FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# install uv
RUN pip install uv

# install dependencies first (layer cache — only re-runs if pyproject.toml changes)
COPY pyproject.toml .
RUN uv pip install --system .

COPY . .

# fallback env — override at runtime via --env-file .env or docker-compose env_file
ENV MONGODB_URI=mongodb+srv://localhost:27017 \
    MONGODB_DB_NAME=ai-agent \
    LLM_NAME=openrouter/owl-alpha \
    EMBEDDING_MODEL_NAME=all-MiniLM-L6-v2 \
    BASE_URL=https://openrouter.ai/api/v1 \
    MEMORIES_VECTOR_INDEX_NAME=memoriesVectorSearch \
    MEMORIES_VECTOR_PATH=textVector

# ponytail: CLI entrypoint only; switch to uvicorn when router.py is implemented
# CMD ["uvicorn", "router:app", "--host", "0.0.0.0", "--port", "8000"]
CMD ["python", "main.py"]