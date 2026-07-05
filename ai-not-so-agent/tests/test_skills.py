"""Tests for tool/skill dispatch — mocks all external I/O."""

import asyncio
import json
import sys
import importlib
from unittest.mock import AsyncMock, MagicMock, patch
from pathlib import Path

import pytest
from bson import ObjectId

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------------------------------------------------------------------------
# ddgs_search
# ---------------------------------------------------------------------------

class TestDdgSearch:
    """tools/ddgs_search.py — all DDGS calls run in a thread executor."""

    @pytest.fixture(autouse=True)
    def _patch_ddgs(self):
        mock_results = [
            {"title": "Python", "href": "https://python.org", "body": "Programming language"},
            {"title": "Docs", "href": "https://docs.python.org", "body": "Official docs"},
        ]
        mock_ddgs = MagicMock()
        mock_ddgs.text = MagicMock(return_value=mock_results)
        mock_ddgs.news = MagicMock(return_value=mock_results)
        mock_ddgs.images = MagicMock(return_value=mock_results)
        mock_ddgs.videos = MagicMock(return_value=mock_results)

        with patch("tools.ddgs_search.DDGS", return_value=mock_ddgs):
            yield mock_ddgs

    @pytest.mark.asyncio
    async def test_text_search_returns_results(self):
        from tools.ddgs_search import ddgs_search

        result = await ddgs_search("python", "text")
        assert len(result) == 2
        assert result[0]["title"] == "Python"

    @pytest.mark.asyncio
    async def test_news_search(self):
        from tools.ddgs_search import ddgs_search

        result = await ddgs_search("python", "news")
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_image_search(self):
        from tools.ddgs_search import ddgs_search

        result = await ddgs_search("python", "image")
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_video_search(self):
        from tools.ddgs_search import ddgs_search

        result = await ddgs_search("python", "video")
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_default_search_type_is_text(self):
        from tools.ddgs_search import ddgs_search

        result = await ddgs_search("python")
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_unknown_search_type_returns_error_string(self):
        from tools.ddgs_search import ddgs_search

        result = await ddgs_search("python", "podcast")
        assert result == "Unknown search_type: podcast"

    @pytest.mark.asyncio
    async def test_empty_results_returns_no_results_message(self):
        mock_ddgs = MagicMock()
        mock_ddgs.text = MagicMock(return_value=[])

        with patch("tools.ddgs_search.DDGS", return_value=mock_ddgs):
            from tools.ddgs_search import ddgs_search

            result = await ddgs_search("xyzzy", "text")
            assert result == "No search results found (possible rate limit or no results)."

    @pytest.mark.asyncio
    async def test_user_id_kwarg_accepted(self):
        """_call_tool injects user_id — the tool must accept **kwargs."""
        from tools.ddgs_search import ddgs_search

        result = await ddgs_search("python", "text", user_id="abc123")
        assert len(result) == 2


# ---------------------------------------------------------------------------
# manage_user_memory
# ---------------------------------------------------------------------------

class TestManageUserMemory:
    """tools/manage_user_memory.py — all DB calls mocked."""

    @pytest.fixture()
    def mock_crud(self):
        with patch("tools.manage_user_memory.Create") as mock_create, \
             patch("tools.manage_user_memory.Update") as mock_update, \
             patch("tools.manage_user_memory.Delete") as mock_delete:

            mock_create.insert_one = AsyncMock(return_value=MagicMock(inserted_id="new_id"))
            mock_update.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
            mock_delete.delete_one = AsyncMock(return_value=MagicMock(deleted_count=1))

            yield {
                "create": mock_create,
                "update": mock_update,
                "delete": mock_delete,
            }

    @pytest.mark.asyncio
    async def test_create_action(self, mock_crud):
        from tools.manage_user_memory import manage_user_memory

        user_id = "507f1f77bcf86cd799439011"
        result = await manage_user_memory(
            action="create",
            user_id=user_id,
            preference={"theme": "dark"},
            facts=["Likes Python"],
        )
        mock_crud["create"].insert_one.assert_awaited_once()
        assert result is not None

    @pytest.mark.asyncio
    async def test_update_action_partial(self, mock_crud):
        from tools.manage_user_memory import manage_user_memory

        user_id = "507f1f77bcf86cd799439011"
        result = await manage_user_memory(
            action="update",
            user_id=user_id,
            preference={"language": "en"},
        )
        mock_crud["update"].update_one.assert_awaited_once()
        assert result is not None

    @pytest.mark.asyncio
    async def test_update_action_with_preference_and_facts(self, mock_crud):
        from tools.manage_user_memory import manage_user_memory

        user_id = "507f1f77bcf86cd799439011"
        result = await manage_user_memory(
            action="update",
            user_id=user_id,
            preference={"theme": "light"},
            facts=["Fact A"],
        )
        mock_crud["update"].update_one.assert_awaited_once()
        # partial update uses dot-notation for preferences and $push for facts
        call_args = mock_crud["update"].update_one.call_args
        update_ops = call_args[0][2]  # third positional arg
        assert "$set" in update_ops
        assert "preferences.theme" in update_ops["$set"]
        assert "$push" in update_ops

    @pytest.mark.asyncio
    async def test_update_no_fields_returns_none(self, mock_crud):
        from tools.manage_user_memory import manage_user_memory

        user_id = "507f1f77bcf86cd799439011"
        result = await manage_user_memory(action="update", user_id=user_id)
        assert result is None
        mock_crud["update"].update_one.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_delete_action(self, mock_crud):
        from tools.manage_user_memory import manage_user_memory

        user_id = "507f1f77bcf86cd799439011"
        result = await manage_user_memory(action="delete", user_id=user_id)
        mock_crud["delete"].delete_one.assert_awaited_once()
        assert result is not None

    @pytest.mark.asyncio
    async def test_unknown_action_returns_none(self, mock_crud):
        from tools.manage_user_memory import manage_user_memory

        user_id = "507f1f77bcf86cd799439011"
        result = await manage_user_memory(action="merge", user_id=user_id)
        assert result is None
        mock_crud["create"].insert_one.assert_not_awaited()
        mock_crud["update"].update_one.assert_not_awaited()
        mock_crud["delete"].delete_one.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_kwargs_accepted(self, mock_crud):
        """_call_tool injects user_id via **kwargs — must not crash."""
        from tools.manage_user_memory import manage_user_memory

        user_id = "507f1f77bcf86cd799439011"
        result = await manage_user_memory(
            action="create",
            user_id=user_id,
            preference={"a": "b"},
            facts=["x"],
            user_id_injected="ignored",  # simulating extra kwargs
        )
        assert result is not None


# ---------------------------------------------------------------------------
# manage_scheduler
# ---------------------------------------------------------------------------

class TestManageScheduler:
    """tools/manage_scheduler.py — all DB calls mocked."""

    @pytest.fixture()
    def mock_crud(self):
        with patch("tools.manage_scheduler._crud") as mock_crud:
            mock_crud.create_scheduler = AsyncMock(return_value="507f1f77bcf86cd799439099")

            async def read_side_effect(filters, find_many=False):
                if find_many:
                    return [
                        {"_id": ObjectId("507f1f77bcf86cd799439011"), "taskName": "Task A", "userID": ObjectId("507f1f77bcf86cd799439011")},
                        {"_id": ObjectId("507f1f77bcf86cd799439012"), "taskName": "Task B", "userID": ObjectId("507f1f77bcf86cd799439011")},
                    ]
                return {
                    "_id": ObjectId("507f1f77bcf86cd799439099"),
                    "taskName": "Test task",
                    "userID": ObjectId("507f1f77bcf86cd799439011"),
                    "prompt": "Do something",
                }

            mock_crud.read_scheduler = AsyncMock(side_effect=read_side_effect)
            mock_crud.update_scheduler = AsyncMock(return_value=True)
            mock_crud.delete_scheduler = AsyncMock(return_value=True)
            yield mock_crud

    @pytest.mark.asyncio
    async def test_create_action(self, mock_crud):
        from tools.manage_scheduler import manage_scheduler

        result = await manage_scheduler(
            action="create",
            task_name="Daily report",
            user_id="507f1f77bcf86cd799439011",
            prompt="Generate a daily report",
            next_execution_time="2026-07-01T09:00:00+08:00",
        )
        mock_crud.create_scheduler.assert_awaited_once()
        assert result == "507f1f77bcf86cd799439099"

    @pytest.mark.asyncio
    async def test_read_action_single(self, mock_crud):
        from tools.manage_scheduler import manage_scheduler

        result = await manage_scheduler(
            action="read",
            scheduler_id="507f1f77bcf86cd799439099",
            user_id="507f1f77bcf86cd799439011",
        )
        mock_crud.read_scheduler.assert_awaited_once()
        assert result["_id"] == "507f1f77bcf86cd799439099"
        assert result["taskName"] == "Test task"

    @pytest.mark.asyncio
    async def test_read_action_many(self, mock_crud):
        from tools.manage_scheduler import manage_scheduler

        result = await manage_scheduler(
            action="read",
            user_id="507f1f77bcf86cd799439011",
            find_many=True,
        )
        assert len(result) == 2
        assert result[0]["taskName"] == "Task A"

    @pytest.mark.asyncio
    async def test_update_action(self, mock_crud):
        from tools.manage_scheduler import manage_scheduler

        result = await manage_scheduler(
            action="update",
            user_id="507f1f77bcf86cd799439011",
            scheduler_id="507f1f77bcf86cd799439099",
            changes={"taskName": "Updated task", "prompt": "New prompt"},
        )
        mock_crud.update_scheduler.assert_awaited_once()
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_action(self, mock_crud):
        from tools.manage_scheduler import manage_scheduler

        result = await manage_scheduler(
            action="delete",
            scheduler_id="507f1f77bcf86cd799439099",
            user_id="507f1f77bcf86cd799439011",
        )
        mock_crud.delete_scheduler.assert_awaited_once()
        assert result is True

    @pytest.mark.asyncio
    async def test_unknown_action_returns_none(self, mock_crud):
        from tools.manage_scheduler import manage_scheduler

        result = await manage_scheduler(action="merge", scheduler_id="abc")
        assert result is None
        mock_crud.create_scheduler.assert_not_awaited()
        mock_crud.update_scheduler.assert_not_awaited()
        mock_crud.delete_scheduler.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_kwargs_accepted(self, mock_crud):
        from tools.manage_scheduler import manage_scheduler

        result = await manage_scheduler(
            action="create",
            task_name="Task",
            user_id="507f1f77bcf86cd799439011",
            prompt="Do stuff",
            next_execution_time="2026-07-01T09:00:00+08:00",
            injected_kwarg="ignored",
        )
        assert result is not None


# ---------------------------------------------------------------------------
# gmail_send
# ---------------------------------------------------------------------------

class TestGmailSend:
    """tools/gmail_send.py — authentication and API calls mocked."""

    @pytest.fixture(autouse=True)
    def _patch_gmail(self):
        with patch("tools.gmail_send._authenticate") as mock_auth, \
             patch("tools.gmail_send._build_message", return_value={"raw": "encoded"}):
            mock_service = MagicMock()
            mock_send = MagicMock(return_value=MagicMock(execute=MagicMock(return_value={"id": "msg_123"})))
            mock_service.users().messages().send = mock_send
            mock_auth.return_value = mock_service

            yield {
                "auth": mock_auth,
                "service": mock_service,
                "send": mock_send,
            }

    @pytest.mark.asyncio
    async def test_send_plain_text_email(self):
        from tools.gmail_send import gmail_send

        result = await gmail_send(
            to="user@example.com",
            subject="Hello",
            body="Plain text body",
        )
        assert result["success"] is True
        assert result["message_id"] == "msg_123"

    @pytest.mark.asyncio
    async def test_send_html_email(self):
        from tools.gmail_send import gmail_send

        result = await gmail_send(
            to="user@example.com",
            subject="Hello HTML",
            body="Fallback",
            html_body="<h1>Hello</h1>",
        )
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_user_id_kwarg_accepted(self):
        from tools.gmail_send import gmail_send

        result = await gmail_send(
            to="user@example.com",
            subject="Hi",
            body="Body",
            user_id="abc123",
        )
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_auth_failure_returns_error(self):
        from tools.gmail_send import gmail_send

        with patch("tools.gmail_send._authenticate", side_effect=Exception("no creds")):
            result = await gmail_send(to="x@y.com", subject="Hi", body="B")
        assert result["success"] is False
        assert "no creds" in result["error"]


# ---------------------------------------------------------------------------
# _call_tool dispatch (llm.py)
# ---------------------------------------------------------------------------

class TestCallToolDispatch:
    """LLM._call_tool — verifies the importlib-based dispatch and error handling."""

    @pytest.fixture()
    def mock_llm(self):
        """Minimal LLM-like object with just what _call_tool needs."""
        from chatbot.llm import LLM

        llm = MagicMock(spec=LLM)
        llm.user_id = "507f1f77bcf86cd799439011"
        llm.tool_calling_history = {"ddgs_search": 0, "manage_user_memory": 0, "gmail_send": 0, "manage_scheduler": 0}

        # Bind the real _call_tool method to our mock
        llm._call_tool = LLM._call_tool.__get__(llm, LLM)
        return llm

    @pytest.mark.asyncio
    async def test_dispatch_ddgs_search(self, mock_llm):
        mock_result = [{"title": "Test", "href": "http://example.com", "body": "desc"}]

        mock_module = MagicMock()
        mock_module.ddgs_search = AsyncMock(return_value=mock_result)

        with patch("importlib.import_module", return_value=mock_module):
            result, status = await mock_llm._call_tool("ddgs_search", {"search_query": "test"})

        assert status is True
        assert result == mock_result
        mock_module.ddgs_search.assert_awaited_once_with(
            search_query="test", user_id="507f1f77bcf86cd799439011"
        )

    @pytest.mark.asyncio
    async def test_dispatch_manage_user_memory(self, mock_llm):
        mock_module = MagicMock()
        mock_module.manage_user_memory = AsyncMock(return_value=MagicMock(inserted_id="x"))

        with patch("importlib.import_module", return_value=mock_module):
            result, status = await mock_llm._call_tool(
                "manage_user_memory",
                {"action": "create", "preference": {"k": "v"}, "facts": ["f"]},
            )

        assert status is True
        mock_module.manage_user_memory.assert_awaited_once_with(
            action="create",
            preference={"k": "v"},
            facts=["f"],
            user_id="507f1f77bcf86cd799439011",
        )

    @pytest.mark.asyncio
    async def test_dispatch_gmail_send(self, mock_llm):
        mock_module = MagicMock()
        mock_module.gmail_send = AsyncMock(return_value={"success": True, "message_id": "msg_abc"})

        with patch("importlib.import_module", return_value=mock_module):
            result, status = await mock_llm._call_tool(
                "gmail_send",
                {"to": "a@b.com", "subject": "T", "body": "B"},
            )

        assert status is True
        assert result == {"success": True, "message_id": "msg_abc"}
        mock_module.gmail_send.assert_awaited_once_with(
            to="a@b.com", subject="T", body="B", user_id="507f1f77bcf86cd799439011"
        )

    @pytest.mark.asyncio
    async def test_dispatch_manage_scheduler(self, mock_llm):
        mock_module = MagicMock()
        mock_module.manage_scheduler = AsyncMock(return_value="507f1f77bcf86cd799439099")

        with patch("importlib.import_module", return_value=mock_module):
            result, status = await mock_llm._call_tool(
                "manage_scheduler",
                {"action": "create", "task_name": "T", "prompt": "P", "next_execution_time": "2026-07-01T09:00:00+08:00"},
            )

        assert status is True
        assert result == "507f1f77bcf86cd799439099"
        mock_module.manage_scheduler.assert_awaited_once_with(
            action="create",
            task_name="T",
            prompt="P",
            next_execution_time="2026-07-01T09:00:00+08:00",
            user_id="507f1f77bcf86cd799439011",
        )

    @pytest.mark.asyncio
    async def test_manage_scheduler_counter_incremented(self, mock_llm):
        mock_module = MagicMock()
        mock_module.manage_scheduler = AsyncMock(return_value=True)

        with patch("importlib.import_module", return_value=mock_module):
            await mock_llm._call_tool(
                "manage_scheduler",
                {"action": "delete", "scheduler_id": "507f1f77bcf86cd799439099"},
            )

        assert mock_llm.tool_calling_history["manage_scheduler"] == 1

    @pytest.mark.asyncio
    async def test_dispatch_unknown_tool_returns_error(self, mock_llm):
        with patch("importlib.import_module", side_effect=ModuleNotFoundError("tools.nonexistent")):
            result, status = await mock_llm._call_tool("nonexistent", {})

        assert status is False
        assert "Error calling tool" in result

    @pytest.mark.asyncio
    async def test_dispatch_tool_exception_returns_error(self, mock_llm):
        mock_module = MagicMock()
        mock_module.ddgs_search = AsyncMock(side_effect=RuntimeError("boom"))

        with patch("importlib.import_module", return_value=mock_module):
            result, status = await mock_llm._call_tool("ddgs_search", {"search_query": "x"})

        assert status is False
        assert "boom" in result

    @pytest.mark.asyncio
    async def test_user_id_injected_into_args(self, mock_llm):
        mock_module = MagicMock()
        mock_module.ddgs_search = AsyncMock(return_value=[])

        with patch("importlib.import_module", return_value=mock_module):
            await mock_llm._call_tool("ddgs_search", {"search_query": "q"})

        call_kwargs = mock_module.ddgs_search.call_args[1]
        assert call_kwargs["user_id"] == "507f1f77bcf86cd799439011"

    @pytest.mark.asyncio
    async def test_tool_call_counter_incremented(self, mock_llm):
        mock_module = MagicMock()
        mock_module.ddgs_search = AsyncMock(return_value=[])

        with patch("importlib.import_module", return_value=mock_module):
            await mock_llm._call_tool("ddgs_search", {"search_query": "q"})

        assert mock_llm.tool_calling_history["ddgs_search"] == 1

    @pytest.mark.asyncio
    async def test_gmail_send_counter_incremented(self, mock_llm):
        mock_module = MagicMock()
        mock_module.gmail_send = AsyncMock(return_value={"success": True, "message_id": "id"})

        with patch("importlib.import_module", return_value=mock_module):
            await mock_llm._call_tool("gmail_send", {"to": "x@y.com", "subject": "S", "body": "B"})

        assert mock_llm.tool_calling_history["gmail_send"] == 1


# ---------------------------------------------------------------------------
# Tool definitions (tools.json) — schema sanity
# ---------------------------------------------------------------------------

class TestToolDefinitions:
    """Verify tools.json is well-formed and matches implementations."""

    @pytest.fixture()
    def tools(self):
        tools_path = Path(__file__).parent.parent / "tools" / "tools.json"
        with open(tools_path, encoding="utf-8") as f:
            return json.load(f)

    def test_six_tools_defined(self, tools):
        assert len(tools) == 6

    def test_ddgs_search_schema(self, tools):
        fn = next(t for t in tools if t["name"] == "ddgs_search")
        assert fn["type"] == "function"
        params = fn["parameters"]
        assert "search_query" in params["properties"]
        assert "search_type" in params["properties"]
        assert params["properties"]["search_type"]["enum"] == ["text", "news", "image", "video"]
        assert "search_query" in params["required"]

    def test_manage_user_memory_schema(self, tools):
        fn = next(t for t in tools if t["name"] == "manage_user_memory")
        assert fn["type"] == "function"
        params = fn["parameters"]
        assert "action" in params["properties"]
        assert params["properties"]["action"]["enum"] == ["create", "update", "delete"]
        assert "action" in params["required"]

    def test_gmail_send_schema(self, tools):
        fn = next(t for t in tools if t["name"] == "gmail_send")
        assert fn["type"] == "function"
        params = fn["parameters"]
        assert "to" in params["properties"]
        assert "subject" in params["properties"]
        assert "body" in params["properties"]
        assert "html_body" in params["properties"]
        assert "to" in params["required"]
        assert "subject" in params["required"]
        assert "body" in params["required"]

    def test_manage_scheduler_schema(self, tools):
        fn = next(t for t in tools if t["name"] == "manage_scheduler")
        assert fn["type"] == "function"
        params = fn["parameters"]
        assert "action" in params["properties"]
        assert params["properties"]["action"]["enum"] == ["create", "read", "update", "delete"]
        assert "scheduler_id" in params["properties"]
        assert "task_name" in params["properties"]
        assert "prompt" in params["properties"]
        assert "next_execution_time" in params["properties"]
        assert "repeating" in params["properties"]
        assert "changes" in params["properties"]
        assert "find_many" in params["properties"]
        assert "action" in params["required"]

    def test_tool_names_match_module_functions(self, tools):
        """Each tool name must correspond to an importable module with that function."""
        for tool in tools:
            name = tool["name"]
            mod = importlib.import_module(f"tools.{name}")
            assert hasattr(mod, name), f"tools.{name} has no function '{name}'"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
