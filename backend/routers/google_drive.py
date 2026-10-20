from fastapi import APIRouter, Request

router = APIRouter(prefix="/api/google-drive")

def get_google_drive_service(request: Request):
    if not hasattr(request.app.state, "google_drive_service") or request.app.state.google_drive_service is False:
        raise Exception("Google Drive service is not connected.")
    
    return request.app.state.google_drive_service

@router.get("/get-metadata")
async def get_google_drive_metadata(request: Request):
    pass