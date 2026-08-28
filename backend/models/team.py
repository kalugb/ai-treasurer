from pydantic import BaseModel, Field

from models.receipt import Receipt


class Member(BaseModel):
    name: str
    role: str


class TeamInput(BaseModel):
    name: str = Field(min_length=1)
    budget: float = Field(ge=0)
    used: float = Field(ge=0)
    members: list[Member]


class Team(TeamInput):
    id: str
    receipts: list[Receipt]
