"""Self-check for receipt groups. Run from backend/:  uv run python tests/test_receipt_groups.py

A throwaway database on the configured local MongoDB (dropped at the end); Drive and sign-in are faked.
"""
import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bson import ObjectId
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pymongo import MongoClient

from routers import google_drive
from services import users


class FakeCache:
    def __init__(self):
        self.store = {}

    def key_builder(self, *parts):
        return ":".join(parts)

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value):
        self.store[key] = value

    async def delete(self, key):
        self.store.pop(key, None)


def check(label, cond):
    print(("ok   " if cond else "FAIL ") + label)
    if not cond:
        raise SystemExit(1)


def build(db):
    app = FastAPI()
    app.include_router(google_drive.router)
    app.state.mongo, app.state.cache = db, FakeCache()
    def fake_user(request: Request):
        request.state.user = {"userKey": "u1", "status": "active"}
        return request.state.user

    app.dependency_overrides[users.get_current_user] = fake_user
    return app


FOLDER = "application/vnd.google-apps.folder"


class FakeFiles:
    """Just enough of the Drive API: files().list(q="'<parent>' in parents ...").execute() -> {"files": [...]}"""

    def __init__(self, tree):
        self.tree = tree

    def files(self):
        return self

    def list(self, q, **_kw):
        parent = q.split("'")[1]
        return type("Req", (), {"execute": lambda _s: {"files": self.tree.get(parent, [])}})()


def item(i, name, mime="image/jpeg"):
    return {"id": i, "name": name, "mimeType": mime, "modifiedTime": "2026-11-01T00:00:00Z", "md5Checksum": f"h-{i}"}


def sync_checks(client, db, org):
    from services.google.google_ops import GoogleDriveService
    from services.google import google_ops

    tree = {
        "ROOT": [item("lunch", "lunch.jpg"), item("T", "Trip to KL", FOLDER), item("E", "Empty", FOLDER)],
        "T": [item("p1", "part1.jpg"), item("p2", "part2.jpg"), item("X", "Taxi", FOLDER)],
        "X": [item("ride", "ride.jpg")],
    }

    async def fake_run_for_org(_request, _org_id, fn, *args):
        return fn(GoogleDriveService(FakeFiles(tree)), *args)

    google_drive.run_for_org = fake_run_for_org
    team = db["departments"].insert_one({"name": "drive", "orgId": org, "googleDriveFolderId": "ROOT"}).inserted_id
    base = f"/api/google-drive/teams/{team}/receipts"

    def groups():
        return {r["googleDriveFileId"]: (r["groupName"], r["groupSource"]) for r in client.get(base, params={"refresh": True}).json()}

    r = client.post(f"{base}/sync").json()
    check("sync reads nested files too (4 files) and counts 1 group", r["total"] == 4 and r["groups"] == 1)
    g = groups()
    check("a root file stays ungrouped", g["lunch"] == (None, None))
    check("sub-folder files (any depth) get the top-level folder name",
          g["p1"] == g["p2"] == g["ride"] == ("Trip to KL", "folder"))

    client.post(f"{base}/group", json={"ids": ["lunch", "p1"], "name": "Lunch + 1"})
    client.post(f"{base}/group", json={"ids": ["p2"], "name": None})
    client.post(f"{base}/sync")
    g = groups()
    check("manual group survives a re-sync", g["lunch"] == g["p1"] == ("Lunch + 1", "manual"))
    check("manual ungroup survives a re-sync", g["p2"] == (None, "manual"))
    check("untouched receipts keep following the folder", g["ride"] == ("Trip to KL", "folder"))

    tree["X"] = []
    tree["ROOT"].append(item("ride", "ride.jpg"))  # ride.jpg moved out of its folder
    r = client.post(f"{base}/sync").json()
    g = groups()
    check("a file moved to the root loses its folder group", g["ride"] == (None, None))
    check("still four receipts, none duplicated", r["total"] == 4 and len(g) == 4)

    tree["T"] = [x for x in tree["T"] if x["id"] != "p2"]  # part2 deleted in Drive
    r = client.post(f"{base}/sync").json()
    check("a file removed from Drive is deleted", r["deleted"] == 1 and "p2" not in groups())

    google_ops.MAX_GROUP_FOLDERS = 1
    tree["ROOT"].append(item("Z", "Other", FOLDER))
    tree["Z"] = [item("z1", "z1.jpg")]
    r = client.post(f"{base}/sync")
    google_ops.MAX_GROUP_FOLDERS = 100
    check("a folder over the cap is skipped without failing the sync", r.status_code == 200 and "z1" not in groups())


def main():
    mongo = MongoClient(os.getenv("MONGODB_URI") or "mongodb://localhost:27017/")
    name = f"zz_groups_{uuid.uuid4().hex[:8]}"
    db = mongo[name]
    try:
        org = db["organizations"].insert_one({"name": "o", "ownerId": "u1"}).inserted_id
        team = db["departments"].insert_one({"name": "t", "orgId": org}).inserted_id
        other = db["departments"].insert_one({"name": "t2", "orgId": org}).inserted_id
        now = datetime.now(timezone.utc)

        def receipt(n, dept=team, **extra):
            return db["receipts"].insert_one({
                "departmentID": dept, "orgID": org, "receiptName": n, "googleDriveFileId": f"d-{n}", "createdFrom": "google_drive",
                "createdAt": now, "receiptAmount": 1.0, **extra,
            }).inserted_id

        a, b, c = receipt("part1"), receipt("part2"), receipt("part3")
        foreign = receipt("x", dept=other)
        local = db["receipts"].insert_one({"departmentID": team, "orgID": org, "receiptName": "loc", "createdFrom": "local_upload", "createdAt": now}).inserted_id

        client = TestClient(build(db))
        base = f"/api/google-drive/teams/{team}/receipts"

        listed = {r["receiptName"]: r for r in client.get(base).json()}
        check("default: nobody is grouped", all(r["groupName"] is None and r["groupSource"] is None for r in listed.values()))

        r = client.post(f"{base}/group", json={"ids": ["d-part1", "d-part2", str(local)], "name": "  Trip to KL "})
        check("group drive + local receipts", r.status_code == 200 and r.json() == {"updated": 3, "groupName": "Trip to KL"})
        listed = {x["receiptName"]: x for x in client.get(base).json()}
        check("grouped receipts carry the trimmed name, source manual",
              all(listed[n]["groupName"] == "Trip to KL" and listed[n]["groupSource"] == "manual" for n in ("part1", "part2", "loc")))
        check("others stay alone", listed["part3"]["groupName"] is None)

        r = client.post(f"{base}/group", json={"ids": ["d-part3"], "name": "trip to kl"})
        check("same name in another case joins the existing group", r.json()["groupName"] == "Trip to KL")

        r = client.post(f"{base}/group", json={"ids": ["d-part1", str(foreign)], "name": "Z"})
        check("a receipt of another team is rejected", r.status_code == 400)
        check("...and nothing changed", db["receipts"].find_one({"_id": a})["groupName"] == "Trip to KL")

        r = client.post(f"{base}/group", json={"ids": ["d-part2"], "name": None})
        got = db["receipts"].find_one({"_id": b})
        check("ungroup clears the name and stays manual", r.status_code == 200 and got["groupName"] is None and got["groupSource"] == "manual")

        check("blank name also ungroups", client.post(f"{base}/group", json={"ids": ["d-part3"], "name": "   "}).json()["groupName"] is None)
        check("name over 80 chars is 422", client.post(f"{base}/group", json={"ids": ["d-part1"], "name": "x" * 81}).status_code == 422)
        check("empty ids is 422", client.post(f"{base}/group", json={"ids": [], "name": "n"}).status_code == 422)
        check("cache was invalidated", not client.app.state.cache.store)

        sync_checks(client, db, org)
        print("all receipt group checks passed")
    finally:
        mongo.drop_database(name)


if __name__ == "__main__":
    main()
