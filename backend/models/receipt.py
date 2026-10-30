from datetime import datetime

from pydantic import BaseModel


class Receipt(BaseModel):
    # legacy shape used by the dashboard mock data (models/dashboard.py, mock_data.py)
    id: str
    filename: str
    merchant: str
    date: str
    amount: float
    category: str
    source: str = "manual"


class ReceiptOut(BaseModel):
    id: str
    receiptName: str
    receiptMetadata: str
    createdAt: datetime | None = None
    createdFrom: str  # "local_upload" or "google_drive"
    receiptAmount: float | None = None
    departmentID: str
    orgID: str
    snapshot: int | None = None
    googleDriveFileId: str | None = None
    url: str | None = None  # signed S3 URL for display; not persisted
