import asyncio
import os
from bson.objectid import ObjectId
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from scheduler.scheduler_crud import SchedulerCRUD
from scheduler.scheduler_llm import run_scheduler_llm

class SchedulerManager:
    def __init__(self):
        self.crud = SchedulerCRUD()
        self.user_id: ObjectId | None = None
        self.user_email: str | None = None
        self.task_cache: dict[str, dict] = {}
        self.poll_interval_seconds = 10 # get from .env later, but math: 10 sec for run cached tasks, 10 cycles (100 sec) for load upcoming tasks
        
    async def load_upcoming_task(self):
        self.task_cache.clear()

        current_time = datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))
        one_hour_later = current_time + timedelta(hours=1)

        filters = {
            "userID": self.user_id,
            "nextExecutionTime": {
                "$gte": current_time,
                "$lte": one_hour_later
            }
        }

        upcoming_tasks = await self.crud.read_scheduler(filters, find_many=True)

        if upcoming_tasks:
            for task in upcoming_tasks:
                self.task_cache[str(task["_id"])] = task

        return upcoming_tasks
    
    async def run_due_tasks(self) -> None:
        current_time = datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))
        to_remove: list[str] = []

        for cache_key, task in list(self.task_cache.items()):
            next_exec: datetime = task["nextExecutionTime"]
            if next_exec.tzinfo is None:
                next_exec = next_exec.replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo("Asia/Kuala_Lumpur"))

            print(f"[SCHEDULER] Checking task: {task['taskName']} (ID: {task['_id']}) with next execution time: {next_exec}")
            print(f"[SCHEDULER] Current time: {current_time}")

            if next_exec <= current_time and task["userID"] == self.user_id:
                task_id: ObjectId = task["_id"]
                task_name: str = task["taskName"]
                task_prompt: str = task["prompt"]
                print(f"[SCHEDULER] Running task: {task_name} (ID: {task_id})")

                try:
                    assert self.user_email is not None
                    response = await run_scheduler_llm(self.user_id, self.user_email, task_prompt)
                    print(f"[SCHEDULER] Task {task_name} (ID: {task_id}) executed with status: {response}")
                    run_status = response.get("status", "error")
                except Exception as e:
                    print(f"[SCHEDULER] Error executing task: {task_name} (ID: {task_id})")
                    print(f"[SCHEDULER] Error: {e}")
                    response = {"response": "", "tool_calls": [], "status": "error"}
                    run_status = "error"

                print(response)

                will_task_repeats: bool = task.get("repeating", False)

                if not will_task_repeats:
                    await self.crud.delete_scheduler(task_id, self.user_id)
                    to_remove.append(cache_key)
                    continue

                max_repeat: int | None = task.get("maxRepeat")
                latest_task_repeated_count: int = task.get("repeatedCount", 0) + 1
                should_not_repeat = (max_repeat is not None) and (latest_task_repeated_count >= max_repeat)

                if should_not_repeat:
                    await self.crud.delete_scheduler(task_id, self.user_id)
                    to_remove.append(cache_key)
                    continue

                interval_in_seconds: int = task.get("intervalInSeconds", 0)
                next_execution_time = next_exec + timedelta(seconds=interval_in_seconds)  

                update_field_format: dict[str, datetime | int | str] = {
                    "nextExecutionTime": next_execution_time,
                    "lastExecutionTime": current_time,
                    "repeatedCount": latest_task_repeated_count,
                    "lastRunStatus": run_status,
                }

                await self.crud.update_scheduler(self.user_id, task_id, update_field_format)
                self.task_cache[cache_key].update(update_field_format)

        for key in to_remove:
            del self.task_cache[key]

    async def start(self):
        print(f"Scheduler Manager started at {datetime.now(ZoneInfo('Asia/Kuala_Lumpur'))}")
        cycle = 0

        # set user_id hardcoded first for now
        self.user_id = ObjectId("6a39ef01435dd96fb84c7685")  # Replace with actual user ID
        self.user_email = "tadot83718@fishnone.com"  # Replace with actual user email

        while True:
            try:
                if cycle % 10 == 0:
                    print(f"[SCHEDULER] Loading upcoming scheduled tasks...")
                    await self.load_upcoming_task()
                    print(f"[SCHEDULER] Upcoming tasks loaded. Total: {len(self.task_cache)}")
                    print(self.task_cache) if self.task_cache else print("[SCHEDULER] No upcoming tasks found.")

                await self.run_due_tasks()
            except Exception as e:
                print(f"[SCHEDULER] Error in scheduler manager: {e}")
            finally:
                cycle += 1
                await asyncio.sleep(self.poll_interval_seconds)


if __name__ == "__main__":
    async def main():
        manager = SchedulerManager()
        await manager.start()

    asyncio.run(main())




                


