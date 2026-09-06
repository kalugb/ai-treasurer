from pydantic import BaseModel, ConfigDict, Field


class CreateOrganizationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    org_name: str = Field(alias="orgName", min_length=1)
    owner_id: str = Field(alias="ownerId")


class UpdateOrganizationRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    org_name: str = Field(alias="orgName", min_length=1)