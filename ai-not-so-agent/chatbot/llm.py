import openai
from openai import AsyncOpenAI
from dotenv import load_dotenv
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from bson import ObjectId
import asyncio
import json
import importlib
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from chatbot.memory import log_memory, update_conversation_time, get_long_term_memory
from db.crud import Read, Collections, Create
from embeddings.embeddings import embedding_client
from skills.skills_manager import embed_all_skills, retrieve_relevant_skills

load_dotenv()

# for exception usage
class ToolCallLimitExceededError(Exception):
    pass

class LLM:
    def __init__(self):
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.base_url = os.getenv("BASE_URL")
        self.llm_model_name = os.getenv("LLM_NAME")

        # client init
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )

        # embedding model
        self.embedding_model = embedding_client

        # all skills embeddings, including ids and embeddings
        self.skill_ids, self.skill_embeddings = [], [] # async load in classmethod
        self.skills_metadata = self._get_skills_metadata()

        # Context tracker
        self.conversation_history = []
        self.title = None
        self.tool_calling_logs = []
        self.TOOL_CALL_LIMIT = 10 # max tool call limit per conversation
        self.EXEMPT_TOOLS = ["manage_user_memory", "mcp_filesystem"] # tools that are exempted from call limit

        self.tools = self._get_tools()

        # Conversation tracker, init from class method
        self.user_id: ObjectId | None = None
        self.conversation_id: ObjectId | None = None
        self.user_memory: dict = {}
        self.SHORT_TERM_MEMORY_LIMIT = 10 # max short term memory limit per conversation

        self.system_instruction = """
You are a helpful, friendly assistant for everyday conversation and tasks.

<user_context>
These are the user preferences and facts, take note: {preferences_and_facts}

The following are memories from past conversations with this user. Use them to inform your response naturally, without explicitly announcing that you're recalling something, unless the user asks what you remember. If a memory conflicts with the user's current message, prioritize the current message.

long_term_memory: {long_term_memory}
</user_context>

<tools>
For normal chat — greetings, questions, opinions, explanations, casual conversation — just respond naturally in plain text. Do not use tools for things you already know or that don't require external action.

You have access to tools for specific situations:
- Use the web search tool when the user asks about current events, recent information, or anything you're unsure about or that may have changed recently.
- Use the file tools when the user explicitly asks you to save, write, or read a local file.
- Use the manage_user_memory tool when you observe something about the user worth remembering long-term — a preference, a personal fact, a habit, a recurring interest, or how they like to be responded to. Think like a human observer: if a friend told you this, would you remember it for future conversations? If yes, call the tool.

When calling a tool:
- Only call a tool when it's clearly needed for the user's request.
- Use the exact function name and argument format provided — never describe a tool call in plain text, always use the proper function call.
- After receiving a tool result, summarize or use it naturally in your response — don't dump raw data back to the user.
- If a tool fails or returns no useful result, tell the user honestly rather than making something up.
- For manage_user_memory specifically: call this FIRST before generating any response. Once the tool call completes, produce one single response only — do not output anything before the tool call, and do not produce a second response after it. The entire reply after the tool call should be your normal response to the user as if the memory save did not happen. Do not mention or acknowledge that you saved anything unless the user explicitly asks what you remember.
</tools>

{skills}

Keep responses concise and conversational unless the user asks for detail.
"""

    @classmethod
    async def create(cls, user_id: ObjectId | None, conversation_id: ObjectId | None = None):
        self = cls()

        self.user_id = user_id if isinstance(user_id, ObjectId) else ObjectId(user_id)
        self.conversation_id = conversation_id if isinstance(conversation_id, ObjectId) else ObjectId(conversation_id)
        self.user_memory = await Read.find_one(Collections.USER_MEMORY, {"userID": self.user_id}, {"_id": 0, "preferences": 1, "facts": 1})

        if not self.conversation_id:
            print("No previous conversations found, creating one...")
            create_conversation_result = await Create.insert_one(Collections.CONVERSATIONS, {"userID": self.user_id, "lastUpdated": datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))})

            if create_conversation_result:
                print("New conversation created successfully")
                self.conversation_id = create_conversation_result.inserted_id
            else:
                print("Error creating new conversation")
        else:
            # retrieving previous chat memories
            previous_chat_memories_query = await Read.find(Collections.MEMORY, {"conversationID": self.conversation_id}, {"text": 1}, sort_by="timestamp", sort_order=-1, limit=3)
            previous_chat_memories = []

            for memory in previous_chat_memories_query:
                previous_chat = memory["text"]
                previous_chat_memories.append(previous_chat)

            self.conversation_history.append({"role": "system", "content": f"previous_chat_memory: {previous_chat_memories}"})

        # load all skills embeddings into memory
        self.skill_ids, self.skill_embeddings = await embed_all_skills()

        return self

    # tools
    def _get_tools(self):
        tools_path = Path(__file__).parent.parent / "tools" / "tools.json"

        with open(tools_path, "r") as f:
            tools = json.load(f)

        return list(tools)
    
    # skills retrieval and loading
    def _get_skills_metadata(self):
        skill_metadata_path = Path(__file__).parent.parent / "skills" / "skills_metadata.json"
        with open(skill_metadata_path, "r") as f:
            skills_metadata = json.load(f)["skills"]

        return skills_metadata
    
    async def _get_relevant_skills_ids(self, user_prompt_embedding: list):
        return await retrieve_relevant_skills(user_prompt_embedding, self.skill_ids, self.skill_embeddings) # type: ignore
    
    async def _load_relevant_skill_contents(self, skill_ids: list[str]) -> str:
        contents = []
        for skill in self.skills_metadata:
            if skill["id"] in skill_ids:
                skill_path = Path(__file__).parent.parent / skill["skill_file"]

                if skill_path.exists():
                    with open(skill_path, "r") as f:
                        contents.append(f.read())

        return "\n\n---\n\n".join(contents) if contents else ""

    # long term memory, again conversation ID is hardcoded first
    async def _get_related_memories(self, query_embeddings: list, conversation_id: ObjectId | None, enable_logging=False):
        related_memory_list = await get_long_term_memory(query_embeddings, conversation_id)

        # related long term memory
        related_memory = []
        if enable_logging:
            related_scoring = []

            for memory in related_memory_list:
                text = memory["text"]
                score = memory["score"]

                related_memory.append(text)
                related_scoring.append(score)

                print(f"Related Memory: {text}, Score: {score}")
        else:
            for memory in related_memory_list:
                text = memory["text"]
                related_memory.append(text)

        return related_memory
            
    
    async def _call_tool(self, tool_name: str, tool_args: dict):  
        tool_args["user_id"] = self.user_id
        tool_status = False
        try:
            tool_name_path = f"tools.{tool_name}"

            print(f"Calling tool: {tool_name}")
            print(f"Tool args: {tool_args}")
            self.tool_calling_history[tool_name] += 1

            tool_module = importlib.import_module(tool_name_path)
            tool_function = getattr(tool_module, tool_name)

            tool_result = await tool_function(**tool_args)
            tool_status = True
            return tool_result, tool_status
        except Exception as e:
            print(f"Error calling tool: {e}")
            return f"Error calling tool {tool_name}: {e}", tool_status

    # LLM (Entry point from any sources (FastAPI, CLI, etc))
    # Whole thing considered as one conversation
    async def llm(self, user_prompt: str):
        # get user prompt embeddings
        user_prompt_embedding = await self.embedding_model.generate_embedding(user_prompt)

        # pass / long-term memory
        related_memory = await self._get_related_memories(user_prompt_embedding, self.conversation_id)

        # load skills
        skill_ids = await self._get_relevant_skills_ids(user_prompt_embedding)
        skills = await self._load_relevant_skill_contents(skill_ids)

        memoried_system_instruction = self.system_instruction.format(long_term_memory=related_memory, preferences_and_facts=self.user_memory, skills=skills)

        # reset tool tracking and logging
        self.tool_calling_logs.clear()
        self.tool_calling_history: dict[str, int] = { tool_name["name"]: 0 for tool_name in self.tools }

        self.conversation_history.append({"role": "user", "content": user_prompt})

        kwargs = {
            "model": self.llm_model_name,
            "input": [
                {"role": "system", "content": memoried_system_instruction},
                *self.conversation_history
            ],
            "stream": True,
            "tools": self.tools
        }

        llm_full_response = ""

        try:
            while True:
                function_calls = []

                stream = await self.client.responses.create(**kwargs)

                # streaming
                async for event in stream:
                    if event.type == "response.output_text.delta":
                        llm_full_response += event.delta
                        yield event.delta

                    if event.type == 'response.output_item.done':
                        item = event.item
                        if item.type == "function_call":
                            function_calls.append(item)

                # no more function calls remaining
                if not function_calls:
                    break

                # tool calling
                for call in function_calls:
                    args = json.loads(call.arguments)
                    tool_name = call.name

                    if self.tool_calling_history[tool_name] >= self.TOOL_CALL_LIMIT and tool_name not in self.EXEMPT_TOOLS:
                        raise ToolCallLimitExceededError(f"Tool {tool_name} has been called too many times. Please retry later")

                    result, tool_status = await self._call_tool(tool_name, args)
                    self.tool_calling_logs.append({
                        "name": tool_name,
                        "input": json.dumps(args, default=str),
                        "call_id": call.call_id,
                        "output": json.dumps(result, default=str),
                        "status": "Success" if tool_status else "Failed"
                    })

                    kwargs["input"].append({
                        "type": "function_call",
                        "call_id": call.call_id,
                        "name": call.name,
                        "arguments": call.arguments,
                    })
                    kwargs["input"].append({
                        "type": "function_call_output",
                        "call_id": call.call_id,
                        "output": json.dumps(result, default=str),
                        "tool_status": "Success" if tool_status else "Failed"
                    })
        except openai.RateLimitError as rle:
            print(f"Rate limited. Please wait and try again")
            print(f"Error: {rle}")
            llm_full_response += " Rate limited error"
            return
        except ToolCallLimitExceededError as tcle:
            print(f"Tool call limit hit: {tcle}")
            llm_full_response += f" Tool call limit hit {tcle}"
        except Exception as e:
            print(f"Error: {e}")
            llm_full_response += f" Error occurred. Error log: {e}"
            return

        self.conversation_history.append({"role": "assistant", "content": llm_full_response})
    
        # take the latest 10 chat history memory for caching
        if len(self.conversation_history) > self.SHORT_TERM_MEMORY_LIMIT:
            self.conversation_history = self.conversation_history[-self.SHORT_TERM_MEMORY_LIMIT:]

        # formating the input for memory logging
        formatted_text = f"{user_prompt} {llm_full_response}"
        formatted_text_embedding = await self.embedding_model.generate_embedding(formatted_text)

        # Log memory to DB in background
        asyncio.create_task(
            log_memory(
                self.conversation_id, 
                formatted_text, 
                formatted_text_embedding, 
                self.tool_calling_logs if self.tool_calling_logs else [], # only log tools call if it's not empty
                skill_ids if skill_ids else [] # only log skills if it's not empty
            )
        )
    # end of method


async def main():
    async def async_input(prompt: str):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, input, prompt)

    llm = await LLM.create(ObjectId("6a2b78c1f31269427ede4833"))

    print("=" * 80)
    print("Welcome to the AI Agent! How can I help you today?")
    print("=" * 80)

    print("\nType 'exit' or CTRL + C to exit the conversation.")
    while True:
        user_prompt = await async_input("\nYou: ")

        if user_prompt.lower() == "exit":
            print("Goodbye, updating conversation time...")
            await update_conversation_time(llm.user_id,llm.conversation_id)
            break

        print("LLM is typing...")

        async for chunk in llm.llm(user_prompt):
            print(chunk, end="", flush=True)

        print("\n====== Response done, ready for next prompt ======")

# the app entry point
if __name__ == "__main__":
    asyncio.run(main())