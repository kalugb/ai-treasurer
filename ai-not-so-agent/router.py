from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from bson import ObjectId
from chatbot.llm_http import LLM
from scheduler.scheduler_manager import SchedulerManager

router = APIRouter()
scheduler_manager = SchedulerManager()


class LLMRequest(BaseModel):
    user_id: ObjectId
    conversation_id: ObjectId
    prompt: str


@router.post("/api/llm")
async def llm_endpoint(req: LLMRequest):
    llm = await LLM.create(user_id=req.user_id, conversation_id=req.conversation_id)
    result = await llm.llm_http(req.prompt)
    return result


@router.post("/api/llm/stream")
async def llm_stream_endpoint(req: LLMRequest):
    llm = await LLM.create(user_id=req.user_id, conversation_id=req.conversation_id)
    return StreamingResponse(llm.llm_stream(req.prompt), media_type="text/event-stream")


# FIXME: later do something to change this, this might not be correct
@router.post("/api/scheduler/start")
async def scheduler_start(background_tasks: BackgroundTasks, user_id: ObjectId, user_email: str):
    scheduler_manager.user_id = user_id
    scheduler_manager.user_email = user_email
    background_tasks.add_task(scheduler_manager.start)
    return {"status": "scheduler started"}
