from typing import Literal

from pydantic import BaseModel, Field


class RunCreate(BaseModel):
    orgId: str
    teamId: str
    total: int = Field(ge=0, le=5000)


class RunFinish(BaseModel):
    orgId: str
    outcome: Literal["Finished", "Cancelled", "Stopped"]
    lastError: str | None = Field(default=None, max_length=500)
