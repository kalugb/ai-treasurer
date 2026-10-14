import os.path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

CREDENTIALS_FILE = Path(__file__).parent.parent.parent / "google_creds" / "credentials.json"
TOKEN_FILE = Path(__file__).parent.parent.parent / "google_creds" / "token.json"

def google_drive_service_exists() -> bool:
    """Check if the Google Drive service is already initialized."""
    return TOKEN_FILE.exists()

def remove_existing_drive_token() -> None:
    """Remove the existing token.json file if it exists."""
    if TOKEN_FILE.exists():
        TOKEN_FILE.unlink()
        print("Existing token.json file removed.")
    else:
        print("No existing token.json file found to remove.")


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

    service = build("drive", "v3", credentials=creds)
    
    return service


def get_drive_service_with_token():
    pass

if __name__ == "__main__":
    remove_existing_drive_token() 
    service = get_drive_service()
    print("Google Drive service initialized successfully.")