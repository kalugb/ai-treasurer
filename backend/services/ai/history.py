"""AI usage history: database `history`, collection `AIHistory` (same MongoDB cluster as everything else).

Two kinds of documents, told apart by `kind`:
- "scan":     one AI receipt scan (upload form, receipt edit, or one receipt of a bulk run).
              `applied` = what a bulk run saved from it, set by the receipt PATCH route in the same request
              as the actual edit, so a cancel / reload / crash can never leave a saved receipt unrecorded.
- "bulk_run": one "fill all with AI" run (status + times only; the counts are derived from its scans).
The AI agent chat is NOT logged here. Documents expire after RETENTION_SECONDS (TTL index on `startedAt`).
Logging is best effort: it never makes a scan fail.
"""
import time
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException, Request
from starlette.concurrency import run_in_threadpool

COLLECTION = "AIHistory"
RETENTION_SECONDS = 14 * 24 * 3600
STALE_RUN = timedelta(minutes=30)  # an "In Progress" run older than this is shown as Interrupted (browser reloaded / closed)
TRIGGERS = ("upload_form", "receipt_edit", "bulk")


def ensure_indexes(db) -> None:
    col = db[COLLECTION]
    col.create_index("startedAt", expireAfterSeconds=RETENTION_SECONDS, name="ttl_startedAt")
    col.create_index([("orgId", 1), ("userId", 1), ("startedAt", -1)], name="org_user_time")
    col.create_index("runId", name="run", sparse=True)


def user_oid(owner_id: str) -> ObjectId:
    # shortcut: same pre-auth mapping as routers.agent / routers.snapshots (placeholder "1" -> sentinel ObjectId); replace when auth lands
    try:
        return ObjectId(owner_id) if ObjectId.is_valid(owner_id) else ObjectId(owner_id.rjust(24, "0"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ownerId")


async def authorize(request: Request, org_id: str, owner_id: str) -> tuple[ObjectId, ObjectId]:
    """Fail closed: ownerId is mandatory and must own the org. A non-owner gets the same 404 as a missing org."""
    from routers.teams import _parse_id, _verify_org_owner  # lazy: routers import this module

    mongo = request.app.state.mongo
    if mongo is None or request.app.state.history_mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    org_oid = _parse_id(org_id, "orgId")
    try:
        await _verify_org_owner(mongo, org_oid, owner_id)
    except HTTPException as exc:
        raise HTTPException(status_code=404, detail="Organization not found") if exc.status_code == 403 else exc
    return org_oid, user_oid(owner_id)


def _message(exc: Exception) -> str:
    return str(getattr(exc, "detail", None) or exc)[:300]


async def _insert_scan(request: Request, ctx: dict, receipt: dict | None, file: dict, started: datetime, duration_ms: int, outcome: dict) -> str | None:
    """Best effort: returns the new document id, or None when logging is skipped / fails."""
    try:
        owner_id, org_id, trigger = ctx.get("owner_id"), ctx.get("org_id"), ctx.get("trigger")
        if not owner_id or not org_id or trigger not in TRIGGERS:
            return None
        org_oid, user = await authorize(request, org_id, owner_id)
        col = request.app.state.history_mongo[COLLECTION]
        team_oid = ObjectId(ctx["team_id"]) if ctx.get("team_id") else None
        run_oid = None
        if trigger == "bulk" and ctx.get("run_id") and ObjectId.is_valid(ctx["run_id"]):
            run = await run_in_threadpool(col.find_one, {"_id": ObjectId(ctx["run_id"]), "kind": "bulk_run", "orgId": org_oid, "userId": user}, {"_id": 1})
            run_oid = run["_id"] if run else None  # a runId that isn't this user's run is dropped, never attached
        doc = {
            "kind": "scan", "userId": user, "orgId": org_oid, "teamId": team_oid, "trigger": trigger, "runId": run_oid,
            "receipt": receipt, "file": file,
            "input": outcome.get("input"), "provider": outcome.get("provider"),
            "status": outcome["status"], "error": outcome.get("error"), "result": outcome.get("result"),
            "applied": None, "startedAt": started, "durationMs": duration_ms,
        }
        return str((await run_in_threadpool(col.insert_one, doc)).inserted_id)
    except Exception as e:
        print(f"AI history: could not log scan ({_message(e)})")
        return None


async def run_logged(request: Request, ctx: dict, file: dict, receipt: dict | None, do_scan):
    """Run `await do_scan(meta)` (meta gets `input` / `provider`) and log it. Returns (result, historyId|None);
    a failed scan is logged as Failed and re-raised unchanged."""
    meta: dict = {}
    started, t0 = datetime.now(timezone.utc), time.monotonic()
    try:
        result = await do_scan(meta)
    except Exception as e:
        await _insert_scan(request, ctx, receipt, file, started, int((time.monotonic() - t0) * 1000),
                           {"status": "Failed", "error": _message(e), **meta})
        raise
    history_id = await _insert_scan(request, ctx, receipt, file, started, int((time.monotonic() - t0) * 1000),
                                    {"status": "Succeeded", "result": result, **meta})
    return result, history_id


async def mark_applied(request: Request, history_id: str | None, owner_id: str | None, org_oid: ObjectId, receipt_id: str, applied: dict) -> None:
    """Record what the AI saved. Called by the receipt PATCH route right after its own successful update. Best effort."""
    try:
        if not history_id or not owner_id or not ObjectId.is_valid(history_id):
            return
        user = user_oid(owner_id)
        col = request.app.state.history_mongo[COLLECTION]
        await run_in_threadpool(
            col.update_one,
            {"_id": ObjectId(history_id), "kind": "scan", "orgId": org_oid, "userId": user, "receipt.receiptId": receipt_id},
            {"$set": {"applied": applied}},
        )
    except Exception as e:
        print(f"AI history: could not mark applied ({_message(e)})")
