"""Outgoing email through Brevo SMTP. Only the one-time code mails live here.

Needs BREVO_SMTP_SERVER, BREVO_SMTP_PORT, BREVO_SMTP_LOGIN, BREVO_SMTP_KEY and BREVO_SMTP_SENDER (an address
verified in Brevo; the login is NOT a valid sender). Mail bodies never reach the logs.
Try it:  uv run python -m services.mailer you@example.com
"""
import os
import smtplib
import sys
from email.message import EmailMessage

from dotenv import load_dotenv
from starlette.concurrency import run_in_threadpool

load_dotenv()

CODE_MINUTES = 10
_REQUIRED = ("BREVO_SMTP_SERVER", "BREVO_SMTP_PORT", "BREVO_SMTP_LOGIN", "BREVO_SMTP_KEY", "BREVO_SMTP_SENDER")


class MailNotConfigured(RuntimeError):
    pass


def _send(to: str, subject: str, text: str, html: str | None) -> None:
    missing = [name for name in _REQUIRED if not os.getenv(name)]
    if missing:
        raise MailNotConfigured(f"Missing mail settings: {', '.join(missing)}")
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = os.environ["BREVO_SMTP_SENDER"], to, subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(os.environ["BREVO_SMTP_SERVER"], int(os.environ["BREVO_SMTP_PORT"]), timeout=15) as smtp:
        smtp.starttls()
        smtp.login(os.environ["BREVO_SMTP_LOGIN"], os.environ["BREVO_SMTP_KEY"])
        smtp.send_message(msg)


async def send_mail(to: str, subject: str, text: str, html: str | None = None) -> None:
    """Raises on any failure (MailNotConfigured, SMTP errors); callers decide whether that is fatal."""
    await run_in_threadpool(_send, to, subject, text, html)


_MESSAGES = {
    "verify": ("Verify your AI Treasurer email", "Use this code to verify your email address"),
    "reset": ("Reset your AI Treasurer password", "Use this code to reset your password"),
}


async def send_code(to: str, purpose: str, code: str) -> None:
    subject, lead = _MESSAGES[purpose]
    text = (f"{lead}:\n\n    {code}\n\nIt expires in {CODE_MINUTES} minutes and works once.\n"
            "If you didn't ask for this, you can ignore this email; nothing changes.\n")
    html = (f"<p>{lead}:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">{code}</p>"
            f"<p>It expires in {CODE_MINUTES} minutes and works once.</p>"
            "<p style=\"color:#666\">If you didn't ask for this, you can ignore this email; nothing changes.</p>")
    await send_mail(to, subject, text, html)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: python -m services.mailer <recipient email>")
    try:
        _send(sys.argv[1], "AI Treasurer mail test", "If you can read this, mail sending works.", None)
        print("accepted by Brevo")
    except MailNotConfigured as e:
        print(e)
        raise SystemExit(1)
