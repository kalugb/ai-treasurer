from pydantic import BaseModel, Field, field_validator


class SnapshotCreate(BaseModel):
    orgId: str
    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def _trim(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Snapshot name cannot be empty")
        return value
