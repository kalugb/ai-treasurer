from pydantic import BaseModel, Field, ConfigDict


class Member(BaseModel):
    name: str
    role: str


class CreateTeamRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    org_id: str = Field(alias="orgId", min_length=1)
    org_owner_id: str | None = Field(default=None, alias="ownerId")
    team_name: str = Field(alias="name", min_length=1)
    budget: float | None = Field(default=None, alias="budget")
    members: list[Member] | None = Field(default=None, alias="members")


class UpdateTeamRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    team_name: str | None = Field(default=None, alias="name")
    budget: float | None = Field(default=None, alias="budget")
    members: list[Member] | None = Field(default=None, alias="members")
