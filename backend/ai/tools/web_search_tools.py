# ai/tools/web_search_tool.py
from langchain_core.tools import tool
from ddgs import DDGS

@tool
def web_search(query: str, max_results: int = 5) -> str:
    """
    Search the web using DuckDuckGo for current information, news, or facts
    not available in the assistant's own knowledge. Use this when the user
    asks about recent events, current data, or anything that may have changed
    recently.

    Args:
        query: The search query string.
        max_results: Number of results to return (default 5, max recommended 10).
    """
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
    except Exception as e:
        return f"Search failed: {e}"

    if not results:
        return "No results found."

    formatted = []
    for i, r in enumerate(results, start=1):
        title = r.get("title", "No title")
        snippet = r.get("body", "No snippet")
        url = r.get("href", "No URL")
        formatted.append(f"{i}. {title}\n{snippet}\nURL: {url}")

    return "\n\n".join(formatted)