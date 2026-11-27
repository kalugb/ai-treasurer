FROM python:3.12-slim

RUN pip install --no-cache-dir uv \
    && useradd --system --create-home --uid 1000 app \
    && mkdir /app && chown app:app /app

WORKDIR /app
USER app

COPY --chown=app:app pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-cache

COPY --chown=app:app . .

EXPOSE 8000

CMD ["uv", "run", "--no-sync", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
