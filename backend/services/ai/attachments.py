"""Convert an uploaded file to text before it reaches the agent.

- Excel (.xlsx/.xls) and PDF -> markdown via Microsoft MarkItDown.
- Images -> transcribed/described via the NVIDIA (omni) vision model ("the model's own OCR").
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
_vision_llm = None


async def _get_vision_llm():
    # lazy singleton; the omni model accepts image_url content (verified)
    global _vision_llm
    if _vision_llm is None:
        from services.ai.load_models.load_nvidia import load_nvidia_llm
        _vision_llm = await load_nvidia_llm()
    return _vision_llm


def _convert_markitdown(data: bytes, extension: str) -> str:
    result = _md.convert_stream(io.BytesIO(data), file_extension=extension)
    return (result.markdown or "").strip()


async def _convert_image(data: bytes, content_type: str) -> str:
    from langchain_core.messages import HumanMessage
    llm = await _get_vision_llm()
    b64 = base64.b64encode(data).decode()
    msg = HumanMessage(content=[
        {"type": "text", "text": "Transcribe all text in this image exactly, then briefly describe any charts, tables, or figures. If there is no text, describe the image."},
        {"type": "image_url", "image_url": {"url": f"data:{content_type};base64,{b64}"}},
    ])
    resp = await llm.ainvoke([msg])
    content = getattr(resp, "content", resp)
    if isinstance(content, list):  # some providers return content blocks
        content = "".join(b.get("text", "") if isinstance(b, dict) else str(b) for b in content)
    return (content or "").strip()


async def convert(filename: str, content_type: str, data: bytes) -> dict:
    """Returns {filename, kind, text}. Raises HTTPException(415) unsupported, (413) too large, (422) empty result."""
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (max 10 MB).")

    content_type = (content_type or "").split(";")[0].strip().lower()

    from starlette.concurrency import run_in_threadpool
    if content_type in _MARKITDOWN_TYPES:
        extension, kind = _MARKITDOWN_TYPES[content_type]
        text = await run_in_threadpool(_convert_markitdown, data, extension)
    elif content_type.startswith("image/"):
        kind = "image"
        text = await _convert_image(data, content_type)
    else:
        raise HTTPException(status_code=415, detail="Only Excel, PDF, or image files are supported.")

    if not text:
        raise HTTPException(status_code=422, detail="Could not extract any text from this file.")
    return {"filename": filename, "kind": kind, "text": text}
