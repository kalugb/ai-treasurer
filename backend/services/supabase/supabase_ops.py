import os

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

RECEIPTS_BUCKET = "receipts"

_url = os.getenv("SUPABASE_URL")
# server-side storage writes need the service-role key; the publishable/anon key is blocked by bucket RLS
_secret_key = os.getenv("SUPABASE_SECRET_KEY")

# a dedicated service-role client for storage, separate from the anon client in supabase_connect.py
_storage_client: Client = create_client(_url, _secret_key)


def upload_receipt(path: str, data: bytes, content_type: str) -> None:
    _storage_client.storage.from_(RECEIPTS_BUCKET).upload(
        path, data, {"content-type": content_type, "upsert": "true"}
    )


def download_receipt(path: str) -> bytes:
    return _storage_client.storage.from_(RECEIPTS_BUCKET).download(path)


def delete_receipt(path: str) -> None:
    _storage_client.storage.from_(RECEIPTS_BUCKET).remove([path])


# proof-of-payment images for cash-in records (private bucket, must exist in Supabase)
CASHIN_BUCKET = "cashInImage"


def upload_cashin_image(path: str, data: bytes, content_type: str) -> None:
    _storage_client.storage.from_(CASHIN_BUCKET).upload(path, data, {"content-type": content_type, "upsert": "true"})


def download_cashin_image(path: str) -> bytes:
    return _storage_client.storage.from_(CASHIN_BUCKET).download(path)


def delete_cashin_image(path: str) -> None:
    _storage_client.storage.from_(CASHIN_BUCKET).remove([path])


if __name__ == "__main__":
    # assert-based self-check: round-trip a blob through the receipts bucket
    test_path = "selftest/roundtrip.bin"
    payload = b"supabase-ops-selftest-\x00\x01\x02"
    upload_receipt(test_path, payload, "application/octet-stream")
    fetched = download_receipt(test_path)
    assert fetched == payload, f"round-trip mismatch: {fetched!r}"
    delete_receipt(test_path)
    print("OK: upload/download/delete round-trip passed")
