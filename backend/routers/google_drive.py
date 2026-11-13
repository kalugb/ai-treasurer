import io
import json
import os
from datetime import datetime, timezone

import pypdfium2 as pdfium
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from googleapiclient.errors import HttpError
from starlette.concurrency import run_in_threadpool
from starlette.responses import StreamingResponse

from models.receipt import DuplicateReviewIn, ReceiptDelete, ReceiptUpdate
from routers.reimbursement import receipt_key, receipt_links
from services.ai import receipt_scan
from services.ai import history as ai_history
from services.google.google_ops import GoogleDriveService
from pymongo.errors import DuplicateKeyError

from services import duplicates
from services.mongodb import mongodb_ops
from services.supabase import supabase_ops

router = APIRouter(prefix="/api/google-drive")
TEAMS_COLLECTION = "departments"
RECEIPTS_COLLECTION = "receipts"
CACHE_KEY_NAME = "receipts"
THUMBNAIL_CACHE_SECONDS = 86400
FOLDER_MIME = "application/vnd.google-apps.folder"
UPLOAD_DOC_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}


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
    created_from = doc.get("createdFrom", "google_drive")
    if created_from == "local_upload":
        # local receipts have no Drive id; the UI/routes key off this field, so surface the Mongo _id
        file_id = str(doc.get("_id", ""))
        created = doc.get("createdAt")
        date = created.date().isoformat() if hasattr(created, "date") else None
        return {
            "id": file_id,
            "googleDriveFileId": file_id,
            "receiptName": doc.get("receiptName", ""),
            "receiptAmount": doc.get("receiptAmount") or 0.0,
            "description": doc.get("description"),
            "label": doc.get("label"),
            "date": date,
            "source": "local_upload",
            "thumbnail": _thumbnail_url(team_id, file_id) if file_id else None,
            "contentHash": doc.get("contentHash"),  # consumed (and removed) by _attach_duplicates
            "duplicateReview": doc.get("duplicateReview"),
        }
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
        "contentHash": doc.get("contentHash"),
        "duplicateReview": doc.get("duplicateReview"),
    }


def _attach_duplicates(request: Request, org_id, outs: list[dict]) -> list[dict]:
    """Add `duplicate` (null, or {status, excluded, of}) to receipt responses. Derived on every read like
    reimbursement state: the oldest receipt with a given file hash in the organization is the original, later
    copies are duplicates; only the human decision is stored. Also removes the raw hash fields from the response."""
    docs = [{"_id": ObjectId(o["id"]), "contentHash": o.get("contentHash")} for o in outs if o.get("contentHash") and ObjectId.is_valid(o.get("id", ""))]
    found = duplicates.annotate(_get_mongo(request), org_id, docs)
    for o in outs:
        o.pop("contentHash", None)
        o.pop("duplicateReview", None)
        o["duplicate"] = found.get(o.get("id"))
    return outs


async def _attach_reimbursement(request: Request, outs: list[dict]) -> list[dict]:
    """Add `reimbursed` / `reimbursement` to receipt responses. Derived on every read (never cached or
    stored on the receipt): a receipt is reimbursed only if its record's status is Reimbursed, and
    unreimbursed by default, whatever its source."""
    links = await receipt_links(_get_mongo(request), [o["googleDriveFileId"] for o in outs if o.get("googleDriveFileId")])
    for o in outs:
        link = links.get(o.get("googleDriveFileId"))
        o["reimbursement"] = link
        o["reimbursed"] = bool(link and link["status"] == "Reimbursed")
    return outs


async def _attach_state(request: Request, org_id, outs: list[dict]) -> list[dict]:
    """Derived-on-read state for receipt responses: duplicate + reimbursement (neither is cached or stored on the receipt)."""
    await _attach_reimbursement(request, _attach_duplicates(request, org_id, outs))
    # the original a copy points at gets its reimbursement state too, for the side-by-side comparison
    originals = {o["duplicate"]["of"]["receiptId"] for o in outs if o.get("duplicate")}
    links = await receipt_links(_get_mongo(request), list(originals))
    for o in outs:
        if o.get("duplicate"):
            o["duplicate"]["of"]["reimbursement"] = links.get(o["duplicate"]["of"]["receiptId"])
    return outs


async def _read_receipts(request: Request, dept_oid: ObjectId):
    mongo = _get_mongo(request)
    return await mongodb_ops.read(
        mongo, collection_name=RECEIPTS_COLLECTION, query={"departmentID": dept_oid}, read_many=True
    )


async def _find_receipt(request: Request, dept_oid: ObjectId, file_id: str):
    """Resolve a receipt by the path `file_id`: a Drive id (google) or a stringified Mongo _id (local)."""
    mongo = _get_mongo(request)
    doc = await mongodb_ops.read(
        mongo, collection_name=RECEIPTS_COLLECTION,
        query={"departmentID": dept_oid, "googleDriveFileId": file_id},
    )
    if doc is not None:
        return doc
    try:
        oid = ObjectId(file_id)
    except (InvalidId, TypeError):
        return None
    return await mongodb_ops.read(
        mongo, collection_name=RECEIPTS_COLLECTION, query={"departmentID": dept_oid, "_id": oid},
    )


@router.get("/teams/{team_id}/receipts")
async def get_team_receipts(team_id: str, request: Request, refresh: bool = False):
    """Cache-first read: Redis -> Mongo. Never calls Google Drive.
    `refresh=true` skips the cache read and re-reads Mongo (picks up out-of-band DB edits)."""
    dept_oid, org_id, _folder_id = await _team_ids(request, team_id)
    cache = request.app.state.cache
    cache_key = cache.key_builder(str(dept_oid), CACHE_KEY_NAME)

    if not refresh:
        cached = await cache.get(cache_key)
        if cached is not None:
            return await _attach_state(request, org_id, cached)

    docs = await _read_receipts(request, dept_oid)
    receipts = [_to_out(team_id, doc) for doc in docs]
    if receipts:  # don't cache empty teams so a first sync shows up immediately
        await cache.set(cache_key, receipts)  # before attaching: reimbursement state is never cached
    elif refresh:  # a refresh that empties the list should also clear any stale cache
        await cache.delete(cache_key)
    return await _attach_state(request, org_id, receipts)


async def _run_sync(request: Request, team_id: str) -> dict:
    """The only path that reads Google Drive. Reconciles Mongo against the Drive folder:
    insert new files, refresh Drive fields on existing (preserving manual fields),
    hard-delete receipts whose Drive file is gone. Returns {inserted, updated, deleted, total}."""
    dept_oid, org_id, folder_id = await _team_ids(request, team_id)
    if not folder_id:
        raise HTTPException(status_code=400, detail="Team has no Google Drive folder configured")

    mongo = _get_mongo(request)
    drive = get_google_drive_service_instance(request)
    try:
        files = await run_in_threadpool(drive.get_folder_content_by_id_with_pagination, folder_id)
    except HttpError as exc:
        status = getattr(exc.resp, "status", None)
        if status in (400, 404):
            raise HTTPException(status_code=400, detail="Google Drive folder not found. Check this team's folder ID in Team Management.")
        if status == 403:
            raise HTTPException(status_code=403, detail="No access to this Google Drive folder. Share it with the connected Google account.")
        raise
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
            "createdTime": f.get("createdTime"),
        }
        matched, _ = await mongodb_ops.upsert_preserving(
            mongo,
            RECEIPTS_COLLECTION,
            match={"departmentID": dept_oid, "googleDriveFileId": file_id},
            set_fields={
                "receiptName": f.get("name", ""),
                "receiptMetadata": json.dumps(metadata),
                "contentHash": f.get("md5Checksum"),  # None for Google-native files (can't be compared)
            },
            insert_defaults={
                "orgID": org_id,
                "createdAt": now,
                "createdFrom": "google_drive",
                "receiptAmount": 0.0,
                "description": None,
                "label": None,
            },
        )
        if matched:
            updated += 1
        else:
            inserted += 1

    # hard-delete Mongo receipts whose Drive file no longer exists (image removed from Drive).
    # Only Drive receipts: local uploads have no googleDriveFileId and are never in the Drive listing.
    existing = await _read_receipts(request, dept_oid)
    stale_ids = [
        d["googleDriveFileId"] for d in existing
        if d.get("createdFrom") != "local_upload" and d.get("googleDriveFileId") and d["googleDriveFileId"] not in drive_ids
    ]
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


@router.post("/teams/{team_id}/receipts/sync/stream")
async def sync_team_receipts_stream(team_id: str, request: Request):
    """SSE variant: runs the sync and streams `started` then `done`/`error`.
    POST only (it writes), so opening the URL in a browser can't trigger a sync.
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
async def update_team_receipt(team_id: str, file_id: str, payload: ReceiptUpdate, request: Request, historyId: str | None = None, ownerId: str | None = None):
    """Persist user-editable fields (amount, description, label) on a receipt.
    historyId + ownerId (sent by the bulk AI run) record in the AI history that the AI saved these fields."""
    dept_oid, org_id, _folder_id = await _team_ids(request, team_id)
    mongo = _get_mongo(request)

    fields = payload.model_dump(exclude_none=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    doc = await _find_receipt(request, dept_oid, file_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Receipt not found")

    if "receiptAmount" in fields and fields["receiptAmount"] != (doc.get("receiptAmount") or 0.0):
        # a reimbursed amount is what was paid out: changing it would no longer match the record
        link = (await receipt_links(mongo, [receipt_key(doc)])).get(receipt_key(doc))
        if link and link["status"] == "Reimbursed":
            raise HTTPException(status_code=409, detail=f"This receipt is reimbursed in record '{link['name']}', so its amount can't be changed. Set the record to Not reimbursed first.")

    await mongodb_ops.update(mongo, query={"_id": doc["_id"]}, collection_name=RECEIPTS_COLLECTION, update_data=fields)
    if historyId:
        org_oid = org_id if isinstance(org_id, ObjectId) else ObjectId(str(org_id))
        await ai_history.mark_applied(request, historyId, ownerId, org_oid, receipt_key(doc), fields)
    doc = await mongodb_ops.read(mongo, collection_name=RECEIPTS_COLLECTION, query={"_id": doc["_id"]})

    cache = request.app.state.cache
    await cache.delete(cache.key_builder(str(dept_oid), CACHE_KEY_NAME))
    return (await _attach_state(request, org_id, [_to_out(team_id, doc)]))[0]


@router.post("/teams/{team_id}/receipts/{file_id}/duplicate-review")
async def review_duplicate(team_id: str, file_id: str, payload: DuplicateReviewIn, request: Request):
    """Record a human decision on a receipt that is a later copy of another: `dismissed` (not a duplicate) or
    `confirmed` (a real duplicate: left out of totals and the reimbursement picker); `clear` forgets the decision.
    The duplicate state itself is derived, so this only stores the decision (tied to the file hash it was made on)."""
    dept_oid, org_id, _folder_id = await _team_ids(request, team_id)
    mongo = _get_mongo(request)
    doc = await _find_receipt(request, dept_oid, file_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if payload.status != "clear" and str(doc["_id"]) not in duplicates.annotate(mongo, org_id, [doc]):
        raise HTTPException(status_code=400, detail="This receipt is not a copy of an older receipt")

    review = None if payload.status == "clear" else {
        "status": payload.status, "hash": doc.get("contentHash"), "reviewedAt": datetime.now(timezone.utc),
    }
    await mongodb_ops.update(mongo, query={"_id": doc["_id"]}, collection_name=RECEIPTS_COLLECTION, update_data={"duplicateReview": review})
    doc = await mongodb_ops.read(mongo, collection_name=RECEIPTS_COLLECTION, query={"_id": doc["_id"]})

    cache = request.app.state.cache
    await cache.delete(cache.key_builder(str(dept_oid), CACHE_KEY_NAME))
    return (await _attach_state(request, org_id, [_to_out(team_id, doc)]))[0]


@router.post("/teams/{team_id}/receipts/delete")
async def delete_team_receipts(team_id: str, payload: ReceiptDelete, request: Request):
    """Delete one or more LOCAL-UPLOAD receipts (Mongo doc + Supabase file). Drive receipts are rejected."""
    dept_oid, _org_id, _folder_id = await _team_ids(request, team_id)
    mongo = _get_mongo(request)
    cache = request.app.state.cache

    # validate everything up front so a rejected request deletes nothing
    docs = []
    for file_id in payload.ids:
        doc = await _find_receipt(request, dept_oid, file_id)
        if doc is None:
            continue
        if doc.get("createdFrom") != "local_upload":
            raise HTTPException(status_code=400, detail="Only local-upload receipts can be deleted")
        docs.append(doc)

    links = await receipt_links(mongo, [receipt_key(d) for d in docs])
    if links and not payload.confirmLinked:
        detail = "; ".join(
            f"'{d.get('receiptName', '')}' is in reimbursement record '{links[receipt_key(d)]['name']}' ({links[receipt_key(d)]['status']})"
            for d in docs if receipt_key(d) in links
        )
        raise HTTPException(status_code=409, detail=f"Linked to reimbursement records: {detail}. Confirm to delete anyway.")

    deleted = 0
    for doc in docs:
        storage_path = doc.get("storagePath")
        if storage_path:
            # remove the file first; a leftover Mongo doc with a missing file is worse than a stray file
            try:
                await run_in_threadpool(supabase_ops.delete_receipt, storage_path)
            except Exception:
                raise HTTPException(status_code=502, detail="Could not delete the receipt file")
            await cache.delete(cache.key_builder(str(doc["_id"]), f"thumb:{storage_path}"))

        deleted += await mongodb_ops.delete(mongo, collection_name=RECEIPTS_COLLECTION, query={"_id": doc["_id"]})

    await cache.delete(cache.key_builder(str(dept_oid), CACHE_KEY_NAME))
    return {"deleted": deleted}


async def _reject_duplicate(request: Request, org_id, file_hash: str) -> None:
    """409 if this exact file is already a receipt anywhere in the organization (any team, any source)."""
    mongo = _get_mongo(request)
    existing = await mongodb_ops.read(
        mongo, collection_name=RECEIPTS_COLLECTION, query={"orgID": org_id, "contentHash": file_hash}
    )
    if existing is None:
        return
    team = await mongodb_ops.read(mongo, collection_name=TEAMS_COLLECTION, query={"_id": existing.get("departmentID")})
    raise HTTPException(status_code=409, detail={
        "code": "duplicate_receipt",
        "message": "This file is already a receipt in this organization.",
        "existing": {
            "receiptId": receipt_key(existing),
            "name": existing.get("receiptName", ""),
            "teamName": (team or {}).get("name", ""),
            "source": existing.get("createdFrom", "google_drive"),
        },
    })


@router.post("/teams/{team_id}/receipts/duplicate-check")
async def check_duplicate_receipt(team_id: str, request: Request, file: UploadFile = File(...)):
    """Pre-check for the upload form: hashes the file in memory and reports a match. Stores nothing."""
    _dept_oid, org_id, _folder_id = await _team_ids(request, team_id)
    await _reject_duplicate(request, org_id, duplicates.content_hash(await file.read()))
    return {"duplicate": False}


@router.post("/teams/{team_id}/receipts/upload")
async def upload_team_receipt(
    team_id: str,
    request: Request,
    file: UploadFile = File(...),
    receiptName: str = Form(...),
    receiptAmount: float = Form(...),
    description: str | None = Form(None),
):
    """Upload a local receipt: store the file in Supabase, metadata in Mongo (createdFrom=local_upload)."""
    dept_oid, org_id, _folder_id = await _team_ids(request, team_id)
    mongo = _get_mongo(request)

    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/") and content_type not in UPLOAD_DOC_TYPES:
        raise HTTPException(status_code=415, detail="Only image, PDF or Excel receipts can be uploaded")
    if receiptAmount < 0:
        raise HTTPException(status_code=422, detail="Amount must be non-negative")

    data = await file.read()
    file_hash = duplicates.content_hash(data)
    await _reject_duplicate(request, org_id, file_hash)
    now = datetime.now(timezone.utc)
    # insert first to get the _id, then upload to a path keyed by it, then backfill storagePath
    doc = {
        "contentHash": file_hash,
        "departmentID": dept_oid,
        "orgID": org_id,
        "receiptName": receiptName,
        "receiptAmount": float(receiptAmount),
        "description": description,
        "createdAt": now,
        "createdFrom": "local_upload",
        "label": None,
        "receiptMetadata": json.dumps({"mimeType": content_type, "size": len(data)}),
    }
    try:
        receipt_id = await mongodb_ops.create(mongo, doc_to_create=doc, collection_name=RECEIPTS_COLLECTION)
    except DuplicateKeyError:  # a simultaneous upload of the same file won the race (partial unique index)
        await _reject_duplicate(request, org_id, file_hash)
        raise HTTPException(status_code=409, detail={"code": "duplicate_receipt"})

    ext = os.path.splitext(file.filename or "")[1]
    storage_path = f"{dept_oid}/{receipt_id}{ext}"
    try:
        await run_in_threadpool(supabase_ops.upload_receipt, storage_path, data, content_type)
    except Exception:
        # roll back the orphan Mongo doc so the two stores stay consistent
        await mongodb_ops.delete(mongo, collection_name=RECEIPTS_COLLECTION, query={"_id": receipt_id})
        raise HTTPException(status_code=502, detail="Could not store the receipt file")

    await mongodb_ops.update(
        mongo, query={"_id": receipt_id}, collection_name=RECEIPTS_COLLECTION, update_data={"storagePath": storage_path}
    )
    doc = await mongodb_ops.read(mongo, collection_name=RECEIPTS_COLLECTION, query={"_id": receipt_id})

    cache = request.app.state.cache
    await cache.delete(cache.key_builder(str(dept_oid), CACHE_KEY_NAME))
    return (await _attach_state(request, org_id, [_to_out(team_id, doc)]))[0]


def _drive_version(raw_meta) -> str:
    """Drive modifiedTime as a cache-version token; a re-synced file changes it and busts the cache."""
    if isinstance(raw_meta, str) and raw_meta:
        try:
            return json.loads(raw_meta).get("modifiedTime") or ""
        except json.JSONDecodeError:
            return ""
    return ""


def _render_pdf_first_page(data: bytes) -> bytes:
    """Rasterize a PDF's first page to PNG so an <img> can show it."""
    pdf = pdfium.PdfDocument(data)
    try:
        bitmap = pdf[0].render(scale=2)  # ~144 DPI, enough for a preview
        buffer = io.BytesIO()
        bitmap.to_pil().save(buffer, format="PNG")
        return buffer.getvalue()
    finally:
        pdf.close()


def _drive_image_bytes(drive, file_id: str, is_pdf: bool) -> bytes:
    """Download a Drive receipt (blocking); rasterize PDFs. Runs in a threadpool."""
    data = drive.download_files_bytes(file_id)
    return _render_pdf_first_page(data) if is_pdf else data


def _local_image_bytes(storage_path: str, is_pdf: bool) -> bytes:
    """Download a local receipt from Supabase (blocking); rasterize PDFs. Runs in a threadpool."""
    data = supabase_ops.download_receipt(storage_path)
    return _render_pdf_first_page(data) if is_pdf else data


@router.get("/teams/{team_id}/receipts/{file_id}/thumbnail")
async def get_team_receipt_thumbnail(team_id: str, file_id: str, request: Request, size: int = 220):
    # size is ignored: the full file bytes are served (Drive's own thumbnailLink 403s for a
    # server fetch). Bytes are cached in Redis so repeat views skip the download + PDF render.
    dept_oid, _org_id, _folder_id = await _team_ids(request, team_id)

    doc = await _find_receipt(request, dept_oid, file_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return await serve_receipt_thumbnail(request, doc, file_id)


@router.post("/teams/{team_id}/receipts/{file_id}/scan")
async def scan_team_receipt(team_id: str, file_id: str, request: Request, ownerId: str | None = None, trigger: str = "receipt_edit", runId: str | None = None):
    """AI-extract name/amount/description from a stored receipt (nothing is saved on the receipt).
    Uses the ORIGINAL file, so a PDF goes text-first (MarkItDown -> LLM) and is only
    read visually when it has no text layer; images go to the vision model.
    Logged to the AI history when ownerId is sent; the response carries `historyId` so the caller can
    pass it back on the receipt PATCH (that is what records "the AI saved this")."""
    llm = request.app.state.llm_inference
    if llm is None:
        raise HTTPException(status_code=503, detail="LLM inference not available")
    dept_oid, org_id, _folder_id = await _team_ids(request, team_id)
    doc = await _find_receipt(request, dept_oid, file_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Receipt not found")

    mime = ""
    raw_meta = doc.get("receiptMetadata")
    if isinstance(raw_meta, str) and raw_meta:
        try:
            mime = json.loads(raw_meta).get("mimeType") or ""
        except json.JSONDecodeError:
            pass
    try:
        if doc.get("createdFrom") == "local_upload":
            data = await run_in_threadpool(supabase_ops.download_receipt, doc.get("storagePath"))
        else:
            data = await run_in_threadpool(get_google_drive_service_instance(request).download_files_bytes, file_id)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch the receipt file")
    name = doc.get("receiptName") or "receipt"
    try:
        result, history_id = await ai_history.run_logged(
            request,
            {"owner_id": ownerId, "org_id": str(org_id), "team_id": team_id, "trigger": trigger, "run_id": runId},
            {"filename": name, "mimeType": mime, "size": len(data)},
            {"receiptId": receipt_key(doc), "name": name, "source": "local_upload" if doc.get("createdFrom") == "local_upload" else "google"},
            lambda meta: receipt_scan.scan(llm, name, mime, data, meta),
        )
        return {**result, "historyId": history_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"receipt scan failed: {e}")
        raise HTTPException(status_code=502, detail="Could not scan this receipt.")

async def serve_receipt_thumbnail(request: Request, doc: dict, file_id: str) -> Response:
    """Cache-first image bytes for a receipt doc (shared by the live route and the snapshot route)."""
    content_type = "application/octet-stream"
    raw_meta = doc.get("receiptMetadata")
    if isinstance(raw_meta, str) and raw_meta:
        try:
            content_type = json.loads(raw_meta).get("mimeType") or content_type
        except json.JSONDecodeError:
            pass

    is_pdf = content_type == "application/pdf"
    if not content_type.startswith("image/") and not is_pdf:
        raise HTTPException(status_code=415, detail="Preview is only available for image or PDF receipts")

    is_local = doc.get("createdFrom") == "local_upload"
    cache = request.app.state.cache
    # version token invalidates the cached bytes when the source file changes
    version = doc.get("storagePath", "") if is_local else _drive_version(raw_meta)
    cache_key = cache.key_builder(str(doc["_id"]), f"thumb:{version}")

    image = await cache.get_bytes(cache_key)
    if image is None:
        try:
            if is_local:
                image = await run_in_threadpool(_local_image_bytes, doc.get("storagePath"), is_pdf)
            else:
                drive = get_google_drive_service_instance(request)
                image = await run_in_threadpool(_drive_image_bytes, drive, file_id, is_pdf)
        except Exception:
            raise HTTPException(status_code=502, detail="Could not fetch the receipt file")
        await cache.set_bytes(cache_key, image, custom_ttl=THUMBNAIL_CACHE_SECONDS)

    if is_pdf:
        content_type = "image/png"

    # stable URL + long browser cache
    return Response(content=image, media_type=content_type, headers={"Cache-Control": f"public, max-age={THUMBNAIL_CACHE_SECONDS}"})
