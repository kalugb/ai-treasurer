from fastapi import APIRouter

from mock_data import DASHBOARD
from models.dashboard import Dashboard, TestPostRequest

router = APIRouter(prefix="/api")


@router.get("/dashboard", response_model=Dashboard)
def get_dashboard():
    return DASHBOARD

@router.get("/test-axios")
def test_axios():
    return {"message": "Axios test successful!"}

@router.post("/test-post")
def test_post(request: TestPostRequest):
    mock_data: dict = {
        "id": 1,
        "name": "Mock Data",
        "description": "This is a mock data response.",
        "date": "2025-03-19",
    }
    
    return {
        "message": f"Received data: {request.dict()}.",
        "mock_data": mock_data
    }
    
