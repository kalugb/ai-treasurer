"""Filesystem tool wrapper — bridges the LLM dispatcher and web backends to the MCP filesystem server.

Two modes:
1. Per-call (CLI / simple usage): spawns a subprocess each call.
2. Long-lived (web): use FilesystemService to keep one server per user/project.

Examples:
    # Per-call (CLI dispatcher)
    await mcp_filesystem(action='read_file', path='chatbot/llm.py')

    # Web (long-lived)
    fs = FilesystemService('/path/to/project')
    await fs.start()
    result = await fs.call_tool('read_file', {'path': 'chatbot/llm.py'})
    await fs.stop()
"""

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

SERVER_PATH = os.path.join(
    os.path.dirname(__file__), "..", "mcp_servers", "filesystem_server.py"
)

_TOOL_METHODS = {
    "read_file": ("read_file", ["path"]),
    "write_file": ("write_file", ["path", "content"]),
    "list_dir": ("list_dir", ["path"]),
    "edit_file": ("edit_file", ["path", "old_text", "new_text"]),
}


# ── Per-call mode (spawns subprocess each time) ──────────────────────────


async def _call(server_tool: str, args: dict, project_root: str | None = None) -> str:
    """Call a filesystem tool by spawning the MCP server as a subprocess."""
    args_list = [SERVER_PATH]
    if project_root:
        args_list.append(str(Path(project_root).resolve()))

    params = StdioServerParameters(command="python", args=args_list)
    async with stdio_client(params) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.call_tool(server_tool, args)

    parts = [block.text for block in result.content if hasattr(block, "text")]
    return "\n".join(parts)


async def mcp_filesystem(action: str, **kwargs) -> str:
    """Dispatch a single filesystem action via subprocess.

    Used by the LLM dispatcher. Passes the project root from kwargs if present.
    """
    if action not in _TOOL_METHODS:
        return f"Unknown action: {action}. Valid: {list(_TOOL_METHODS)}"

    server_tool, param_keys = _TOOL_METHODS[action]
    args = {k: kwargs[k] for k in param_keys if k in kwargs}
    project_root = kwargs.get("project_root")
    return await _call(server_tool, args, project_root)


# ── Long-lived mode (web / persistent connection) ─────────────────────────


class FilesystemService:
    """Long-lived MCP filesystem server for a single project.

    Usage:
        fs = FilesystemService('/path/to/project')
        await fs.start()
        result = await fs.call_tool('read_file', {'path': 'chatbot/llm.py'})
        await fs.stop()

    Or as async context manager:
        async with FilesystemService('/path/to/project') as fs:
            result = await fs.call_tool('read_file', {'path': 'chatbot/llm.py'})
    """

    def __init__(self, project_root: str | Path):
        self.project_root = Path(project_root).resolve()
        self._read_stream = None
        self._write_stream = None
        self._session = None
        self._client_cm = None
        self._session_cm = None
        self._process_task = None

    async def start(self):
        """Start the MCP server subprocess and connect."""
        args_list = [SERVER_PATH, str(self.project_root)]
        params = StdioServerParameters(command="python", args=args_list)
        self._client_cm = stdio_client(params)
        self._read_stream, self._write_stream = await self._client_cm.__aenter__()
        self._session_cm = ClientSession(self._read_stream, self._write_stream)
        self._session = await self._session_cm.__aenter__()
        await self._session.initialize()

    async def stop(self):
        """Disconnect and kill the server subprocess."""
        if self._session_cm:
            await self._session_cm.__aexit__(None, None, None)
            self._session_cm = None
        if self._client_cm:
            await self._client_cm.__aexit__(None, None, None)
            self._client_cm = None
        self._session = None
        self._read_stream = None
        self._write_stream = None

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, *exc):
        await self.stop()

    async def call_tool(self, tool_name: str, arguments: dict) -> str:
        """Call a tool on the long-lived server."""
        if not self._session:
            raise RuntimeError("FilesystemService not started")
        result = await self._session.call_tool(tool_name, arguments)
        parts = [block.text for block in result.content if hasattr(block, "text")]
        return "\n".join(parts)

    # Convenience wrappers

    async def read_file(self, path: str) -> str:
        return await self.call_tool("read_file", {"path": path})

    async def write_file(self, path: str, content: str) -> str:
        return await self.call_tool("write_file", {"path": path, "content": content})

    async def list_dir(self, path: str) -> str:
        return await self.call_tool("list_dir", {"path": path})

    async def edit_file(self, path: str, old_text: str, new_text: str) -> str:
        return await self.call_tool("edit_file", {"path": path, "old_text": old_text, "new_text": new_text})
