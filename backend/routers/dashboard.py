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
    return {"message": "POST request successful!", "data": request.dict()}
