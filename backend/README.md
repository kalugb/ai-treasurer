# AI Treasurer mock API

Run from `backend/`:

```bash
uv run uvicorn main:app --reload
```

It serves in-memory mock data at `http://localhost:8000/api` for the dashboard and teams. Restart the server to reset edits; replace `mock_data.py` with a database layer when the real backend is ready.
