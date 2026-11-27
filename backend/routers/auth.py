"""Sign up, sign in/out and session refresh. Tokens only ever travel in httpOnly cookies set here."""
import asyncio
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from models.auth import (ForgotPasswordRequest, LoginRequest, RegisterRequest, ResendCodeRequest, ResetPasswordRequest,
                         VerifyEmailRequest)
from services import auth, email_codes, mailer, users

router = APIRouter(prefix="/api/auth")
register_throttle = auth.Throttle(limit=10, window=60 * 60)  # every attempt counts, successful or not
# every request for a code counts (found or not), so these say nothing about which emails exist
send_ip_throttle = auth.Throttle(limit=20, window=60 * 60)
send_email_throttle = auth.Throttle(limit=5, window=60 * 60)
guess_throttle = auth.Throttle(limit=30, window=60 * 60)  # verify/reset attempts per IP; each code also allows 5 guesses
NOT_VERIFIED = "email_not_verified"


def _db(request: Request):
    db = request.app.state.mongo
    if db is None:
        raise HTTPException(status_code=503, detail="Database not available")
    return db


async def _open_session(request: Request, response: Response, session: dict, provider: str, remember: bool) -> dict:
    """Make sure the profile exists, then put the session in cookies. Returns the body for the client."""
    user = await run_in_threadpool(users.ensure_account, _db(request), session["user"], provider)
    if user.get("status", "active") != "active":
        raise HTTPException(status_code=403, detail="This account is disabled")
    if user.get("emailVerified") is False:  # no cookies until the emailed code has been entered
        raise HTTPException(status_code=403, detail={"code": NOT_VERIFIED, "email": user.get("email"), "message": users.EMAIL_NOT_VERIFIED})
    auth.set_session_cookies(response, session, remember)
    return {"user": users.public(user), **auth.session_body(session)}


def _count(request: Request, email: str) -> None:
    ip = auth.client_ip(request)
    send_ip_throttle.check(ip)
    send_email_throttle.check(email)
    send_ip_throttle.fail(ip)
    send_email_throttle.fail(email)


_mail_tasks: set = set()  # keeps a reference so a pending mail task is not garbage collected


async def _send_code(db, email: str, purpose: str) -> None:
    """Make a code and mail it without waiting (so the reply time can't tell whether the email exists).
    Inside the resend cooldown nothing is sent. A mail failure is only logged: the user can ask again."""
    try:
        code = await run_in_threadpool(email_codes.issue, db, email, purpose)
    except HTTPException as e:
        if e.status_code == 429:
            return
        raise

    async def mail():
        try:
            await mailer.send_code(email, purpose, code)
        except Exception as e:
            print(f"Could not send the {purpose} code: {type(e).__name__}")
    task = asyncio.create_task(mail())
    _mail_tasks.add(task)
    task.add_done_callback(_mail_tasks.discard)


@router.post("/register", status_code=201)
async def register(payload: RegisterRequest, request: Request):
    """Creates the account but signs nobody in: the emailed code must be entered first (POST /verify-email)."""
    ip = auth.client_ip(request)
    register_throttle.check(ip)
    register_throttle.fail(ip)
    _count(request, payload.email)
    db = _db(request)
    if await run_in_threadpool(users.find_by_username, db, payload.username):
        raise HTTPException(status_code=409, detail="That username is taken.")
    auth_id = await auth.admin_create_user(payload.email, payload.password, payload.username)
    try:
        await run_in_threadpool(
            lambda: users.create_account(db, auth_id=auth_id, username=payload.username, email=payload.email,
                                         display_name=None, provider="email", email_verified=False))
    except DuplicateKeyError:
        await auth.admin_delete_user(auth_id)
        raise HTTPException(status_code=409, detail="That username or email is already taken.")
    except Exception:
        await auth.admin_delete_user(auth_id)  # no half-made account: a login without a profile
        raise
    await _send_code(db, payload.email, "verify")
    return {"verificationRequired": True, "email": payload.email}


@router.post("/verify-email")
async def verify_email(payload: VerifyEmailRequest, request: Request):
    guess_throttle.check(auth.client_ip(request))
    guess_throttle.fail(auth.client_ip(request))
    db = _db(request)
    await run_in_threadpool(email_codes.check, db, payload.email, "verify", payload.code)
    await run_in_threadpool(users.mark_email_verified, db, payload.email)
    return {"ok": True}


@router.post("/resend-code")
async def resend_code(payload: ResendCodeRequest, request: Request):
    _count(request, payload.email)
    db = _db(request)
    doc = await run_in_threadpool(users.find_by_email, db, payload.email)
    if doc and doc.get("emailVerified") is False:
        await _send_code(db, payload.email, "verify")
    return {"ok": True}  # the same answer whether or not the email has an unverified account


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    _count(request, payload.email)
    db = _db(request)
    doc = await run_in_threadpool(users.find_by_email, db, payload.email)
    if doc and doc.get("authProvider") == "email" and doc.get("status", "active") == "active":  # Google-only accounts have no password
        await _send_code(db, payload.email, "reset")
    return {"ok": True, "message": "If that email has an account, we sent a code to it."}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request):
    guess_throttle.check(auth.client_ip(request))
    guess_throttle.fail(auth.client_ip(request))
    db = _db(request)
    await run_in_threadpool(email_codes.check, db, payload.email, "reset", payload.code)
    doc = await run_in_threadpool(users.find_by_email, db, payload.email)
    if not doc or not doc.get("authId"):
        raise HTTPException(status_code=400, detail=email_codes.BAD_CODE)
    await auth.admin_set_password(doc["authId"], payload.newPassword)
    await run_in_threadpool(users.mark_email_verified, db, payload.email)  # the code proved they own the address
    await auth.revoke_all_sessions(payload.email, payload.newPassword)
    auth.login_throttle.reset(f"{auth.client_ip(request)}|{payload.email}")
    return {"ok": True}


@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    identifier = payload.identifier.strip().lower()
    key = f"{auth.client_ip(request)}|{identifier}"
    auth.login_throttle.check(key)
    db = _db(request)
    email = identifier
    if "@" not in identifier:
        doc = await run_in_threadpool(users.find_by_username, db, identifier)
        email = (doc or {}).get("email")
    try:
        if not email:  # same answer and same cost as a wrong password: no way to tell which usernames exist
            raise HTTPException(status_code=401, detail=auth.BAD_LOGIN)
        session = await auth.password_login(email, payload.password)
    except HTTPException as e:
        if e.status_code == 401:
            auth.login_throttle.fail(key)
        raise
    auth.login_throttle.reset(key)
    try:
        return await _open_session(request, response, session, "email", payload.remember)
    except HTTPException as e:
        if isinstance(e.detail, dict) and e.detail.get("code") == NOT_VERIFIED and e.detail.get("email"):
            try:
                _count(request, e.detail["email"])
                await _send_code(db, e.detail["email"], "verify")  # the code from sign-up may have expired
            except HTTPException:
                pass  # throttled: the 403 below still tells the user to verify, and Resend is there
        raise


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get(auth.REFRESH_COOKIE)
    try:
        if not token:
            raise HTTPException(status_code=401, detail="Session expired")
        session = await auth.refresh_session(token)
        return await _open_session(request, response, session, "email", auth.remembered(request))
    except HTTPException as e:
        if e.status_code != 401:
            raise
        expired = JSONResponse({"detail": e.detail}, status_code=401)
        auth.clear_session_cookies(expired)
        return expired


@router.post("/logout")
async def logout(request: Request):
    token = request.cookies.get(auth.ACCESS_COOKIE)
    if token:
        await auth.sign_out(token)
    done = JSONResponse({"ok": True})
    auth.clear_session_cookies(done)
    return done


@router.get("/session")
async def get_session(request: Request, user: dict = Depends(users.get_current_user)):
    """Who is signed in and how long the access cookie still lasts (the client refreshes before that)."""
    return {"user": users.public(user), "expiresIn": max(0, int(request.state.claims["exp"] - time.time()))}


@router.get("/google/start")
async def google_start(remember: bool = False):
    """Browser navigates here; the PKCE verifier and the remember-me choice stay in a short-lived httpOnly cookie,
    then on to Google via Supabase."""
    verifier, challenge = auth.new_pkce()
    redirect = RedirectResponse(auth.google_authorize_url(challenge), status_code=302)
    redirect.set_cookie(auth.PKCE_COOKIE, f"{int(remember)}:{verifier}", max_age=600, httponly=True, secure=auth.cookie_secure(),
                        samesite="lax", path=auth.REFRESH_PATH)
    return redirect


@router.get("/google/callback")
async def google_callback(request: Request, code: str | None = None, error: str | None = None):
    home = auth.frontend_url()
    remember_flag, _, verifier = (request.cookies.get(auth.PKCE_COOKIE) or "").partition(":")

    def finish(url: str) -> RedirectResponse:
        redirect = RedirectResponse(url, status_code=302)
        redirect.delete_cookie(auth.PKCE_COOKIE, path=auth.REFRESH_PATH)
        return redirect

    if error or not code or not verifier:
        return finish(f"{home}/?auth=error")
    try:
        session = await auth.exchange_code(code, verifier)
        user = await run_in_threadpool(users.ensure_account, _db(request), session["user"], "google")
    except Exception as e:
        print(f"Google sign-in failed: {type(e).__name__}")
        return finish(f"{home}/?auth=error")
    if user.get("status", "active") != "active":
        return finish(f"{home}/?auth=disabled")
    redirect = finish(f"{home}/")
    auth.set_session_cookies(redirect, session, remember_flag == "1")
    return redirect
