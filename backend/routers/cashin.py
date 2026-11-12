import datetime as dt
import os
import re
import uuid
from datetime import datetime, time, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from starlette.concurrency import run_in_threadpool

from models.cashin import CashInDelete
from routers.teams import _parse_id, _verify_org_owner, get_mongo
from services.mongodb import mongodb_ops
from services.supabase import supabase_ops

router = APIRouter(prefix="/api")
COLLECTION_NAME = "cashin"
REIMBURSEMENT_COLLECTION = "reimbursement"
TYPE = "Cash in"
REIMBURSEMENT = "Reimbursement"
MAX_IMAGE_BYTES = 10 * 1024 * 1024
# raster images only: no SVG (a script when opened directly) and no PDFs (proof is an image)
IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
HISTORY_MAX = 100
_MIN = datetime.min.replace(tzinfo=timezone.utc)


def _require_db(mongo):
    if mongo is None:
        raise HTTPException(status_code=503, detail="Database not available")


def _as_datetime(day: dt.date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def _utc(when) -> datetime:
    # mongo hands back naive datetimes; treat them as UTC so records sort against each other
    if not isinstance(when, datetime):
        return _MIN
    return when if when.tzinfo else when.replace(tzinfo=timezone.utc)


def _ext(filename: str | None) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    return ext if re.fullmatch(r"\.[a-z0-9]{1,8}", ext) else ""


async def _read_image(file: UploadFile | None) -> tuple[bytes, str, str] | None:
    """(data, content_type, filename) for a valid proof image, None when no file was sent."""
    if file is None or not file.filename:
        return None
    content_type = file.content_type or ""
    if content_type not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Proof must be a PNG, JPEG, WebP or GIF image")
    data = await file.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Proof image is larger than 10 MB")
    if not data:
        raise HTTPException(status_code=422, detail="Proof image is empty")
    return data, content_type, file.filename


def _image_meta(path: str, data: bytes, content_type: str, filename: str) -> dict:
    return {"storagePath": path, "mimeType": content_type, "size": len(data), "fileName": filename}


async def _upload(org_oid: ObjectId, record_oid: ObjectId, image: tuple[bytes, str, str]) -> dict:
    data, content_type, filename = image
    # random token: a replaced image never overwrites the file the record still points at
    path = f"{org_oid}/{record_oid}-{uuid.uuid4().hex[:8]}{_ext(filename)}"
    try:
        await run_in_threadpool(supabase_ops.upload_cashin_image, path, data, content_type)
    except Exception:
        raise HTTPException(status_code=502, detail="Could not store the proof image")
    return _image_meta(path, data, content_type, filename)


async def _drop_file(path: str | None) -> None:
    # best effort: a stray private file is harmless, a failed cleanup must not fail the request
    if not path:
        return
    try:
        await run_in_threadpool(supabase_ops.delete_cashin_image, path)
    except Exception:
        pass


def _to_out(doc: dict) -> dict:
    meta = doc.get("imageMetadata") or {}
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "date": _utc(doc.get("datetime")).date().isoformat() if doc.get("datetime") else None,
        "amount": doc.get("amount") or 0.0,
        "source": doc.get("source", ""),
        "type": TYPE,
        "hasImage": bool(meta.get("storagePath")),
        # storagePath stays server-side; the image is served through the owner-checked image route
        "imageMetadata": {k: meta.get(k) for k in ("fileName", "mimeType", "size")} if meta.get("storagePath") else {},
    }


def build_cashflow(cashins: list[dict], reimbursements: list[dict], limit: int, offset: int) -> dict:
    """Balance = total cash in - total reimbursement (every record, whatever its status), plus a page of the
    merged history, newest first.
    shortcut: merges and sorts the whole org in Python, switch to an aggregation when records grow large."""
    entries = [
        (_utc(d.get("datetime")), str(d["_id"]), {"kind": TYPE, "id": str(d["_id"]), "name": d.get("name", ""), "amount": d.get("amount") or 0.0, "detail": d.get("source", "")}, d)
        for d in cashins
    ] + [
        (_utc(d.get("datetime")), str(d["_id"]), {"kind": REIMBURSEMENT, "id": str(d["_id"]), "name": d.get("name", ""), "amount": d.get("amount") or 0.0, "detail": d.get("teamInvolved", "")}, d)
        for d in reimbursements
    ]
    entries.sort(key=lambda e: (e[0], e[1]), reverse=True)
    total_in = round(sum(d.get("amount") or 0.0 for d in cashins), 2)
    total_out = round(sum(d.get("amount") or 0.0 for d in reimbursements), 2)
    page = [{**item, "date": when.date().isoformat() if doc.get("datetime") else None} for when, _id, item, doc in entries[offset:offset + limit]]
    return {
        "balance": round(total_in - total_out, 2),
        "totalCashIn": total_in,
        "totalReimbursement": total_out,
        "cashInCount": len(cashins),
        "reimbursementCount": len(reimbursements),
        "history": page,
        "total": len(entries),
        "hasMore": offset + limit < len(entries),
    }


@router.get("/cashins")
async def list_cashins(orgId: str, ownerId: str = Query(min_length=1), mongo=Depends(get_mongo)):
    _require_db(mongo)
    org_oid = _parse_id(orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    docs = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"orgId": org_oid}, read_many=True)
    docs = sorted(docs or [], key=lambda d: (_utc(d.get("datetime")), str(d["_id"])), reverse=True)
    records = [_to_out(d) for d in docs]
    return {"records": records, "total": round(sum(r["amount"] for r in records), 2), "count": len(records)}


@router.get("/cashflow")
async def get_cashflow(
    orgId: str,
    ownerId: str = Query(min_length=1),
    limit: int = Query(5, ge=1, le=HISTORY_MAX),
    offset: int = Query(0, ge=0),
    mongo=Depends(get_mongo),
):
    _require_db(mongo)
    org_oid = _parse_id(orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    cashins = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"orgId": org_oid}, read_many=True)
    reimbursements = await mongodb_ops.read(mongo, collection_name=REIMBURSEMENT_COLLECTION, query={"orgId": org_oid}, read_many=True)
    return build_cashflow(cashins or [], reimbursements or [], limit, offset)


@router.post("/cashins", status_code=201)
async def create_cashin(
    orgId: str = Form(...),
    name: str = Form(..., min_length=1, max_length=200),
    date: dt.date = Form(...),
    amount: float = Form(..., ge=0, le=1e12),
    source: str = Form(..., min_length=1, max_length=200),
    file: UploadFile | None = File(None),
    ownerId: str = Query(min_length=1),
    mongo=Depends(get_mongo),
):
    _require_db(mongo)
    org_oid = _parse_id(orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    name, source = name.strip(), source.strip()
    if not name or not source:
        raise HTTPException(status_code=422, detail="name and source cannot be empty")
    image = await _read_image(file)

    doc = {
        "_id": ObjectId(),  # known up front, so the file is uploaded before the record exists (no half-made record)
        "name": name,
        "datetime": _as_datetime(date),
        "amount": float(amount),
        "orgId": org_oid,
        "source": source,
        "type": TYPE,
        "imageMetadata": {},
    }
    if image:
        doc["imageMetadata"] = await _upload(org_oid, doc["_id"], image)
    try:
        await mongodb_ops.create(mongo, doc_to_create=doc, collection_name=COLLECTION_NAME)
    except Exception:
        await _drop_file(doc["imageMetadata"].get("storagePath"))
        raise
    return _to_out(doc)


@router.patch("/cashins/{record_id}")
async def update_cashin(
    record_id: str,
    name: str | None = Form(None, min_length=1, max_length=200),
    date: dt.date | None = Form(None),
    amount: float | None = Form(None, ge=0, le=1e12),
    source: str | None = Form(None, min_length=1, max_length=200),
    removeImage: bool = Form(False),
    file: UploadFile | None = File(None),
    ownerId: str = Query(min_length=1),
    mongo=Depends(get_mongo),
):
    _require_db(mongo)
    record_oid = _parse_id(record_id, "cash in id")
    existing = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": record_oid})
    if existing is None:
        raise HTTPException(status_code=404, detail="Cash in record not found")
    org_oid = existing["orgId"]
    await _verify_org_owner(mongo, org_oid, ownerId)

    set_fields: dict = {}
    if name is not None:
        set_fields["name"] = name.strip()
    if source is not None:
        set_fields["source"] = source.strip()
    if "" in (set_fields.get("name"), set_fields.get("source")):
        raise HTTPException(status_code=422, detail="name and source cannot be empty")
    if date is not None:
        set_fields["datetime"] = _as_datetime(date)
    if amount is not None:
        set_fields["amount"] = float(amount)

    old_path = (existing.get("imageMetadata") or {}).get("storagePath")
    image = await _read_image(file)
    new_meta = None
    if image:
        new_meta = await _upload(org_oid, record_oid, image)
        set_fields["imageMetadata"] = new_meta
    elif removeImage and old_path:
        set_fields["imageMetadata"] = {}

    if not set_fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    try:
        await mongodb_ops.update(mongo, query={"_id": record_oid}, collection_name=COLLECTION_NAME, update_data=set_fields)
    except Exception:
        if new_meta:
            await _drop_file(new_meta["storagePath"])
        raise
    if "imageMetadata" in set_fields:
        await _drop_file(old_path)  # the record no longer points at it
    updated = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": record_oid})
    return _to_out(updated)


@router.post("/cashins/delete")
async def delete_cashins(payload: CashInDelete, ownerId: str = Query(min_length=1), mongo=Depends(get_mongo)):
    _require_db(mongo)
    org_oid = _parse_id(payload.orgId, "orgId")
    await _verify_org_owner(mongo, org_oid, ownerId)
    ids = [_parse_id(i, "cash in id") for i in payload.ids]
    # orgId in the filter: ids from another org are never deleted
    query = {"_id": {"$in": ids}, "orgId": org_oid}
    docs = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query=query, read_many=True) or []
    deleted = await mongodb_ops.delete(mongo, collection_name=COLLECTION_NAME, query=query, delete_many=True)
    for doc in docs:  # records first, then files: a record never points at a missing file
        await _drop_file((doc.get("imageMetadata") or {}).get("storagePath"))
    return {"deleted": deleted}


@router.get("/cashins/{record_id}/image")
async def get_cashin_image(record_id: str, ownerId: str = Query(min_length=1), mongo=Depends(get_mongo)):
    """The proof image. Private: served here after the owner check, never through a public bucket URL."""
    _require_db(mongo)
    doc = await mongodb_ops.read(mongo, collection_name=COLLECTION_NAME, query={"_id": _parse_id(record_id, "cash in id")})
    if doc is None:
        raise HTTPException(status_code=404, detail="Cash in record not found")
    await _verify_org_owner(mongo, doc["orgId"], ownerId)
    meta = doc.get("imageMetadata") or {}
    if not meta.get("storagePath"):
        raise HTTPException(status_code=404, detail="This record has no proof image")
    return await image_response(meta)


async def image_response(meta: dict) -> Response:
    """Download a stored proof image (shared with the snapshot image route)."""
    try:
        data = await run_in_threadpool(supabase_ops.download_cashin_image, meta["storagePath"])
    except Exception:
        raise HTTPException(status_code=502, detail="Could not load the proof image")
    media_type = meta.get("mimeType") if meta.get("mimeType") in IMAGE_TYPES else "application/octet-stream"
    return Response(content=data, media_type=media_type, headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})
