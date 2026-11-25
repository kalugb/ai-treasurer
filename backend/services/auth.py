"""Session auth. Supabase Auth owns passwords and issues the tokens; this module
- verifies access tokens (ES256 via the project's JWKS, checked locally, no network per request),
- talks to Supabase Auth (GoTrue) over REST,
- keeps the tokens in httpOnly cookies, so page scripts can never read them.

The browser only ever talks to this backend on its own origin (Vite proxy in dev, nginx in Docker/EC2), so the
cookies are first-party and SameSite=Lax. Non-GET requests are additionally checked against the allowed origins
(see `allowed_origins` / main.py), which closes CSRF.
"""
import base64
import hashlib
import os
import secrets
import time
from urllib.parse import urlparse

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import HTTPException, Request, Response

load_dotenv()

ACCESS_COOKIE = "sb_access"
REFRESH_COOKIE = "sb_refresh"
PKCE_COOKIE = "sb_pkce"  # Google sign-in: "<0|1>:<code verifier>" (remember choice + verifier), lives 10 minutes
REMEMBER_COOKIE = "sb_remember"  # present = "remember me" was ticked; read on refresh to keep the cookies persistent
ACCESS_PATH = "/api"
REFRESH_PATH = "/api/auth"
REFRESH_MAX_AGE = 60 * 60 * 24 * 60
BAD_LOGIN = "Invalid username/email or password."

DEFAULT_ORIGINS = ["http://localhost:5173", "http://localhost:8080", "http://localhost:80"]


def _url() -> str:
    return (os.getenv("SUPABASE_URL") or "").rstrip("/")


def frontend_url() -> str:
    """Public address of the app (what the browser shows). Callbacks and redirects are built from it."""
    return (os.getenv("FRONTEND_URL") or "http://localhost:5173").rstrip("/")


def allowed_origins() -> list[str]:
    extra = [o.strip().rstrip("/") for o in (os.getenv("ALLOWED_ORIGINS") or "").split(",") if o.strip()]
    origins = [*DEFAULT_ORIGINS, frontend_url(), *extra]
    return list(dict.fromkeys(origins))


def cookie_secure() -> bool:
    # true behind HTTPS (EC2); browsers drop Secure cookies over plain http, except on localhost
    return (os.getenv("COOKIE_SECURE") or "false").strip().lower() == "true"


# ---------- access token ----------

_jwks: jwt.PyJWKClient | None = None


def _jwks_client() -> jwt.PyJWKClient:
    global _jwks
    if _jwks is None:
        _jwks = jwt.PyJWKClient(
            f"{_url()}/auth/v1/.well-known/jwks.json",
            headers={"apikey": os.getenv("SUPABASE_PUBLISHABLE_KEY") or ""},
            cache_keys=True,
            lifespan=3600,
        )
    return _jwks


def verify_token(token: str) -> dict:
    """Return the claims of a valid Supabase access token, else 401. shortcut: only asymmetric signing keys (JWKS)
    are supported; a legacy HS256 project would need SUPABASE_JWT_SECRET here."""
    try:
        key = _jwks_client().get_signing_key_from_jwt(token).key
        return jwt.decode(
            token, key, algorithms=["ES256", "RS256"], audience="authenticated",
            issuer=f"{_url()}/auth/v1", options={"require": ["exp", "sub"]},
            leeway=30,  # this machine's clock may differ from Supabase's by seconds (measured: 6s); a token must not be "not yet valid"
        )
    except jwt.PyJWKClientError as e:  # Supabase unreachable / unknown key id
        if isinstance(e, jwt.PyJWKClientConnectionError):
            raise HTTPException(status_code=503, detail="Sign-in service unavailable")
        raise HTTPException(status_code=401, detail="Not signed in")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Not signed in")


# ---------- Supabase Auth REST ----------

def _headers(key: str) -> dict:
    headers = {"apikey": key}
    if key.startswith("eyJ"):  # legacy JWT-style keys also go in Authorization; the new sb_* keys must not
        headers["Authorization"] = f"Bearer {key}"
    return headers


async def _gotrue(method: str, path: str, *, json=None, params=None, key: str | None = None, bearer: str | None = None) -> httpx.Response:
    headers = _headers(key or os.getenv("SUPABASE_PUBLISHABLE_KEY") or "")
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            return await client.request(method, f"{_url()}/auth/v1{path}", json=json, params=params, headers=headers)
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Sign-in service unavailable")


def _error_code(res: httpx.Response) -> str:
    try:
        return str(res.json().get("error_code") or "")
    except Exception:
        return ""


async def password_login(email: str, password: str) -> dict:
    res = await _gotrue("POST", "/token", params={"grant_type": "password"}, json={"email": email, "password": password})
    if res.status_code in (400, 401, 422):
        raise HTTPException(status_code=401, detail=BAD_LOGIN)
    if res.status_code != 200:
        raise HTTPException(status_code=503, detail="Sign-in service unavailable")
    return res.json()


async def refresh_session(refresh_token: str) -> dict:
    res = await _gotrue("POST", "/token", params={"grant_type": "refresh_token"}, json={"refresh_token": refresh_token})
    if res.status_code in (400, 401, 403, 422):
        raise HTTPException(status_code=401, detail="Session expired")
    if res.status_code != 200:
        raise HTTPException(status_code=503, detail="Sign-in service unavailable")
    return res.json()


async def sign_out(access_token: str) -> None:
    """Best effort: revoke this session at Supabase. Cookies are cleared either way."""
    try:
        await _gotrue("POST", "/logout", params={"scope": "local"}, bearer=access_token)
    except HTTPException:
        pass


async def admin_create_user(email: str, password: str, username: str) -> str:
    """Create a confirmed Supabase user (no SMTP yet, so no confirmation mail) and return its id.
    shortcut: marks the email as confirmed without proof; enable email confirmation once SMTP exists."""
    res = await _gotrue(
        "POST", "/admin/users", key=os.getenv("SUPABASE_SECRET_KEY") or "",
        json={"email": email, "password": password, "email_confirm": True, "user_metadata": {"username": username}},
    )
    if res.status_code in (200, 201):
        return res.json()["id"]
    code = _error_code(res)
    if code in ("email_exists", "user_already_exists", "identity_already_exists"):
        raise HTTPException(status_code=409, detail="That email is already registered.")
    if code == "weak_password":
        raise HTTPException(status_code=422, detail="That password is too weak.")
    if res.status_code == 422:
        raise HTTPException(status_code=422, detail="That email or password was rejected.")
    print(f"Supabase create user failed: {res.status_code} {code}")
    raise HTTPException(status_code=503, detail="Sign-in service unavailable")


async def admin_delete_user(user_id: str) -> None:
    """Rollback helper when the profile could not be saved. Best effort."""
    try:
        await _gotrue("DELETE", f"/admin/users/{user_id}", key=os.getenv("SUPABASE_SECRET_KEY") or "")
    except HTTPException:
        print("Could not roll back the Supabase user")


# ---------- Google sign-in (PKCE, finished on the backend so the browser never holds tokens) ----------

def new_pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def google_authorize_url(challenge: str) -> str:
    from urllib.parse import urlencode
    query = urlencode({
        "provider": "google",
        "redirect_to": f"{frontend_url()}/api/auth/google/callback",
        "code_challenge": challenge,
        "code_challenge_method": "s256",
    })
    return f"{_url()}/auth/v1/authorize?{query}"


async def exchange_code(code: str, verifier: str) -> dict:
    res = await _gotrue("POST", "/token", params={"grant_type": "pkce"}, json={"auth_code": code, "code_verifier": verifier})
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Google sign-in failed")
    return res.json()


# ---------- cookies ----------

def set_session_cookies(response: Response, session: dict, remember: bool) -> None:
    """remember=False: browser-session cookies (no Max-Age), gone when the browser closes.
    remember=True: they survive a restart; the refresh cookie for REFRESH_MAX_AGE.
    The choice rides in REMEMBER_COOKIE so a refresh keeps it."""
    secure = cookie_secure()
    keep = (lambda seconds: seconds) if remember else (lambda seconds: None)
    response.set_cookie(ACCESS_COOKIE, session["access_token"], max_age=keep(int(session.get("expires_in", 3600))),
                        httponly=True, secure=secure, samesite="lax", path=ACCESS_PATH)
    response.set_cookie(REFRESH_COOKIE, session["refresh_token"], max_age=keep(REFRESH_MAX_AGE),
                        httponly=True, secure=secure, samesite="lax", path=REFRESH_PATH)
    if remember:
        response.set_cookie(REMEMBER_COOKIE, "1", max_age=REFRESH_MAX_AGE, httponly=True, secure=secure,
                            samesite="lax", path=REFRESH_PATH)
    else:
        response.delete_cookie(REMEMBER_COOKIE, path=REFRESH_PATH)


def remembered(request: Request) -> bool:
    return request.cookies.get(REMEMBER_COOKIE) == "1"


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_COOKIE, path=ACCESS_PATH)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_PATH)
    response.delete_cookie(REMEMBER_COOKIE, path=REFRESH_PATH)


def session_body(session: dict) -> dict:
    return {"expiresIn": int(session.get("expires_in", 3600))}


# ---------- login throttle ----------

class Throttle:
    """Counts failures per key in a sliding window. shortcut: per process (in memory), so with several workers
    each has its own counter; move to Redis when running more than one."""

    def __init__(self, limit: int = 5, window: int = 15 * 60):
        self.limit, self.window, self._hits = limit, window, {}

    def _recent(self, key: str) -> list[float]:
        now = time.monotonic()
        hits = [t for t in self._hits.get(key, []) if now - t < self.window]
        if hits:
            self._hits[key] = hits
        else:
            self._hits.pop(key, None)
        return hits

    def check(self, key: str) -> None:
        if len(self._recent(key)) >= self.limit:
            raise HTTPException(status_code=429, detail="Too many attempts. Try again in a few minutes.")

    def fail(self, key: str) -> None:
        self._recent(key)
        self._hits.setdefault(key, []).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)


login_throttle = Throttle()


def client_ip(request: Request) -> str:
    # behind nginx uvicorn runs with --proxy-headers, so this is the real client address
    return request.client.host if request.client else "unknown"


def origin_allowed(origin: str | None) -> bool:
    """Used for non-GET requests. A request without an Origin header isn't a browser cross-site request."""
    if origin is None:
        return True
    o = urlparse(origin)
    return f"{o.scheme}://{o.netloc}" in allowed_origins() and bool(o.scheme and o.netloc)
