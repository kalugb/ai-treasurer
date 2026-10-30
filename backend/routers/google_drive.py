import asyncio
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from services.google.google_connect import get_drive_service
from services.google.google_ops import GoogleDriveService
from services.mongodb import mongodb_ops
from services.supabase import supabase_storage
from services.supabase.supabase_connect import get_storage_client, new_storage_client

router = APIRouter(prefix="/api/google-drive")
DEPARTMENTS_COLLECTION = "departments"
RECEIPTS_COLLECTION = "receipts"
CACHE_KEY_NAME = "receipts"
RECEIPTS_CACHE_TTL = 3600  # 1h; must stay < supabase_storage.DEFAULT_SIGNED_URL_TTL so cached URLs never expire


def get_google_drive_service_instance(request: Request):
    instance = getattr(request.app.state, "google_drive_service_instance", None)
    if instance:
        return instance
    # connect endpoint stores the raw service; wrap it so routes work without a restart
    raw = getattr(request.app.state, "google_drive_service", None)
    if raw:
        return GoogleDriveService(raw)
    raise HTTPException(status_code=503, detail="Google Drive service is not connected")


async def _team_doc(request: Request, team_id: str) -> dict:
    mongo = request.app.state.mongo
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        team_oid = ObjectId(team_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid team id")

    team = await mongodb_ops.read(mongo, collection_name=DEPARTMENTS_COLLECTION, query={"_id": team_oid})
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


def _team_folder_id(team: dict) -> str:
    folder_id = team.get("googleDriveFolderId") or team.get("google_drive_folder_id")
    if not folder_id:
        raise HTTPException(status_code=400, detail="Team has no Google Drive folder configured")
    return folder_id


def _receipt_out(doc: dict, url: str | None) -> dict:
    return {
        "id": str(doc["_id"]),
        "receiptName": doc.get("receiptName", ""),
        "receiptMetadata": doc.get("receiptMetadata", ""),
        "createdAt": doc.get("createdAt"),
        "createdFrom": doc.get("createdFrom", ""),
        "receiptAmount": doc.get("receiptAmount"),
        "departmentID": str(doc["departmentID"]) if isinstance(doc.get("departmentID"), ObjectId) else str(doc.get("departmentID", "")),
        "orgID": str(doc["orgID"]) if isinstance(doc.get("orgID"), ObjectId) else str(doc.get("orgID", "")),
        "snapshot": doc.get("snapshot"),
        "googleDriveFileId": doc.get("googleDriveFileId"),
        "url": url,
    }


@router.get("/teams/{team_id}/receipts")
async def get_team_receipts(team_id: str, request: Request):
    team = await _team_doc(request, team_id)
    dept_id = team["_id"]
    cache = request.app.state.cache
    cache_key = cache.key_builder(str(dept_id), CACHE_KEY_NAME) if cache is not None else None

    if cache is not None:
        cached = await cache.get(cache_key)
        if cached is not None:
            return cached

    mongo = request.app.state.mongo
    docs = await mongodb_ops.read(
        mongo, collection_name=RECEIPTS_COLLECTION,
        query={"departmentID": dept_id}, read_many=True,
    )
    if not docs:
        return []

    storage = get_storage_client()
    paths = [doc["storagePath"] for doc in docs if doc.get("storagePath")]
    url_by_path = await run_in_threadpool(supabase_storage.signed_urls, storage, paths)
    results = [_receipt_out(doc, url_by_path.get(doc.get("storagePath"))) for doc in docs]

    if cache is not None:
        await cache.set(cache_key, results, custom_ttl=RECEIPTS_CACHE_TTL)
    return results


@router.post("/teams/{team_id}/receipts/sync")
async def sync_team_receipts(team_id: str, request: Request):
    team = await _team_doc(request, team_id)
    folder_id = _team_folder_id(team)
    mongo = request.app.state.mongo
    org_id = team.get("orgId")
    dept_id = team["_id"]

    drive = get_google_drive_service_instance(request)
    files = await run_in_threadpool(drive.get_folder_content_by_id_with_pagination, folder_id)

    receipts = [f for f in files if f.get("mimeType") != "application/vnd.google-apps.folder"]
    skipped = len(files) - len(receipts)

    # The Drive (httplib2) and Supabase (httpx) clients are single-connection and NOT thread-safe, so
    # we can't share one across threads. Instead each worker thread builds its OWN clients once
    # (thread-local) and reuses them, so concurrent download+upload is safe. This parallelizes the
    # slow network I/O; Mongo upserts then run sequentially on the event loop (local + fast).
    local = threading.local()

    def _worker(file):
        if not hasattr(local, "drive"):
            local.drive = GoogleDriveService(get_drive_service())
            local.storage = new_storage_client()
        file_id = file["id"]
        path = supabase_storage.object_path(str(org_id), str(dept_id), file_id)
        data = local.drive.download_files_bytes(file_id)
        supabase_storage.upload_receipt(local.storage, path, data, file.get("mimeType"))
        return file, path

    loop = asyncio.get_running_loop()
    with ThreadPoolExecutor(max_workers=8) as pool:
        stored = await asyncio.gather(*(loop.run_in_executor(pool, _worker, f) for f in receipts))

    inserted = updated = 0
    for file, path in stored:
        file_id = file["id"]
        metadata = json.dumps({
            "mimeType": file.get("mimeType"),
            "size": file.get("size"),
            "modifiedTime": file.get("modifiedTime"),
            "thumbnailLink": file.get("thumbnailLink"),
        })

        result = await mongodb_ops.upsert_preserving(
            mongo, RECEIPTS_COLLECTION,
            match={"departmentID": dept_id, "googleDriveFileId": file_id},
            set_fields={
                "receiptName": file.get("name", ""),
                "receiptMetadata": metadata,
                "storagePath": path,
            },
            insert_defaults={
                "departmentID": dept_id,
                "orgID": org_id,
                "googleDriveFileId": file_id,
                "createdAt": datetime.now(timezone.utc),
                "createdFrom": "google_drive",
                "receiptAmount": None,
                "snapshot": None,
            },
        )
        if result == "inserted":
            inserted += 1
        else:
            updated += 1

    # stale cache would hide the just-synced files; drop it so the next GET rebuilds
    cache = request.app.state.cache
    if cache is not None:
        await cache.delete(cache.key_builder(str(dept_id), CACHE_KEY_NAME))

    return {"inserted": inserted, "updated": updated, "skipped": skipped, "total": len(files)}
