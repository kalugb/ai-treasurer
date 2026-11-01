from pydantic import BaseModel, Field


class Receipt(BaseModel):
    id: str
    filename: str
    merchant: str
    date: str
    amount: float
    category: str
    source: str = "manual"


class ReceiptOut(BaseModel):
    id: str
    googleDriveFileId: str
    receiptName: str
    receiptAmount: float = 0.0
    description: str | None = None
    label: str | None = None
    date: str | None = None
    source: str = "google_drive"


class ReceiptUpdate(BaseModel):
    receiptAmount: float | None = Field(default=None, ge=0)
    description: str | None = None
    label: str | None = None
