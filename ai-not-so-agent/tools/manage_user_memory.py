import os
from datetime import datetime
from zoneinfo import ZoneInfo
from bson.objectid import ObjectId
from typing import Optional, Any
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db.crud import Create, Update, Delete, Collections


async def create_user_memory(adding_fields: dict):
    create_result = await Create.insert_one(Collections.USER_MEMORY, adding_fields)
    return create_result


async def update_user_memory(
    user_id: ObjectId,
    preference: Optional[dict[str, str]] = None,
    facts: Optional[list[str]] = None,
    full_update: bool = False
):
    now = datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))

    if full_update:
        update_ops: dict[str, Any] = {
            "$set": {
                "preferences": preference or {},
                "facts": facts or [],
                "updatedAt": now
            }
        }
        update_result = await Update.update_one(Collections.USER_MEMORY, {"userID": user_id}, update_ops, upsert=True)
        return update_result

    # partial update — merge preferences, append facts
    set_fields: dict[str, Any] = {}
    push_fields: dict[str, Any] = {}

    if preference:
        set_fields.update({f"preferences.{k}": v for k, v in preference.items()})

    if facts:
        push_fields["facts"] = {"$each": facts}

    if not set_fields and not push_fields:
        print("Nothing to update")
        return None

    set_fields["updatedAt"] = now

    update_ops = {"$set": set_fields}
    if push_fields:
        update_ops["$push"] = push_fields

    update_result = await Update.update_one(Collections.USER_MEMORY, {"userID": user_id}, update_ops, upsert=True)
    return update_result


async def delete_user_memory(user_id: ObjectId):
    delete_result = await Delete.delete_one(Collections.USER_MEMORY, {"userID": user_id})
    return delete_result


async def manage_user_memory(
    action: str,
    user_id: ObjectId,
    preference: Optional[dict[str, str]] = None,
    facts: Optional[list[str]] = None,
    **kwargs: Any
):
    if action == "create":
        ops_result = await create_user_memory({
            "schemaVersion": 1,
            "userID": user_id,
            "preferences": preference or {},
            "facts": facts or [],
            "createdAt": datetime.now(ZoneInfo("Asia/Kuala_Lumpur")),
        })
    elif action == "update":
        ops_result = await update_user_memory(user_id, preference, facts)
    elif action == "delete":
        ops_result = await delete_user_memory(user_id)
    else:
        print("Unknown action")
        ops_result = None

    return ops_result