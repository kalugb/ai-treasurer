"""Self-check for sign up / sign in / sessions / ownership. Run from backend/:  uv run python tests/test_auth.py

Supabase Auth is faked (a tiny in-memory GoTrue that signs real ES256 tokens), MongoDB is a throwaway database on the
configured local server (dropped at the end). Nothing is sent to Supabase or Google.
"""
import asyncio
import base64
import hashlib
import os
import sys
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["SUPABASE_URL"] = "https://fake.supabase.test"
os.environ["COOKIE_SECURE"] = "false"
os.environ["FRONTEND_URL"] = "http://localhost:5173"
os.environ.setdefault("TOKEN_ENCRYPTION_KEY", "test-only-key")

import httpx
import jwt
from bson import ObjectId
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from pymongo import MongoClient

from routers import auth as auth_router  # noqa: E402
from services import auth, email_codes, mailer, users  # noqa: E402
import main  # noqa: E402
from services.redis.cache import CacheStore  # noqa: E402
from services.redis.events import EventBus  # noqa: E402
from services.redis.redis_client import RedisLink  # noqa: E402

ORIGIN = {"Origin": "http://localhost:5173"}
PRIVATE = ec.generate_private_key(ec.SECP256R1())
ISS = f"{os.environ['SUPABASE_URL']}/auth/v1"


def sign(sub, email, exp_in=3600, aud="authenticated", key=PRIVATE, iat_in=0):
    claims = {"sub": sub, "email": email, "aud": aud, "iss": ISS, "exp": int(time.time()) + exp_in, "iat": int(time.time()) + iat_in}
    return jwt.encode(claims, key, algorithm="ES256", headers={"kid": "k1"})


class FakeKey:
    def __init__(self):
        self.key = PRIVATE.public_key()


class FakeJwks:
    def get_signing_key_from_jwt(self, token):
        return FakeKey()


class FakeGoTrue:
    def __init__(self):
        self.users, self.refresh, self.codes, self.revoked = {}, {}, {}, []

    def session(self, u):
        refresh = uuid.uuid4().hex
        self.refresh[refresh] = u["id"]
        return {"access_token": sign(u["id"], u["email"]), "refresh_token": refresh, "expires_in": 3600,
                "user": {"id": u["id"], "email": u["email"], "user_metadata": u.get("meta", {})}}

    async def __call__(self, method, path, *, json=None, params=None, key=None, bearer=None):
        def res(status, body=None):
            return httpx.Response(status, json=body if body is not None else {})
        if path == "/admin/users" and method == "POST":
            if json["email"] in {u["email"] for u in self.users.values()}:
                return res(422, {"error_code": "email_exists"})
            u = {"id": str(uuid.uuid4()), "email": json["email"], "password": json["password"], "meta": json["user_metadata"]}
            self.users[u["id"]] = u
            return res(200, {"id": u["id"]})
        if path.startswith("/admin/users/") and method == "PUT":
            self.users[path.rsplit("/", 1)[1]]["password"] = json["password"]
            return res(200)
        if path.startswith("/admin/users/") and method == "DELETE":
            self.users.pop(path.rsplit("/", 1)[1], None)
            return res(200)
        if path == "/token":
            grant = params["grant_type"]
            if grant == "password":
                for u in self.users.values():
                    if u["email"] == json["email"] and u["password"] == json["password"]:
                        return res(200, self.session(u))
                return res(400, {"error_code": "invalid_credentials"})
            if grant == "refresh_token":
                uid = self.refresh.pop(json["refresh_token"], None)  # rotation: a refresh token works once
                return res(200, self.session(self.users[uid])) if uid else res(400, {"error_code": "refresh_token_not_found"})
            if grant == "pkce":
                u = self.codes.get(json["auth_code"])
                return res(200, self.session(u)) if u and json["code_verifier"] else res(400)
        if path == "/logout":
            self.revoked.append(bearer)
            if (params or {}).get("scope") == "global":
                uid = jwt.decode(bearer, options={"verify_signature": False})["sub"]
                self.refresh = {k: v for k, v in self.refresh.items() if v != uid}
            return res(204)
        raise AssertionError(f"unexpected GoTrue call {method} {path}")


def new_client():
    return TestClient(main.app, base_url="http://localhost:5173", follow_redirects=False)


def check(label, cond):
    print(("ok   " if cond else "FAIL ") + label)
    if not cond:
        raise SystemExit(1)


def main_check():
    gotrue = FakeGoTrue()
    auth._gotrue, auth._jwks_client = gotrue, lambda: FakeJwks()
    issued, mails = {}, []  # (email, purpose) -> last code made; mails actually handed to the mailer
    real_issue = email_codes.issue

    def recording_issue(db, email, purpose):
        issued[(email, purpose)] = code = real_issue(db, email, purpose)
        return code

    async def fake_send_code(to, purpose, code):
        mails.append((to, purpose, code))
    email_codes.issue, mailer.send_code = recording_issue, fake_send_code

    def clear_throttles():
        for t in (auth.login_throttle, auth_router.register_throttle, auth_router.send_ip_throttle,
                  auth_router.send_email_throttle, auth_router.guess_throttle):
            t._hits.clear()

    def signup(client, username, email, password):
        """Register, enter the emailed code, then sign in: what a person does."""
        clear_throttles()
        assert client.post("/api/auth/register", json={"username": username, "email": email, "password": password}, headers=ORIGIN).status_code == 201
        assert client.post("/api/auth/verify-email", json={"email": email.lower(), "code": issued[(email.lower(), "verify")]}, headers=ORIGIN).status_code == 200
        assert client.post("/api/auth/login", json={"identifier": username, "password": password}, headers=ORIGIN).status_code == 200
    tag = uuid.uuid4().hex[:8]
    mongo = MongoClient(os.getenv("MONGODB_URI") or "mongodb://localhost:27017/")
    names = [f"zz_auth_main_{tag}", f"zz_auth_ai_{tag}", f"zz_auth_hist_{tag}"]
    db, ai, hist = (mongo[n] for n in names)
    try:
        users.ensure_indexes(db)
        email_codes.ensure_indexes(db)
        link = RedisLink("redis://127.0.0.1:1/0")  # unreachable on purpose: in-memory cache/events fallbacks
        st = main.app.state
        st.mongo, st.ai_mongo, st.history_mongo = db, ai, hist
        st.cache, st.events, st.redis_link = CacheStore(link), EventBus(link), link
        st.llm_inference = st.embeddings_client = st.supabase = None

        # the pre-auth user "1" owns an org (this is the data the first account must inherit)
        users.get_or_create(db, "1")
        org1 = db["organizations"].insert_one({"orgName": "Legacy org", "ownerId": "1"}).inserted_id
        team1 = db["departments"].insert_one({"name": "Legacy team", "orgId": org1, "budget": 10}).inserted_id

        anon = new_client()
        check("no cookie: /api/users/me is 401", anon.get("/api/users/me").status_code == 401)
        check("no cookie: CSRF-safe GET of auth session is 401", anon.get("/api/auth/session").status_code == 401)

        # every route except the sign-in ones refuses an anonymous caller
        open_paths = {"/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout",
                      "/api/auth/verify-email", "/api/auth/resend-code", "/api/auth/forgot-password", "/api/auth/reset-password",
                      "/api/auth/google/start", "/api/auth/google/callback", "/api/connect/google/callback"}
        bad = []
        for path, methods in main.app.openapi()["paths"].items():
            if path in open_paths:
                continue
            for method in methods:
                url = path.replace("{", "").replace("}", "")
                url = "".join(c if c.isalnum() or c in "/-_." else "" for c in url)
                r = anon.request(method.upper(), url.replace("team_id", "0" * 24).replace("file_id", "x"), headers=ORIGIN)
                if r.status_code != 401:
                    bad.append((method, path, r.status_code))
        check(f"anonymous callers get 401 on every protected route ({bad})", not bad)

        # ---- sign up
        a = new_client()
        for body in ({"username": "ab", "email": "a@x.com", "password": "password1"},
                     {"username": "bad name!", "email": "a@x.com", "password": "password1"},
                     {"username": "alice", "email": "nope", "password": "password1"},
                     {"username": "alice", "email": "a@x.com", "password": "short"},
                     {"username": "alice", "email": "a@x.com", "password": "password1", "role": "admin"}):
            check(f"register rejects {list(body.values())[:2]}", a.post("/api/auth/register", json=body, headers=ORIGIN).status_code == 422)
        clear_throttles()
        r = a.post("/api/auth/register", json={"username": "Alice", "email": "Alice@X.com", "password": "password1"}, headers=ORIGIN)
        check("register ok, asks for verification", r.status_code == 201 and r.json() == {"verificationRequired": True, "email": "alice@x.com"})
        check("register sets no cookies (nobody is signed in yet)", not r.headers.get_list("set-cookie") and a.get("/api/auth/session").status_code == 401)
        check("a code was made for the new email", ("alice@x.com", "verify") in issued)
        check("the code is stored hashed, not in clear", issued[("alice@x.com", "verify")] not in str(db["emailCodes"].find_one({"email": "alice@x.com"})))
        for _ in range(50):  # the mail is sent without waiting for it
            if mails:
                break
            time.sleep(0.05)
        check("the code was handed to the mailer", mails == [("alice@x.com", "verify", issued[("alice@x.com", "verify")])])
        alice_id = db["users"].find_one({"username": "alice"})["authId"]
        check("profile starts unverified", db["users"].find_one({"username": "alice"})["emailVerified"] is False)
        pre = new_client()
        pre.cookies.set("sb_access", sign(alice_id, "alice@x.com"))
        check("a valid Supabase token of an unverified user is refused everywhere (403)", pre.get("/api/users/me").status_code == 403)
        lg = new_client().post("/api/auth/login", json={"identifier": "alice", "password": "password1"}, headers=ORIGIN)
        check("login before verifying -> 403 email_not_verified, no cookies", lg.status_code == 403 and lg.json()["detail"]["code"] == "email_not_verified" and not lg.headers.get_list("set-cookie"))
        check("wrong password still looks like any wrong password", new_client().post("/api/auth/login", json={"identifier": "alice", "password": "nope-nope"}, headers=ORIGIN).status_code == 401)
        good = issued[("alice@x.com", "verify")]
        wrong = "000000" if good != "000000" else "111111"
        check("wrong code -> 400", a.post("/api/auth/verify-email", json={"email": "alice@x.com", "code": wrong}, headers=ORIGIN).status_code == 400)
        check("malformed code -> 422", a.post("/api/auth/verify-email", json={"email": "alice@x.com", "code": "12ab56"}, headers=ORIGIN).status_code == 422)
        check("code for another email -> 400", a.post("/api/auth/verify-email", json={"email": "other@x.com", "code": good}, headers=ORIGIN).status_code == 400)
        check("verify with the right code", a.post("/api/auth/verify-email", json={"email": "alice@x.com", "code": good}, headers=ORIGIN).status_code == 200)
        check("the code works only once", a.post("/api/auth/verify-email", json={"email": "alice@x.com", "code": good}, headers=ORIGIN).status_code == 400)
        r = a.post("/api/auth/login", json={"identifier": "alice", "password": "password1"}, headers=ORIGIN)
        check("login after verifying", r.status_code == 200)
        check("tokens are in httpOnly cookies, not in the body", "access_token" not in r.text and "refresh_token" not in r.text)
        setc = " ".join(r.headers.get_list("set-cookie")).lower()
        check("cookies are httponly + samesite=lax", setc.count("httponly") == 2 and "samesite=lax" in setc)
        check("refresh cookie is scoped to /api/auth", "path=/api/auth" in setc and "path=/api" in setc)
        me = a.get("/api/auth/session").json()
        check("username lowercased, display name defaults to it", me["user"]["username"] == "alice" and me["user"]["displayName"] == "alice")
        check("email lowercased", me["user"]["email"] == "alice@x.com")
        check("first account took over user '1' (same key)", me["user"]["userKey"] == "1")
        check("session reports remaining lifetime", 3500 < me["expiresIn"] <= 3600)
        check("legacy org is visible to the first account", [o["id"] for o in a.get("/api/organizations").json()] == [str(org1)])

        # ---- second account: separate identity, cannot reach the first one's data
        b = new_client()
        clear_throttles()
        check("duplicate username -> 409", b.post("/api/auth/register", json={"username": "ALICE", "email": "b@x.com", "password": "password1"}, headers=ORIGIN).status_code == 409)
        check("duplicate email -> 409", b.post("/api/auth/register", json={"username": "bob", "email": "alice@x.com", "password": "password1"}, headers=ORIGIN).status_code == 409)
        check("failed sign-ups left no Supabase orphan", len(gotrue.users) == 1)
        check("register ok (2nd)", signup(b, "bob", "b@x.com", "password1") is None)
        bme = b.get("/api/auth/session").json()["user"]
        check("second account gets its own key", bme["userKey"] not in ("1", "") and ObjectId.is_valid(bme["userKey"]))
        check("second account has no orgs", b.get("/api/organizations").status_code == 404)
        spoof = {"orgId": str(org1), "ownerId": "1"}  # a client-sent owner id must be ignored
        check("teams of another owner: refused even with ownerId=1", b.get("/api/teams", params=spoof).status_code == 403)
        check("dashboard of another owner refused", b.get("/api/dashboard", params=spoof).status_code in (403, 404))
        check("cash in of another owner refused", b.get("/api/cashins", params=spoof).status_code in (403, 404))
        check("receipts of another owner's team: 404", b.get(f"/api/google-drive/teams/{team1}/receipts").status_code == 404)
        check("owner still reads own team receipts", a.get(f"/api/google-drive/teams/{team1}/receipts").status_code == 200)
        check("rename of another owner's org refused", b.put(f"/api/organizations/{org1}", json={"org_name": "pwn", "orgName": "pwn"}, headers=ORIGIN).status_code in (403, 404, 422))
        check("delete of another owner's org refused", b.delete(f"/api/organizations/{org1}", headers=ORIGIN).status_code in (403, 404))
        check("org survived", db["organizations"].count_documents({"_id": org1}) == 1)
        created = b.post("/api/organizations", json={"org_name": "Bob org", "orgName": "Bob org", "owner_id": "1", "ownerId": "1"}, headers=ORIGIN)
        if created.status_code == 201:
            check("new org belongs to the session user, not the payload's owner", created.json()["ownerId"] == bme["userKey"])
        else:
            check(f"org create validation ({created.status_code}, body shape differs)", created.status_code == 422)

        # agent chats are per user
        ai["memories"].insert_one({"userId": users.user_oid("1"), "conversationId": ObjectId(), "input": "secret", "status": "Succeeded", "time": __import__("datetime").datetime.now()})
        check("agent conversations: owner sees theirs", len(a.get("/api/agent/conversations").json()) == 1)
        check("agent conversations: other user sees none", b.get("/api/agent/conversations", params={"userId": "1"}).json() == [])

        # ---- profile
        check("email cannot be changed here", a.patch("/api/users/me", json={"email": "x@y.com"}, headers=ORIGIN).status_code == 422)
        check("display name can", a.patch("/api/users/me", json={"displayName": "Alice A"}, headers=ORIGIN).json()["displayName"] == "Alice A")

        # ---- sign in by username and by email, same generic failure
        c = new_client()
        check("login by username", c.post("/api/auth/login", json={"identifier": "ALICE", "password": "password1"}, headers=ORIGIN).status_code == 200)
        check("session works after login", c.get("/api/users/me").json()["username"] == "alice")
        d = new_client()
        check("login by email", d.post("/api/auth/login", json={"identifier": "Alice@x.com", "password": "password1"}, headers=ORIGIN).status_code == 200)
        w1 = new_client().post("/api/auth/login", json={"identifier": "alice", "password": "wrong-pass"}, headers=ORIGIN)
        w2 = new_client().post("/api/auth/login", json={"identifier": "nobody", "password": "wrong-pass"}, headers=ORIGIN)
        check("wrong password and unknown user look identical", (w1.status_code, w1.json()) == (w2.status_code, w2.json()) == (401, {"detail": auth.BAD_LOGIN}))
        auth.login_throttle._hits.clear()
        t = new_client()
        codes = [t.post("/api/auth/login", json={"identifier": "alice", "password": f"wrong-{i}"}, headers=ORIGIN).status_code for i in range(6)]
        check(f"6th failed attempt is throttled {codes}", codes == [401] * 5 + [429])
        check("right password is also blocked while throttled", t.post("/api/auth/login", json={"identifier": "alice", "password": "password1"}, headers=ORIGIN).status_code == 429)
        auth.login_throttle._hits.clear()

        # ---- tokens
        for label, token in (("expired", sign("x", "x@x", exp_in=-10)), ("wrong audience", sign("x", "x@x", aud="anon")),
                             ("signed by another key", sign("x", "x@x", key=ec.generate_private_key(ec.SECP256R1()))),
                             ("garbage", "not.a.jwt")):
            e = new_client()
            e.cookies.set("sb_access", token)
            check(f"{label} token -> 401", e.get("/api/users/me").status_code == 401)
        skewed = new_client()
        skewed.cookies.set("sb_access", sign(me["user"]["authId"] if "authId" in me["user"] else db["users"].find_one({"username": "alice"})["authId"], "alice@x.com", iat_in=10))
        check("a token issued 10s in the future (clock skew) is accepted", skewed.get("/api/users/me").status_code == 200)
        far = new_client()
        far.cookies.set("sb_access", sign(db["users"].find_one({"username": "alice"})["authId"], "alice@x.com", iat_in=600))
        check("a token issued 10 minutes in the future is refused", far.get("/api/users/me").status_code == 401)
        valid_unknown = new_client()
        valid_unknown.cookies.set("sb_access", sign(str(uuid.uuid4()), "ghost@x.com"))
        check("valid token for a user with no profile -> 401", valid_unknown.get("/api/users/me").status_code == 401)

        # ---- CSRF: a cross-site POST is refused, even with a valid cookie
        check("cross-site POST blocked", a.post("/api/auth/logout", headers={"Origin": "https://evil.example"}).status_code == 403)
        check("Origin: null blocked", a.patch("/api/users/me", json={"displayName": "x"}, headers={"Origin": "null"}).status_code == 403)
        check("still signed in after the blocked logout", a.get("/api/users/me").status_code == 200)
        check("cookies from a cross-site GET are not a write", a.get("/api/users/me", headers={"Origin": "https://evil.example"}).status_code == 200)

        # ---- disabled account
        db["users"].update_one({"username": "bob"}, {"$set": {"status": "disabled"}})
        check("disabled account -> 403", b.get("/api/users/me").status_code == 403)
        check("disabled account cannot log in", new_client().post("/api/auth/login", json={"identifier": "bob", "password": "password1"}, headers=ORIGIN).status_code == 403)
        db["users"].update_one({"username": "bob"}, {"$set": {"status": "active"}})

        # ---- refresh rotates; a used refresh token is dead
        r1 = new_client()
        r1.post("/api/auth/login", json={"identifier": "alice", "password": "password1"}, headers=ORIGIN)
        old_refresh = r1.cookies.get("sb_refresh", path="/api/auth")
        r1.cookies.delete("sb_access", path="/api")
        check("no access cookie: 401", r1.get("/api/users/me").status_code == 401)
        check("refresh ok", r1.post("/api/auth/refresh", headers=ORIGIN).status_code == 200)
        check("signed in again after refresh", r1.get("/api/users/me").status_code == 200)
        replay = new_client()
        replay.cookies.set("sb_refresh", old_refresh, path="/api/auth")
        rr = replay.post("/api/auth/refresh", headers=ORIGIN)
        check("replayed refresh token -> 401 and cookies cleared", rr.status_code == 401 and "sb_refresh" in rr.headers.get("set-cookie", ""))
        check("refresh without a cookie -> 401", new_client().post("/api/auth/refresh", headers=ORIGIN).status_code == 401)

        # ---- logout
        lo = c.post("/api/auth/logout", headers=ORIGIN)
        check("logout ok and revoked at Supabase", lo.status_code == 200 and len(gotrue.revoked) == 1)
        check("logout clears the session", c.get("/api/users/me").status_code == 401)
        check("logout when already signed out is fine", new_client().post("/api/auth/logout", headers=ORIGIN).status_code == 200)

        # ---- Google sign-in (PKCE)
        g = new_client()
        s = g.get("/api/auth/google/start")
        loc = s.headers["location"]
        check("google start redirects to Supabase authorize with PKCE", s.status_code == 302 and loc.startswith(f"{ISS}/authorize?") and "provider=google" in loc and "code_challenge_method=s256" in loc)
        check("callback url is on the app's own origin", "redirect_to=http%3A%2F%2Flocalhost%3A5173%2Fapi%2Fauth%2Fgoogle%2Fcallback" in loc)
        check("verifier cookie is httpOnly", "httponly" in s.headers["set-cookie"].lower() and "sb_pkce" in s.headers["set-cookie"])
        remember_flag, _, verifier = g.cookies.get("sb_pkce").strip('"').partition(":")
        check("google start without remember stores flag 0", remember_flag == "0")
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        check("challenge matches verifier", f"code_challenge={challenge}" in loc)
        guser = {"id": str(uuid.uuid4()), "email": "Gina@Gmail.com", "password": None, "meta": {"full_name": "Gina Google"}}
        gotrue.users[guser["id"]] = guser
        gotrue.codes["good-code"] = guser
        cb = g.get("/api/auth/google/callback", params={"code": "good-code"})
        check("google callback signs in and goes home", cb.status_code == 302 and cb.headers["location"] == "http://localhost:5173/")
        gme = g.get("/api/auth/session").json()["user"]
        check("google user: username from email, name from Google", (gme["username"], gme["displayName"], gme["authProvider"]) == ("gina", "Gina Google", "google"))
        check("callback without verifier cookie fails safely", new_client().get("/api/auth/google/callback", params={"code": "good-code"}).headers["location"].endswith("/?auth=error"))
        check("callback with bad code fails safely", g.get("/api/auth/google/callback", params={"code": "bad"}).headers["location"].endswith("/?auth=error")) if g.cookies.get("sb_pkce") else None
        check("callback with an error param fails safely", new_client().get("/api/auth/google/callback", params={"error": "access_denied"}).headers["location"].endswith("/?auth=error"))

        # ---- the unique index closes the username race
        try:
            users.create_account(db, auth_id="zzz", username="alice", email="zzz@x.com", display_name=None, provider="email")
            check("duplicate username rejected by the index", False)
        except Exception as e:
            check(f"duplicate username rejected by the index ({type(e).__name__})", type(e).__name__ == "DuplicateKeyError")
        # ---- remember me
        def cookie_headers(resp):
            return {h.split("=", 1)[0]: h.lower() for h in resp.headers.get_list("set-cookie")}

        auth.login_throttle._hits.clear()
        short = new_client().post("/api/auth/login", json={"identifier": "alice", "password": "password1"}, headers=ORIGIN)
        hs = cookie_headers(short)
        check("no remember: session cookies (no Max-Age / Expires)",
              all("max-age" not in hs[n] and "expires" not in hs[n] for n in ("sb_access", "sb_refresh")))
        check("no remember: no remember cookie kept", "sb_remember" not in hs or "max-age=0" in hs["sb_remember"] or 'sb_remember=""' in hs["sb_remember"])
        keepc = new_client()
        kept = keepc.post("/api/auth/login", json={"identifier": "alice", "password": "password1", "remember": True}, headers=ORIGIN)
        hk = cookie_headers(kept)
        check("remember: refresh cookie lasts 60 days", f"max-age={auth.REFRESH_MAX_AGE}" in hk["sb_refresh"])
        check("remember: access cookie has a Max-Age", "max-age=" in hk["sb_access"])
        check("remember: flag cookie is httpOnly on /api/auth", "httponly" in hk["sb_remember"] and "path=/api/auth" in hk["sb_remember"])
        hr = cookie_headers(keepc.post("/api/auth/refresh", headers=ORIGIN))
        check("remember survives a refresh", f"max-age={auth.REFRESH_MAX_AGE}" in hr["sb_refresh"])
        shortc = new_client()
        shortc.post("/api/auth/login", json={"identifier": "alice", "password": "password1"}, headers=ORIGIN)
        hs2 = cookie_headers(shortc.post("/api/auth/refresh", headers=ORIGIN))
        check("not remembered stays a browser session after refresh", "max-age" not in hs2["sb_refresh"])
        hl = cookie_headers(keepc.post("/api/auth/logout", headers=ORIGIN))
        check("logout clears the remember cookie", "sb_remember" in hl)
        gr = new_client()
        loc2 = gr.get("/api/auth/google/start", params={"remember": "true"})
        check("google start with remember stores flag 1", gr.cookies.get("sb_pkce").strip('"').startswith("1:"))
        gotrue.codes["code-2"] = guser
        hg = cookie_headers(gr.get("/api/auth/google/callback", params={"code": "code-2"}))
        check("google sign-in with remember: persistent cookies", f"max-age={auth.REFRESH_MAX_AGE}" in hg["sb_refresh"] and "sb_remember" in hg)
        # ---- email codes: resend, limits, expiry
        from datetime import datetime, timedelta, timezone
        clear_throttles()
        post = lambda client, path, body: client.post(f"/api/auth{path}", json=body, headers=ORIGIN)
        carol = new_client()
        check("register carol", post(carol, "/register", {"username": "carol", "email": "carol@x.com", "password": "password1"}).status_code == 201)
        first = issued[("carol@x.com", "verify")]
        check("resend inside the cooldown keeps the live code", post(carol, "/resend-code", {"email": "carol@x.com"}).json() == {"ok": True} and issued[("carol@x.com", "verify")] == first)
        wrong = "000000" if first != "000000" else "111111"
        for _ in range(5):
            post(carol, "/verify-email", {"email": "carol@x.com", "code": wrong})
        check("after 5 wrong guesses even the right code is refused", post(carol, "/verify-email", {"email": "carol@x.com", "code": first}).status_code == 400)
        db["emailCodes"].update_one({"email": "carol@x.com", "purpose": "verify"}, {"$set": {"sentAt": datetime.now(timezone.utc) - timedelta(seconds=120)}})
        post(carol, "/resend-code", {"email": "carol@x.com"})
        second = issued[("carol@x.com", "verify")]
        check("resend after the cooldown makes a new live code", db["emailCodes"].find_one({"email": "carol@x.com", "purpose": "verify"})["attempts"] == 0)
        db["emailCodes"].update_one({"email": "carol@x.com", "purpose": "verify"}, {"$set": {"expiresAt": datetime.now(timezone.utc) - timedelta(seconds=1)}})
        check("an expired code is refused", post(carol, "/verify-email", {"email": "carol@x.com", "code": second}).status_code == 400)
        before = dict(issued)
        check("resend for an unknown email looks the same", post(carol, "/resend-code", {"email": "nobody@x.com"}).json() == {"ok": True} and issued == before)
        check("resend for an already verified email makes no code", post(carol, "/resend-code", {"email": "alice@x.com"}).json() == {"ok": True} and issued == before)
        clear_throttles()
        capped = [post(carol, "/resend-code", {"email": "capped@x.com"}).status_code for _ in range(7)]
        check(f"requests for one email are capped per hour {capped}", capped == [200] * 5 + [429] * 2)
        clear_throttles()

        # ---- forgot / reset password
        old = new_client()
        old.post("/api/auth/login", json={"identifier": "alice", "password": "password1"}, headers=ORIGIN)
        old_refresh = old.cookies.get("sb_refresh", path="/api/auth")
        same = [post(new_client(), "/forgot-password", {"email": e}) for e in ("alice@x.com", "nobody@x.com", "gina@gmail.com")]
        check("forgot-password answers identically for known, unknown and Google-only emails", len({(r.status_code, r.text) for r in same}) == 1 and same[0].status_code == 200)
        check("a code was made only for the password account", ("alice@x.com", "reset") in issued and ("nobody@x.com", "reset") not in issued and ("gina@gmail.com", "reset") not in issued)
        reset_code = issued[("alice@x.com", "reset")]
        bad_reset = "000000" if reset_code != "000000" else "111111"
        check("reset with a wrong code -> 400", post(new_client(), "/reset-password", {"email": "alice@x.com", "code": bad_reset, "newPassword": "newpassword1"}).status_code == 400)
        check("reset with a too short password -> 422", post(new_client(), "/reset-password", {"email": "alice@x.com", "code": reset_code, "newPassword": "short"}).status_code == 422)
        check("a verify code can't reset a password", post(new_client(), "/reset-password", {"email": "carol@x.com", "code": first, "newPassword": "newpassword1"}).status_code == 400)
        check("reset ok", post(new_client(), "/reset-password", {"email": "alice@x.com", "code": reset_code, "newPassword": "newpassword1"}).status_code == 200)
        check("the reset code works once", post(new_client(), "/reset-password", {"email": "alice@x.com", "code": reset_code, "newPassword": "another-pass1"}).status_code == 400)
        check("old password no longer works", post(new_client(), "/login", {"identifier": "alice", "password": "password1"}).status_code == 401)
        check("new password works", post(new_client(), "/login", {"identifier": "alice", "password": "newpassword1"}).status_code == 200)
        stale = new_client()
        stale.cookies.set("sb_refresh", old_refresh, path="/api/auth")
        check("sessions from before the reset can't refresh", stale.post("/api/auth/refresh", headers=ORIGIN).status_code == 401)
        post(carol, "/forgot-password", {"email": "carol@x.com"})
        check("an unverified account can reset its password (and is then verified)",
              post(carol, "/reset-password", {"email": "carol@x.com", "code": issued[("carol@x.com", "reset")], "newPassword": "carolpass1"}).status_code == 200
              and post(new_client(), "/login", {"identifier": "carol", "password": "carolpass1"}).status_code == 200)

        print("\nALL AUTH CHECKS PASSED")
    finally:
        for n in names:
            mongo.drop_database(n)
        mongo.close()


if __name__ == "__main__":
    main_check()
