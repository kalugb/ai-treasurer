"""Agent tools that make Excel files.

- load_skill: the editable formatting/usage guidance (services/ai/skills/excel.md).
- generate_report: real figures read from the database, scoped to the user's org like the treasury tools.
- generate_spreadsheet: a table the AI writes itself; the file is marked "Prepared by AI".

The tools only BUILD the file in memory (AgentContext.files). The agent router uploads it and records it
on the chat turn after the run, so these tools never write to any store.
"""
from typing import Literal

from langchain_core.tools import tool
from langgraph.runtime import get_runtime
from pydantic import BaseModel, Field

from services.ai import excel
from services.ai.tools import treasury_tools as tt
from services.ai.tools.treasury_tools import AgentContext

MAX_FILES_PER_TURN = 3


class SheetIn(BaseModel):
    name: str = Field(description="Sheet name, under 31 characters.")
    columns: list[str] = Field(description="Column headers, left to right.")
    rows: list[list[str | float | int | None]] = Field(description="Data rows; each row has one value per column.")
    money_columns: list[str] = Field(default_factory=list, description="Columns holding amounts (plain numbers, no 'RM').")
    date_columns: list[str] = Field(default_factory=list, description="Columns holding dates as YYYY-MM-DD.")


def _add_file(ctx: AgentContext, title: str, sheets: list[dict], ai_made: bool, kind: str) -> str:
    try:
        data = excel.build_workbook(title, sheets, excel.load_style(), ai_made=ai_made)
    except ValueError as e:
        return f"Not created: {e}"
    name = excel.safe_filename(title)
    rows = sum(len(s.get("rows") or []) for s in sheets)
    done = f"Created '{name}' ({rows} row{'s' if rows != 1 else ''}). It is attached below your reply. The task is done: now reply to the user in one or two sentences, do not call more tools."
    # small models sometimes repeat the same call: keep one file per name (the latest) instead of duplicates
    for i, f in enumerate(ctx.files):
        if f["name"] == name:
            ctx.files[i] = {"name": name, "data": data, "kind": kind, "rows": rows}
            return done
    if len(ctx.files) >= MAX_FILES_PER_TURN:
        return f"Not created: at most {MAX_FILES_PER_TURN} files per message."
    ctx.files.append({"name": name, "data": data, "kind": kind, "rows": rows})
    return done


@tool
def load_skill(name: Literal["excel"]) -> str:
    """Read the guidance for making Excel files. Call this once before generate_report or
    generate_spreadsheet, whenever the user asks for a spreadsheet, Excel/xlsx file, download or export."""
    ctx = get_runtime(AgentContext).context
    if name in ctx.skills_loaded:
        return "Already loaded above. Now call generate_report (real data) or generate_spreadsheet (your own table)."
    ctx.skills_loaded.add(name)
    return excel.load_guidance() or "No guidance available; keep files short and clearly titled."


@tool
def generate_report(kind: Literal["team_receipts", "budget_overview"], team_name: str | None = None) -> str:
    """Make an Excel file from the user's REAL treasury data (exact figures, read from the database).
    kind="team_receipts" lists receipts: one team's when team_name is given, otherwise EVERY team's
    (one sheet with a Team column); kind="budget_overview" lists every team's budget, spent and remaining.
    Always use this for real figures instead of generate_spreadsheet. Read-only."""
    ctx = get_runtime(AgentContext).context
    teams, error = tt._scope(ctx)
    if error:
        return error
    if not teams:
        return "There are no teams in this organization yet."

    if kind == "budget_overview":
        rows = []
        for team in teams:
            budget = team.get("budget") or 0
            used, count = tt._team_used(team["_id"])
            rows.append([team.get("name") or "Unnamed team", budget, round(used, 2), round(budget - used, 2), count])
        sheet = {"name": "Budget overview", "columns": ["Team", "Budget", "Spent", "Remaining", "Receipts"],
                 "rows": rows, "money_columns": ["Budget", "Spent", "Remaining"]}
        return _add_file(ctx, "Budget overview", [sheet], ai_made=False, kind="report")

    if team_name and team_name.strip():
        name = team_name.strip().lower()
        picked = [t for t in teams if (t.get("name") or "").strip().lower() == name]
        if not picked:
            owned = ", ".join(t.get("name") or "Unnamed" for t in teams) or "none"
            return f"No team named '{team_name}' in your organization. Your teams: {owned}. Leave team_name empty for every team."
    else:
        picked = teams

    columns = ["Team", "Date", "Receipt", "Label", "Notes", "Source", "Amount", "Reimbursement", "Duplicate"]
    counted, excluded = [], []
    for team in picked:
        receipts = list(tt._mongo[tt.RECEIPTS_COLLECTION].find({"departmentID": team["_id"]}))
        states = tt._reimbursement_states(receipts)
        dupes = tt._duplicate_states(receipts)
        for r in sorted(receipts, key=lambda d: tt._receipt_date(d), reverse=True):
            dupe = dupes.get(str(r["_id"]))
            local = r.get("createdFrom") == "local_upload"
            amount = r.get("receiptAmount") or 0.0
            row = [
                team.get("name") or "Unnamed team",
                tt._receipt_date(r), r.get("receiptName") or "Unnamed", r.get("label"), r.get("description"),
                "Local upload" if local else "Google Drive",
                amount if (amount or local) else None,  # a Drive receipt nobody set an amount on stays blank
                states[tt._receipt_key(r)],
                ("Needs review" if dupe["status"] == "pending" else "Confirmed" if dupe["excluded"] else "Not a duplicate") if dupe else None,
            ]
            (excluded if dupe and dupe["excluded"] else counted).append(row)
    if len(picked) == 1:  # one team: the Team column would repeat the title on every row
        columns = columns[1:]
        counted, excluded = [r[1:] for r in counted], [r[1:] for r in excluded]
    if not counted and not excluded:
        return f"{picked[0].get('name')} has no receipts yet." if len(picked) == 1 else "There are no receipts in this organization yet."
    sheets = [{"name": "Receipts", "columns": columns, "rows": counted, "money_columns": ["Amount"], "date_columns": ["Date"]}]
    if excluded:  # confirmed duplicates aren't real expenses: kept for reference, out of the main total
        sheets.append({"name": "Excluded duplicates", "columns": columns, "rows": excluded, "money_columns": ["Amount"], "date_columns": ["Date"]})
    title = f"{picked[0].get('name') or 'Team'} receipts" if len(picked) == 1 else "All team receipts"
    return _add_file(ctx, title, sheets, ai_made=False, kind="report")


@tool
def generate_spreadsheet(title: str, sheets: list[SheetIn]) -> str:
    """Make an Excel file from a table YOU write (a plan, template, checklist or comparison).
    Never use it for the user's real receipts or budgets: use generate_report for those.
    The file is marked as prepared by AI. Put amounts as plain numbers and list them in money_columns."""
    ctx = get_runtime(AgentContext).context
    specs = [s.model_dump() if isinstance(s, BaseModel) else dict(s) for s in sheets]
    return _add_file(ctx, title, specs, ai_made=True, kind="ai")
