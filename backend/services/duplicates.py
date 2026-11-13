"""Duplicate-receipt support. A receipt's identity is the MD5 of its bytes (`contentHash`).

MD5 because it is the only hash Drive returns for every uploaded file (sha256Checksum is missing on
some), so Drive and local receipts stay comparable. It spots accidental double-filing; it is not a
security boundary.

Duplicate state is DERIVED on every read, never stored (like reimbursement state): within an
organization, the oldest receipt with a given hash is the original and every later copy is a duplicate.
Only the human decision is stored, as `duplicateReview: {status: dismissed|confirmed, hash, reviewedAt}`.
"""
import hashlib
import json
from datetime import datetime, timezone

RECEIPTS_COLLECTION = "receipts"
TEAMS_COLLECTION = "departments"
_FIELDS = {"_id": 1, "departmentID": 1, "orgID": 1, "googleDriveFileId": 1, "receiptName": 1, "createdFrom": 1,
           "createdAt": 1, "receiptMetadata": 1, "contentHash": 1, "duplicateReview": 1,
           "receiptAmount": 1, "label": 1, "description": 1}


def content_hash(data: bytes) -> str:
    return hashlib.md5(data, usedforsecurity=False).hexdigest()


def ensure_indexes(db) -> None:
    """Lookup index for any receipt, plus a partial unique one so two simultaneous local uploads of the
    same file can't both win. Partial because Drive duplicates must be allowed to coexist."""
    col = db[RECEIPTS_COLLECTION]
    col.create_index([("orgID", 1), ("contentHash", 1)], name="org_content_hash", sparse=True)
    col.create_index(
        [("orgID", 1), ("contentHash", 1)],
        unique=True,
        name="uniq_local_content_hash",
        partialFilterExpression={"createdFrom": "local_upload", "contentHash": {"$type": "string"}},
    )


def _naive_utc(value) -> datetime | None:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(value, datetime):
        return None
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


def _age_key(doc: dict):
    """Oldest first: Drive's own createdTime for Drive files (sync time would just be the first sync), else createdAt."""
    created = None
    raw = doc.get("receiptMetadata")
    if doc.get("createdFrom") != "local_upload" and isinstance(raw, str) and raw:
        try:
            created = _naive_utc(json.loads(raw).get("createdTime"))
        except json.JSONDecodeError:
            pass
    return (created or _naive_utc(doc.get("createdAt")) or datetime.max, str(doc["_id"]))


def receipt_key(doc: dict) -> str:
    return doc.get("googleDriveFileId") or str(doc["_id"])


def classify(group: list[dict]) -> dict[str, dict | None]:
    """group = every receipt sharing one contentHash in one organization.
    Returns {str(_id): None for the original, else {status: pending|confirmed|dismissed, original: doc}}.
    A decision only counts while its stored hash still matches the receipt (a replaced Drive file is re-judged)."""
    ordered = sorted(group, key=_age_key)
    original = ordered[0]
    out: dict[str, dict | None] = {str(original["_id"]): None}
    for doc in ordered[1:]:
        review = doc.get("duplicateReview") or {}
        status = review.get("status") if review.get("hash") == doc.get("contentHash") and review.get("status") in ("dismissed", "confirmed") else "pending"
        out[str(doc["_id"])] = {"status": status, "original": original}
    return out


def verdicts(docs: list[dict]) -> dict[str, dict]:
    """{str(_id): {status, original}} for every doc that is a later copy of another doc in `docs`
    (docs must all be from one organization)."""
    groups: dict[str, list[dict]] = {}
    for d in docs:
        if d.get("contentHash"):
            groups.setdefault(d["contentHash"], []).append(d)
    return {
        rid: v
        for group in groups.values() if len(group) > 1
        for rid, v in classify(group).items() if v
    }


def _shown_date(doc: dict) -> str | None:
    """The date the UI shows for a receipt: Drive modifiedTime, or the upload day for a local receipt."""
    if doc.get("createdFrom") == "local_upload":
        created = _naive_utc(doc.get("createdAt"))
        return created.date().isoformat() if created else None
    try:
        modified = json.loads(doc.get("receiptMetadata") or "{}").get("modifiedTime")
    except (json.JSONDecodeError, TypeError):
        modified = None
    return modified[:10] if isinstance(modified, str) and modified else None


def describe(verdict: dict, team_names: dict) -> dict:
    """The shape the API / snapshot exposes. `excluded` = confirmed (left out of totals and the reimbursement picker).
    `of` carries the original's details so the UI can show both receipts side by side."""
    original = verdict["original"]
    return {
        "status": verdict["status"],
        "excluded": verdict["status"] == "confirmed",
        "of": {
            "receiptId": receipt_key(original),
            "name": original.get("receiptName", ""),
            "teamId": str(original.get("departmentID", "")),
            "teamName": team_names.get(original.get("departmentID"), ""),
            "source": original.get("createdFrom", "google_drive"),
            "amount": original.get("receiptAmount") or 0.0,
            "label": original.get("label"),
            "description": original.get("description"),
            "date": _shown_date(original),
        },
    }


def annotate(db, org_id, docs: list[dict]) -> dict[str, dict]:
    """{str(_id): describe(...)} for the docs that are currently duplicates of an older receipt in the organization."""
    hashes = {d["contentHash"] for d in docs if d.get("contentHash")}
    if not hashes or org_id is None:
        return {}
    same_hash = list(db[RECEIPTS_COLLECTION].find({"orgID": org_id, "contentHash": {"$in": list(hashes)}}, _FIELDS))
    wanted = {str(d["_id"]) for d in docs}
    found = {rid: v for rid, v in verdicts(same_hash).items() if rid in wanted}
    team_ids = {v["original"].get("departmentID") for v in found.values()}
    teams = {t["_id"]: t.get("name", "") for t in db[TEAMS_COLLECTION].find({"_id": {"$in": list(team_ids)}}, {"name": 1})} if team_ids else {}
    return {rid: describe(v, teams) for rid, v in found.items()}


if __name__ == "__main__":
    from bson import ObjectId

    assert content_hash(b"abc") == "900150983cd24fb0d6963f7d28e17f72"
    d = datetime
    def mk(created, **kw):
        return {"_id": ObjectId(), "contentHash": "h", "createdFrom": "local_upload", "createdAt": created, **kw}

    a, b, c = mk(d(2026, 1, 1)), mk(d(2026, 1, 2)), mk(d(2026, 1, 3))
    v = classify([c, a, b])
    assert v[str(a["_id"])] is None and v[str(b["_id"])]["status"] == "pending" and v[str(c["_id"])]["original"] is a
    # decisions count only while the hash matches; a replaced file is re-judged
    b["duplicateReview"] = {"status": "confirmed", "hash": "h"}
    assert classify([a, b])[str(b["_id"])]["status"] == "confirmed"
    b["contentHash"] = "h2"
    assert classify([a, b])[str(b["_id"])]["status"] == "pending"
    b["contentHash"] = "h"; b["duplicateReview"] = {"status": "dismissed", "hash": "h"}
    assert classify([a, b])[str(b["_id"])]["status"] == "dismissed"
    # the original is never flagged; if it goes away the survivor is the original (so a confirmed one counts again)
    b["duplicateReview"] = {"status": "confirmed", "hash": "h"}
    assert classify([b]) == {str(b["_id"]): None}
    # Drive copies are ordered by Drive's createdTime, not by when they were first synced
    old = mk(d(2026, 5, 1), createdFrom="google_drive", receiptMetadata=json.dumps({"createdTime": "2020-01-01T00:00:00.000Z"}))
    new = mk(d(2026, 1, 1), createdFrom="google_drive", receiptMetadata=json.dumps({"createdTime": "2024-01-01T00:00:00.000Z"}))
    assert classify([new, old])[str(old["_id"])] is None
    print("duplicates self-check OK")
