import datetime as dt
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Status = Literal["Reimbursed", "Not reimbursed"]


class ReceiptInvolved(BaseModel):
    # names only: labels, not references (keeps docs small when a team has many receipts)
    receiptNames: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]] = Field(max_length=100)


class ReimbursementCreate(BaseModel):
    orgId: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=200)
    date: dt.date
    teamInvolvedId: str | None = None  # omitted for a custom ("Others") team
    teamInvolved: str | None = Field(default=None, max_length=200)
    amount: float = Field(ge=0)
    status: Status = "Not reimbursed"
    receiptInvolved: ReceiptInvolved | None = None


class ReimbursementUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    date: dt.date | None = None
    teamInvolvedId: str | None = None
    teamInvolved: str | None = Field(default=None, max_length=200)
    amount: float | None = Field(default=None, ge=0)
    status: Status | None = None
    receiptInvolved: ReceiptInvolved | None = None


class ReimbursementDelete(BaseModel):
    orgId: str = Field(min_length=1)
    ids: list[str] = Field(min_length=1)
