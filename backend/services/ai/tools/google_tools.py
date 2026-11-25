"""
LangChain-compatible Google Drive tools (search + list, My Drive + Shared Drives).

Each call uses the Drive connection of the user running the chat (AgentContext.owner_id),
from the encrypted token in treasurer.users. No token file is read.
"""

from typing import Optional

from google.auth.exceptions import RefreshError
from googleapiclient.errors import HttpError
from langchain_core.tools import tool
from langgraph.runtime import get_runtime

from services import crypto
from services.google import drive_tokens
from services.ai.tools.treasury_tools import AgentContext

_mongo = None  # main DB handle, set once at startup


def set_mongo(db):
    global _mongo
    _mongo = db


class _NoDrive(Exception):
    pass


def _get_drive_service():
    """The chatting user's Drive v3 service. Raises _NoDrive with a message the model can repeat."""
    owner_id = get_runtime(AgentContext).context.owner_id
    if _mongo is None or not owner_id:
        raise _NoDrive("Google Drive isn't available right now.")
    try:
        return drive_tokens.service_for_user(_mongo, owner_id).service
    except drive_tokens.DriveNotConnected:
        raise _NoDrive("Google Drive isn't connected for your account. Connect it in Settings.")
    except (RefreshError, crypto.InvalidToken):
        drive_tokens.mark_disconnected(_mongo, owner_id)
        raise _NoDrive("Your Google Drive access expired. Reconnect Google Drive in Settings.")
    except RuntimeError:
        raise _NoDrive("Google Drive isn't configured on the server.")


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
    try:
        service = _get_drive_service()
    except _NoDrive as e:
        return str(e)
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
    try:
        service = _get_drive_service()
    except _NoDrive as e:
        return str(e)
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
    try:
        service = _get_drive_service()
    except _NoDrive as e:
        return str(e)
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
    try:
        service = _get_drive_service()
    except _NoDrive as e:
        return str(e)
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
