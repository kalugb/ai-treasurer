from supabase import Client

BUCKET_NAME = "receipts"
DEFAULT_SIGNED_URL_TTL = 7200  # 2h; must stay > the Redis cache TTL so cached URLs never serve expired


def object_path(org_id: str, dept_id: str, file_id: str) -> str:
    return f"{org_id}/{dept_id}/{file_id}"


def upload_receipt(client: Client, path: str, data: bytes, content_type: str | None = None) -> str:
    # upsert so re-syncing the same Drive file overwrites its bytes instead of erroring
    file_options = {"upsert": "true"}
    if content_type:
        file_options["content-type"] = content_type
    client.storage.from_(BUCKET_NAME).upload(path, data, file_options)
    return path


def signed_url(client: Client, path: str, expires_in: int = DEFAULT_SIGNED_URL_TTL) -> str | None:
    result = client.storage.from_(BUCKET_NAME).create_signed_url(path, expires_in)
    return result.get("signedURL")


def signed_urls(client: Client, paths: list[str], expires_in: int = DEFAULT_SIGNED_URL_TTL) -> dict[str, str]:
    # one HTTP round-trip for all paths, vs one per path; returns {path: url}
    if not paths:
        return {}
    results = client.storage.from_(BUCKET_NAME).create_signed_urls(paths, expires_in)
    return {item["path"]: item["signedURL"] for item in results if item.get("signedURL") and not item.get("error")}


if __name__ == "__main__":
    from services.supabase.supabase_connect import get_storage_client

    def main():
        client = get_storage_client()
        test_path = object_path("selftest", "selftest", "probe.txt")
        payload = b"supabase storage self-check"

        stored = upload_receipt(client, test_path, payload, "text/plain")
        assert stored == test_path, "upload_receipt should return the object path"

        url = signed_url(client, test_path, 60)
        assert url and test_path.split("/")[-1] in url, f"expected a signed URL for {test_path}, got {url!r}"
        print("OK signed URL:", url)

        client.storage.from_(BUCKET_NAME).remove([test_path])
        print("Cleaned up", test_path)

    main()
