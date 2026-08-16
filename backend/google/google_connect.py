import os.path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

CREDENTIALS_FILE = Path(__file__).parent.parent / "google_creds" / "credentials.json"
TOKEN_FILE = Path(__file__).parent.parent / "google_creds" / "token.json"


def get_drive_service():
    """Authenticate and return an authorized Google Drive API service object."""
    creds = None

    # token.json stores the user's access/refresh token after the first run,
    # so they don't have to log in again every time.
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    # If there are no valid credentials, prompt the user to log in.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                CREDENTIALS_FILE, SCOPES
            )
            creds = flow.run_local_server(port=0)

        # Save the credentials for the next run.
        with open(TOKEN_FILE, "w") as token:
            token.write(creds.to_json())

    return build("drive", "v3", credentials=creds)


def list_files(service, folder_id=None, page_size=10):
    """
    List the user's most recently modified files.

    If folder_id is provided, only lists files inside that folder.
    If folder_id is None, lists files from anywhere in the Drive.
    """
    try:
        query = f"'{folder_id}' in parents" if folder_id else None

        results = (
            service.files()
            .list(
                q=query,
                pageSize=page_size,
                fields="files(id, name, mimeType, modifiedTime)",
                orderBy="modifiedTime desc",
                supportsAllDrives=True,          # needed if using Shared Drives
                includeItemsFromAllDrives=True,  # needed if using Shared Drives
            )
            .execute()
        )
        items = results.get("files", [])

        if not items:
            print("No files found.")
            return

        print(f"Found {len(items)} file(s):")
        for item in items:
            print(f"  {item['name']}  (id: {item['id']})")

    except HttpError as error:
        print(f"An error occurred: {error}")


def find_folder_id(service, folder_name):
    """
    Helper: look up a folder's ID by its name (returns the first match).
    NOTE: only searches Drives you own by default. If the folder lives in
    a Shared Drive and there might be duplicate names, use
    find_folder_id_by_path() instead.
    """
    query = (
        f"name = '{folder_name}' "
        "and mimeType = 'application/vnd.google-apps.folder' "
        "and trashed = false"
    )
    results = (
        service.files()
        .list(
            q=query,
            fields="files(id, name)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            corpora="allDrives",
        )
        .execute()
    )
    folders = results.get("files", [])

    if not folders:
        print(f"No folder named '{folder_name}' found.")
        return None

    if len(folders) > 1:
        print(
            f"Warning: {len(folders)} folders named '{folder_name}' found, "
            "using the first one. Use find_folder_id_by_path() to disambiguate."
        )

    return folders[0]["id"]


def find_folder_id_by_path(service, path_parts, drive_id=None):
    """
    Resolve a folder ID by walking a path segment by segment, e.g.
        find_folder_id_by_path(service, ["Team Drive", "Projects", "2026", "Reports"])

    This guarantees you land on the exact folder even if the same folder
    name exists elsewhere in the Drive. Pass drive_id if you know the
    Shared Drive's ID (from its URL) to search only within that drive.
    """
    parent_id = drive_id  # None means "search from My Drive/all accessible drives"

    for name in path_parts:
        query = (
            f"name = '{name}' "
            "and mimeType = 'application/vnd.google-apps.folder' "
            "and trashed = false"
        )
        if parent_id:
            query += f" and '{parent_id}' in parents"

        list_kwargs = dict(
            q=query,
            fields="files(id, name)",
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            corpora="allDrives",
        )

        results = service.files().list(**list_kwargs).execute()
        matches = results.get("files", [])

        if not matches:
            print(f"Could not find folder '{name}' under the given parent.")
            return None

        if len(matches) > 1:
            print(
                f"Warning: multiple folders named '{name}' at this level, "
                "using the first one."
            )

        parent_id = matches[0]["id"]

    return parent_id


if __name__ == "__main__":
    service = get_drive_service()

    # List files from the entire Drive
    # list_files(service)

    # Example: list files from a specific folder by name
    # folder_id = find_folder_id(service, "My Project Docs")
    # if folder_id:
    #     list_files(service, folder_id=folder_id)

    # Example: list files from a specific folder by ID (from the Drive URL)
    # list_files(service, folder_id="1a2B3cD4EfGhIjKlMnOpQrStUvWxYz")

    # Example: folder nested deep inside a Shared Drive, resolved by path
    folder_id = find_folder_id_by_path(
        service, ["Emerge Camp", "2026 - MBS Rawang", "Treasurer", "Games"]
    )
    if folder_id:
        list_files(service, folder_id=folder_id, page_size=100)