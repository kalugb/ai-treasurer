from datetime import datetime, time, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from models.reimbursement import ReimbursementCreate, ReimbursementDelete, ReimbursementUpdate
from routers.teams import _parse_id, _verify_org_owner, get_mongo
from services.mongodb import mongodb_ops

router = APIRouter(prefix="/api")
COLLECTION_NAME = "reimbursement"
TEAMS_COLLECTION = "departments"
RECEIPTS_COLLECTION = "receipts"
REIMBURSED = "Reimbursed"
ALREADY_LINKED = "One of these receipts is already in another reimbursement record"


def ensure_indexes(db) -> None:
    """One record per receipt, enforced atomically: a receipt id may appear in at most one record.
    Partial, so records without linked receipts (incl. legacy name-only ones) are not indexed."""
    db[COLLECTION_NAME].create_index(
        "receiptInvolved.receiptIds",
        unique=True,
        partialFilterExpression={"receiptInvolved.receiptIds": {"$exists": True}},
        name="uniq_receipt_link",
    )


def receipt_key(doc: dict) -> str:
    """The id a receipt is known by everywhere: Drive file id, or the stringified _id for local uploads."""
    return doc.get("googleDriveFileId") or str(doc["_id"])


async def receipt_links(mongo, ids: list[str]) -> dict[str, dict]:
    """{receiptId: {id, name, status}} for the receipts that sit in a reimbursement record."""
    wanted = set(ids)
    if not wanted:
        return {}
    docs = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"receiptInvolved.receiptIds": {"$in": list(wanted)}}, read_many=True)
    links: dict[str, dict] = {}
    for d in docs or []:
        for rid in (d.get("receiptInvolved") or {}).get("receiptIds", []):
            if rid in wanted:
                links[rid] = {"id": str(d["_id"]), "name": d.get("name", ""), "status": d.get("status", "Not reimbursed")}
    return links


async def _existing_receipts(mongo, ids: list[str], team_oid: ObjectId | None = None) -> dict[str, dict]:
    """Receipt docs that still exist for these ids (optionally only in one team), keyed by receipt id."""
    if not ids:
        return {}
    oids = [ObjectId(i) for i in ids if ObjectId.is_valid(i)]
    query: dict = {"$or": [{"googleDriveFileId": {"$in": ids}}, {"_id": {"$in": oids}}]}
    if team_oid is not None:
        query["departmentID"] = team_oid
    docs = await mongodb_ops.read(mongo, collection_name=RECEIPTS_COLLECTION, query=query, read_many=True)
    return {receipt_key(d): d for d in docs or []}


def _stored_pairs(doc: dict) -> dict[str, str]:
    """id -> name already stored on a record (parallel arrays; legacy name-only records have no ids)."""
    involved = doc.get("receiptInvolved") or {}
    ids, names = involved.get("receiptIds") or [], involved.get("receiptNames") or []
    return dict(zip(ids, names)) if len(ids) == len(names) else {i: "" for i in ids}


async def _build_receipt_involved(mongo, team_oid: ObjectId, receipt, keep: dict[str, str], exclude_oid: ObjectId | None) -> dict:
    """Validate the picked receipt ids and build the stored {receiptIds, receiptNames} ({} when none).
    `keep` = id -> name already stored on the record: those may stay even if the receipt is gone."""
    ids = list(dict.fromkeys(receipt.receiptIds)) if receipt else []
    if not ids:
        return {}
    found = await _existing_receipts(mongo, ids, team_oid)
    if any(i not in found and i not in keep for i in ids):
        raise HTTPException(status_code=400, detail="Some selected receipts do not belong to this team")
    query: dict = {"receiptInvolved.receiptIds": {"$in": ids}}
    if exclude_oid is not None:
        query["_id"] = {"$ne": exclude_oid}
    taken = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query=query, read_many=True)
    if taken:
        owner_of = {i: d.get("name", "") for d in taken for i in d["receiptInvolved"]["receiptIds"] if i in ids}
        label = lambda i: found[i].get("receiptName", "") if i in found else keep.get(i) or i  # noqa: E731
        raise HTTPException(status_code=409, detail="; ".join(f"'{label(i)}' is already in reimbursement record '{who}'" for i, who in owner_of.items()))
    return {
        "receiptIds": ids,
        "receiptNames": [found[i].get("receiptName", "") if i in found else keep.get(i, "") for i in ids],
    }


async def _missing_receipts(mongo, docs: list[dict]) -> dict[ObjectId, list[str]]:
    """Per record: linked receipt ids whose receipt no longer exists (deleted, or removed from Drive by a sync)."""
    linked = {d["_id"]: (d.get("receiptInvolved") or {}).get("receiptIds", []) for d in docs}
    alive = await _existing_receipts(mongo, list({i for ids in linked.values() for i in ids}))
    return {rid: [i for i in ids if i not in alive] for rid, ids in linked.items()}


def _to_out(doc: dict, missing: list[str] | None = None) -> dict:
    when = doc.get("datetime")
    team_id = doc.get("teamInvolvedId")
    involved = doc.get("receiptInvolved") or {}
    # older docs stored a single {receiptName}
    names = involved.get("receiptNames") or ([involved["receiptName"]] if involved.get("receiptName") else [])
    pairs = _stored_pairs(doc)
    missing = missing or []
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "date": when.date().isoformat() if isinstance(when, datetime) else None,
        "teamInvolved": doc.get("teamInvolved", ""),
        "teamInvolvedId": str(team_id) if team_id else None,
        "amount": doc.get("amount") or 0.0,
        "status": doc.get("status", "Not reimbursed"),
        "receiptInvolved": {
            "receiptNames": names,
            "receiptIds": involved.get("receiptIds") or [],
            "missingReceiptIds": missing,
            "missingReceiptNames": [pairs.get(i) or i for i in missing],
        },
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
    missing = await _missing_receipts(mongo, docs)
    records = [_to_out(d, missing[d["_id"]]) for d in docs]
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
        doc["receiptInvolved"] = await _build_receipt_involved(mongo, team["_id"], payload.receiptInvolved, {}, None)
    else:
        if payload.receiptInvolved and payload.receiptInvolved.receiptIds:
            raise HTTPException(status_code=422, detail="Receipts can only be linked to an existing team")
        custom = (payload.teamInvolved or "").strip()
        if not custom:
            raise HTTPException(status_code=422, detail="teamInvolved is required for a custom team")
        doc["teamInvolved"] = custom
    if not doc["name"]:
        raise HTTPException(status_code=422, detail="name cannot be empty")
    try:
        doc["_id"] = await mongodb_ops.create(mongo, doc_to_create=doc, collection_name=COLLECTION_NAME)
    except DuplicateKeyError:  # lost a race with another record claiming the same receipt
        raise HTTPException(status_code=409, detail=ALREADY_LINKED)
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

    old_team = existing.get("teamInvolvedId")
    new_team = old_team
    if "teamInvolvedId" in sent:
        if sent["teamInvolvedId"]:
            team = await _resolve_team(mongo, org_oid, sent["teamInvolvedId"])
            new_team = team["_id"]
            set_fields["teamInvolvedId"] = new_team
            set_fields["teamInvolved"] = team.get("name", "")
        else:
            # switched to a custom team: no id field (receipts belong to real teams, cleared below)
            custom = (sent.get("teamInvolved") or "").strip()
            if not custom:
                raise HTTPException(status_code=422, detail="teamInvolved is required for a custom team")
            new_team = None
            set_fields["teamInvolved"] = custom
            unset_fields["teamInvolvedId"] = ""
    elif sent.get("teamInvolved") is not None and not old_team:
        # renaming a custom team; a real team's name always comes from its team doc
        set_fields["teamInvolved"] = sent["teamInvolved"].strip() or existing.get("teamInvolved", "")

    team_changed = new_team != old_team
    if "receiptInvolved" in sent:
        if new_team is None:
            if payload.receiptInvolved and payload.receiptInvolved.receiptIds:
                raise HTTPException(status_code=422, detail="Receipts can only be linked to an existing team")
            set_fields["receiptInvolved"] = {}
        else:
            # ids already on the record may stay even if their receipt is gone, unless the team changed
            keep = {} if team_changed else _stored_pairs(existing)
            set_fields["receiptInvolved"] = await _build_receipt_involved(mongo, new_team, payload.receiptInvolved, keep, record_oid)
    elif team_changed:
        # the old team's receipts are not valid for the new team
        set_fields["receiptInvolved"] = {}

    if not set_fields and not unset_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    update: dict = {"$set": set_fields} if set_fields else {}
    if unset_fields:
        update["$unset"] = unset_fields
    try:
        mongo[COLLECTION_NAME].update_one({"_id": record_oid}, update)  # direct: mongodb_ops.update only emits $set
    except DuplicateKeyError:  # lost a race with another record claiming the same receipt
        raise HTTPException(status_code=409, detail=ALREADY_LINKED)
    updated = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": record_oid})
    missing = await _missing_receipts(mongo, [updated])
    return _to_out(updated, missing[record_oid])


@router.post("/reimbursements/delete")
async def delete_reimbursements(payload: ReimbursementDelete, ownerId: str | None = None, mongo=Depends(get_mongo)):
    _require_db(mongo)
    org_oid = _parse_id(payload.orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    ids = [_parse_id(i, "reimbursement id") for i in payload.ids]
    # orgId in the filter: ids from another org are never deleted
    deleted = await mongodb_ops.delete(mongo, collection_name=COLLECTION_NAME, query={"_id": {"$in": ids}, "orgId": org_oid}, delete_many=True)
    return {"deleted": deleted}
