from fastapi import APIRouter, Request

from services.google.google_ops import GoogleDriveService

router = APIRouter(prefix="/api/google-drive")

def get_google_drive_service_instance(request: Request):
    if not hasattr(request.app.state, "google_drive_service_instance") or request.app.state.google_drive_service_instance is False:
        raise Exception("Google Drive service is not connected. Anyway you shouldn't be here")
    
    return request.app.state.google_drive_service_instance

def get_folder_content_by_path(request: Request, folder_id: str):
    drive_service_instance = get_google_drive_service_instance(request)
    
    return drive_service_instance.get_folder_content_by_path(folder_id)

@router.get("/get-metadata/{folder_id}")
async def get_google_drive_metadata(folder_id: str, request: Request):
    pass