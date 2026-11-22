"""Google OAuth (web redirect flow) for per-user Drive connections.

connect:  authorization_url(user_key) -> Google consent URL. The `state` is a Fernet token holding the user key and
          the PKCE code verifier, valid STATE_TTL seconds, so the callback needs no server-side session.
callback: finish_authorization(code, state) -> (user_key, creds_json, account_email).
Needs a "Web application" OAuth client in google_creds/credentials.json with GOOGLE_OAUTH_REDIRECT_URI registered.
"""
import json
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from services import crypto

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
CREDENTIALS_FILE = Path(__file__).parent.parent.parent / "google_creds" / "credentials.json"
LEGACY_TOKEN_FILE = Path(__file__).parent.parent.parent / "google_creds" / "token.json"  # only read by the one-time import
STATE_TTL = 600


def redirect_uri() -> str:
    return os.getenv("GOOGLE_OAUTH_REDIRECT_URI", "http://localhost:8000/api/connect/google/callback")


def frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def _flow(**kwargs) -> Flow:
    if not CREDENTIALS_FILE.exists():
        raise RuntimeError("google_creds/credentials.json is missing")
    return Flow.from_client_secrets_file(str(CREDENTIALS_FILE), scopes=SCOPES, redirect_uri=redirect_uri(), **kwargs)


def authorization_url(user_key: str) -> str:
    verifier = secrets.token_urlsafe(64)  # PKCE; must survive the round trip, so it rides in the encrypted state
    state = crypto.encrypt(json.dumps({"u": user_key, "v": verifier}))
    url, _ = _flow(code_verifier=verifier).authorization_url(
        access_type="offline",
        prompt="consent",  # always return a refresh token, also on a reconnect
        state=state,
    )
    return url


def account_email(creds: Credentials) -> str | None:
    """Blocking. The Google account behind the token (best effort)."""
    try:
        about = build("drive", "v3", credentials=creds, cache_discovery=False).about().get(fields="user(emailAddress)").execute()
        return about.get("user", {}).get("emailAddress")
    except Exception as e:
        print(f"Could not read the Google account email: {type(e).__name__}")
        return None


def finish_authorization(code: str, state: str) -> tuple[str, str, str | None]:
    """Blocking. Raises InvalidToken for a forged/expired state, or an oauthlib error for a bad code."""
    data = json.loads(crypto.decrypt(state, ttl=STATE_TTL))
    flow = _flow(code_verifier=data["v"], state=state)
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        raise ValueError("Google returned no refresh token")
    return data["u"], creds.to_json(), account_email(creds)
