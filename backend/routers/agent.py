import asyncio
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Depends, UploadFile, File
from fastapi.responses import Response, StreamingResponse
from starlette.concurrency import run_in_threadpool

from services.mongodb import mongodb_ops
from services.supabase import supabase_ops
from services.ai import attachments as attachments_svc
from services.ai import excel
from services.ai import receipt_scan
from services.ai import history as ai_history
from services.ai.embeddings.long_term_memory import embed_turn, retrieve_embedding
from models.agent import SendMessageRequest, RegenerateRequest, StopRequest

router = APIRouter(prefix="/api/agent")
COLLECTION_NAME = "memories"
EXPORTS_COLLECTION = "exportFiles"  # ai DB: spreadsheets the agent made (file in Supabase bucket agentExports)
EXPORT_DAYS = 30

STATUS_IN_PROGRESS = "In Progress"
STATUS_SUCCESS = "Succeeded"
STATUS_FAILED = "Failed"

# In-flight agent runs, keyed by str(memory_id), so /stop can actually cancel the task.
# In-process only (single worker); a multi-worker deploy would need the cancel broadcast over Redis.
_running: dict[str, asyncio.Task] = {}


def get_ai_mongo(request: Request):
    return request.app.state.ai_mongo

def get_redis(request: Request):
    return request.app.state.redis

def get_llm(request: Request):
    return request.app.state.llm_inference


def _user_oid(user_id: str) -> ObjectId:
    # shortcut: userId is pre-auth placeholder "1", mapped to a fixed sentinel ObjectId.
    # Replace with the real user's ObjectId when auth lands.
    try:
        return ObjectId(user_id)
    except (InvalidId, Exception):
        return ObjectId(user_id.rjust(24, "0"))

def _parse_oid(raw: str, label: str) -> ObjectId:
    try:
        return ObjectId(raw)
    except (InvalidId, Exception):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")

def _channel(user_oid: ObjectId) -> str:
    return f"agent:runs:{user_oid}"

def _aggregate_tools(tool_call_log: list) -> list[dict]:
    # Collapse the per-call log into {toolName, toolUsed} counts (schema's `tools` shape).
    counts: dict[str, int] = {}
    for call in tool_call_log or []:
        name = call.get("name") or "unknown"
        counts[name] = counts.get(name, 0) + 1
    return [{"toolName": n, "toolUsed": c} for n, c in counts.items()]

def _to_memory_out(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "conversationId": str(doc.get("conversationId", "")),
        "input": doc.get("input", ""),
        "output": doc.get("output"),
        "tools": doc.get("tools", []) or [],
        "attachments": doc.get("attachments", []) or [],
        "files": doc.get("files", []) or [],  # spreadsheets the agent made in this turn: [{id, name, size, kind}]
        "status": doc.get("status", STATUS_IN_PROGRESS),
        "time": doc["time"].isoformat() if isinstance(doc.get("time"), datetime) else doc.get("time"),
    }


async def _publish(redis, user_oid: ObjectId, payload: dict):
    if redis is None:
        return
    try:
        await redis.publish(_channel(user_oid), json.dumps(payload))
    except Exception as e:
        print(f"agent publish failed: {e}")


async def _save_embedding(app, memory_id: ObjectId, user_input: str, output: str):
    # Best effort: the turn is already Succeeded + delivered; a failure only means no vector.
    client = getattr(app.state, "embeddings_client", None)
    if client is None:
        return
    try:
        vector = await embed_turn(client, user_input, output)
        await mongodb_ops.update(
            app.state.ai_mongo, collection_name=COLLECTION_NAME,
            query={"_id": memory_id},
            update_data={"textEmbedding": vector},
        )
    except Exception as e:
        print(f"agent embedding failed for {memory_id}: {e}")


async def _recall(app, user_oid: ObjectId, org_id: str | None, user_input: str, skip_ids: set, limit: int = 5) -> list[dict]:
    # Long-term memory: the caller's most similar past turns. Best effort — failure just means no memories.
    client = getattr(app.state, "embeddings_client", None)
    if client is None or not user_input.strip():
        return []
    try:
        query_vector = await retrieve_embedding(client, user_input)
        # over-fetch, then drop turns already sent as short-term history
        hits = await mongodb_ops.get_embeddings(app.state.ai_mongo, COLLECTION_NAME, query_vector, user_oid, org_id, limit=limit * 2)
        kept = [h for h in hits if h.get("_id") not in skip_ids][:limit]
        kept_ids = {h.get("_id") for h in kept}
        # debug: inspect similarity scores to pick a cutoff later
        print(f"agent recall for {user_input[:60]!r}: {len(hits)} hit(s), {len(kept)} used")
        for h in hits:
            tag = "use" if h.get("_id") in kept_ids else ("skip-history" if h.get("_id") in skip_ids else "skip-limit")
            print(f"  score={h.get('score', 0):.4f} [{tag}] {h.get('_id')} input={(h.get('input') or '')[:60]!r}")
        return kept
    except Exception as e:
        print(f"agent recall failed: {e}")
        return []


def _looks_like_tool_call(text: str) -> bool:
    """A reply that is just a JSON tool call ({"name": ..., "arguments": ...}) printed as text, which the
    NVIDIA fallback sometimes does instead of calling the tool."""
    stripped = (text or "").strip().strip("`").removeprefix("json").strip()
    if not (stripped.startswith("{") and stripped.endswith("}")):
        return False
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError:
        return False
    return isinstance(parsed, dict) and "name" in parsed and ("arguments" in parsed or "parameters" in parsed)


async def _store_files(app, user_oid: ObjectId, org_id: str | None, conversation_oid: ObjectId, memory_id: ObjectId, made: list) -> tuple[list[dict], int]:
    """Upload the spreadsheets the Excel tools built during the run and record them in ai.exportFiles.
    Returns ([{id, name, size, kind}], number that failed). Upload first, then the record, so a record
    never points at a missing file."""
    saved, failed = [], 0
    for f in made:
        file_oid = ObjectId()
        path = f"{user_oid}/{file_oid}.xlsx"
        try:
            await run_in_threadpool(supabase_ops.upload_export, path, f["data"], excel.XLSX_MIME)
            await mongodb_ops.create(app.state.ai_mongo, collection_name=EXPORTS_COLLECTION, doc_to_create={
                "_id": file_oid, "userId": user_oid, "orgId": org_id, "conversationId": conversation_oid, "memoryId": memory_id,
                "name": f["name"], "storagePath": path, "size": len(f["data"]), "kind": f["kind"], "createdAt": datetime.now(timezone.utc),
            })
            saved.append({"id": str(file_oid), "name": f["name"], "size": len(f["data"]), "kind": f["kind"]})
        except Exception as e:
            failed += 1
            print(f"agent export upload failed for {memory_id}: {e}")
    return saved, failed


def sweep_expired_exports(ai_db) -> None:
    """Blocking, best effort, run at startup: delete exports older than EXPORT_DAYS (file + record)."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=EXPORT_DAYS)
    old = list(ai_db[EXPORTS_COLLECTION].find({"createdAt": {"$lt": cutoff}}, {"storagePath": 1}))
    if not old:
        return
    supabase_ops.delete_exports([d["storagePath"] for d in old if d.get("storagePath")])
    ai_db[EXPORTS_COLLECTION].delete_many({"_id": {"$in": [d["_id"] for d in old]}})
    print(f"removed {len(old)} expired agent export(s)")


async def _run_agent(app, user_oid: ObjectId, conversation_oid: ObjectId, memory_id: ObjectId, user_input: str, owner_id: str, org_id: str | None, attachments: list | None = None):
    # Tracked asyncio.Task (see _running): /stop can cancel it to truly kill the in-flight LLM call.
    # Decoupled from any client connection, so navigating away never kills the run.
    ai_mongo = app.state.ai_mongo
    redis = app.state.redis
    llm = app.state.llm_inference
    collection = COLLECTION_NAME

    try:
        if llm is None:
            raise RuntimeError("LLM inference not available")

        # Build prior history for this conversation (completed turns, chronological).
        prior = await mongodb_ops.read(
            ai_mongo, collection_name=collection,
            query={"conversationId": conversation_oid, "status": STATUS_SUCCESS},
            read_many=True,
        )
        prior = sorted(prior or [], key=lambda d: d.get("time") or datetime.min)
        # short-term memory: last 5 completed turns of this conversation.
        # history carries only each turn's typed input — NOT past attachment text — so a large
        # file doesn't get re-sent on every subsequent turn (keeps context lean + streaming fast).
        history = [{"user": d.get("input", ""), "assistant": d.get("output", "")} for d in prior][-5:]
        recent_ids = {d["_id"] for d in prior[-5:]}
        memories = await _recall(app, user_oid, org_id, user_input, recent_ids)

        # current turn: merge this turn's attachment text into the message the model sees
        model_input = user_input
        for att in (attachments or []):
            model_input += f"\n\n[Attached file: {att.get('filename', 'file')} ({att.get('kind', 'file')})]\n{att.get('text', '')}"

        async def on_delta(text):
            await _publish(redis, user_oid, {
                "event": "delta",
                "conversationId": str(conversation_oid),
                "memoryId": str(memory_id),
                "delta": text,
            })

        made: list = []  # spreadsheets the Excel tools build during this run (see AgentContext.files)
        output, tool_log = await llm.run_llm(model_input, history, {"owner_id": owner_id, "org_id": org_id, "files": made}, on_delta=on_delta, memories=memories)
        tools = _aggregate_tools(tool_log)
        if not (output or "").strip() or _looks_like_tool_call(output):
            # the model ran out of budget, gave up, or printed a tool call as text: a made file still deserves
            # a reply, otherwise fail the turn so the user gets "Generate again" instead of a broken bubble
            if not made:
                raise RuntimeError("The AI returned an empty reply")
            output = "Your spreadsheet is ready below." if len(made) == 1 else "Your spreadsheets are ready below."
        files, failed_files = await _store_files(app, user_oid, org_id, conversation_oid, memory_id, made)
        if failed_files:
            output += f"\n\n_Note: {failed_files} spreadsheet{'s' if failed_files > 1 else ''} could not be saved. Ask again to retry._"

        # Only write success if the turn is still In Progress — a user "stop" may have
        # already flipped it to Failed; don't resurrect a stopped turn.
        matched = await mongodb_ops.update(
            ai_mongo, collection_name=collection,
            query={"_id": memory_id, "status": STATUS_IN_PROGRESS},
            update_data={"output": output, "tools": tools, "files": files, "status": STATUS_SUCCESS},
        )
        if not matched:
            return  # stopped/overtaken; leave the existing (Failed) status and don't publish done
        await _publish(redis, user_oid, {
            "event": "done",
            "conversationId": str(conversation_oid),
            "memoryId": str(memory_id),
            "status": STATUS_SUCCESS,
            "output": output,
        })
        # Unregister first so a late /stop can't cancel (and flip to Failed) an already-delivered turn.
        _running.pop(str(memory_id), None)
        # Raw typed input (not attachment text) so file dumps don't dominate the vector.
        await _save_embedding(app, memory_id, user_input, output)
    except asyncio.CancelledError:
        # /stop cancelled the task: kill the run, mark Failed, tell the UI.
        print(f"agent run cancelled: {memory_id}")
        await mongodb_ops.update(
            ai_mongo, collection_name=collection,
            query={"_id": memory_id},
            update_data={"status": STATUS_FAILED, "error": "Stopped by user"},
        )
        await _publish(redis, user_oid, {
            "event": "error",
            "conversationId": str(conversation_oid),
            "memoryId": str(memory_id),
            "status": STATUS_FAILED,
            "detail": "Stopped by user.",
        })
        raise
    except Exception as e:
        print(f"agent run failed: {e}")
        await mongodb_ops.update(
            ai_mongo, collection_name=collection,
            query={"_id": memory_id},
            update_data={"status": STATUS_FAILED, "error": str(e)},
        )
        await _publish(redis, user_oid, {
            "event": "error",
            "conversationId": str(conversation_oid),
            "memoryId": str(memory_id),
            "status": STATUS_FAILED,
            "detail": "Agent run failed.",
        })
    finally:
        _running.pop(str(memory_id), None)


def _spawn_run(app, user_oid, conversation_oid, memory_id, user_input, owner_id, org_id, attachments=None):
    task = asyncio.create_task(_run_agent(app, user_oid, conversation_oid, memory_id, user_input, owner_id, org_id, attachments))
    _running[str(memory_id)] = task
    return task


@router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, userId: str = "1", ai_mongo=Depends(get_ai_mongo)):
    if ai_mongo is None:
        raise HTTPException(status_code=503, detail="AI database not available")
    conversation_oid = _parse_oid(conversation_id, "conversationId")
    user_oid = _user_oid(userId)
    deleted = await mongodb_ops.delete(
        ai_mongo, collection_name=COLLECTION_NAME,
        query={"conversationId": conversation_oid, "userId": user_oid}, delete_many=True,
    )
    # the conversation's spreadsheets go too: records first, then the files (best effort; a stray private file is harmless)
    exports = await mongodb_ops.read(ai_mongo, collection_name=EXPORTS_COLLECTION, query={"conversationId": conversation_oid, "userId": user_oid}, read_many=True)
    if exports:
        await mongodb_ops.delete(ai_mongo, collection_name=EXPORTS_COLLECTION, query={"_id": {"$in": [d["_id"] for d in exports]}}, delete_many=True)
        try:
            await run_in_threadpool(supabase_ops.delete_exports, [d["storagePath"] for d in exports if d.get("storagePath")])
        except Exception as e:
            print(f"agent export cleanup failed for conversation {conversation_oid}: {e}")
    return {"deleted": deleted}


@router.get("/files/{file_id}")
async def download_file(file_id: str, userId: str = "1", ai_mongo=Depends(get_ai_mongo)):
    """Download a spreadsheet the agent made. Only its owner can; anyone else gets the same 404 as a missing file."""
    if ai_mongo is None:
        raise HTTPException(status_code=503, detail="AI database not available")
    try:
        file_oid = ObjectId(file_id)
    except (InvalidId, Exception):
        raise HTTPException(status_code=404, detail="File not found")
    doc = await mongodb_ops.read(ai_mongo, collection_name=EXPORTS_COLLECTION, query={"_id": file_oid, "userId": _user_oid(userId)})
    if doc is None:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        data = await run_in_threadpool(supabase_ops.download_export, doc["storagePath"])
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch the file")
    name = doc.get("name") or "spreadsheet.xlsx"
    return Response(content=data, media_type=excel.XLSX_MIME, headers={
        "Content-Disposition": f"attachment; filename=\"{name.encode('ascii', 'ignore').decode() or 'spreadsheet.xlsx'}\"; filename*=UTF-8''{quote(name)}",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


@router.get("/conversations")
async def list_conversations(userId: str = "1", ai_mongo=Depends(get_ai_mongo)):
    if ai_mongo is None:
        raise HTTPException(status_code=503, detail="AI database not available")
    user_oid = _user_oid(userId)
    docs = await mongodb_ops.read(
        ai_mongo, collection_name=COLLECTION_NAME,
        query={"userId": user_oid}, read_many=True,
    )
    # Group by conversation; keep the latest turn per conversation for preview + status.
    latest: dict[str, dict] = {}
    for d in docs or []:
        cid = str(d.get("conversationId", ""))
        t = d.get("time") or datetime.min
        if cid not in latest or (latest[cid].get("time") or datetime.min) < t:
            latest[cid] = d
    out = []
    for cid, d in latest.items():
        out.append({
            "conversationId": cid,
            "preview": d.get("input", ""),
            "status": d.get("status", STATUS_IN_PROGRESS),
            "lastMemoryId": str(d["_id"]),
            "time": d["time"].isoformat() if isinstance(d.get("time"), datetime) else d.get("time"),
        })
    out.sort(key=lambda c: c.get("time") or "", reverse=True)
    return out


@router.get("/conversations/{conversation_id}/messages")
async def get_messages(conversation_id: str, userId: str = "1", ai_mongo=Depends(get_ai_mongo)):
    if ai_mongo is None:
        raise HTTPException(status_code=503, detail="AI database not available")
    conversation_oid = _parse_oid(conversation_id, "conversationId")
    user_oid = _user_oid(userId)
    docs = await mongodb_ops.read(
        ai_mongo, collection_name=COLLECTION_NAME,
        query={"conversationId": conversation_oid, "userId": user_oid}, read_many=True,
    )
    docs = sorted(docs or [], key=lambda d: d.get("time") or datetime.min)
    return [_to_memory_out(d) for d in docs]


@router.post("/attachments")
async def upload_attachment(request: Request, file: UploadFile = File(...)):
    """Convert one uploaded file (Excel/PDF via MarkItDown, image via the shared Groq/NVIDIA models) to text.
    Transient: the bytes are discarded after conversion; only the text is returned."""
    data = await file.read()
    return await attachments_svc.convert(file.filename or "file", file.content_type or "", data, llm=request.app.state.llm_inference)


@router.post("/receipts/scan")
async def scan_receipt(request: Request, file: UploadFile = File(...), ownerId: str | None = None, orgId: str | None = None, teamId: str | None = None):
    """AI-extract receipt name/amount/description from an uploaded file (nothing is stored except the AI history entry,
    which is skipped when ownerId/orgId are missing). The file itself is never kept: this is the upload form's scan."""
    llm = request.app.state.llm_inference
    if llm is None:
        raise HTTPException(status_code=503, detail="LLM inference not available")
    data = await file.read()
    filename, content_type = file.filename or "file", file.content_type or ""
    try:
        result, history_id = await ai_history.run_logged(
            request,
            {"owner_id": ownerId, "org_id": orgId, "team_id": teamId, "trigger": "upload_form"},
            {"filename": filename, "mimeType": content_type, "size": len(data)}, None,
            lambda meta: receipt_scan.scan(llm, filename, content_type, data, meta),
        )
        return {**result, "historyId": history_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"receipt scan failed: {e}")
        raise HTTPException(status_code=502, detail="Could not scan this receipt.")


@router.post("/messages", status_code=202)
async def send_message(req: SendMessageRequest, request: Request, ai_mongo=Depends(get_ai_mongo)):
    if ai_mongo is None:
        raise HTTPException(status_code=503, detail="AI database not available")
    user_oid = _user_oid(req.userId)
    conversation_oid = _parse_oid(req.conversationId, "conversationId") if req.conversationId else ObjectId()

    doc = {
        "userId": user_oid,
        "conversationId": conversation_oid,
        "input": req.input,
        "output": None,
        "tools": [],
        "attachments": [a.model_dump() for a in req.attachments],  # 2=b: stored separate from input
        "orgId": req.orgId,  # scope for this turn; regenerate reuses it
        "time": datetime.now(timezone.utc),
        "status": STATUS_IN_PROGRESS,
    }
    memory_id = await mongodb_ops.create(ai_mongo, doc_to_create=doc, collection_name=COLLECTION_NAME)

    await _publish(request.app.state.redis, user_oid, {
        "event": "running",
        "conversationId": str(conversation_oid),
        "memoryId": str(memory_id),
        "status": STATUS_IN_PROGRESS,
    })

    _spawn_run(request.app, user_oid, conversation_oid, memory_id, req.input, req.userId, req.orgId, [a.model_dump() for a in req.attachments])

    return {"conversationId": str(conversation_oid), "memoryId": str(memory_id), "status": STATUS_IN_PROGRESS}


@router.post("/regenerate", status_code=202)
async def regenerate(req: RegenerateRequest, request: Request, ai_mongo=Depends(get_ai_mongo)):
    if ai_mongo is None:
        raise HTTPException(status_code=503, detail="AI database not available")
    user_oid = _user_oid(req.userId)
    memory_id = _parse_oid(req.memoryId, "memoryId")

    doc = await mongodb_ops.read(ai_mongo, collection_name=COLLECTION_NAME, query={"_id": memory_id, "userId": user_oid})
    if doc is None:
        raise HTTPException(status_code=404, detail="Memory not found")
    if doc.get("status") != STATUS_FAILED:
        raise HTTPException(status_code=400, detail="Only failed runs can be regenerated")

    conversation_oid = doc["conversationId"]
    # 3=a: reuse the same doc, flip back to In Progress.
    await mongodb_ops.update(
        ai_mongo, collection_name=COLLECTION_NAME,
        query={"_id": memory_id},
        update_data={"status": STATUS_IN_PROGRESS, "output": None, "tools": [], "error": None,
                     "time": datetime.now(timezone.utc)},
    )
    await _publish(request.app.state.redis, user_oid, {
        "event": "running",
        "conversationId": str(conversation_oid),
        "memoryId": str(memory_id),
        "status": STATUS_IN_PROGRESS,
    })
    _spawn_run(request.app, user_oid, conversation_oid, memory_id, doc.get("input", ""), req.userId, doc.get("orgId"), doc.get("attachments"))

    return {"conversationId": str(conversation_oid), "memoryId": str(memory_id), "status": STATUS_IN_PROGRESS}


@router.post("/stop", status_code=202)
async def stop(req: StopRequest, request: Request, ai_mongo=Depends(get_ai_mongo)):
    # User stopped the response: cancel the in-flight task (truly kills the LLM call) and mark Failed.
    if ai_mongo is None:
        raise HTTPException(status_code=503, detail="AI database not available")
    user_oid = _user_oid(req.userId)
    memory_id = _parse_oid(req.memoryId, "memoryId")

    doc = await mongodb_ops.read(ai_mongo, collection_name=COLLECTION_NAME, query={"_id": memory_id, "userId": user_oid})
    if doc is None:
        raise HTTPException(status_code=404, detail="Memory not found")

    conversation_oid = doc["conversationId"]
    task = _running.get(str(memory_id))
    if task is not None and not task.done():
        task.cancel()  # raises CancelledError into _run_agent, which marks Failed + publishes error
        return {"memoryId": str(memory_id), "status": STATUS_FAILED}

    # No live task (already finished, or a different worker). Only flip if still In Progress.
    matched = await mongodb_ops.update(
        ai_mongo, collection_name=COLLECTION_NAME,
        query={"_id": memory_id, "status": STATUS_IN_PROGRESS},
        update_data={"status": STATUS_FAILED, "error": "Stopped by user"},
    )
    if matched:
        await _publish(request.app.state.redis, user_oid, {
            "event": "error",
            "conversationId": str(conversation_oid),
            "memoryId": str(memory_id),
            "status": STATUS_FAILED,
            "detail": "Stopped by user.",
        })
    # Idempotent: if the run already finished, report its current status rather than 404.
    current = await mongodb_ops.read(ai_mongo, collection_name=COLLECTION_NAME, query={"_id": memory_id})
    return {"memoryId": str(memory_id), "status": current.get("status", STATUS_FAILED)}


@router.get("/stream")
async def stream(userId: str = "1", request: Request = None, ai_mongo=Depends(get_ai_mongo), redis=Depends(get_redis)):
    user_oid = _user_oid(userId)

    async def event_generator():
        # Initial snapshot so a fresh/reconnected stream shows correct state without a refresh.
        in_progress = []
        if ai_mongo is not None:
            docs = await mongodb_ops.read(
                ai_mongo, collection_name=COLLECTION_NAME,
                query={"userId": user_oid, "status": STATUS_IN_PROGRESS}, read_many=True,
            )
            in_progress = [{"conversationId": str(d.get("conversationId", "")), "memoryId": str(d["_id"])} for d in (docs or [])]
        yield f"event: snapshot\ndata: {json.dumps({'inProgress': in_progress})}\n\n"

        if redis is None:
            return
        pubsub = redis.pubsub()
        await pubsub.subscribe(_channel(user_oid))
        try:
            while True:
                if request is not None and await request.is_disconnected():
                    break
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15.0)
                if msg is None:
                    yield ": keep-alive\n\n"  # comment frame keeps the connection open through proxies
                    continue
                data = msg.get("data")
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                payload = json.loads(data)
                event = payload.get("event", "message")
                yield f"event: {event}\ndata: {json.dumps(payload)}\n\n"
        finally:
            await pubsub.unsubscribe(_channel(user_oid))
            await pubsub.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
