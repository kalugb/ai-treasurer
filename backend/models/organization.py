from pydantic import BaseModel, Field
from datetime import datetime, timezone

class CreateOrganizationRequest(BaseModel):
    org_name: str
    owner_id: str
    created_at: datetime = Field(default_factory=datetime.now(timezone.utc))
    
class UpdateOrganizationRequest(BaseModel):
    org_id: str
    new_org_name: str