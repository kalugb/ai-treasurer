from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routers import dashboard, teams, organization, google_connect, google_drive, agent, reimbursement, snapshots, cashin, ai_history, users, auth as auth_router
from lifespan import lifespan
from services import auth

ORIGINS = auth.allowed_origins()

app = FastAPI(title="AI Treasurer Backend", lifespan=lifespan)


@app.middleware("http")
async def reject_foreign_origin(request: Request, call_next):
    """CSRF guard for the cookie session: a state-changing request from a page on another origin is refused."""
    if request.method not in ("GET", "HEAD", "OPTIONS") and not auth.origin_allowed(request.headers.get("origin")):
        return JSONResponse({"detail": "Cross-site request blocked"}, status_code=403)
    return await call_next(request)


# added last = outermost, so preflights are answered before the origin guard sees them
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(dashboard.router)
app.include_router(teams.router)
app.include_router(organization.router)
app.include_router(google_connect.router)
app.include_router(google_drive.router)
app.include_router(agent.router)
app.include_router(reimbursement.router)
app.include_router(snapshots.router)
app.include_router(cashin.router)
app.include_router(ai_history.router)
app.include_router(users.router)
