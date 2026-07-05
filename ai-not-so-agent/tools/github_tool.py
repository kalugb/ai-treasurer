import asyncio
import subprocess
from pathlib import Path

import asyncio.subprocess as aio_subprocess

_git = "git"


async def _run_git(args, cwd=None):
    cmd = [_git] + args
    try:
        proc = await aio_subprocess.create_subprocess_exec(
            *cmd,
            stdout=aio_subprocess.PIPE,
            stderr=aio_subprocess.PIPE,
            cwd=cwd,
        )
        stdout, stderr = await proc.communicate()
        return {
            "returncode": proc.returncode,
            "stdout": stdout.decode(errors="replace").strip(),
            "stderr": stderr.decode(errors="replace").strip(),
        }
    except OSError as e:
        return {
            "returncode": 1,
            "stdout": "",
            "stderr": str(e)
        }


async def _resolve_repo(repo_path):
    if repo_path:
        return str(Path(repo_path).resolve())
    return None


async def github_tool(action: str, **kwargs):
    """Run git operations. Supported actions: pull, push, fetch, branch_list, branch_create, branch_delete, checkout, status, log, diff, add, commit, stash, stash_pop, reset, remote_list, tag_list, current_branch."""
    repo = await _resolve_repo(kwargs.get("repo_path"))

    if action == "pull":
        remote = kwargs.get("remote", "origin")
        branch = kwargs.get("branch")
        args = ["pull", remote]
        if branch:
            args.append(branch)
        r = await _run_git(args, cwd=repo)
        return r

    if action == "push":
        remote = kwargs.get("remote", "origin")
        branch = kwargs.get("branch")
        args = ["push", remote]
        if branch:
            args.append(branch)
        if kwargs.get("force"):
            args.insert(1, "--force")
        if kwargs.get("set_upstream"):
            args.insert(1, "-u")
        r = await _run_git(args, cwd=repo)
        return r

    if action == "fetch":
        remote = kwargs.get("remote")
        args = ["fetch"]
        if remote:
            args.append(remote)
        if kwargs.get("all"):
            args.append("--all")
        if kwargs.get("prune"):
            args.append("--prune")
        r = await _run_git(args, cwd=repo)
        return r

    if action == "branch_list":
        args = ["branch"]
        if kwargs.get("remote"):
            args.append("-r")
        if kwargs.get("all"):
            args.append("-a")
        r = await _run_git(args, cwd=repo)
        return r

    if action == "branch_create":
        name = kwargs["name"]
        base = kwargs.get("base")
        args = ["branch", name]
        if base:
            args.append(base)
        r = await _run_git(args, cwd=repo)
        return r

    if action == "branch_delete":
        name = kwargs["name"]
        args = ["branch", "-d", name]
        if kwargs.get("force"):
            args[1] = "-D"
        if kwargs.get("remote"):
            r = await _run_git(["push", "origin", "--delete", name], cwd=repo)
            return r
        r = await _run_git(args, cwd=repo)
        return r

    if action == "checkout":
        target = kwargs["target"]
        args = ["checkout", target]
        if kwargs.get("create"):
            args.insert(1, "-b")
        r = await _run_git(args, cwd=repo)
        return r

    if action == "status":
        args = ["status"]
        if kwargs.get("short"):
            args.append("--short")
        r = await _run_git(args, cwd=repo)
        return r

    if action == "log":
        args = ["log"]
        if kwargs.get("limit"):
            args.append(f"-{int(kwargs['limit'])}")
        if kwargs.get("oneline"):
            args.append("--oneline")
        if kwargs.get("graph"):
            args.append("--graph")
        if kwargs.get("author"):
            args.append(f"--author={kwargs['author']}")
        if kwargs.get("since"):
            args.append(f"--since={kwargs['since']}")
        if kwargs.get("branch"):
            args.append(kwargs["branch"])
        r = await _run_git(args, cwd=repo)
        return r

    if action == "diff":
        args = ["diff"]
        if kwargs.get("staged"):
            args.append("--staged")
        if kwargs.get("branch"):
            args.append(kwargs["branch"])
        if kwargs.get("file"):
            args.append("--")
            args.append(kwargs["file"])
        r = await _run_git(args, cwd=repo)
        return r

    if action == "add":
        if kwargs.get("all"):
            args = ["add", "."]
        elif kwargs.get("file"):
            args = ["add", kwargs["file"]]
        else:
            return {"returncode": 1, "stdout": "", "stderr": "Provide 'file' or 'all=true'"}
        r = await _run_git(args, cwd=repo)
        return r

    if action == "commit":
        message = kwargs["message"]
        args = ["commit", "-m", message]
        if kwargs.get("amend"):
            args.append("--amend")
        r = await _run_git(args, cwd=repo)
        return r

    if action == "stash":
        args = ["stash"]
        if kwargs.get("message"):
            args.extend(["push", "-m", kwargs["message"]])
        r = await _run_git(args, cwd=repo)
        return r

    if action == "stash_pop":
        args = ["stash", "pop"]
        if kwargs.get("index") is not None:
            args.append(f"stash@{{{kwargs['index']}}}")
        r = await _run_git(args, cwd=repo)
        return r

    if action == "reset":
        target = kwargs["target"]
        mode = kwargs.get("mode", "mixed")
        args = ["reset", f"--{mode}", target]
        r = await _run_git(args, cwd=repo)
        return r

    if action == "remote_list":
        args = ["remote", "-v"]
        r = await _run_git(args, cwd=repo)
        return r

    if action == "tag_list":
        args = ["tag"]
        if kwargs.get("sort"):
            args.append(f"--sort={kwargs['sort']}")
        r = await _run_git(args, cwd=repo)
        return r

    if action == "current_branch":
        r = await _run_git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=repo)
        return r

    return {"returncode": 1, "stdout": "", "stderr": f"Unknown action: {action}"}

# testing purposes
if __name__ == "__main__":
    async def run_tests():
        passed = 0
        failed = 0

        async def run(name, coro):
            nonlocal passed, failed
            try:
                await coro
                print(f"✅ {name}")
                passed += 1
            except AssertionError as e:
                print(f"❌ {name} — {e}")
                failed += 1
            except Exception as e:
                print(f"❌ {name} — unexpected error: {e}")
                failed += 1

        print("=" * 60)
        print("GitHub Tool Tests")
        print("=" * 60)

        # current branch
        async def test_current_branch():
            r = await github_tool("current_branch", repo_path=".")
            assert r["returncode"] == 0
            assert len(r["stdout"]) > 0
            print(f"     branch: {r['stdout']}")

        # status
        async def test_status():
            r = await github_tool("status", repo_path=".")
            assert r["returncode"] == 0
            assert "On branch" in r["stdout"]

        # status short
        async def test_status_short():
            r = await github_tool("status", repo_path=".", short=True)
            assert r["returncode"] == 0

        # log default
        async def test_log_default():
            r = await github_tool("log", repo_path=".")
            assert r["returncode"] == 0
            assert "commit" in r["stdout"]

        # log with limit
        async def test_log_limit():
            r = await github_tool("log", repo_path=".", limit=5)
            assert r["returncode"] == 0
            print(f"     {len(r['stdout'].splitlines())} lines")

        # log oneline
        async def test_log_oneline():
            r = await github_tool("log", repo_path=".", limit=10, oneline=True)
            assert r["returncode"] == 0
            assert len(r["stdout"].splitlines()) <= 10

        # log graph
        async def test_log_graph():
            r = await github_tool("log", repo_path=".", limit=5, graph=True, oneline=True)
            assert r["returncode"] == 0

        # branch list local
        async def test_branch_list_local():
            r = await github_tool("branch_list", repo_path=".")
            assert r["returncode"] == 0
            print(f"     branches: {r['stdout'][:80]}")

        # branch list remote
        async def test_branch_list_remote():
            r = await github_tool("branch_list", repo_path=".", remote=True)
            assert r["returncode"] == 0

        # branch list all
        async def test_branch_list_all():
            r = await github_tool("branch_list", repo_path=".", all=True)
            assert r["returncode"] == 0

        # remote list
        async def test_remote_list():
            r = await github_tool("remote_list", repo_path=".")
            assert r["returncode"] == 0
            print(f"     remotes: {r['stdout'][:80] if r['stdout'] else '(none)'}")

        # tag list
        async def test_tag_list():
            r = await github_tool("tag_list", repo_path=".")
            assert r["returncode"] == 0
            print(f"     tags: {r['stdout'][:80] if r['stdout'] else '(none)'}")

        # tag list sorted
        async def test_tag_list_sorted():
            r = await github_tool("tag_list", repo_path=".", sort="-version:refname")
            assert r["returncode"] == 0

        # diff unstaged
        async def test_diff_unstaged():
            r = await github_tool("diff", repo_path=".")
            assert r["returncode"] == 0
            print(f"     unstaged diff: {len(r['stdout'])} chars")

        # diff staged
        async def test_diff_staged():
            r = await github_tool("diff", repo_path=".", staged=True)
            assert r["returncode"] == 0
            print(f"     staged diff: {len(r['stdout'])} chars")

        # invalid action
        async def test_invalid_action():
            r = await github_tool("nonexistent_action", repo_path=".")
            assert r["returncode"] == 1
            assert "Unknown action" in r["stderr"]

        async def test_nonexistent_repo():
            r = await github_tool("status", repo_path="/tmp/nonexistent_repo_99999")
            assert r["returncode"] != 0
            print(f"     error: {r['stderr'][:80]}")

        # fetch (read-only, doesn't modify local git state)
        async def test_fetch_dry():
            r = await github_tool("fetch", repo_path=".", prune=True)
            assert isinstance(r, dict)
            assert "returncode" in r

        await run("current_branch", test_current_branch())
        await run("status", test_status())
        await run("status_short", test_status_short())
        await run("log_default", test_log_default())
        await run("log_limit", test_log_limit())
        await run("log_oneline", test_log_oneline())
        await run("log_graph", test_log_graph())
        await run("branch_list_local", test_branch_list_local())
        await run("branch_list_remote", test_branch_list_remote())
        await run("branch_list_all", test_branch_list_all())
        await run("remote_list", test_remote_list())
        await run("tag_list", test_tag_list())
        await run("tag_list_sorted", test_tag_list_sorted())
        await run("diff_unstaged", test_diff_unstaged())
        await run("diff_staged", test_diff_staged())
        await run("invalid_action", test_invalid_action())
        await run("nonexistent_repo", test_nonexistent_repo())
        await run("fetch_dry", test_fetch_dry())

        print("\n" + "=" * 60)
        print(f"Results: {passed} passed, {failed} failed")
        print("=" * 60)

    asyncio.run(run_tests())
