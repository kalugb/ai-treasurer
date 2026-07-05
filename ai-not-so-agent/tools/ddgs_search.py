from ddgs import DDGS
import asyncio

MAX_RESULT = 10

async def _run_search(func):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, func)

async def text_search(search_query):
    return await _run_search(lambda: DDGS().text(search_query, max_results=MAX_RESULT))

async def news_search(search_query):
    return await _run_search(lambda: DDGS().news(search_query, max_results=MAX_RESULT))

async def image_search(search_query):
    return await _run_search(lambda: DDGS().images(search_query, max_results=MAX_RESULT))

async def video_search(search_query):
    return await _run_search(lambda: DDGS().videos(search_query, max_results=MAX_RESULT))

async def ddgs_search(search_query: str, search_type: str = "text", **kwargs):
    if search_type == "text":
        result = await text_search(search_query)
    elif search_type == "news":
        result = await news_search(search_query)
    elif search_type == "image":
        result = await image_search(search_query)
    elif search_type == "video":
        result = await video_search(search_query)
    else:
        return f"Unknown search_type: {search_type}"

    if not result:
        return "No search results found (possible rate limit or no results)."

    return result

if __name__ == "__main__":
    result = asyncio.run(ddgs_search("python programming", "text"))
    print(result)