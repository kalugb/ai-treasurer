from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import dashboard, teams, organization
from lifespan import lifespan

app = FastAPI(title="AI Treasurer Mock API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(teams.router)
app.include_router(organization.router)
