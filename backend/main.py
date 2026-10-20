from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import dashboard, teams, organization, google_connect, google_drive
from lifespan import lifespan

ORIGINS = ["http://localhost:5173", ]

app = FastAPI(title="AI Treasurer Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(teams.router)
app.include_router(organization.router)
app.include_router(google_connect.router)
app.include_router(google_drive.router)
