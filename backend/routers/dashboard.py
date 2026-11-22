from fastapi import APIRouter, Depends, HTTPException, Query
from services.users import current_owner_id

from routers.cashin import build_cashflow
from routers.google_drive import _to_out
from routers.reimbursement import receipt_key, receipt_links
from routers.teams import CASHFLOW_COLLECTION, COLLECTION_NAME as TEAMS, RECEIPTS_COLLECTION, TYPE_CASH_IN, TYPE_REIMBURSEMENT, _parse_id, _verify_org_owner, get_mongo
from services import duplicates
from services.mongodb import mongodb_ops

router = APIRouter(prefix="/api")

RECENT_RECEIPTS = 8
CASH_HISTORY = 5
MAX_NOTES = 4
NEAR_LIMIT = 0.9  # a team at 90% of its budget gets a note


def _money(n: float) -> str:
    return f"{'-' if n < 0 else ''}RM{abs(n):,.2f}"


def build_overview(teams: list[dict], receipts: list[dict], dupes: dict, links: dict, cash: dict) -> dict:
    """Every Overview figure from plain data, so it can be checked without a database.
    receipts: `_to_out`-shaped dicts plus `teamId` and `key` (the id reimbursement records use).
    dupes: {receipt id: duplicates.describe(...)}; links: {receipt key: {status, ...}}; cash: build_cashflow(...)."""
    per_team = {str(t["_id"]): {"id": str(t["_id"]), "name": t.get("name") or "Unnamed team", "budget": float(t.get("budget") or 0), "spent": 0.0, "receiptCount": 0} for t in teams}
    attention = {"missingAmount": 0, "duplicateReview": 0, "notReimbursed": 0}
    recent = []
    for r in receipts:
        dup = dupes.get(r["id"])
        excluded = bool(dup and dup["excluded"])
        reimbursed = (links.get(r["key"]) or {}).get("status") == "Reimbursed"
        amount = r.get("receiptAmount") or 0.0
        # same rule as the frontend's isUnset: a Drive receipt with no amount that isn't a confirmed duplicate
        unset = r.get("source") != "local_upload" and not amount and not excluded
        team = per_team.get(r["teamId"])
        if team:
            team["receiptCount"] += 1
            if not excluded:
                team["spent"] += amount
        attention["missingAmount"] += unset
        attention["duplicateReview"] += bool(dup and dup["status"] == "pending")
        attention["notReimbursed"] += not excluded and not reimbursed
        recent.append({
            "id": r["key"], "teamId": r["teamId"], "teamName": team["name"] if team else "",
            "name": r.get("receiptName", ""), "label": r.get("label"), "amount": amount, "date": r.get("date"),
            "source": r.get("source"), "unset": unset, "duplicate": dup["status"] if dup else None, "reimbursed": reimbursed,
        })
    recent.sort(key=lambda x: (x["date"] or "", x["id"]), reverse=True)

    team_rows = []
    for t in per_team.values():
        t["spent"] = round(t["spent"], 2)
        t["remaining"] = round(t["budget"] - t["spent"], 2)  # negative = over budget
        team_rows.append(t)
    used = lambda t: t["spent"] / t["budget"] if t["budget"] else (1 if t["spent"] else 0)
    team_rows.sort(key=used, reverse=True)

    budget = round(sum(t["budget"] for t in team_rows), 2)
    spent = round(sum(t["spent"] for t in team_rows), 2)

    notes = []
    for t in team_rows:
        if t["remaining"] < 0:
            notes.append(f"{t['name']} is over budget by {_money(-t['remaining'])}.")
        elif t["budget"] and used(t) >= NEAR_LIMIT:
            notes.append(f"{t['name']} has used {used(t):.0%} of its budget ({_money(t['remaining'])} left).")
    if cash["balance"] < 0:
        notes.append(f"Cash balance is negative: {_money(cash['balance'])}. Reimbursements are above cash in.")
    if attention["missingAmount"]:
        n = attention["missingAmount"]
        notes.append(f"{n} receipt{'s have' if n != 1 else ' has'} no amount yet.")
    if attention["duplicateReview"]:
        n = attention["duplicateReview"]
        notes.append(f"{n} receipt{'s need' if n != 1 else ' needs'} duplicate review.")

    return {
        "totals": {"budget": budget, "spent": spent, "remaining": round(budget - spent, 2), "receiptCount": len(receipts)},
        "teams": team_rows,
        "attention": attention,
        "cash": {k: cash[k] for k in ("balance", "totalCashIn", "totalReimbursement", "history")},
        "recentReceipts": recent[:RECENT_RECEIPTS],
        "notes": notes[:MAX_NOTES] or ["Everything is in order."],
    }


@router.get("/dashboard")
async def get_dashboard(orgId: str, ownerId: str = Depends(current_owner_id), mongo=Depends(get_mongo)):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")
    org_oid = _parse_id(orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)

    # shortcut: reads the whole org in Python, switch to an aggregation when receipts grow large
    teams = await mongodb_ops.read(mongo, collection_name=TEAMS, query={"orgId": {"$in": [org_oid, orgId]}}, read_many=True) or []
    docs = await mongodb_ops.read(mongo, collection_name=RECEIPTS_COLLECTION, query={"orgID": org_oid}, read_many=True) or []
    records = await mongodb_ops.read(mongo, collection_name=CASHFLOW_COLLECTION, query={"orgId": org_oid}, read_many=True) or []

    dupes = duplicates.annotate(mongo, org_oid, docs)
    links = await receipt_links(mongo, [receipt_key(d) for d in docs])
    receipts = [{**_to_out(str(d.get("departmentID", "")), d), "id": str(d["_id"]), "key": receipt_key(d), "teamId": str(d.get("departmentID", ""))} for d in docs]
    cash = build_cashflow([r for r in records if r.get("type") == TYPE_CASH_IN], [r for r in records if r.get("type") == TYPE_REIMBURSEMENT], CASH_HISTORY, 0)
    return build_overview(teams, receipts, dupes, links, cash)
