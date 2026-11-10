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
    reimbursed: bool = False  # in a record whose status is Reimbursed
    reimbursement: dict | None = None  # {id, name, status} of the record holding this receipt


class ReceiptUpdate(BaseModel):
    receiptAmount: float | None = Field(default=None, ge=0)
    description: str | None = None
    label: str | None = None


class ReceiptDelete(BaseModel):
    ids: list[str] = Field(min_length=1)
    confirmLinked: bool = False  # must be true to delete receipts that sit in a reimbursement record
