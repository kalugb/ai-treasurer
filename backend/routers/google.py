from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from services.google.google_connect import get_drive_service, remove_existing_drive_token

router = APIRouter(prefix="/api")

@router.get("/google-drive-service-exists")
def check_google_drive_service_exists(request: Request):
    return {
        "google_drive_service_exists": request.app.state.google_drive_service_connected
    }
    
@router.post("/google-drive-service-connect")
def connect_google_drive_service(request: Request):
    remove_existing_drive_token()  # Remove existing token.json if it exists
    
    try:
        request.app.state.google_drive_service = get_drive_service()
        
        if request.app.state.google_drive_service is None:
            raise Exception("Failed to connect to Google Drive service.")

        request.app.state.google_drive_service_connected = True
        return {
            "message": "Google Drive service connected successfully.",
            "status": "success"
        }
    except Exception as e:
        request.app.state.google_drive_service_connected = False
        request.app.state.google_drive_service = None
        return JSONResponse(status_code=500, content=f"Failed to connect to Google Drive service: {str(e)}")
        
@router.delete("/google-drive-service-disconnect")
def disconnect_google_drive_service(request: Request):
    remove_existing_drive_token()  # Remove existing token.json if it exists
    
    request.app.state.google_drive_service_connected = False
    request.app.state.google_drive_service = None
    return {
        "message": "Google Drive service disconnected successfully.",
        "status": "success"
    }
