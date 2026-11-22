"""Symmetric encryption for secrets kept in MongoDB (Google OAuth tokens, OAuth `state`).
Fernet (AES-128-CBC + HMAC) with the key from TOKEN_ENCRYPTION_KEY. Losing the key means every user must reconnect.
Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
"""
import os

from cryptography.fernet import Fernet, InvalidToken  # noqa: F401  (InvalidToken is re-exported for callers)
from dotenv import load_dotenv

load_dotenv()


def _fernet() -> Fernet:
    key = os.getenv("TOKEN_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY is not set")
    return Fernet(key.encode())


def encryption_ready() -> bool:
    try:
        _fernet()
        return True
    except Exception:
        return False


def encrypt(text: str) -> str:
    return _fernet().encrypt(text.encode()).decode()


def decrypt(token: str, ttl: int | None = None) -> str:
    """Raises InvalidToken when tampered, made with another key, or older than `ttl` seconds."""
    return _fernet().decrypt(token.encode(), ttl=ttl).decode()


if __name__ == "__main__":
    import time

    os.environ["TOKEN_ENCRYPTION_KEY"] = Fernet.generate_key().decode()
    secret = encrypt("hello")
    assert secret != "hello" and decrypt(secret) == "hello"
    try:
        decrypt(secret[:-2] + "AA")
        raise AssertionError("tampered token accepted")
    except InvalidToken:
        pass
    other = Fernet(Fernet.generate_key()).encrypt(b"x").decode()
    try:
        decrypt(other)
        raise AssertionError("token from another key accepted")
    except InvalidToken:
        pass
    old = _fernet().encrypt_at_time(b"x", int(time.time()) - 120).decode()
    try:
        decrypt(old, ttl=60)
        raise AssertionError("expired token accepted")
    except InvalidToken:
        pass
    del os.environ["TOKEN_ENCRYPTION_KEY"]
    assert not encryption_ready() or os.getenv("TOKEN_ENCRYPTION_KEY")  # .env may still provide one
    print("crypto self-check passed")
