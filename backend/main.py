from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import dashboard, teams

app = FastAPI(title="AI Treasurer Mock API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router)
app.include_router(teams.router)
