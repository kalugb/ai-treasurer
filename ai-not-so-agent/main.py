import os
import sys
import asyncio
import questionary
from datetime import datetime
from zoneinfo import ZoneInfo
from bson.objectid import ObjectId
from chatbot.memory import update_conversation_time

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from chatbot.llm import LLM
from scheduler.scheduler_manager import SchedulerManager
from db.crud import Collections, Read, Create, Update, Delete, Aggregation
from auth.cli_auth import CLIAuth


class AI_AGENT:
    def __init__(self):
        self.scheduler_manager = SchedulerManager()
        self.user_id = None
        self.username = None

    async def _get_conversations(self, user_id):
        conversation_id_list = await Read.find(Collections.CONVERSATIONS, {"userID": user_id}, {"_id": 1})
        conversation_list_count = len(conversation_id_list)

        if conversation_list_count == 0:
            print("You have no conversations. Please start a new conversation.")
            return None

        print("You have ", conversation_list_count, "conversations: ")
        conversation_list = {(i + 1): conversation_id_list[i]["_id"] for i in range(conversation_list_count)}

        return conversation_list

    async def _call_llm(self, user_id, conversation_id):
        async def async_input(prompt: str):
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, input, prompt)

        llm = await LLM.create(user_id, conversation_id)

        try:
            while True:
                user_prompt = await async_input("\nYou: ")

                if user_prompt.lower() == "exit":
                    print("Goodbye, updating conversation time...")
                    await update_conversation_time(self.user_id, conversation_id)
                    break

                print("LLM is typing...")

                async for chunk in llm.llm(user_prompt):
                    print(chunk, end="", flush=True)

                print("\n====== Response done, ready for next prompt ======")

        except (KeyboardInterrupt, asyncio.CancelledError):
            print("Goodbye, updating conversation time...")
            await asyncio.shield(update_conversation_time(self.user_id, conversation_id))


async def main():
    print("Loading... Please wait while the AI Agent is initializing.")
    ai_agent = AI_AGENT()
    print("AI Agent initialized successfully. Ready to assist you.")
    print("You can press CTRL + C to exit at any time.")

    while True:
        while not ai_agent.user_id:
            auth_result = await CLIAuth.authenticate()

            if auth_result == "<exit_signal>":
                print("Exiting...")
                sys.exit(0)

            if auth_result:
                ai_agent.user_id = auth_result["user_id"]  # type: ignore
                ai_agent.username = auth_result["username"] # type: ignore
                print("Authentication successful with user ID: ", ai_agent.user_id)
                break

        # get conversation list
        conversation_list = await ai_agent._get_conversations(ai_agent.user_id)

        if conversation_list is None:
            print("Starting a new conversation...")
            conversation_result = await Create.insert_one(Collections.CONVERSATIONS, { "userID": ai_agent.user_id, "lastUpdated": datetime.now(ZoneInfo("Asia/Kuala_Lumpur")) })
            conversation_id = conversation_result.inserted_id # type: ignore
            print("New conversation created with ID: ", conversation_id)
        else:
            conversation_choice = await questionary.select(
                "Select a conversation to continue: ",
                choices=[f"Conversation {i}" for i in conversation_list.keys()] + ["Start a new conversation", "Logout", "Exit"]
            ).ask_async()

            if conversation_choice == "Start a new conversation":
                conversation_result = await Create.insert_one(Collections.CONVERSATIONS, { "userID": ai_agent.user_id, "lastUpdated": datetime.now(ZoneInfo("Asia/Kuala_Lumpur")) })
                conversation_id = conversation_result.inserted_id # type: ignore
                print("New conversation created with ID: ", conversation_id)
            elif conversation_choice == "Logout":
                print("Logging out...")
                ai_agent.user_id = None
                ai_agent.username = None

                await CLIAuth.signout()
                continue
            elif conversation_choice == "Exit" or conversation_choice is None:
                print("Exiting...")
                sys.exit(0)
            else:
                selected_index = int(conversation_choice.split(" ")[1])
                conversation_id = conversation_list[selected_index]
                print("Continuing with Conversation ID:", conversation_id)

        # call llm
        await ai_agent._call_llm(ai_agent.user_id, conversation_id) if conversation_id else print("No conversation selected.")


if __name__ == "__main__":
    from scheduler.scheduler_manager import SchedulerManager

    async def run_with_scheduler():
        scheduler_manager = SchedulerManager()
        scheduler_task = asyncio.create_task(scheduler_manager.start())
        main_task = asyncio.create_task(main())

        try:
            await asyncio.gather(scheduler_task, main_task)
        except (KeyboardInterrupt, asyncio.CancelledError):
            print("Exiting...")
        finally:
            scheduler_task.cancel()
            main_task.cancel()
            await asyncio.gather(scheduler_task, main_task, return_exceptions=True)

    async def run_without_scheduler():
        await main()
        
    asyncio.run(run_without_scheduler())
