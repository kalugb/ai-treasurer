from fastapi import APIRouter, Request

router = APIRouter(prefix="/api")

@router.get("/google-drive-service-exists")
def check_google_drive_service_exists(request: Request):
    return {
        "google_drive_service_exists": request.app.state.google_drive_service_connected
    }
    
