from pydantic import BaseModel

from models.receipt import Receipt


class Dashboard(BaseModel):
    total_spending: float
    spending_change: float
    receipts_captured: int
    receipts_needing_review: int
    monthly_budget: float
    monthly_budget_used_percent: float
    recent_receipts: list[Receipt]

class TestPostRequest(BaseModel):
    title: str
    description: str
    amount: float
    date: str