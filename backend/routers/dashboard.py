from fastapi import APIRouter

from mock_data import DASHBOARD
from models.dashboard import Dashboard

router = APIRouter(prefix="/api")


@router.get("/dashboard", response_model=Dashboard)
def get_dashboard():
    return DASHBOARD
