from copy import deepcopy
from uuid import uuid4

from fastapi import APIRouter, HTTPException

from mock_data import TEAMS
from models.team import Team, TeamInput

router = APIRouter(prefix="/api")
teams = deepcopy(TEAMS)


@router.get("/teams", response_model=list[Team])
def get_teams():
    return teams


@router.post("/teams", response_model=Team, status_code=201)
def create_team(team: TeamInput):
    created = {**team.model_dump(), "id": str(uuid4()), "receipts": []}
    teams.append(created)
    return created


@router.put("/teams/{team_id}", response_model=Team)
def update_team(team_id: str, team: TeamInput):
    for index, current in enumerate(teams):
        if current["id"] == team_id:
            updated = {**team.model_dump(), "id": team_id, "receipts": current["receipts"]}
            teams[index] = updated
            return updated
    raise HTTPException(status_code=404, detail="Team not found")


@router.delete("/teams/{team_id}", status_code=204)
def delete_team(team_id: str):
    for index, team in enumerate(teams):
        if team["id"] == team_id:
            del teams[index]
            return
    raise HTTPException(status_code=404, detail="Team not found")
