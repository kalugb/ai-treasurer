"""Google OAuth callback. Start the flow with POST /api/users/me/google-drive/connect."""
from urllib.parse import urlencode

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from starlette.concurrency import run_in_threadpool

from services.google import drive_tokens, google_connect

router = APIRouter(prefix="/api/connect")


def _back(result: str) -> RedirectResponse:
    return RedirectResponse(f"{google_connect.frontend_url()}/?{urlencode({'googleDrive': result})}", status_code=302)


@router.get("/google/callback")
async def google_callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None):
    # the user comes from the encrypted, time-limited state (not from a query param), so it can't be swapped
    if error or not code or not state or request.app.state.mongo is None:
        return _back("error")
    try:
        user_key, creds_json, email = await run_in_threadpool(google_connect.finish_authorization, code, state)
        await run_in_threadpool(drive_tokens.save_connection, request.app.state.mongo, user_key, creds_json, email)
    except Exception as e:
        print(f"Google connect failed: {type(e).__name__}")  # never echo Google's error text or token data
        return _back("error")
    return _back("connected")
