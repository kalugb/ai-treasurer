"""
LangChain-compatible Google Drive tools (search + list, My Drive + Shared Drives).

Reuses the same OAuth flow as your working credentials.json/token.json script,
so no MCP server is involved -- this calls the Drive API v3 directly.

Usage:
    from ai.tools.gdrive_tools import search_drive_files, list_drive_folders, list_folder_contents

    self.tools = [get_current_time, add_numbers, get_weather, web_search,
                  search_drive_files, list_drive_folders, list_folder_contents]
"""

import os.path
from pathlib import Path
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from langchain_core.tools import tool

# Read-only is enough for search/list. Add drive.file only if you later add
# tools that create/modify files.
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

CREDENTIALS_FILE = Path(__file__).parent.parent.parent / "google_creds" / "credentials.json"
TOKEN_FILE = Path(__file__).parent.parent.parent / "google_creds" / "token.json"

_service = None  # cached Drive API client, built lazily on first tool call


def _get_drive_service():
    """Authenticate (using cached token if present) and return a Drive v3 service."""
    global _service
    if _service is not None:
        return _service

    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())

    _service = build("drive", "v3", credentials=creds)
    return _service


def _shared_drive_kwargs(extra_corpora: bool = True) -> dict:
    """
    Standard kwargs needed on every files().list() call so results include
    Shared Drives, not just My Drive / Shared with me.
    """
    kwargs = {
        "supportsAllDrives": True,
        "includeItemsFromAllDrives": True,
    }
    if extra_corpora:
        # corpora="allDrives" is what actually makes an unscoped search sweep
        # every Shared Drive the user has access to, not just My Drive.
        kwargs["corpora"] = "allDrives"
    return kwargs


def _escape_query_value(value: str) -> str:
    """Escape single quotes for safe inclusion in a Drive query string."""
    return value.replace("'", "\\'")


@tool
def search_drive_files(
    name_contains: str,
    only_folders: bool = False,
    max_results: int = 20,
) -> str:
    """
    Search Google Drive (including Shared Drives) for files or folders whose
    name contains the given text. Use this to find a file/folder by (partial)
    name before reading or listing its contents.

    Args:
        name_contains: Substring to search for in the file/folder name.
        only_folders: If True, only return folders (useful before calling
            list_folder_contents).
        max_results: Maximum number of results to return (default 20).

    Returns:
        A formatted list of matches with name, id, type, and last modified time.
    """
    service = _get_drive_service()
    safe_value = _escape_query_value(name_contains)

    query_parts = [f"name contains '{safe_value}'", "trashed = false"]
    if only_folders:
        query_parts.append("mimeType = 'application/vnd.google-apps.folder'")
    query = " and ".join(query_parts)

    try:
        results = (
            service.files()
            .list(
                q=query,
                pageSize=max_results,
                fields="files(id, name, mimeType, modifiedTime, parents, driveId)",
                orderBy="modifiedTime desc",
                **_shared_drive_kwargs(),
            )
            .execute()
        )
    except HttpError as error:
        return f"Drive search failed: {error}"

    items = results.get("files", [])
    if not items:
        return f"No files or folders found matching '{name_contains}'."

    lines = [f"Found {len(items)} result(s) for '{name_contains}':"]
    for item in items:
        kind = "folder" if item["mimeType"] == "application/vnd.google-apps.folder" else "file"
        shared = " [shared drive]" if item.get("driveId") else ""
        lines.append(
            f"- {item['name']} ({kind}, id: {item['id']}, "
            f"modified: {item.get('modifiedTime', 'unknown')}){shared}"
        )
    return "\n".join(lines)


@tool
def list_drive_folders(max_results: int = 50) -> str:
    """
    List folders in Google Drive, including folders inside Shared Drives.
    Use this to browse available top-level and nested folders when the
    user doesn't know the exact folder name.

    Args:
        max_results: Maximum number of folders to return (default 50).

    Returns:
        A formatted list of folder names and ids.
    """
    service = _get_drive_service()
    query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false"

    try:
        results = (
            service.files()
            .list(
                q=query,
                pageSize=max_results,
                fields="files(id, name, modifiedTime, parents, driveId)",
                orderBy="modifiedTime desc",
                **_shared_drive_kwargs(),
            )
            .execute()
        )
    except HttpError as error:
        return f"Drive folder listing failed: {error}"

    items = results.get("files", [])
    if not items:
        return "No folders found."

    lines = [f"Found {len(items)} folder(s):"]
    for item in items:
        shared = " [shared drive]" if item.get("driveId") else ""
        lines.append(f"- {item['name']} (id: {item['id']}){shared}")
    return "\n".join(lines)


@tool
def list_folder_contents(folder_id: str, max_results: int = 50) -> str:
    """
    List the files and subfolders directly inside a given Drive folder,
    including folders that live in a Shared Drive. Get folder_id first from
    search_drive_files or list_drive_folders.

    Args:
        folder_id: The Drive file/folder ID to list contents of.
        max_results: Maximum number of items to return (default 50).

    Returns:
        A formatted list of the folder's immediate contents.
    """
    service = _get_drive_service()
    query = f"'{folder_id}' in parents and trashed = false"

    try:
        results = (
            service.files()
            .list(
                q=query,
                pageSize=max_results,
                fields="files(id, name, mimeType, modifiedTime)",
                orderBy="modifiedTime desc",
                **_shared_drive_kwargs(),
            )
            .execute()
        )
    except HttpError as error:
        return f"Listing folder contents failed: {error}"

    items = results.get("files", [])
    if not items:
        return "This folder is empty (or you don't have access to its contents)."

    lines = [f"Found {len(items)} item(s) in folder {folder_id}:"]
    for item in items:
        kind = "folder" if item["mimeType"] == "application/vnd.google-apps.folder" else "file"
        lines.append(
            f"- {item['name']} ({kind}, id: {item['id']}, "
            f"modified: {item.get('modifiedTime', 'unknown')})"
        )
    return "\n".join(lines)


@tool
def find_folder_by_path(path_parts: list[str], drive_id: Optional[str] = None) -> str:
    """
    Resolve a nested folder path to its Drive folder ID, walking segment by
    segment (e.g. ["Team Drive", "Projects", "2026", "Reports"]). Works for
    folders inside a Shared Drive too. Use this when the user names a folder
    path rather than a single folder.

    Args:
        path_parts: Ordered list of folder names from top to target folder.
        drive_id: Optional Shared Drive ID to restrict the search to.

    Returns:
        The resolved folder ID, or an explanation if it couldn't be found.
    """
    service = _get_drive_service()
    parent_id = drive_id

    for name in path_parts:
        safe_name = _escape_query_value(name)
        query = (
            f"name = '{safe_name}' "
            "and mimeType = 'application/vnd.google-apps.folder' "
            "and trashed = false"
        )
        if parent_id:
            query += f" and '{parent_id}' in parents"

        try:
            results = (
                service.files()
                .list(
                    q=query,
                    fields="files(id, name)",
                    **_shared_drive_kwargs(),
                )
                .execute()
            )
        except HttpError as error:
            return f"Failed while resolving '{name}': {error}"

        matches = results.get("files", [])
        if not matches:
            return f"Could not find folder '{name}' under the given parent."

        parent_id = matches[0]["id"]

    return f"Resolved path {' / '.join(path_parts)} -> folder id: {parent_id}"