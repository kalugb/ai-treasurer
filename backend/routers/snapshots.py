import json
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request, Response
from pymongo import DESCENDING
from pymongo.errors import DocumentTooLarge, OperationFailure
from pymongo.read_concern import ReadConcern
from starlette.concurrency import run_in_threadpool

from models.snapshot import SnapshotCreate
from routers.cashin import _to_out as _cashin_out, image_response
from routers.google_drive import _find_receipt, _to_out as _receipt_out, serve_receipt_thumbnail
from routers.reimbursement import _to_out as _record_out
from routers.teams import NO_TRANSACTIONS, _parse_id, _verify_org_owner

router = APIRouter(prefix="/api/snapshots")
COLLECTION = "snapshots"
TEAMS = "departments"
RECEIPTS = "receipts"
RECORDS = "reimbursement"
CASHIN = "cashin"
MAX_PER_ORG = 50
MAX_RECEIPTS = 5000
MAX_RECORDS = 5000
VERIFY_ATTEMPTS = 5  # standalone fallback: re-reads before giving up
CACHE_MAX_ITEMS = 2000  # ~1 MB; bigger details skip Redis so they can't fill a small plan
# summary = everything except the heavy copies
SUMMARY_FIELDS = {"name": 1, "snapshotTime": 1, "teamCount": 1, "receiptCount": 1, "recordCount": 1, "totalAmount": 1, "reimbursedAmount": 1, "cashInCount": 1, "cashInAmount": 1}


def _history(request: Request):
    db = request.app.state.history_mongo
    if db is None:
        raise HTTPException(status_code=503, detail="History database not available")
    return db


def _user_oid(owner_id: str) -> ObjectId:
    # shortcut: same pre-auth mapping as routers.agent (placeholder "1" -> sentinel ObjectId); replace when auth lands
    try:
        return ObjectId(owner_id) if ObjectId.is_valid(owner_id) else ObjectId(owner_id.rjust(24, "0"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ownerId")


async def _authorize(request: Request, org_id: str, owner_id: str) -> tuple[ObjectId, ObjectId]:
    """Fail closed: ownerId is mandatory and must own the org. A non-owner gets the same 404 as a missing org,
    so org / snapshot ids can't be probed."""
    mongo = request.app.state.mongo
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    org_oid = _parse_id(org_id, "orgId")
    try:
        await _verify_org_owner(mongo, org_oid, owner_id)
    except HTTPException as exc:
        raise HTTPException(status_code=404, detail="Organization not found") if exc.status_code == 403 else exc
    return org_oid, _user_oid(owner_id)


def _scope(snapshot_id: str, org_oid: ObjectId, user_oid: ObjectId) -> dict:
    return {"_id": _parse_id(snapshot_id, "snapshot id"), "orgId": org_oid, "userId": user_oid}


def _summary(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "snapshotTime": doc.get("snapshotTime"),
        "teamCount": doc.get("teamCount", 0),
        "receiptCount": doc.get("receiptCount", 0),
        "recordCount": doc.get("recordCount", 0),
        "totalAmount": doc.get("totalAmount", 0.0),
        "reimbursedAmount": doc.get("reimbursedAmount", 0.0),
        "cashInCount": doc.get("cashInCount", 0),  # snapshots made before cash in existed have none
        "cashInAmount": doc.get("cashInAmount", 0.0),
    }


def _detail(doc: dict) -> dict:
    return {
        **_summary(doc),
        "teams": [{**t, "teamId": str(t["teamId"])} for t in doc.get("teamsRecorded", [])],
        "receipts": doc.get("receiptsRecorded", {}),
        "records": [
            {**r, "recordId": str(r["recordId"]), "teamInvolvedId": str(r["teamInvolvedId"]) if r.get("teamInvolvedId") else None}
            for r in doc.get("reimbursementsRecorded", [])
        ],
        # the stored copy of _cashin_out; storagePath stays server-side (images are served through the snapshot image route)
        "cashIn": [{k: v for k, v in c.items() if k not in ("cashInId", "storagePath")} for c in doc.get("cashInRecorded", [])],
    }


def _mime(raw) -> str | None:
    try:
        return json.loads(raw).get("mimeType") if isinstance(raw, str) and raw else None
    except json.JSONDecodeError:
        return None


def _read_everything(mongo, session, org_oid: ObjectId) -> dict:
    """Blocking. Reads teams, receipts and reimbursement records through ONE session, so a snapshot-isolated
    transaction sees them all at a single instant."""
    forms = [org_oid, str(org_oid)]  # legacy docs store orgId as a string
    at = datetime.now(timezone.utc)  # taken at the start: the transaction's snapshot point is when its first read ran
    teams = list(mongo[TEAMS].find({"orgId": {"$in": forms}}, session=session))
    team_oids = [t["_id"] for t in teams]
    receipts = list(mongo[RECEIPTS].find({"departmentID": {"$in": team_oids}}, session=session))
    records = list(mongo[RECORDS].find({"orgId": {"$in": forms}}, session=session))
    cashins = list(mongo[CASHIN].find({"orgId": {"$in": forms}}, session=session))
    return {"at": at, "teams": teams, "receipts": receipts, "records": records, "cashins": cashins}


def _hash(mongo) -> str:
    return mongo.command("dbHash", collections=[TEAMS, RECEIPTS, RECORDS, CASHIN])["md5"]


def _take_verified(mongo, org_oid: ObjectId) -> dict:
    """Blocking. Standalone servers have no transactions, so read between two content hashes and keep the
    result only if nothing changed in between; otherwise retry.
    shortcut: a change made and undone during the read is invisible to the hashes, and writes to OTHER orgs
    also force a retry (the hash covers whole collections); use a replica set (Atlas) for the strict guarantee."""
    for _ in range(VERIFY_ATTEMPTS):
        before = _hash(mongo)
        data = _read_everything(mongo, None, org_oid)
        if _hash(mongo) == before:
            return data
    raise HTTPException(status_code=409, detail="Data kept changing while the snapshot was being taken. Try again in a moment.")


def _build(user_oid: ObjectId, org_oid: ObjectId, name: str, data: dict) -> dict:
    teams_recorded = [
        {"teamId": t["_id"], "name": t.get("name") or t.get("team_name") or "", "budget": t.get("budget", 0) or 0, "members": t.get("members", []) or []}
        for t in data["teams"]
    ]
    receipts_recorded: dict[str, list] = {str(t["_id"]): [] for t in data["teams"]}
    total = 0.0
    for doc in data["receipts"]:
        team_hex = str(doc["departmentID"])
        out = _receipt_out(team_hex, doc)
        total += out["receiptAmount"]
        receipts_recorded[team_hex].append({
            "receiptId": out["googleDriveFileId"],
            "name": out["receiptName"],
            "amount": out["receiptAmount"],
            "date": out["date"],
            "label": out["label"],
            "description": out["description"],
            "source": out["source"],
            "mimeType": _mime(doc.get("receiptMetadata")),
        })
    records_recorded, reimbursed = [], 0.0
    for doc in data["records"]:
        out = _record_out(doc)
        if out["status"] == "Reimbursed":
            reimbursed += out["amount"]
        records_recorded.append({
            "recordId": doc["_id"],
            "name": out["name"],
            "date": out["date"],
            "teamInvolved": out["teamInvolved"],
            "teamInvolvedId": doc.get("teamInvolvedId"),
            "amount": out["amount"],
            "status": out["status"],
            "receiptIds": out["receiptInvolved"]["receiptIds"],
            "receiptNames": out["receiptInvolved"]["receiptNames"],
        })
    cash_in_recorded = [
        {**_cashin_out(doc), "cashInId": doc["_id"], "storagePath": (doc.get("imageMetadata") or {}).get("storagePath")}
        for doc in data["cashins"]
    ]
    return {
        "userId": user_oid,
        "orgId": org_oid,
        "name": name,
        "snapshotTime": data["at"],
        "teamCount": len(teams_recorded),
        "receiptCount": len(data["receipts"]),
        "recordCount": len(records_recorded),
        "cashInCount": len(cash_in_recorded),
        "totalAmount": round(total, 2),
        "reimbursedAmount": round(reimbursed, 2),
        "cashInAmount": round(sum(c["amount"] for c in cash_in_recorded), 2),
        "teamsRecorded": teams_recorded,
        "receiptsRecorded": receipts_recorded,
        "reimbursementsRecorded": records_recorded,
        "cashInRecorded": cash_in_recorded,
    }


async def _cache_get(request: Request, key: str):
    try:
        return await request.app.state.cache.get(key)
    except Exception:  # cache is best-effort
        return None


async def _cache_set(request: Request, key: str, value):
    try:
        await request.app.state.cache.set(key, value)
    except Exception:
        pass


async def _cache_drop(request: Request, *keys: str):
    for key in keys:
        try:
            await request.app.state.cache.delete(key)
        except Exception:
            pass


def _list_key(request: Request, org_oid: ObjectId, user_oid: ObjectId) -> str:
    return request.app.state.cache.key_builder(f"{org_oid}:{user_oid}", "snapshots")


def _detail_key(request: Request, snapshot_id: ObjectId, org_oid: ObjectId, user_oid: ObjectId) -> str:
    return request.app.state.cache.key_builder(f"{snapshot_id}:{org_oid}:{user_oid}", "snapshot")


@router.post("", status_code=201)
async def create_snapshot(payload: SnapshotCreate, request: Request, ownerId: str = Query(min_length=1)):
    org_oid, user_oid = await _authorize(request, payload.orgId, ownerId)
    history = _history(request)
    mongo = request.app.state.mongo

    if history[COLLECTION].count_documents({"orgId": org_oid, "userId": user_oid}) >= MAX_PER_ORG:
        raise HTTPException(status_code=409, detail=f"Snapshot limit reached ({MAX_PER_ORG}). Delete an old one first.")

    def take():  # snapshot-isolated: anything committed after the transaction starts is invisible to it
        with mongo.client.start_session() as session:
            return session.with_transaction(lambda s: _read_everything(mongo, s, org_oid), read_concern=ReadConcern("snapshot"))

    try:
        data = await run_in_threadpool(take)  # Atlas / any replica set
    except OperationFailure as exc:
        if exc.code != NO_TRANSACTIONS:
            raise
        data = await run_in_threadpool(_take_verified, mongo, org_oid)  # standalone (local dev)
    if len(data["receipts"]) > MAX_RECEIPTS or len(data["records"]) > MAX_RECORDS or len(data["cashins"]) > MAX_RECORDS:
        raise HTTPException(status_code=413, detail="This organization is too large to snapshot")

    doc = _build(user_oid, org_oid, payload.name, data)
    try:
        doc["_id"] = history[COLLECTION].insert_one(doc).inserted_id
    except DocumentTooLarge:
        raise HTTPException(status_code=413, detail="This organization is too large to snapshot")
    await _cache_drop(request, _list_key(request, org_oid, user_oid))
    return _summary(doc)


@router.get("")
async def list_snapshots(request: Request, orgId: str, ownerId: str = Query(min_length=1)):
    org_oid, user_oid = await _authorize(request, orgId, ownerId)
    history = _history(request)
    key = _list_key(request, org_oid, user_oid)
    cached = await _cache_get(request, key)
    if cached is not None:
        return cached
    docs = history[COLLECTION].find({"orgId": org_oid, "userId": user_oid}, SUMMARY_FIELDS).sort("snapshotTime", DESCENDING)
    result = [_summary(d) for d in docs]
    await _cache_set(request, key, result)
    return result


@router.get("/{snapshot_id}")
async def get_snapshot(snapshot_id: str, request: Request, orgId: str, ownerId: str = Query(min_length=1)):
    org_oid, user_oid = await _authorize(request, orgId, ownerId)
    history = _history(request)
    scope = _scope(snapshot_id, org_oid, user_oid)
    key = _detail_key(request, scope["_id"], org_oid, user_oid)
    cached = await _cache_get(request, key)  # only after the ownership check above
    if cached is not None:
        return cached
    doc = history[COLLECTION].find_one(scope)
    if doc is None:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    result = _detail(doc)
    if doc.get("receiptCount", 0) + doc.get("recordCount", 0) + doc.get("cashInCount", 0) <= CACHE_MAX_ITEMS:
        await _cache_set(request, key, result)
    return result


@router.delete("/{snapshot_id}", status_code=204)
async def delete_snapshot(snapshot_id: str, request: Request, orgId: str, ownerId: str = Query(min_length=1)):
    org_oid, user_oid = await _authorize(request, orgId, ownerId)
    history = _history(request)
    scope = _scope(snapshot_id, org_oid, user_oid)
    if history[COLLECTION].delete_one(scope).deleted_count == 0:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    await _cache_drop(request, _list_key(request, org_oid, user_oid), _detail_key(request, scope["_id"], org_oid, user_oid))
    return Response(status_code=204)


@router.get("/{snapshot_id}/teams/{team_id}/receipts/{receipt_id}/thumbnail")
async def get_snapshot_receipt_thumbnail(snapshot_id: str, team_id: str, receipt_id: str, request: Request, orgId: str, ownerId: str = Query(min_length=1)):
    """The receipt's CURRENT file (cache first, then Drive/Supabase) - images are not frozen in the snapshot.
    Only receipts that are listed in this snapshot (under this team) can be fetched."""
    org_oid, user_oid = await _authorize(request, orgId, ownerId)
    history = _history(request)
    team_oid = _parse_id(team_id, "team id")  # parsed, so the dotted field path below can't be injected
    listed = history[COLLECTION].find_one(
        {**_scope(snapshot_id, org_oid, user_oid), f"receiptsRecorded.{team_oid}": {"$elemMatch": {"receiptId": receipt_id}}}, {"_id": 1}
    )
    if listed is None:
        raise HTTPException(status_code=404, detail="Receipt not found in this snapshot")
    doc = await _find_receipt(request, team_oid, receipt_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="The receipt file no longer exists")
    return await serve_receipt_thumbnail(request, doc, receipt_id)


@router.get("/{snapshot_id}/cashin/{cash_in_id}/image")
async def get_snapshot_cashin_image(snapshot_id: str, cash_in_id: str, request: Request, orgId: str, ownerId: str = Query(min_length=1)):
    """The proof image of a cash in record listed in this snapshot (the file as stored now: images are not frozen)."""
    org_oid, user_oid = await _authorize(request, orgId, ownerId)
    history = _history(request)
    cash_in_oid = _parse_id(cash_in_id, "cash in id")
    doc = history[COLLECTION].find_one(
        {**_scope(snapshot_id, org_oid, user_oid), "cashInRecorded.cashInId": cash_in_oid}, {"cashInRecorded.$": 1}
    )
    record = (doc or {}).get("cashInRecorded", [None])[0]
    if record is None or not record.get("storagePath"):
        raise HTTPException(status_code=404, detail="Proof image not found in this snapshot")
    return await image_response({"storagePath": record["storagePath"], "mimeType": (record.get("imageMetadata") or {}).get("mimeType")})
