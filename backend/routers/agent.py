import asyncio
import asyncio
import json
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse

from services.mongodb import mongodb_ops
from models.agent import SendMessageRequest, RegenerateRequest, StopRequest

router = APIRouter(prefix="/api/agent")
COLLECTION_NAME = "memories"

STATUS_IN_PROGRESS = "In Progress"
STATUS_SUCCESS = "Successed"
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


async def _run_agent(app, user_oid: ObjectId, conversation_oid: ObjectId, memory_id: ObjectId, user_input: str, owner_id: str, org_id: str | None):
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
        # short-term memory: last 5 completed turns of this conversation
        history = [{"user": d.get("input", ""), "assistant": d.get("output", "")} for d in prior][-5:]

        async def on_delta(text):
            await _publish(redis, user_oid, {
                "event": "delta",
                "conversationId": str(conversation_oid),
                "memoryId": str(memory_id),
                "delta": text,
            })

        output, tool_log = await llm.run_llm(user_input, history, {"owner_id": owner_id, "org_id": org_id}, on_delta=on_delta)
        tools = _aggregate_tools(tool_log)

        # Only write success if the turn is still In Progress — a user "stop" may have
        # already flipped it to Failed; don't resurrect a stopped turn.
        matched = await mongodb_ops.update(
            ai_mongo, collection_name=collection,
            query={"_id": memory_id, "status": STATUS_IN_PROGRESS},
            update_data={"output": output, "tools": tools, "status": STATUS_SUCCESS},
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


def _spawn_run(app, user_oid, conversation_oid, memory_id, user_input, owner_id, org_id):
    task = asyncio.create_task(_run_agent(app, user_oid, conversation_oid, memory_id, user_input, owner_id, org_id))
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
    return {"deleted": deleted}


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

    _spawn_run(request.app, user_oid, conversation_oid, memory_id, req.input, req.userId, req.orgId)

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
    _spawn_run(request.app, user_oid, conversation_oid, memory_id, doc.get("input", ""), req.userId, doc.get("orgId"))

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
