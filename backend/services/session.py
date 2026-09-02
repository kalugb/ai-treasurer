import time
import uuid
from typing import Any

class SessionStore:
    def __init__(self, ttl_seconds: int = 3600):
        self._store: dict[str, dict[str, Any]] = {} # swap to redis in future
        self._expiry: dict[str, float] = {} # swap to redis in future
        self.ttl = ttl_seconds
        
    def create(self) -> str:
        session_id = str(uuid.uuid4())
        self._store[session_id] = {}
        self._expiry[session_id] = time.time() + self.ttl
        
        return session_id
    
    def get(self, session_id: str) -> dict[str, Any] | None:
        if session_id not in self._store:
            return None
        
        if time.time() > self._expiry[session_id]:
            self.delete(session_id)
            
            return None
        
        return self._store[session_id]
    
    def set(self, session_id: str, key: str, value: Any):
        if session_id in self._store:
            self._store[session_id][key] = value
            self._expiry[session_id] = time.time() + self.ttl
            
    def delete(self, session_id: str):
        self._store.pop(session_id, None)
        self._expiry.pop(session_id, None)
    