from pydantic import BaseModel, Field


class SendMessageRequest(BaseModel):
    input: str = Field(min_length=1)
    conversationId: str | None = None  # None -> start a new conversation
    userId: str = "1"  # pre-auth placeholder; mapped to a sentinel ObjectId server-side


class RegenerateRequest(BaseModel):
    memoryId: str
    userId: str = "1"


class ToolUsage(BaseModel):
    toolName: str
    toolUsed: int


class MemoryOut(BaseModel):
    id: str
    conversationId: str
    input: str
    output: str | None = None
    tools: list[ToolUsage] = []
    status: str  # "Successed" | "Failed" | "In Progress"
    time: str | None = None


class ConversationOut(BaseModel):
    conversationId: str
    preview: str  # last input, for the session list
    status: str  # latest turn's status
    lastMemoryId: str
    time: str | None = None
