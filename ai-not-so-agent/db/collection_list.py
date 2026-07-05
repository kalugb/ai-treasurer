# list collections
from enum import Enum

class Collections(str, Enum):
    USERS = "users"
    MEMORY = "memories"
    USER_MEMORY = "userMemory"
    CONVERSATIONS = "conversations"
    SCHEDULER = "scheduler"
    SESSION = "sessions"