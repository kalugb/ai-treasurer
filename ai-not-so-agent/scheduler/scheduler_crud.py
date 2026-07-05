import sys
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from bson.objectid import ObjectId
from typing import Any, Optional

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from db.crud import Create, Read, Update, Delete, Collections

class SchedulerCRUD:
    async def create_scheduler(
            self,
            task_name: str,
            user_id: ObjectId,
            prompt: str,
            next_execution_time: datetime,
            repeating: bool = False,
            max_repeat: Optional[int] = None,
            interval_in_seconds: Optional[int] = 3600
    ) -> Optional[ObjectId]:
        current_time = datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))

        if next_execution_time.tzinfo is None:
            next_execution_time = next_execution_time.replace(tzinfo=ZoneInfo("Asia/Kuala_Lumpur"))

        create_scheduler_format: dict[str, Any] = {
            "schemaVersion": 1,
            "taskName": task_name,
            "userID": user_id if isinstance(user_id, ObjectId) else ObjectId(user_id),
            "prompt": prompt,
            "createdAt": current_time,
            "nextExecutionTime": next_execution_time,
            "repeating": repeating,

            # notify user via email when the task is executed
            "notifyOnUser": True,
            "notifyEmail": await Read.find_one(Collections.USERS, {"_id": user_id}, {"email": 1, "_id": 0})["email"], # type: ignore
            "notifyMessage": f"Your scheduled task '{task_name}' has been executed. Prompt: {prompt}",
        }

        if repeating:
            create_scheduler_format.update({
                "intervalInSeconds": interval_in_seconds,
                "maxRepeat": max_repeat,
                "repeatedCount": 0,
                "lastExecutionTime": None,
                "lastRunStatus": None,
            })

        create_scheduler_result = await Create.insert_one(Collections.SCHEDULER, create_scheduler_format)

        if create_scheduler_result:
            print("Scheduler created successfully with scheduler id: ", create_scheduler_result.inserted_id)
            return create_scheduler_result.inserted_id
        else:
            print("Error creating scheduler")
            return None
        
    async def read_scheduler(self, filters: dict[str, Any], find_many: bool = False):
        get_scheduler_result: Any = None
        
        if find_many:
            get_scheduler_result = await Read.find(Collections.SCHEDULER, filters)
        else:
            get_scheduler_result = await Read.find_one(Collections.SCHEDULER, filters)

        if get_scheduler_result:
            print("Scheduler found successfully")
            return get_scheduler_result
        else:
            print("No scheduler found with the given filters: ", filters)
            return None
        
    async def update_scheduler(
            self,
            user_id: ObjectId,  
            scheduler_id: ObjectId,  
            changes: dict[str, Any]
    ):
        if not scheduler_id:
            print("Invalid scheduler id")
            return False

        update_scheduler_result = await Update.update_one(Collections.SCHEDULER, {"_id": scheduler_id, "userID": user_id}, {"$set": changes})

        if update_scheduler_result:
            print("Scheduler updated successfully with scheduler id: ", scheduler_id)
            return True
        else:
            print("Error updating scheduler")
            return False
        
    async def delete_scheduler(self, scheduler_id: ObjectId, user_id: ObjectId):
        if not scheduler_id:
            print("Invalid scheduler id")
            return False

        delete_scheduler_result = await Delete.delete_one(Collections.SCHEDULER, {"_id": scheduler_id, "userID": user_id})

        if delete_scheduler_result:
            print("Scheduler deleted successfully with scheduler id: ", scheduler_id)
            return True
        else:
            print("Error deleting scheduler")
            return False
    
