import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any, Optional
from bson.objectid import ObjectId
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from scheduler.scheduler_crud import SchedulerCRUD

_crud = SchedulerCRUD()


async def create_scheduler(
    task_name: str,
    user_id: str | ObjectId,
    prompt: str,
    next_execution_time: str,
    repeating: bool = False,
    max_repeat: Optional[int] = None,
    interval_in_seconds: Optional[int] = None,
):
    result = await _crud.create_scheduler(
        task_name=task_name,
        user_id=ObjectId(user_id) if isinstance(user_id, str) else user_id,
        prompt=prompt,
        next_execution_time=datetime.fromisoformat(next_execution_time),
        repeating=repeating,
        max_repeat=max_repeat,
        interval_in_seconds=interval_in_seconds or 3600,
    )
    return str(result) if result else None


async def read_scheduler(
    user_id: str | ObjectId,
    scheduler_id: Optional[str | ObjectId] = None,
    find_many: bool = False,
):
    filters: dict[str, Any] = {}

    if scheduler_id is not None:
        filters["_id"] = ObjectId(scheduler_id) if isinstance(scheduler_id, str) else scheduler_id
    filters["userID"] = ObjectId(user_id) if isinstance(user_id, str) else user_id

    result = await _crud.read_scheduler(filters, find_many=find_many)
    if result is None:
        return None
    if isinstance(result, list):
        for doc in result:
            doc["_id"] = str(doc["_id"])
            if "userID" in doc:
                doc["userID"] = str(doc["userID"])
        return result
    result["_id"] = str(result["_id"])
    if "userID" in result:
        result["userID"] = str(result["userID"])
    return result


async def update_scheduler(user_id: str | ObjectId, scheduler_id: str | ObjectId, changes: dict[str, Any]):
    result = await _crud.update_scheduler(
        user_id=ObjectId(user_id) if isinstance(user_id, str) else user_id,
        scheduler_id=ObjectId(scheduler_id) if isinstance(scheduler_id, str) else scheduler_id,
        changes=changes,
    )
    return result


async def delete_scheduler(scheduler_id: str | ObjectId, user_id: str | ObjectId):
    scheduler_id = ObjectId(scheduler_id) if isinstance(scheduler_id, str) else scheduler_id
    user_id = ObjectId(user_id) if isinstance(user_id, str) else user_id
    result = await _crud.delete_scheduler(scheduler_id, user_id)
    return result

async def manage_scheduler(
    action: str,
    scheduler_id: Optional[str] = None,
    user_id: Optional[str] = None,
    task_name: Optional[str] = None,
    prompt: Optional[str] = None,
    next_execution_time: Optional[str] = None,
    repeating: bool = False,
    max_repeat: Optional[int] = None,
    interval_in_seconds: Optional[int] = 3600,
    changes: Optional[dict[str, Any]] = None,
    find_many: bool = False,
    **kwargs: Any,
):
    if action == "create":
        result = await create_scheduler(
            task_name=task_name or "",
            user_id=user_id or "",
            prompt=prompt or "",
            next_execution_time=next_execution_time or "",
            repeating=repeating,
            max_repeat=max_repeat,
            interval_in_seconds=interval_in_seconds,
        )
    elif action == "read":
        if user_id is None:
            result = None
        else:
            result = await read_scheduler(
                scheduler_id=scheduler_id,
                user_id=user_id,
                find_many=find_many,
            )
    elif action == "update":
        if user_id is None or scheduler_id is None:
            result = None
        else:
            result = await update_scheduler(
                user_id=user_id,
                scheduler_id=scheduler_id,
                changes=changes or {},
            )
    elif action == "delete":
        result = await delete_scheduler(scheduler_id or "", user_id or "")
    else:
        result = None

    return result
