from copy import deepcopy
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from mock_data import DASHBOARD, TEAMS

app = FastAPI(title="AI Treasurer Mock API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

teams = deepcopy(TEAMS)


class Member(BaseModel):
    name: str
    role: str


class Receipt(BaseModel):
    id: str
    filename: str
    merchant: str
    date: str
    amount: float
    category: str


class TeamInput(BaseModel):
    name: str = Field(min_length=1)
    budget: float = Field(ge=0)
    used: float = Field(ge=0)
    members: list[Member]


class Team(TeamInput):
    id: str
    receipts: list[Receipt]


class Dashboard(BaseModel):
    total_spending: float
    spending_change: float
    receipts_captured: int
    receipts_needing_review: int
    monthly_budget: float
    monthly_budget_used_percent: float
    recent_receipts: list[Receipt]


@app.get("/api/dashboard", response_model=Dashboard)
def get_dashboard():
    return DASHBOARD


@app.get("/api/teams", response_model=list[Team])
def get_teams():
    return teams


@app.post("/api/teams", response_model=Team, status_code=201)
def create_team(team: TeamInput):
    created = {**team.model_dump(), "id": str(uuid4()), "receipts": []}
    teams.append(created)
    return created


@app.put("/api/teams/{team_id}", response_model=Team)
def update_team(team_id: str, team: TeamInput):
    for index, current in enumerate(teams):
        if current["id"] == team_id:
            updated = {**team.model_dump(), "id": team_id, "receipts": current["receipts"]}
            teams[index] = updated
            return updated
    raise HTTPException(status_code=404, detail="Team not found")


@app.delete("/api/teams/{team_id}", status_code=204)
def delete_team(team_id: str):
    for index, team in enumerate(teams):
        if team["id"] == team_id:
            del teams[index]
            return
    raise HTTPException(status_code=404, detail="Team not found")
