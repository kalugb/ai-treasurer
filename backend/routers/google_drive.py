import re
import urllib.request

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Response
from starlette.concurrency import run_in_threadpool

from services.google.google_ops import GoogleDriveService
from services.mongodb import mongodb_ops

router = APIRouter(prefix="/api/google-drive")
COLLECTION_NAME = "departments"
CACHE_KEY_NAME = "google-drive-receipts"
THUMBNAIL_CACHE_SECONDS = 86400


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


async def _team_folder_id(request: Request, team_id: str) -> str:
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
    return folder_id


async def _folder_files(request: Request, folder_id: str, refresh: bool = False):
    cache = request.app.state.cache
    cache_key = cache.key_builder(folder_id, CACHE_KEY_NAME)
    cached = None if refresh else await cache.get(cache_key)
    if cached is not None:
        return cached

    drive = get_google_drive_service_instance(request)
    files = await run_in_threadpool(drive.get_folder_content_by_id_with_pagination, folder_id)
    await cache.set(cache_key, files)
    return files


def _download_thumbnail(url: str, size: int):
    # Drive returns links like "...=s220"; swap the size for a sharper preview
    with urllib.request.urlopen(re.sub(r'=(s|w)\d+(-h\d+)?$', f'=s{size}', url), timeout=10) as response:
        return response.read(), response.headers.get_content_type()


@router.get("/teams/{team_id}/receipts")
async def get_team_receipts(team_id: str, request: Request, refresh: bool = False):
    folder_id = await _team_folder_id(request, team_id)
    return await _folder_files(request, folder_id, refresh)


@router.get("/teams/{team_id}/receipts/{file_id}/thumbnail")
async def get_team_receipt_thumbnail(team_id: str, file_id: str, request: Request, size: int = 220):
    folder_id = await _team_folder_id(request, team_id)
    files = await _folder_files(request, folder_id)
    file = next((item for item in files if item.get("id") == file_id), None)
    if file is None:
        raise HTTPException(status_code=404, detail="Receipt not found in this team's folder")

    thumbnail_url = file.get("thumbnailLink")
    if not thumbnail_url:
        raise HTTPException(status_code=404, detail="No thumbnail available for this file")

    try:
        image, content_type = await run_in_threadpool(_download_thumbnail, thumbnail_url, max(64, min(size, 1024)))
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch thumbnail from Google Drive")

    # stable URL + long browser cache: Drive's own thumbnailLink changes every fetch
    return Response(content=image, media_type=content_type, headers={"Cache-Control": f"public, max-age={THUMBNAIL_CACHE_SECONDS}"})
