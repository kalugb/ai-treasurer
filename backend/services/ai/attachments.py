"""Convert an uploaded file to text before it reaches the agent.

- Excel (.xlsx/.xls) and PDF -> markdown via Microsoft MarkItDown.
- Images -> transcribed/described by the shared chat models (Groq first, NVIDIA fallback) via LLMInference.describe_image.
Transient: callers pass raw bytes and get text back; nothing is stored.
"""
import base64
import io

from fastapi import HTTPException
from markitdown import MarkItDown

MAX_BYTES = 10 * 1024 * 1024  # 10 MB cap at the trust boundary

# (extension, kind) by content-type for the markitdown path
_MARKITDOWN_TYPES = {
    "application/pdf": (".pdf", "pdf"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": (".xlsx", "excel"),
    "application/vnd.ms-excel": (".xls", "excel"),
}

_md = MarkItDown()


def _convert_markitdown(data: bytes, extension: str) -> str:
    result = _md.convert_stream(io.BytesIO(data), file_extension=extension)
    return (result.markdown or "").strip()


async def convert(filename: str, content_type: str, data: bytes, llm=None) -> dict:
    """Returns {filename, kind, text}. Raises HTTPException(415) unsupported, (413) too large,
    (422) empty result, (503) image but no LLM, (502) both vision models failed.
    `llm` is the shared LLMInference; only needed for images."""
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (max 10 MB).")

    content_type = (content_type or "").split(";")[0].strip().lower()

    from starlette.concurrency import run_in_threadpool
    if content_type in _MARKITDOWN_TYPES:
        extension, kind = _MARKITDOWN_TYPES[content_type]
        text = await run_in_threadpool(_convert_markitdown, data, extension)
    elif content_type.startswith("image/"):
        kind = "image"
        if llm is None:
            raise HTTPException(status_code=503, detail="AI model is not available to read images right now.")
        try:
            text = await llm.describe_image(base64.b64encode(data).decode(), content_type)
        except Exception as e:
            print(f"attachment image failed: {e}")
            raise HTTPException(status_code=502, detail="Couldn't read this image (both AI models failed). Try again.")
    else:
        raise HTTPException(status_code=415, detail="Only Excel, PDF, or image files are supported.")

    if not text:
        raise HTTPException(status_code=422, detail="Could not extract any text from this file.")
    return {"filename": filename, "kind": kind, "text": text}
