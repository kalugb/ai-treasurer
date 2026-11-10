"""Read-only tools giving the agent context about the user's teams, budgets, and receipts.

Strictly user-scoped: every call resolves the caller's organizations via ownerId and refuses
any org/team not owned by the caller, so one user's agent can never read another user's data.
Read-only by design — nothing here inserts, updates, or deletes.
"""
import json
from dataclasses import dataclass

from bson import ObjectId
from bson.errors import InvalidId
from langchain_core.tools import tool
from langgraph.runtime import get_runtime

ORG_COLLECTION = "organizations"
TEAMS_COLLECTION = "departments"
RECEIPTS_COLLECTION = "receipts"
REIMBURSEMENT_COLLECTION = "reimbursement"


@dataclass
class AgentContext:
    # owner_id is the string ownerId (pre-auth placeholder "1"); org_id scopes to the selected org.
    owner_id: str = ""
    org_id: str | None = None


ALLOWED_COLLECTIONS = frozenset({ORG_COLLECTION, TEAMS_COLLECTION, RECEIPTS_COLLECTION, REIMBURSEMENT_COLLECTION})


class _ReadOnlyCollection:
    """Exposes only find() on one collection — no insert/update/delete."""
    def __init__(self, collection):
        self._collection = collection

    def find(self, query):
        return self._collection.find(query)


class _ReadOnlyCollections:
    """Least-privilege view of the DB for the treasury tools: read-only access to exactly the
    three allowed collections. Any other collection name raises, so a future tool in this module
    physically cannot reach user accounts, the ai memory DB, or anything else."""
    def __init__(self, db):
        self._db = db

    def __getitem__(self, name):
        if name not in ALLOWED_COLLECTIONS:
            raise KeyError(f"treasury tools may not access collection {name!r}")
        return _ReadOnlyCollection(self._db[name])


# the agent is a shared singleton built at startup; the narrowed handle is set once there.
# identity/org never live here — they ride per-call via AgentContext.
_mongo = None


def set_mongo(db):
    # wrap the raw DB handle so the tools get least-privilege, read-only access to 3 collections
    global _mongo
    _mongo = _ReadOnlyCollections(db) if db is not None else None


def _owned_orgs(owner_id: str) -> list[dict]:
    # organizations.ownerId is a plain string (camelCase, legacy snake fallbacks)
    for field in ("ownerId", "owner_id", "ownerID"):
        docs = list(_mongo[ORG_COLLECTION].find({field: owner_id}))
        if docs:
            return docs
    return []


def _scope(ctx: AgentContext) -> tuple[list[dict], str | None]:
    """Resolve the caller's teams. Returns (team_docs, error_message).

    If ctx.org_id is set it must be one the caller owns, else refused. Never returns
    teams from an org the caller doesn't own.
    """
    if _mongo is None:
        return [], "The data service is unavailable right now."
    if not ctx.owner_id:
        return [], "No user context; cannot read any data."

    orgs = _owned_orgs(ctx.owner_id)
    if not orgs:
        return [], "You don't have any organizations yet."

    org_ids = {str(o["_id"]) for o in orgs}
    if ctx.org_id:
        if ctx.org_id not in org_ids:
            # the selected org isn't owned by this user — refuse, do not leak
            return [], "The selected organization isn't one you own."
        org_ids = {ctx.org_id}

    oid_list = [ObjectId(i) for i in org_ids]
    # departments.orgId is an ObjectId (legacy string tolerated)
    teams = list(_mongo[TEAMS_COLLECTION].find({"orgId": {"$in": oid_list}}))
    if not teams:
        teams = list(_mongo[TEAMS_COLLECTION].find({"orgId": {"$in": list(org_ids)}}))
    return teams, None


def _team_used(dept_oid: ObjectId) -> tuple[float, int]:
    """Sum receiptAmount over a team's receipts (no server-side total exists). Returns (used, count)."""
    receipts = list(_mongo[RECEIPTS_COLLECTION].find({"departmentID": dept_oid}))
    used = sum((r.get("receiptAmount") or 0.0) for r in receipts)
    return used, len(receipts)


@tool
def get_teams_overview() -> str:
    """Get a budget overview of every team in the user's selected organization: each team's
    budget, total spent, remaining budget, and number of receipts. Use this when the user asks
    about team budgets, spending, how much is left, or an organization-wide financial summary.
    Read-only."""
    ctx = get_runtime(AgentContext).context
    teams, error = _scope(ctx)
    if error:
        return error
    if not teams:
        return "There are no teams in this organization yet."

    lines = []
    for team in teams:
        budget = team.get("budget") or 0
        used, count = _team_used(team["_id"])
        remaining = max(0.0, budget - used)
        lines.append(
            f"- {team.get('name') or 'Unnamed team'}: budget ${budget:,.2f}, "
            f"spent ${used:,.2f}, remaining ${remaining:,.2f}, {count} receipt(s)"
        )
    return "Teams in this organization:\n" + "\n".join(lines)


@tool
def get_team_receipts(team_name: str) -> str:
    """Get the receipts for one team by name, with each receipt's name, amount, date, source,
    reimbursement state (reimbursed or not), and any label/notes. Use this when the user asks about a specific team's receipts or
    transactions. Read-only — this cannot add, edit, or delete receipts."""
    ctx = get_runtime(AgentContext).context
    teams, error = _scope(ctx)
    if error:
        return error

    name = (team_name or "").strip().lower()
    team = next((t for t in teams if (t.get("name") or "").strip().lower() == name), None)
    if team is None:
        owned = ", ".join(t.get("name") or "Unnamed" for t in teams) or "none"
        return f"No team named '{team_name}' in your organization. Your teams: {owned}."

    receipts = list(_mongo[RECEIPTS_COLLECTION].find({"departmentID": team["_id"]}))
    if not receipts:
        return f"{team.get('name')} has no receipts yet."

    states = _reimbursement_states(receipts)
    lines = []
    for r in receipts:
        amount = r.get("receiptAmount") or 0.0
        date = _receipt_date(r)
        source = "Local upload" if r.get("createdFrom") == "local_upload" else "Google Drive"
        extra = r.get("label") or r.get("description") or ""
        extra = f" — {extra}" if extra else ""
        lines.append(f"- {r.get('receiptName') or 'Unnamed'}: ${amount:,.2f}, {date}, {source}, {states[_receipt_key(r)]}{extra}")
    total = sum((r.get("receiptAmount") or 0.0) for r in receipts)
    return f"Receipts for {team.get('name')} (total ${total:,.2f}):\n" + "\n".join(lines)


def _receipt_key(doc: dict) -> str:
    # same id the app uses for a receipt: Drive file id, or the stringified _id for local uploads
    return doc.get("googleDriveFileId") or str(doc["_id"])


def _reimbursement_states(receipts: list[dict]) -> dict[str, str]:
    """receipt id -> wording for its reimbursement state. Reimbursed only if its record's status is
    Reimbursed; otherwise not reimbursed (even when it already sits in a pending record)."""
    states = {_receipt_key(r): "not reimbursed" for r in receipts}
    for rec in _mongo[REIMBURSEMENT_COLLECTION].find({"receiptInvolved.receiptIds": {"$in": list(states)}}):
        record = rec.get("name", "")
        text = f"reimbursed (record '{record}')" if rec.get("status") == "Reimbursed" else f"not reimbursed (pending in record '{record}')"
        for rid in rec["receiptInvolved"]["receiptIds"]:
            if rid in states:
                states[rid] = text
    return states


def _receipt_date(doc: dict) -> str:
    # mirror google_drive._to_out: local uses createdAt; Drive uses receiptMetadata.modifiedTime
    if doc.get("createdFrom") == "local_upload":
        created = doc.get("createdAt")
        return created.date().isoformat() if hasattr(created, "date") else "—"
    raw = doc.get("receiptMetadata")
    if isinstance(raw, str) and raw:
        try:
            modified = json.loads(raw).get("modifiedTime")
            if isinstance(modified, str) and modified:
                return modified[:10]
        except json.JSONDecodeError:
            pass
    return "—"
