"""Input sanitization utilities."""

import re
import html


def sanitize_input(text: str) -> str:
    """Strip HTML tags and escape remaining content.

    Removes anything that looks like an HTML/XML tag, then HTML-escapes
    the remainder so '<', '>', '&', '"' in user text are rendered literally.
    """
    if not isinstance(text, str):
        text = str(text)

    # ponytail: regex strip is enough for chat input; use bleach if richer sanitization needed
    text = re.sub(r"<[^>]*>", "", text)
    text = html.escape(text)

    return text
