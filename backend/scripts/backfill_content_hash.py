"""One-off: give existing LOCAL receipts a contentHash (MD5 of the stored file).

Drive receipts get theirs on the next Drive sync; this only covers local uploads made before the
duplicate check existed. Idempotent, never deletes. A receipt whose file is an exact copy of another
local receipt in the same org can't take the hash (unique index): it is reported for you to review.

    cd backend && uv run python scripts/backfill_content_hash.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pymongo.errors import DuplicateKeyError  # noqa: E402

from services import duplicates  # noqa: E402
from services.mongodb.mongodb_connect import connect_to_mongodb  # noqa: E402
from services.supabase import supabase_ops  # noqa: E402

client, db = connect_to_mongodb()
done = skipped = 0
clashes = []
for doc in db["receipts"].find({"createdFrom": "local_upload", "contentHash": {"$exists": False}, "storagePath": {"$type": "string"}}):
    try:
        digest = duplicates.content_hash(supabase_ops.download_receipt(doc["storagePath"]))
        db["receipts"].update_one({"_id": doc["_id"]}, {"$set": {"contentHash": digest}})
        done += 1
    except DuplicateKeyError:
        clashes.append(f"{doc['_id']} ({doc.get('receiptName', '')})")
    except Exception as e:  # file missing in Supabase etc.: leave the receipt unhashed
        skipped += 1
        print(f"skipped {doc['_id']}: {e}")
print(f"hashed {done}, skipped {skipped}, exact copies of another local receipt {len(clashes)}")
for c in clashes:
    print("  duplicate:", c)
client.close()
