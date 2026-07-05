import openai
from openai import AsyncOpenAI
from dotenv import load_dotenv
import os
from pathlib import Path
from bson import ObjectId
import asyncio
import json
import importlib
import sys
from typing import Any

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from chatbot.memory import log_memory
from db.crud import Read, Collections, Create
from embeddings.embeddings import embedding_client
from skills.skills_manager import embed_all_skills, retrieve_relevant_skills

load_dotenv()

# module-level singletons — initialized once per process
_client = None
_skill_ids = None
_skill_embeddings = None
_skills_metadata = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=os.getenv("OPENROUTER_API_KEY"),
            base_url=os.getenv("BASE_URL")
        )
    return _client


def _get_tools() -> list:
    tools_path = Path(__file__).parent.parent / "tools" / "tools.json"
    with open(tools_path, "r", encoding="utf-8") as f:
        return list(json.load(f))


def _get_skills_metadata() -> list:
    skill_metadata_path = Path(__file__).parent.parent / "skills" / "skills_metadata.json"
    with open(skill_metadata_path, "r", encoding="utf-8") as f:
        return json.load(f)["skills"]


async def _get_skills() -> tuple:
    global _skill_ids, _skill_embeddings, _skills_metadata
    if _skill_ids is None:
        _skills_metadata = _get_skills_metadata()
        _skill_ids, _skill_embeddings = await embed_all_skills()
    return _skill_ids, _skill_embeddings, _skills_metadata


async def _load_relevant_skills(user_prompt_embedding, skill_ids, skill_embeddings, skills_metadata) -> tuple[str, list]:
    relevant_ids = await retrieve_relevant_skills(user_prompt_embedding, skill_ids, skill_embeddings)
    contents = []
    for skill in skills_metadata:
        if skill["id"] in relevant_ids:
            skill_path = Path(__file__).parent.parent / skill["skill_file"]
            if skill_path.exists():
                with open(skill_path, "r", encoding="utf-8") as f:
                    contents.append(f.read())
    return "\n\n---\n\n".join(contents) if contents else "", relevant_ids


async def _call_tool(tool_name: str, tool_args: dict, user_id: ObjectId) -> tuple:
    tool_args["user_id"] = user_id
    try:
        tool_module = importlib.import_module(f"tools.{tool_name}")
        tool_function = getattr(tool_module, tool_name)
        result = await tool_function(**tool_args)
        return result, True
    except Exception as e:
        return f"Error calling tool {tool_name}: {e}", False


SYSTEM_INSTRUCTION = """
You are a scheduled task executor. You execute tasks autonomously and notify the user when done.

<user_context>
These are the user preferences and facts, take note: {preferences_and_facts}
</user_context>

<task_execution>
You are executing a scheduled task on behalf of the user. Follow these steps strictly:

1. Execute the task described in the user prompt using available tools
2. Once the task is complete (success or failure), you MUST call gmail_send to notify the user
3. Never skip the email notification — it is required regardless of task outcome

Email address: {user_email}

Email notification format:
- to: use the user's email from their preferences/facts if available, otherwise use the email mentioned in the task
- subject: brief summary e.g. "Task Completed: <task name>" or "Task Failed: <task name>"
- body: include what was done, the result, any relevant details, and timestamp. If the result is a text answer, include it in the email body in full answer. If the result is a file, attach it to the email.
</task_execution>

<tools>
You have access to tools for specific situations:
- Use the web search tool when you need current information to complete the task.
- Use the manage_user_memory tool when you observe something about the user worth remembering long-term.
- Use the gmail_send tool ALWAYS after task completion — this is mandatory, not optional.

When calling a tool:
- Only call a tool when it's clearly needed.
- Use the exact function name and argument format provided.
- After receiving a tool result, summarize or use it naturally.
- If a tool fails or returns no useful result, still call gmail_send to notify the user of the failure.
</tools>

{skills}

After sending the email, include the exact text TASK_COMPLETE in your final response.
"""


async def run_scheduler_llm(
    user_id: ObjectId,
    user_email: str, 
    prompt: str,
    conversation_id: ObjectId | None = None
) -> dict:
    """Stateless — call from run_due_tasks with task['userID'], task['prompt'], task['conversationID'].

    Returns {"response": str, "tool_calls": list, "status": "success"|"error"}.
    """
    user_id = user_id if isinstance(user_id, ObjectId) else ObjectId(user_id)
    client = _get_client()
    llm_model_name = os.getenv("LLM_NAME")
    tools = _get_tools()

    # load skills cache + user memory + prompt embedding in parallel
    skill_ids, skill_embeddings, skills_metadata = await _get_skills()

    user_memory, user_prompt_embedding = await asyncio.gather(
        Read.find_one(Collections.USER_MEMORY, {"userID": user_id}, {"_id": 0, "preferences": 1, "facts": 1}),
        embedding_client.generate_embedding(prompt)
    )

    skills_content, relevant_skill_ids = await _load_relevant_skills(
        user_prompt_embedding, skill_ids, skill_embeddings, skills_metadata
    )

    system_instruction = SYSTEM_INSTRUCTION.format(
        preferences_and_facts=user_memory,
        skills=skills_content,
        user_email=user_email
    )

    messages: list[Any] = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt}
    ]

    tool_calling_history: dict[str, int] = {t["name"]: 0 for t in tools}
    tool_calling_logs: list[dict[str, Any]] = []  # fix: explicit type annotation
    llm_full_response = ""

    try:
        while True:
            # fix: pass messages directly instead of via kwargs dict to satisfy mypy overload
            response = await client.responses.create(
                model=llm_model_name, # type: ignore
                input=messages,
                tools=tools
            )

            function_calls = [item for item in response.output if item.type == "function_call"]

            if not function_calls:
                llm_full_response = response.output_text
                break

            for call in function_calls:
                args = json.loads(call.arguments)
                tool_name = call.name

                if tool_calling_history[tool_name] >= 10:
                    return {"response": f"Tool call limit hit: {tool_name}", "tool_calls": tool_calling_logs, "status": "error"}

                result, tool_status = await _call_tool(tool_name, args, user_id)
                tool_calling_history[tool_name] += 1

                tool_calling_logs.append({
                    "name": tool_name,
                    "input": json.dumps(args, default=str),
                    "call_id": call.call_id,
                    "output": json.dumps(result, default=str),
                    "status": "Success" if tool_status else "Failed"
                })

                # fix: append directly to messages list instead of kwargs["input"]
                messages.append({
                    "type": "function_call",
                    "call_id": call.call_id,
                    "name": call.name,
                    "arguments": call.arguments,
                })
                messages.append({
                    "type": "function_call_output",
                    "call_id": call.call_id,
                    "output": json.dumps(result, default=str),
                    "tool_status": "Success" if tool_status else "Failed"
                })

    except openai.RateLimitError as rle:
        return {"response": f"Rate limited: {rle}", "tool_calls": [], "status": "error"}
    except Exception as e:
        return {"response": f"Error: {e}", "tool_calls": [], "status": "error"}

    # use existing conversation or create new one
    if not conversation_id:
        create_result = await Create.insert_one(Collections.CONVERSATIONS, {"userID": user_id})
        conversation_id = create_result.inserted_id  # type: ignore

    # log memory in background
    formatted_text = f"{prompt} {llm_full_response}"
    formatted_text_embedding = await embedding_client.generate_embedding(formatted_text)

    asyncio.create_task(
        log_memory(
            conversation_id,
            formatted_text,
            formatted_text_embedding,
            tool_calling_logs,
            relevant_skill_ids
        )
    )

    return {"response": llm_full_response, "tool_calls": tool_calling_logs, "status": "success"}