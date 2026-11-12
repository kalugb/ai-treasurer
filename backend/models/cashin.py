from pydantic import BaseModel, Field


class CashInDelete(BaseModel):
    orgId: str = Field(min_length=1)
    ids: list[str] = Field(min_length=1)
