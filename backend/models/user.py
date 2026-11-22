from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from services.users import CURRENCIES


class UserSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    currency: Literal[CURRENCIES] | None = None
    monthlySummaries: bool | None = None
    reviewReminders: bool | None = None


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    displayName: str | None = Field(None, max_length=80)
    # "" clears the email
    email: str | None = Field(None, max_length=254, pattern=r"^(|[^@\s]+@[^@\s]+\.[^@\s]+)$")
    settings: UserSettingsUpdate | None = None
