import base64
import pickle
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from pathlib import Path
from typing import Optional, Union
from zoneinfo import ZoneInfo
from bson import ObjectId

from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/gmail.send']
CREDENTIALS_PATH = Path(__file__).parent.parent / "credentials.json"
TOKEN_PATH = Path(__file__).parent.parent / "token_gmail_send.pickle"


def _authenticate():
    creds = None

    if TOKEN_PATH.exists():
        with open(TOKEN_PATH, 'rb') as token:
            creds = pickle.load(token)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_PATH, 'wb') as token:
            pickle.dump(creds, token)

    return build('gmail', 'v1', credentials=creds)


def _build_message(to: str, subject: str, body: str, html_body: Optional[str] = None) -> dict:
    message: Union[MIMEMultipart, MIMEText]

    if html_body:
        message = MIMEMultipart('alternative')
        message['to'] = to
        message['subject'] = subject
        message.attach(MIMEText(body, 'plain'))
        message.attach(MIMEText(html_body, 'html'))
    else:
        message = MIMEText(body, 'plain')
        message['to'] = to
        message['subject'] = subject

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    return {'raw': raw}


async def gmail_send(
    to: str,
    subject: str,
    body: str,
    html_body: Optional[str] = None,
    user_id: Optional[ObjectId] = None,
    **kwargs
) -> dict:
    try:
        service = _authenticate()

        timestamp = datetime.now(ZoneInfo("Asia/Kuala_Lumpur")).strftime("%Y-%m-%d %H:%M:%S %Z")
        body = f"{body}\n\n---\nSent at: {timestamp}"
        if html_body:
            html_body = f"{html_body}<br><br><hr><p><small>Sent at: {timestamp}</small></p>"

        message = _build_message(to, subject, body, html_body)
        result = service.users().messages().send(userId='me', body=message).execute()
        return {"success": True, "message_id": result['id']}
    except Exception as e:
        return {"success": False, "error": str(e)}


def gmail_send_logout():
    if TOKEN_PATH.exists():
        TOKEN_PATH.unlink()
        print("Logged out — token_gmail_send.pickle deleted.")
        print("Next gmail_send call will trigger re-authentication.")
    else:
        print("No active session found.")


if __name__ == "__main__":
    import asyncio

    async def test():
        print("=" * 50)
        print("Gmail Send Tool Test")
        print("=" * 50)

        TEST_EMAIL = input("Enter your email to send test emails to: ").strip()

        # test 1 — plain text email
        print("\n[1] Sending plain text email...")
        result = await gmail_send(
            to=TEST_EMAIL,
            subject="Test Email — Plain Text",
            body="Hello from your AI Agent!\n\nThis is a plain text test email sent via the gmail_send tool."
        )
        if result["success"]:
            print(f"  Sent — message ID: {result['message_id']}")
        else:
            print(f"  Error: {result['error']}")

        # test 2 — html email
        print("\n[2] Sending HTML email...")
        result = await gmail_send(
            to=TEST_EMAIL,
            subject="Test Email — HTML",
            body="Hello from your AI Agent! This is the plain text fallback.",
            html_body="<h1>Hello from your AI Agent!</h1><p>This is an <b>HTML</b> test email sent via the <code>gmail_send</code> tool.</p>"
        )
        if result["success"]:
            print(f"  Sent — message ID: {result['message_id']}")
        else:
            print(f"  Error: {result['error']}")

        # test 3 — scheduler notification simulation
        print("\n[3] Simulating scheduler task completion notification...")
        result = await gmail_send(
            to=TEST_EMAIL,
            subject="Task Completed: Monitor BTC Price",
            body=(
                "Your scheduled task 'Monitor BTC Price' has completed.\n\n"
                "Result:\n"
                "BTC price dropped below $50,000. A buy order for 0.01 BTC has been placed successfully.\n\n"
                "Task has been removed from the scheduler."
            )
        )
        if result["success"]:
            print(f"  Sent — message ID: {result['message_id']}")
        else:
            print(f"  Error: {result['error']}")

        print("\n" + "=" * 50)
        print("Tests done — check your inbox")

        # test 4 — logout
        print("\n[4] Logging out...")
        gmail_send_logout()

        print("\n[5] Verifying logout...")
        if not TOKEN_PATH.exists():
            print("  Confirmed — token file deleted.")
        else:
            print("  Warning — token file still exists.")

        print("\n" + "=" * 50)
        print("All done")

    asyncio.run(test())