# ai-agent

An async chatbot with memory, tool calling, and a scheduler — backed by MongoDB with both CLI and HTTP interfaces.

## Features

- **Dual interface** — CLI (`chatbot/llm.py`) and HTTP/SSE streaming (`chatbot/llm_http.py`)
- **Persistent memory** — Vector search recalls relevant past conversations (cosine similarity, 384-dim embeddings)
- **Tool calling** — DuckDuckGo search (text, news, image, video) and user memory management
- **Auth** — Login/signup with bcrypt password hashing
- **Scheduler** — Recurring tasks with configurable intervals and repeat limits
- **TTL cleanup** — Memories auto-expire after 180 days

## Requirements

- Python >= 3.12
- MongoDB Atlas (or compatible MongoDB instance)
- OpenRouter API key

## Setup

```bash
# Install dependencies
uv sync

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB credentials and OpenRouter API key

# Create collections and indexes
python setup/create_collections.py
```

### Environment Variables

| Variable | Description |
|---|---|
| `MONGODB_USER` | MongoDB username |
| `MONGODB_PASSWORD` | MongoDB password |
| `MONGODB_URI` | MongoDB connection string |
| `MONGODB_DB_NAME` | Database name (default: `ai-agent`) |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `LLM_NAME` | Model name (default: `openrouter/owl-alpha`) |
| `BASE_URL` | OpenRouter base URL |
| `EMBEDDING_MODEL_NAME` | Embedding model (default: `all-MiniLM-L6-v2`) |
| `MEMORIES_VECTOR_INDEX_NAME` | Vector search index name |
| `MEMORIES_VECTOR_PATH` | Vector field path |

## Usage

```bash
python main.py
```

1. Log in or sign up
2. Select an existing conversation or start a new one
3. Chat — the model can search the web and manage your long-term memory
4. Type `exit` to leave a conversation, or Ctrl+C to quit

## Project Structure

```
ai-agent/
├── main.py                    # CLI entry point
├── chatbot/
│   ├── llm.py                 # LLM client (CLI output)
│   ├── llm_http.py            # LLM client (HTTP/SSE streaming)
│   └── memory.py              # Memory logging, retrieval, vector search
├── db/
│   ├── connectdb.py           # MongoDB connection (Motor)
│   ├── crud.py                # Generic CRUD operations
│   ├── embeddings.py          # Sentence-transformer embeddings
│   └── collection_list.py     # Collection names enum
├── scheduler/
│   ├── scheduler_crud.py      # Scheduler DB operations
│   └── scheduler_manager.py   # Task orchestration
├── tools/
│   ├── ddgs_search.py         # DuckDuckGo search
│   ├── manage_user_memory.py  # User memory CRUD
│   └── tools.json             # LLM tool definitions
├── auth/
│   └── cli_auth.py            # CLI authentication
├── skills/
│   └── skills_manager.py      # Skill embedding and retrieval
├── setup/
│   ├── create_collections.py  # Create collections + indexes
│   ├── create_ttl_index.py    # TTL index on memories
│   └── create_vector_search_index.py
└── .env
```

## Known Limitations

- **Scheduler execution is a stub** — `run_due_tasks()` prints task names but does not execute task logic yet
- **CLI only** — `router.py` (FastAPI) is a placeholder; HTTP interface exists in `llm_http.py` but is not wired to a server
