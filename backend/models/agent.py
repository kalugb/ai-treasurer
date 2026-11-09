from pydantic import BaseModel, Field


class Attachment(BaseModel):
    filename: str
    kind: str  # "excel" | "pdf" | "image"
    text: str  # extracted/transcribed content fed to the model


class SendMessageRequest(BaseModel):
    input: str = Field(min_length=1)
    conversationId: str | None = None  # None -> start a new conversation
    userId: str = "1"  # pre-auth placeholder; mapped to a sentinel ObjectId server-side
    orgId: str | None = None  # selected organization; scopes the treasury tools (rides the request now, moves to session/auth later)
    attachments: list[Attachment] = []  # converted file context for THIS turn (2=b: kept separate from input)


class RegenerateRequest(BaseModel):
    memoryId: str
    userId: str = "1"


class StopRequest(BaseModel):
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
    attachments: list[Attachment] = []  # filename/kind for UI chips (text carried too)
    status: str  # "Successed" | "Failed" | "In Progress"
    time: str | None = None


class ConversationOut(BaseModel):
    conversationId: str
    preview: str  # last input, for the session list
    status: str  # latest turn's status
    lastMemoryId: str
    time: str | None = None
