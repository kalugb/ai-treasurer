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
    displayName: str | None = Field(None, max_length=80)  # email and username belong to the login and can't change here
    settings: UserSettingsUpdate | None = None
