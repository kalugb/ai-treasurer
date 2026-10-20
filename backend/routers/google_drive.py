from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from services.google.google_ops import GoogleDriveService
from services.mongodb import mongodb_ops

router = APIRouter(prefix="/api/google-drive")
COLLECTION_NAME = "departments"
CACHE_KEY_NAME = "google-drive-receipts"


def get_google_drive_service_instance(request: Request):
    instance = getattr(request.app.state, "google_drive_service_instance", None)
    if instance:
        return instance
    # connect endpoint stores the raw service; wrap it so routes work without a restart
    raw = getattr(request.app.state, "google_drive_service", None)
    if raw:
        return GoogleDriveService(raw)
    raise HTTPException(status_code=503, detail="Google Drive service is not connected")


def get_folder_content_by_path(request: Request, folder_id: str):
    drive_service_instance = get_google_drive_service_instance(request)

    return drive_service_instance.get_folder_content_by_path(folder_id)


@router.get("/teams/{team_id}/receipts")
async def get_team_receipts(team_id: str, request: Request):
    mongo = request.app.state.mongo
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    try:
        team_oid = ObjectId(team_id)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid team id")

    team = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": team_oid})
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    folder_id = team.get("googleDriveFolderId") or team.get("google_drive_folder_id")
    if not folder_id:
        raise HTTPException(status_code=400, detail="Team has no Google Drive folder configured")

    cache = request.app.state.cache
    cache_key = cache.key_builder(folder_id, CACHE_KEY_NAME)
    cached = await cache.get(cache_key)
    if cached is not None:
        return cached

    # resolved from the stored team, so the client cannot point us at an arbitrary folder
    drive = get_google_drive_service_instance(request)
    files = await run_in_threadpool(drive.get_folder_content_by_id_with_pagination, folder_id)
    await cache.set(cache_key, files)
    return files
