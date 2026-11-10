from datetime import datetime, time, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from models.reimbursement import ReimbursementCreate, ReimbursementDelete, ReimbursementUpdate
from routers.teams import _parse_id, _verify_org_owner, get_mongo
from services.mongodb import mongodb_ops

router = APIRouter(prefix="/api")
COLLECTION_NAME = "reimbursement"
TEAMS_COLLECTION = "departments"
REIMBURSED = "Reimbursed"


def _receipt_names(receipt) -> dict:
    # de-duplicated, order kept; {} when nothing picked
    names = list(dict.fromkeys(receipt.receiptNames)) if receipt else []
    return {"receiptNames": names} if names else {}


def _to_out(doc: dict) -> dict:
    when = doc.get("datetime")
    team_id = doc.get("teamInvolvedId")
    involved = doc.get("receiptInvolved") or {}
    # older docs stored a single {receiptName}
    names = involved.get("receiptNames") or ([involved["receiptName"]] if involved.get("receiptName") else [])
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "date": when.date().isoformat() if isinstance(when, datetime) else None,
        "teamInvolved": doc.get("teamInvolved", ""),
        "teamInvolvedId": str(team_id) if team_id else None,
        "amount": doc.get("amount") or 0.0,
        "status": doc.get("status", "Not reimbursed"),
        "receiptInvolved": {"receiptNames": names},
    }


def _totals(records: list[dict]) -> dict:
    paid = [r["amount"] for r in records if r["status"] == REIMBURSED]
    unpaid = [r["amount"] for r in records if r["status"] != REIMBURSED]
    return {
        "reimbursed": round(sum(paid), 2),
        "notReimbursed": round(sum(unpaid), 2),
        "reimbursedCount": len(paid),
        "notReimbursedCount": len(unpaid),
    }


def _as_datetime(day) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


async def _resolve_team(mongo, org_oid: ObjectId, team_id: str) -> dict:
    # a team id must belong to the record's org, and its name comes from the team doc (not the client)
    team = await mongodb_ops.read(mongo, collection_name=TEAMS_COLLECTION, query={"_id": _parse_id(team_id, "teamInvolvedId")})
    if team is None or str(team.get("orgId")) != str(org_oid):
        raise HTTPException(status_code=400, detail="Team not found in this organization")
    return team


def _require_db(mongo):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")


@router.get("/reimbursements")
async def list_reimbursements(orgId: str, ownerId: str | None = None, mongo=Depends(get_mongo)):
    _require_db(mongo)
    org_oid = _parse_id(orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    # shortcut: returns and sums the whole org list in Python, switch to a $group aggregation + pagination when records grow large
    docs = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"orgId": org_oid}, read_many=True)
    docs = sorted(docs or [], key=lambda d: d.get("datetime") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    records = [_to_out(d) for d in docs]
    return {"records": records, "totals": _totals(records)}


@router.post("/reimbursements", status_code=201)
async def create_reimbursement(payload: ReimbursementCreate, ownerId: str | None = None, mongo=Depends(get_mongo)):
    _require_db(mongo)
    org_oid = _parse_id(payload.orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    doc = {
        "name": payload.name.strip(),
        "datetime": _as_datetime(payload.date),
        "amount": float(payload.amount),
        "orgId": org_oid,
        "status": payload.status,
        "receiptInvolved": {},
    }
    if payload.teamInvolvedId:
        team = await _resolve_team(mongo, org_oid, payload.teamInvolvedId)
        doc["teamInvolvedId"] = team["_id"]
        doc["teamInvolved"] = team.get("name", "")
        if payload.receiptInvolved:
            doc["receiptInvolved"] = _receipt_names(payload.receiptInvolved)
    else:
        custom = (payload.teamInvolved or "").strip()
        if not custom:
            raise HTTPException(status_code=422, detail="teamInvolved is required for a custom team")
        doc["teamInvolved"] = custom
    if not doc["name"]:
        raise HTTPException(status_code=422, detail="name cannot be empty")
    doc["_id"] = await mongodb_ops.create(mongo, doc_to_create=doc, collection_name=COLLECTION_NAME)
    return _to_out(doc)


@router.patch("/reimbursements/{record_id}")
async def update_reimbursement(record_id: str, payload: ReimbursementUpdate, ownerId: str | None = None, mongo=Depends(get_mongo)):
    _require_db(mongo)
    record_oid = _parse_id(record_id, "reimbursement id")
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": record_oid})
    if existing is None:
        raise HTTPException(status_code=404, detail="Reimbursement not found")
    org_oid = existing["orgId"]
    await _verify_org_owner(mongo, org_oid, ownerId)

    sent = payload.model_dump(exclude_unset=True)
    set_fields: dict = {}
    unset_fields: dict = {}
    if sent.get("name") is not None:
        set_fields["name"] = sent["name"].strip()
        if not set_fields["name"]:
            raise HTTPException(status_code=422, detail="name cannot be empty")
    if sent.get("date") is not None:
        set_fields["datetime"] = _as_datetime(sent["date"])
    if sent.get("amount") is not None:
        set_fields["amount"] = float(sent["amount"])
    if sent.get("status") is not None:
        set_fields["status"] = sent["status"]

    if "teamInvolvedId" in sent:
        if sent["teamInvolvedId"]:
            team = await _resolve_team(mongo, org_oid, sent["teamInvolvedId"])
            set_fields["teamInvolvedId"] = team["_id"]
            set_fields["teamInvolved"] = team.get("name", "")
        else:
            # switched to a custom team: no id field, and no receipt (receipts belong to real teams)
            custom = (sent.get("teamInvolved") or "").strip()
            if not custom:
                raise HTTPException(status_code=422, detail="teamInvolved is required for a custom team")
            set_fields["teamInvolved"] = custom
            set_fields["receiptInvolved"] = {}
            unset_fields["teamInvolvedId"] = ""
    elif sent.get("teamInvolved") is not None and not existing.get("teamInvolvedId"):
        # renaming a custom team; a real team's name always comes from its team doc
        set_fields["teamInvolved"] = sent["teamInvolved"].strip() or existing.get("teamInvolved", "")

    has_team = set_fields.get("teamInvolvedId") or ("teamInvolvedId" not in unset_fields and existing.get("teamInvolvedId"))
    if "receiptInvolved" in sent and "receiptInvolved" not in set_fields:
        set_fields["receiptInvolved"] = _receipt_names(payload.receiptInvolved) if has_team else {}

    if not set_fields and not unset_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    update: dict = {"$set": set_fields} if set_fields else {}
    if unset_fields:
        update["$unset"] = unset_fields
    mongo[COLLECTION_NAME].update_one({"_id": record_oid}, update)  # direct: mongodb_ops.update only emits $set
    updated = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": record_oid})
    return _to_out(updated)


@router.post("/reimbursements/delete")
async def delete_reimbursements(payload: ReimbursementDelete, ownerId: str | None = None, mongo=Depends(get_mongo)):
    _require_db(mongo)
    org_oid = _parse_id(payload.orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    ids = [_parse_id(i, "reimbursement id") for i in payload.ids]
    # orgId in the filter: ids from another org are never deleted
    deleted = await mongodb_ops.delete(mongo, collection_name=COLLECTION_NAME, query={"_id": {"$in": ids}, "orgId": org_oid}, delete_many=True)
    return {"deleted": deleted}
