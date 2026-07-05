"""MCP filesystem server — exposes read/write tools over stdio.

Usage:
    python filesystem_server.py [project_root]

If project_root is not given, defaults to the parent of this file's directory.
All tool paths are relative to project_root and cannot escape it.
"""

import asyncio
import sys
from pathlib import Path

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import TextContent, Tool

PROJECT_ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent


def _safe_path(path_str: str) -> Path:
    """Resolve path relative to PROJECT_ROOT, rejecting escape attempts."""
    target = (PROJECT_ROOT / path_str).resolve()
    if not str(target).startswith(str(PROJECT_ROOT)):
        raise ValueError(f"Path escapes project root: {path_str}")
    return target


server = Server("filesystem")


@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="read_file",
            description="Read a file's contents as text.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path relative to project root, e.g. 'chatbot/llm.py'",
                    }
                },
                "required": ["path"],
            },
        ),
        Tool(
            name="write_file",
            description="Write content to a file, creating parent dirs if needed. Overwrites existing files.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path relative to project root",
                    },
                    "content": {
                        "type": "string",
                        "description": "Full file content to write",
                    },
                },
                "required": ["path", "content"],
            },
        ),
        Tool(
            name="list_dir",
            description="List files and directories under a path.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path relative to project root, e.g. 'tools/'",
                    }
                },
                "required": ["path"],
            },
        ),
        Tool(
            name="edit_file",
            description="Replace a unique section of a file. Good for targeted edits.",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path relative to project root",
                    },
                    "old_text": {
                        "type": "string",
                        "description": "Exact text to find (must be unique in the file)",
                    },
                    "new_text": {
                        "type": "string",
                        "description": "Replacement text",
                    },
                },
                "required": ["path", "old_text", "new_text"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict):
    try:
        if name == "read_file":
            return await _read_file(arguments["path"])
        elif name == "write_file":
            return await _write_file(arguments["path"], arguments["content"])
        elif name == "list_dir":
            return await _list_dir(arguments["path"])
        elif name == "edit_file":
            return await _edit_file(arguments["path"], arguments["old_text"], arguments["new_text"])
        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
    except Exception as e:
        return [TextContent(type="text", text=f"Error: {e}")]


async def _read_file(path: str):
    target = _safe_path(path)
    if not target.exists():
        return [TextContent(type="text", text=f"File not found: {path}")]
    if target.is_dir():
        return [TextContent(type="text", text=f"Is a directory: {path}")]
    try:
        content = target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return [TextContent(type="text", text=f"Binary file, cannot read as text: {path}")]
    return [TextContent(type="text", text=content)]


async def _write_file(path: str, content: str):
    target = _safe_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return [TextContent(type="text", text=f"Wrote {len(content)} chars to {path}")]


async def _list_dir(path: str):
    target = _safe_path(path)
    if not target.exists():
        return [TextContent(type="text", text=f"Directory not found: {path}")]
    if not target.is_dir():
        return [TextContent(type="text", text=f"Not a directory: {path}")]
    entries = []
    for item in sorted(target.iterdir()):
        kind = "dir" if item.is_dir() else "file"
        size = item.stat().st_size if item.is_file() else 0
        entries.append(f"{kind:4} {size:>8}  {item.name}")
    return [TextContent(type="text", text="\n".join(entries) or "(empty)")]


async def _edit_file(path: str, old_text: str, new_text: str):
    target = _safe_path(path)
    if not target.exists():
        return [TextContent(type="text", text=f"File not found: {path}")]
    content = target.read_text(encoding="utf-8")
    if old_text not in content:
        return [TextContent(type="text", text=f"old_text not found in {path}")]
    if content.count(old_text) > 1:
        return [TextContent(type="text", text=f"old_text appears multiple times in {path} — be more specific")]
    new_content = content.replace(old_text, new_text, 1)
    target.write_text(new_content, encoding="utf-8")
    return [TextContent(type="text", text=f"Edited {path}")]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
