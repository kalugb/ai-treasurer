from dotenv import load_dotenv
import os
from datetime import datetime
from zoneinfo import ZoneInfo
import asyncio
from dotenv import load_dotenv
from bson.objectid import ObjectId
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
load_dotenv()

from db.crud import Create, Collections, Update, Aggregation

load_dotenv()

# hard code conversation id first, retrieve from db in actual run
async def get_long_term_memory(query_embeddings: list, conversation_id: ObjectId | None):
    vector_search_index_name = os.getenv("MEMORIES_VECTOR_INDEX_NAME")
    indexed_path = os.getenv("MEMORIES_VECTOR_PATH")
    numCandidates = 100
    limit = 10

    pipeline = [
        {
            "$vectorSearch": {
                "index": vector_search_index_name,
                "path": indexed_path,
                "queryVector": query_embeddings,
                "numCandidates": numCandidates,
                "limit": limit,
                "filter": {
                    "conversationID": conversation_id
                }
            }
        },
        {
            "$project": {
                "text": 1,
                "_id": 0,
                "score": {
                    "$meta": "vectorSearchScore"
                },
            }
        },
        {
            "$match": {
                "score": {
                    "$gte": 0.75
                }
            }
        }
    ]

    # vector search
    result = await Aggregation.aggregate(
        collection_name=Collections.MEMORY,
        pipeline=pipeline
    )

    return result

async def log_memory(conversation_id, text: str, text_vector: list, tools_used: list[dict] = [], skill_used: list[str] = []) -> None:    
    current_time = datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))

    # Basic MongoDB data formatting
    memory_format = {
        "text": text,
        "textVector": text_vector,
        "timestamp": current_time,
        "conversationID": conversation_id if isinstance(conversation_id, ObjectId) else ObjectId(conversation_id)
    }

    if tools_used and isinstance(tools_used, list):
        # Additional logging for tools usage
        tools_format = [
            {
                "toolCallID": t.get("call_id", None),
                "toolName": t.get("name", "Unknown Tool"),
                "toolInput": t.get("input", "Unknown Input"),
                "toolOutput": t.get("output", "Unknown Output"),
                "toolStatus": t.get("status", "Failed")
            }
            for t in tools_used
        ]
        # Add into memory
        memory_format["toolsUsed"] = tools_format
    
    if skill_used and isinstance(skill_used, list):
        # Additional logging for skills usage
        memory_format["skillsUsed"] = skill_used

    # db write operation here
    try:
        write_operation = await Create.insert_one(
            collection_name=Collections.MEMORY,
            data=memory_format
        )
    except Exception as e:
        write_operation = None
        print(f"Error logging memory: {e}")
    
    if not write_operation:
        print("Error logging memory")
# end of function

# update conversation
async def update_conversation_time(user_id, conversation_id):
    filter = {"_id": conversation_id if isinstance(conversation_id, ObjectId) else ObjectId(conversation_id)}
    current_time = datetime.now(ZoneInfo("Asia/Kuala_Lumpur"))
    update = {"$set": {"userID": user_id, "lastUpdated": current_time}}
    update_result = await Update.update_one(Collections.CONVERSATIONS, filter, update, upsert=True)

    if update_result:
        print("Conversation time updated successfully")
    else:
        print("Error updating conversation time")
        