"""AI receipt scan: file bytes -> {receiptName, receiptAmount, description}. Transient, nothing stored.

PDF/Excel -> MarkItDown text -> LLM. Images go straight to the vision model.
A PDF with no text layer (scanned) is rasterized (page 1) and sent as an image.
"""
import base64

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

from services.ai import attachments


async def scan(llm, filename: str, content_type: str, data: bytes, meta: dict | None = None) -> dict:
    """meta (optional out-param) receives `input` (text / image / pdf-page-image) and `provider` for the AI history."""
    meta = meta if meta is not None else {}
    content_type = (content_type or "").split(";")[0].strip().lower()
    if len(data) > attachments.MAX_BYTES:
        raise HTTPException(status_code=413, detail="File is too large (max 10 MB).")

    if content_type.startswith("image/"):
        image, mime = data, content_type
        meta["input"] = "image"
    else:
        try:
            converted = await attachments.convert(filename, content_type, data)
            meta["input"] = "text"
            return await llm.extract_receipt(text=converted["text"], meta=meta)
        except HTTPException as e:
            # 422 = no text extracted; only a PDF can fall back to reading it visually
            if e.status_code != 422 or content_type != "application/pdf":
                raise
        from routers.google_drive import _render_pdf_first_page  # lazy: avoids a router import at module load
        image, mime = await run_in_threadpool(_render_pdf_first_page, data), "image/png"
        meta["input"] = "pdf-page-image"

    return await llm.extract_receipt(image_b64=base64.b64encode(image).decode(), mime=mime, meta=meta)
