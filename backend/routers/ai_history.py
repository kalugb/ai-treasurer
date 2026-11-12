"""AI usage history API (see services/ai/history.py for the data model). Read + the bulk-run lifecycle;
scan documents are written by the scan routes themselves. ownerId is mandatory and must own the org."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request
from starlette.concurrency import run_in_threadpool

from models.ai_history import RunCreate, RunFinish
from routers.teams import _parse_id
from services.ai.history import COLLECTION, STALE_RUN, authorize

router = APIRouter(prefix="/api/ai-history")
MAX_RUN_SCANS = 1000  # a run's detail lists at most this many receipts
TEAMS = "departments"


def _col(request: Request):
    return request.app.state.history_mongo[COLLECTION]


def _utc(value):
    return value.replace(tzinfo=timezone.utc) if isinstance(value, datetime) and value.tzinfo is None else value


def _iso(value):
    value = _utc(value)
    return value.isoformat().replace("+00:00", "Z") if isinstance(value, datetime) else None


def _id(value):
    return str(value) if value is not None else None


def _scan_out(doc: dict, team_names: dict) -> dict:
    return {
        "id": str(doc["_id"]), "kind": "scan", "trigger": doc.get("trigger"), "runId": _id(doc.get("runId")),
        "teamId": _id(doc.get("teamId")), "teamName": team_names.get(doc.get("teamId")),
        "receipt": doc.get("receipt"), "file": doc.get("file"), "input": doc.get("input"), "provider": doc.get("provider"),
        "status": doc.get("status"), "error": doc.get("error"), "result": doc.get("result"), "applied": doc.get("applied"),
        "startedAt": _iso(doc.get("startedAt")), "durationMs": doc.get("durationMs"),
    }


def _run_out(doc: dict, counts: dict, team_names: dict, now: datetime) -> dict:
    status = doc.get("status")
    if status == "In Progress" and now - _utc(doc["startedAt"]) > STALE_RUN:
        status = "Interrupted"  # the browser that ran it was reloaded / closed: finish never arrived
    c = counts.get(doc["_id"], {})
    scanned, filled, failed = c.get("scanned", 0), c.get("filled", 0), c.get("failed", 0)
    return {
        "id": str(doc["_id"]), "kind": "bulk_run", "status": status,
        "teamId": _id(doc.get("teamId")), "teamName": team_names.get(doc.get("teamId")),
        "startedAt": _iso(doc.get("startedAt")), "endedAt": _iso(doc.get("endedAt")), "lastError": doc.get("lastError"),
        "total": doc.get("total", 0), "scanned": scanned, "filled": filled, "failed": failed,
        "notSaved": scanned - filled - failed,  # scanned fine but nothing was saved (nothing found, or cancelled before the save)
    }


def _counts(col, run_ids: list, org_oid, user_oid) -> dict:
    """Blocking. Per-run numbers come from the run's scans, so they're right even if finish never arrived."""
    if not run_ids:
        return {}
    pipeline = [
        {"$match": {"kind": "scan", "runId": {"$in": run_ids}, "orgId": org_oid, "userId": user_oid}},
        {"$group": {
            "_id": "$runId", "scanned": {"$sum": 1},
            "filled": {"$sum": {"$cond": [{"$ne": [{"$ifNull": ["$applied", None]}, None]}, 1, 0]}},
            "failed": {"$sum": {"$cond": [{"$eq": ["$status", "Failed"]}, 1, 0]}},
        }},
    ]
    return {row["_id"]: row for row in col.aggregate(pipeline)}


def _team_names(request: Request, team_ids: set) -> dict:
    """Blocking."""
    ids = [t for t in team_ids if t is not None]
    if not ids:
        return {}
    return {t["_id"]: t.get("name", "") for t in request.app.state.mongo[TEAMS].find({"_id": {"$in": ids}}, {"name": 1})}


@router.post("/runs", status_code=201)
async def create_run(payload: RunCreate, request: Request, ownerId: str = Query(min_length=1)):
    org_oid, user = await authorize(request, payload.orgId, ownerId)
    team_oid = _parse_id(payload.teamId, "teamId")
    team = await run_in_threadpool(request.app.state.mongo[TEAMS].find_one, {"_id": team_oid, "orgId": {"$in": [org_oid, str(org_oid)]}}, {"_id": 1})
    if team is None:
        raise HTTPException(status_code=400, detail="Team is not in this organization")
    doc = {"kind": "bulk_run", "userId": user, "orgId": org_oid, "teamId": team_oid, "status": "In Progress",
           "startedAt": datetime.now(timezone.utc), "endedAt": None, "total": payload.total, "lastError": None}
    inserted = await run_in_threadpool(_col(request).insert_one, doc)
    return {"runId": str(inserted.inserted_id)}


@router.post("/runs/{run_id}/finish")
async def finish_run(run_id: str, payload: RunFinish, request: Request, ownerId: str = Query(min_length=1)):
    org_oid, user = await authorize(request, payload.orgId, ownerId)
    result = await run_in_threadpool(
        _col(request).update_one,
        {"_id": _parse_id(run_id, "run id"), "kind": "bulk_run", "orgId": org_oid, "userId": user, "status": "In Progress"},
        {"$set": {"status": payload.outcome, "endedAt": datetime.now(timezone.utc), "lastError": payload.lastError}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"ok": True}


@router.get("")
async def list_history(
    request: Request,
    orgId: str = Query(min_length=1), ownerId: str = Query(min_length=1),
    kind: str = Query("all", pattern="^(all|scan|bulk_run)$"),
    limit: int = Query(20, ge=1, le=50), offset: int = Query(0, ge=0),
):
    """Newest first: bulk runs and standalone scans. A bulk run's own scans are only in that run's detail."""
    org_oid, user = await authorize(request, orgId, ownerId)
    col = _col(request)
    query = {"orgId": org_oid, "userId": user}
    standalone = {"kind": "scan", "trigger": {"$ne": "bulk"}}
    query["$or"] = {"all": [{"kind": "bulk_run"}, standalone], "scan": [standalone], "bulk_run": [{"kind": "bulk_run"}]}[kind]

    def load():
        docs = list(col.find(query).sort("startedAt", -1).skip(offset).limit(limit + 1))
        page = docs[:limit]
        counts = _counts(col, [d["_id"] for d in page if d["kind"] == "bulk_run"], org_oid, user)
        return page, len(docs) > limit, counts, _team_names(request, {d.get("teamId") for d in page})

    page, has_more, counts, names = await run_in_threadpool(load)
    now = datetime.now(timezone.utc)
    return {"items": [_run_out(d, counts, names, now) if d["kind"] == "bulk_run" else _scan_out(d, names) for d in page], "hasMore": has_more}


@router.get("/{item_id}")
async def get_history(item_id: str, request: Request, orgId: str = Query(min_length=1), ownerId: str = Query(min_length=1)):
    org_oid, user = await authorize(request, orgId, ownerId)
    col = _col(request)
    oid = _parse_id(item_id, "history id")

    def load():
        doc = col.find_one({"_id": oid, "orgId": org_oid, "userId": user})
        if doc is None:
            return None, [], {}, {}
        scans = list(col.find({"kind": "scan", "runId": oid, "orgId": org_oid, "userId": user}).sort("startedAt", 1).limit(MAX_RUN_SCANS)) if doc["kind"] == "bulk_run" else []
        counts = _counts(col, [oid], org_oid, user) if doc["kind"] == "bulk_run" else {}
        return doc, scans, counts, _team_names(request, {doc.get("teamId")})

    doc, scans, counts, names = await run_in_threadpool(load)
    if doc is None:
        raise HTTPException(status_code=404, detail="History entry not found")
    if doc["kind"] == "scan":
        return _scan_out(doc, names)
    return {**_run_out(doc, counts, names, datetime.now(timezone.utc)), "scans": [_scan_out(s, names) for s in scans]}
