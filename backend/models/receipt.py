from pydantic import BaseModel


class Receipt(BaseModel):
    id: str
    filename: str
    merchant: str
    date: str
    amount: float
    category: str
    source: str = "manual"
