import json
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool
from starlette.responses import StreamingResponse

from models.receipt import ReceiptUpdate
from services.google.google_ops import GoogleDriveService
from services.mongodb import mongodb_ops

router = APIRouter(prefix="/api/google-drive")
TEAMS_COLLECTION = "departments"
RECEIPTS_COLLECTION = "receipts"
CACHE_KEY_NAME = "receipts"
THUMBNAIL_CACHE_SECONDS = 86400
FOLDER_MIME = "application/vnd.google-apps.folder"


def get_google_drive_service_instance(request: Request):
    instance = getattr(request.app.state, "google_drive_service_instance", None)
    if instance:
        return instance
    # connect endpoint stores the raw service; wrap it so routes work without a restart
    raw = getattr(request.app.state, "google_drive_service", None)
    if raw:
        return GoogleDriveService(raw)
    raise HTTPException(status_code=503, detail="Google Drive service is not connected")


def _get_mongo(request: Request):
    mongo = request.app.state.mongo
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return mongo


async def _team_ids(request: Request, team_id: str):
    """Resolve a team to (department_oid, org_oid, google_drive_folder_id)."""
    mongo = _get_mongo(request)
    try:
        team_oid = ObjectId(team_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid team id")

    team = await mongodb_ops.read(mongo, collection_name=TEAMS_COLLECTION, query={"_id": team_oid})
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    org_id = team.get("orgId") or team.get("orgID")
    folder_id = team.get("googleDriveFolderId") or team.get("google_drive_folder_id")
    return team_oid, org_id, folder_id


def _thumbnail_url(team_id: str, file_id: str) -> str:
    # stable backend-proxied URL; Drive's own thumbnailLink expires/changes between syncs
    return f"/api/google-drive/teams/{team_id}/receipts/{file_id}/thumbnail"


def _to_out(team_id: str, doc: dict) -> dict:
    metadata = {}
    raw_meta = doc.get("receiptMetadata")
    if isinstance(raw_meta, str) and raw_meta:
        try:
            metadata = json.loads(raw_meta)
        except json.JSONDecodeError:
            metadata = {}
    modified = metadata.get("modifiedTime")
    file_id = doc.get("googleDriveFileId", "")
    return {
        "id": str(doc.get("_id", "")),
        "googleDriveFileId": file_id,
        "receiptName": doc.get("receiptName", ""),
        "receiptAmount": doc.get("receiptAmount") or 0.0,
        "description": doc.get("description"),
        "label": doc.get("label"),
        "date": modified[:10] if isinstance(modified, str) and modified else None,
        "source": doc.get("createdFrom", "google_drive"),
        "thumbnail": _thumbnail_url(team_id, file_id) if file_id else None,
    }


async def _read_receipts(request: Request, dept_oid: ObjectId):
    mongo = _get_mongo(request)
    return await mongodb_ops.read(
        mongo, collection_name=RECEIPTS_COLLECTION, query={"departmentID": dept_oid}, read_many=True
    )


@router.get("/teams/{team_id}/receipts")
async def get_team_receipts(team_id: str, request: Request, refresh: bool = False):
    """Cache-first read: Redis -> Mongo. Never calls Google Drive.
    `refresh=true` skips the cache read and re-reads Mongo (picks up out-of-band DB edits)."""
    dept_oid, _org_id, _folder_id = await _team_ids(request, team_id)
    cache = request.app.state.cache
    cache_key = cache.key_builder(str(dept_oid), CACHE_KEY_NAME)

    if not refresh:
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

    docs = await _read_receipts(request, dept_oid)
    receipts = [_to_out(team_id, doc) for doc in docs]
    if receipts:  # don't cache empty teams so a first sync shows up immediately
        await cache.set(cache_key, receipts)
    elif refresh:  # a refresh that empties the list should also clear any stale cache
        await cache.delete(cache_key)
    return receipts


async def _run_sync(request: Request, team_id: str) -> dict:
    """The only path that reads Google Drive. Reconciles Mongo against the Drive folder:
    insert new files, refresh Drive fields on existing (preserving manual fields),
    hard-delete receipts whose Drive file is gone. Returns {inserted, updated, deleted, total}."""
    dept_oid, org_id, folder_id = await _team_ids(request, team_id)
    if not folder_id:
        raise HTTPException(status_code=400, detail="Team has no Google Drive folder configured")

    mongo = _get_mongo(request)
    drive = get_google_drive_service_instance(request)
    files = await run_in_threadpool(drive.get_folder_content_by_id_with_pagination, folder_id)
    files = [f for f in files if f.get("mimeType") != FOLDER_MIME]

    now = datetime.now(timezone.utc)
    inserted = updated = 0
    drive_ids = set()

    for f in files:
        file_id = f.get("id")
        if not file_id:
            continue
        drive_ids.add(file_id)
        metadata = {
            "mimeType": f.get("mimeType"),
            "size": f.get("size"),
            "modifiedTime": f.get("modifiedTime"),
            "thumbnailLink": f.get("thumbnailLink"),
        }
        matched, _ = await mongodb_ops.upsert_preserving(
            mongo,
            RECEIPTS_COLLECTION,
            match={"departmentID": dept_oid, "googleDriveFileId": file_id},
            set_fields={
                "receiptName": f.get("name", ""),
                "receiptMetadata": json.dumps(metadata),
            },
            insert_defaults={
                "orgID": org_id,
                "createdAt": now,
                "createdFrom": "google_drive",
                "receiptAmount": 0.0,
                "description": None,
                "label": None,
                "snapshot": None,
            },
        )
        if matched:
            updated += 1
        else:
            inserted += 1

    # hard-delete Mongo receipts whose Drive file no longer exists (image removed from Drive)
    existing = await _read_receipts(request, dept_oid)
    stale_ids = [d["googleDriveFileId"] for d in existing if d.get("googleDriveFileId") not in drive_ids]
    deleted = 0
    if stale_ids:
        deleted = await mongodb_ops.delete(
            mongo,
            collection_name=RECEIPTS_COLLECTION,
            query={"departmentID": dept_oid, "googleDriveFileId": {"$in": stale_ids}},
            delete_many=True,
        )

    cache = request.app.state.cache
    await cache.delete(cache.key_builder(str(dept_oid), CACHE_KEY_NAME))
    return {"inserted": inserted, "updated": updated, "deleted": deleted, "total": len(files)}


@router.post("/teams/{team_id}/receipts/sync")
async def sync_team_receipts(team_id: str, request: Request):
    """Blocking sync (back-compat / SSE-less fallback). See `_run_sync`."""
    return await _run_sync(request, team_id)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.get("/teams/{team_id}/receipts/sync/stream")
async def sync_team_receipts_stream(team_id: str, request: Request):
    """SSE variant: runs the sync and streams `started` then `done`/`error`.
    The whole job runs inside this request; closing the connection stops it."""
    async def event_source():
        yield _sse("started", {"teamId": team_id})
        try:
            result = await _run_sync(request, team_id)
            yield _sse("done", result)
        except HTTPException as exc:
            yield _sse("error", {"detail": exc.detail, "status": exc.status_code})
        except Exception:
            yield _sse("error", {"detail": "Sync failed. Check the Google Drive connection.", "status": 500})

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.patch("/teams/{team_id}/receipts/{file_id}")
async def update_team_receipt(team_id: str, file_id: str, payload: ReceiptUpdate, request: Request):
    """Persist user-editable fields (amount, description, label) on a receipt."""
    dept_oid, _org_id, _folder_id = await _team_ids(request, team_id)
    mongo = _get_mongo(request)

    fields = payload.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    match = {"departmentID": dept_oid, "googleDriveFileId": file_id}
    modified = await mongodb_ops.update(mongo, query=match, collection_name=RECEIPTS_COLLECTION, update_data=fields)

    doc = await mongodb_ops.read(mongo, collection_name=RECEIPTS_COLLECTION, query=match)
    if doc is None:
        raise HTTPException(status_code=404, detail="Receipt not found")

    cache = request.app.state.cache
    await cache.delete(cache.key_builder(str(dept_oid), CACHE_KEY_NAME))
    return _to_out(team_id, doc)


@router.get("/teams/{team_id}/receipts/{file_id}/thumbnail")
async def get_team_receipt_thumbnail(team_id: str, file_id: str, request: Request, size: int = 220):
    # size is ignored: the authenticated Drive API serves the full file bytes.
    # Drive's own thumbnailLink (lh3.googleusercontent.com) 403s for an unauthenticated
    # server fetch, so we download the real file via files().get_media instead.
    dept_oid, _org_id, _folder_id = await _team_ids(request, team_id)
    mongo = _get_mongo(request)

    doc = await mongodb_ops.read(
        mongo,
        collection_name=RECEIPTS_COLLECTION,
        query={"departmentID": dept_oid, "googleDriveFileId": file_id},
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Receipt not found")

    content_type = "application/octet-stream"
    raw_meta = doc.get("receiptMetadata")
    if isinstance(raw_meta, str) and raw_meta:
        try:
            content_type = json.loads(raw_meta).get("mimeType") or content_type
        except json.JSONDecodeError:
            pass
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Preview is only available for image receipts")

    drive = get_google_drive_service_instance(request)
    try:
        image = await run_in_threadpool(drive.download_files_bytes, file_id)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch receipt image from Google Drive")

    # stable URL + long browser cache
    return Response(content=image, media_type=content_type, headers={"Cache-Control": f"public, max-age={THUMBNAIL_CACHE_SECONDS}"})
