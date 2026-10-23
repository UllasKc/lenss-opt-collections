#!/usr/bin/env python3
"""One-command deploy of LensS Collections for Optus into a Databricks workspace.

    python deploy/deploy.py --config deploy/config/<config>.json

Creates/updates, idempotently and in order:
  schemas    catalog (optional) + bronze/silver/gold/context schemas + raw_files volume
  ingest     uploads the Optus workbook, lands its 4 sheets as bronze/context tables
  context    governance tables that are not in the workbook (SQL controls, known limits)
  transform  silver typed table, gold rules, 1 metric view, 11 certified views
  views      the Command Center views (qry_cc_*)
  summary    writes the Command Center's executive summary to gold.exec_summary (no LLM)
  genie      Genie space: sources, instructions, examples, benchmarks
  lakebase   Postgres project/database + chat-history/usage schema
  app        Databricks App (create/update, bind resources, grants, deploy)
  smoke      end-to-end test of the deployed URL (needs LENSS_SMOKE_CLIENT_ID/SECRET)

Run a subset with --only ingest,transform or --skip smoke. Everything goes
through the `databricks` CLI, so it uses whatever auth the CLI profile has
(the VS Code extension's OAuth login, or DATABRICKS_HOST/DATABRICKS_TOKEN).
"""
from __future__ import annotations

import argparse
from datetime import date, timedelta
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DEPLOY_DIR = Path(__file__).resolve().parent
REPO_DIR = DEPLOY_DIR.parent
STEPS = ["schemas", "ingest", "context", "transform", "views", "summary", "genie", "lakebase", "app", "smoke", "routing",
         "org-smoke", "org-routing"]
# Run only when named in --only: the live routing test takes 10-15 minutes and real engine calls; the org tests
# (organisation workspace only) take about 40 and 30 minutes.
ON_REQUEST = {"routing", "org-smoke", "org-routing"}
# The personal (Free Edition) workspace: the org tests refuse to run there (cost).
PERSONAL_WORKSPACE_IDS = {"7474660150071734"}

SHEETS = {  # sheet name -> (layer, table)
    "Collections_Fact": ("bronze", "fact_collections_snapshot"),
    "Data_Dictionary": ("context", "data_dictionary"),
    "Scenario_Guide": ("context", "scenario_guide"),
    "Sample_BI_Questions": ("context", "sample_bi_questions"),
}


# Windows consoles often can't print every character; replace them rather than crash the deploy.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


class DeployError(RuntimeError):
    pass


# --------------------------------------------------------------------------- CLI

class Databricks:
    def __init__(self, profile: str | None):
        exe = os.environ.get("DATABRICKS_CLI_PATH") or shutil.which("databricks")
        if not exe:
            raise DeployError(
                "Databricks CLI not found. Install it (winget install Databricks.DatabricksCLI, "
                "or brew install databricks) or set DATABRICKS_CLI_PATH."
            )
        self.exe = exe
        self.profile = profile

    def run(self, *args: str, json_body: dict | None = None, check: bool = True, output_json: bool = True):
        cmd = [self.exe, *args]
        if self.profile:
            cmd += ["--profile", self.profile]
        tmp = None
        if json_body is not None:
            tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8")
            json.dump(json_body, tmp)
            tmp.close()
            cmd += ["--json", f"@{tmp.name}"]
        if output_json:
            cmd += ["-o", "json"]
        try:
            # cwd=REPO_DIR: never run inside the app folder, whose AppKit-generated
            # databricks.yml would otherwise hijack the target host.
            proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", cwd=REPO_DIR)
        finally:
            if tmp:
                os.unlink(tmp.name)
        if proc.returncode != 0:
            if check:
                raise DeployError(f"`databricks {' '.join(args)}` failed:\n{proc.stderr.strip() or proc.stdout.strip()}")
            return None
        out = proc.stdout.strip()
        if not output_json:
            return out
        if not out:
            return {}
        try:
            return json.loads(out)
        except json.JSONDecodeError:
            return out


# --------------------------------------------------------------------------- SQL

def split_sql(text: str) -> list[str]:
    """Splits on ';' outside $$...$$ blocks and single-quoted strings; drops -- comment lines."""
    lines = [ln for ln in text.splitlines() if not ln.strip().startswith("--")]
    text = "\n".join(lines)
    out, buf, i, in_dollar, in_quote = [], [], 0, False, False
    while i < len(text):
        if not in_quote and text.startswith("$$", i):
            in_dollar = not in_dollar
            buf.append("$$")
            i += 2
            continue
        ch = text[i]
        if not in_dollar and ch == "'":
            if in_quote and text.startswith("''", i):
                buf.append("''")
                i += 2
                continue
            in_quote = not in_quote
        if ch == ";" and not in_dollar and not in_quote:
            stmt = "".join(buf).strip()
            if stmt:
                out.append(stmt)
            buf = []
        else:
            buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


class Sql:
    def __init__(self, db: Databricks, warehouse_id: str):
        self.db, self.warehouse_id = db, warehouse_id

    def execute(self, statement: str) -> list[list]:
        resp = self.db.run(
            "api", "post", "/api/2.0/sql/statements",
            json_body={"statement": statement, "warehouse_id": self.warehouse_id, "wait_timeout": "50s"},
        )
        while resp["status"]["state"] in ("PENDING", "RUNNING"):
            time.sleep(2)
            resp = self.db.run("api", "get", f"/api/2.0/sql/statements/{resp['statement_id']}")
        if resp["status"]["state"] != "SUCCEEDED":
            msg = resp["status"].get("error", {}).get("message", resp["status"]["state"])
            raise DeployError(f"SQL failed: {msg}\n--- statement ---\n{statement[:600]}")
        return resp.get("result", {}).get("data_array", []) or []

    def run_file(self, path: Path, cfg: dict, rules: dict | None = None) -> None:
        text = path.read_text(encoding="utf-8")
        text = text.replace("{{catalog}}", cfg["catalog"]).replace("{{prefix}}", cfg["schema_prefix"])
        # {{live:<name>}}: the rule read live from gold.qry_rules when the view is queried, so a changed
        # value in business_rules_config moves the view's figures at once.
        text = re.sub(r"\{\{live:([a-z0-9_]+)\}\}",
                      lambda m: f"(SELECT {m.group(1)} FROM {cfg['catalog']}.{cfg['schema_prefix']}_gold.qry_rules)", text)
        # {{rule:<name>}}: a value from gold.business_rules_config, for SQL that can't read the table
        # at query time (metric views); {{rule:<name>+1}} / {{rule:<name>-1}} for a band's next or
        # last value. A missing or unset rule stops the deploy rather than guessing.
        def fill(m: re.Match) -> str:
            name, offset = m.group(1), int(m.group(2) or 0)
            if not rules or rules.get(name) is None:
                raise DeployError(f"{path.name} uses {{{{rule:{name}}}}} but business_rules_config has no value for '{name}'")
            return f"{float(rules[name]) + offset:g}"
        text = re.sub(r"\{\{rule:([a-z0-9_]+)([+-]\d+)?\}\}", fill, text)
        stmts = split_sql(text)
        for n, stmt in enumerate(stmts, 1):
            first = " ".join(stmt.split())[:90]
            log(f"  {path.name} [{n}/{len(stmts)}] {first}")
            self.execute(stmt)


# --------------------------------------------------------------------------- helpers

def ident(name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise DeployError(f"Unsafe identifier in config: {name!r}")
    return name


def load_config(path: Path) -> dict:
    cfg = json.loads(path.read_text(encoding="utf-8"))
    defaults = {
        "profile": None,
        "create_catalog": False,
        "schema_prefix": "optus_collections",
        "warehouse_id": None,
        "warehouse_name": None,
        "xlsx_path": "Data/Optus_GenBI_Collections_Demo_Data_v2.xlsx",
        "genie_space_title": "LensS Optus Collections Analytics",
        "genie_space_id": None,
        "lakebase_project": "lenss-optus-collections",
        "lakebase_database": "chatapp",
        "app_name": "lenss-optus-collections",
        "app_dir": "appkit-genie-app",
        "app_workspace_path": None,
        "readers_group": None,
        # Optional chat model that names chat sessions, e.g. "databricks-meta-llama-3-3-70b-instruct".
        # Off by default: sessions are named from the first question.
        "title_endpoint": None,
        # Answer cache (DATABRICKS_IMPLEMENTATION_GUIDE.md, Step 8e): reuse answers to standalone
        # questions until the data or Genie changes, and pre-warm the 10 suggested questions.
        "answer_cache": True,
        "prewarm_suggestions": True,
        # The app stops itself after this many minutes without use (Databricks Apps never stop on their
        # own and bill while running). 0 = never. Someone with CAN_MANAGE on the app starts it again.
        "idle_stop_minutes": 60,
        # People who start the app before demos: CAN_MANAGE on the app (Start needs it) and read access
        # to its source folder. Give the group Workspace access only (no SQL, no admin).
        "demo_givers_group": None,
        # Other users or groups who may start the app (read access to its source folder).
        "app_starters": [],
    }
    for k, v in defaults.items():
        cfg.setdefault(k, v)
    for key in ("catalog", "schema_prefix"):
        ident(cfg[key])
    # Checked up front so a bad name fails before anything is created (Lakebase and Apps reject
    # underscores and capitals in these IDs).
    for key in ("lakebase_project", "lakebase_database", "app_name"):
        if not re.fullmatch(r"[a-z]([a-z0-9-]{0,61}[a-z0-9])?", str(cfg[key])):
            raise DeployError(f"{key} must be lowercase letters, digits and hyphens, starting with a letter "
                              f"(no underscores), got {cfg[key]!r}")
    return cfg


def state_path(cfg_path: Path) -> Path:
    return DEPLOY_DIR / ".state" / f"{cfg_path.stem}.json"


def load_state(cfg_path: Path) -> dict:
    p = state_path(cfg_path)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def save_state(cfg_path: Path, state: dict) -> None:
    p = state_path(cfg_path)
    p.parent.mkdir(exist_ok=True)
    p.write_text(json.dumps(state, indent=2), encoding="utf-8")


# --------------------------------------------------------------------------- steps

def step_preflight(db: Databricks, cfg: dict, state: dict) -> None:
    me = db.run("current-user", "me")
    state["user"] = me["userName"]
    log(f"Authenticated as {state['user']}")

    wh_id = cfg["warehouse_id"]
    if not wh_id:
        whs = db.run("warehouses", "list")
        whs = whs if isinstance(whs, list) else whs.get("warehouses", [])
        if cfg["warehouse_name"]:
            whs = [w for w in whs if w["name"] == cfg["warehouse_name"]]
        if not whs:
            raise DeployError("No matching SQL warehouse found — set warehouse_id or warehouse_name in the config.")
        wh_id = whs[0]["id"]
    state["warehouse_id"] = wh_id
    wh = db.run("warehouses", "get", wh_id)
    if wh.get("state") != "RUNNING":
        log(f"Starting warehouse {wh['name']} ({wh_id})…")
        db.run("warehouses", "start", wh_id)
    log(f"Using warehouse {wh['name']} ({wh_id})")


def step_schemas(sql: Sql, cfg: dict) -> None:
    c, p = cfg["catalog"], cfg["schema_prefix"]
    if cfg["create_catalog"]:
        sql.execute(f"CREATE CATALOG IF NOT EXISTS {c}")
    for layer in ("bronze", "silver", "gold", "context"):
        sql.execute(f"CREATE SCHEMA IF NOT EXISTS {c}.{p}_{layer}")
    sql.execute(f"CREATE VOLUME IF NOT EXISTS {c}.{p}_bronze.raw_files")
    log(f"Schemas {c}.{p}_{{bronze,silver,gold,context}} and volume raw_files ready")


def step_ingest(db: Databricks, sql: Sql, cfg: dict) -> None:
    import pandas as pd  # imported lazily so other steps don't need pandas

    c, p = cfg["catalog"], cfg["schema_prefix"]
    xlsx = (REPO_DIR / cfg["xlsx_path"]).resolve()
    if not xlsx.exists():
        raise DeployError(f"Workbook not found: {xlsx}")
    volume = f"/Volumes/{c}/{p}_bronze/raw_files"
    log(f"Reading {xlsx.name}")
    # Text such as 'N/A' (no contact) and 'None' (no porting) is data here, not missing: keep it as written.
    sheets = pd.read_excel(xlsx, sheet_name=None, keep_default_na=False, na_values=[""])
    missing = set(SHEETS) - set(sheets)
    if missing:
        raise DeployError(f"Workbook is missing sheets: {sorted(missing)}")

    db.run("fs", "cp", str(xlsx), f"dbfs:{volume}/{xlsx.name}", "--overwrite", output_json=False)
    with tempfile.TemporaryDirectory() as tmp:
        for sheet, (layer, table) in SHEETS.items():
            df = sheets[sheet].copy()
            for col in df.columns:
                if pd.api.types.is_datetime64_any_dtype(df[col]):
                    df[col] = df[col].dt.strftime("%Y-%m-%d")
                elif df[col].dtype == "object":
                    # e.g. README's Detail column mixes strings with a real date
                    df[col] = df[col].map(lambda x: None if pd.isna(x) else str(x))
            csv = Path(tmp) / f"{sheet}.csv"
            df.to_csv(csv, index=False)
            db.run("fs", "cp", str(csv), f"dbfs:{volume}/{sheet}.csv", "--overwrite", output_json=False)

            src = (f"read_files('{volume}/{sheet}.csv', format => 'csv', header => true, "
                   f"inferSchema => true, multiLine => true, escape => '\"')")
            cols = [r[0] for r in sql.execute(f"DESCRIBE QUERY SELECT * FROM {src}") if r[0] != "_rescued_data"]
            col_list = ", ".join(f"`{col}`" for col in cols)
            sql.execute(f"CREATE OR REPLACE TABLE {c}.{p}_{layer}.{table} AS SELECT {col_list} FROM {src}")
            count = sql.execute(f"SELECT COUNT(*) FROM {c}.{p}_{layer}.{table}")[0][0]
            if int(count) != len(df):
                raise DeployError(f"{table}: expected {len(df)} rows, loaded {count}")
            log(f"  {sheet} -> {p}_{layer}.{table} ({count} rows)")


def step_context(sql: Sql, cfg: dict) -> None:
    sql.run_file(DEPLOY_DIR / "sql" / "20_context_manual.sql", cfg)


def step_views(sql: Sql, cfg: dict) -> None:
    """Command Center views (70_command_center_views.sql): additive, safe to run on a shared gold schema."""
    sql.run_file(DEPLOY_DIR / "sql" / "70_command_center_views.sql", cfg, business_rules(sql, cfg))
    c, p = cfg["catalog"], cfg["schema_prefix"]
    (as_of, overdue, balance, promises) = sql.execute(
        f"SELECT CAST(As_Of_Date AS STRING), Overdue_Accounts, Overdue_Balance, Promises FROM {c}.{p}_gold.qry_cc_kpis")[0]
    log(f"Command Center views ready: as of {as_of}, {int(float(overdue)):,} overdue accounts owing {money(balance)}, "
        f"{int(float(promises)):,} promises to pay")


def business_rules(sql: Sql, cfg: dict) -> dict:
    """gold.business_rules_config as {rule_name: value}: the one source of every threshold."""
    rows = sql.execute(f"SELECT rule_name, threshold_value FROM {cfg['catalog']}.{cfg['schema_prefix']}_gold.business_rules_config")
    return {r[0]: (None if r[1] is None else float(r[1])) for r in rows}


def step_transform(sql: Sql, cfg: dict) -> None:
    for name in ("30_silver.sql", "40_gold_config.sql"):
        sql.run_file(DEPLOY_DIR / "sql" / name, cfg)
    # Metric views can't read a table at query time, so their thresholds are written in from the table.
    rules = business_rules(sql, cfg)
    for name in ("50_metric_views.sql", "60_certified_views.sql"):
        sql.run_file(DEPLOY_DIR / "sql" / name, cfg, rules)
    log(f"Business rules: {len(rules)} thresholds from gold.business_rules_config")
    c, p = cfg["catalog"], cfg["schema_prefix"]
    rows, accounts, promises = sql.execute(
        f"SELECT COUNT(*), COUNT(DISTINCT Account_ID), SUM(PTP_Flag) FROM {c}.{p}_gold.qry_account_month")[0]
    scen = dict(sql.execute(f"SELECT Scenario_ID, Accounts FROM {c}.{p}_gold.qry_scenario_summary"))
    log(f"Transform done — sanity check: {int(rows):,} account-months, {int(accounts):,} accounts, {int(promises):,} promises "
        f"(the v2 workbook: 180,000 / 15,000 / 15,648); scenarios at the latest snapshot "
        f"1={scen.get('1')} 2={scen.get('2')} 3={scen.get('3')} (Scenario_Guide: 339 / 115 / 473), 6={scen.get('6')}")


def money(v) -> str:
    v = float(v or 0)
    # Amounts are in Australian dollars (AUD).
    if abs(v) >= 1e9:
        return f"${v / 1e9:.2f}B"
    return f"${v / 1e6:.2f}M" if abs(v) >= 1e6 else f"${v / 1e3:.0f}K" if abs(v) >= 1e3 else f"${v:,.0f}"


def pct(v) -> str:
    return f"{float(v or 0) * 100:.1f}%"


def build_exec_summary(sql: Sql, gold: str) -> tuple[str, str]:
    """The Command Center's executive summary, written from the certified views.

    Deterministic on purpose: every number is read straight from gold, so the
    text can't drift from the dashboard, and it only changes when this step
    re-runs (after new data), not on every page load.
    """
    cols = ["As_Of_Date", "Overdue_Accounts", "Overdue_Balance", "Promises", "Promised_Amount", "Broken_Promises",
            "Broken_Rate", "Broken_Amount", "Broken_Rate_12M"]
    k = dict(zip(cols, sql.execute(f"SELECT CAST(As_Of_Date AS STRING), {', '.join(cols[1:])} FROM {gold}.qry_cc_kpis")[0]))
    calls = {r[0]: r[1] for r in sql.execute(f"SELECT Call_Outcome, Broken_Rate FROM {gold}.qry_fcr_vs_promises")}
    drivers = sql.execute(
        f"SELECT Factor, Segment, Broken_Rate, Factor_Strength FROM {gold}.qry_ptp_break_drivers "
        f"WHERE Meets_Min_Volume = 1 ORDER BY Factor_Order, Segment_Order, Segment")
    repeat = {r[0]: r[1] for r in sql.execute(f"SELECT Prior_Month_Outcome, Repeat_Rate FROM {gold}.qry_repeat_after_unresolved")}
    scen = {int(r[0]): int(r[1]) for r in sql.execute(f"SELECT Scenario_ID, Accounts FROM {gold}.qry_scenario_summary")}

    snapshot = k["As_Of_Date"]
    d = time.strptime(snapshot[:10], "%Y-%m-%d")
    day = f"{d.tm_mday} {time.strftime('%B %Y', d)}"
    parts = [
        f"As of {day}, {int(float(k['Overdue_Accounts'])):,} Optus accounts are overdue, owing {money(k['Overdue_Balance'])}.",
        f"Customers made {int(float(k['Promises'])):,} promises to pay this month, worth {money(k['Promised_Amount'])}; "
        f"{int(float(k['Broken_Promises'])):,} ({pct(k['Broken_Rate'])}) were broken, {money(k['Broken_Amount'])}, "
        f"against {pct(k['Broken_Rate_12M'])} over the 12 months.",
    ]
    fcr, xfer, unres = calls.get("Resolved first time"), calls.get("Transferred"), calls.get("Not resolved, not transferred")
    if fcr is not None and xfer is not None and unres is not None:
        parts.append(f"Promises break most where the call went wrong: {pct(xfer)} broke after a transferred call and "
                     f"{pct(unres)} after an unresolved call, against {pct(fcr)} when the call was resolved first time.")
    credit = [r for r in drivers if r[0] == "Credit score"]
    if len(credit) > 1:
        parts.append(f"Credit history matters too: {pct(credit[0][2])} broke with a credit score {credit[0][1].lower()}, "
                     f"against {pct(credit[-1][2])} at {credit[-1][1]}.")
    flat = [f.lower() for f in ("Product", "State", "Porting status", "Contract renewal window")
            if any(r[0] == f and r[3] == "Little difference" for r in drivers)]
    if flat:
        names = ", ".join(flat[:-1]) + " and " + flat[-1] if len(flat) > 1 else flat[0]
        parts.append(f"{names[0].upper()}{names[1:]} make{'s' if len(flat) == 1 else ''} little difference.")
    if repeat.get("Not resolved last month") is not None and repeat.get("Resolved first time last month") is not None:
        parts.append(f"Customers whose call was not resolved called again {pct(repeat['Not resolved last month'])} of the time "
                     f"the next month, against {pct(repeat['Resolved first time last month'])} after a first-time resolution.")
    if scen:
        parts.append(f"Scenarios this month: {scen.get(1, 0):,} upgrade-but-overdue, {scen.get(2, 0):,} porting out with a low "
                     f"credit score, {scen.get(3, 0):,} chronic late payers at renewal and {scen.get(6, 0):,} repeat callers "
                     f"after an unresolved call.")
    return " ".join(parts), snapshot


def step_summary(sql: Sql, cfg: dict) -> None:
    gold = f"{cfg['catalog']}.{cfg['schema_prefix']}_gold"
    narrative, snapshot = build_exec_summary(sql, gold)
    # When the data was last loaded (the ingest step), shown under the summary. The app
    # can only read gold, so it's stored here rather than looked up by the app.
    silver = f"{cfg['schema_prefix']}_silver"
    rows = sql.execute(f"SELECT CAST(MAX(last_altered) AS STRING) FROM {cfg['catalog']}.information_schema.tables "
                       f"WHERE table_schema = '{silver}' AND table_name = 'fact_collections_snapshot'")
    refreshed = f"TIMESTAMP '{rows[0][0]}'" if rows and rows[0][0] else "CAST(NULL AS TIMESTAMP)"
    escaped = narrative.replace("\\", "\\\\").replace("'", "\\'")
    # One row, rewritten every run (CREATE OR REPLACE also adds new columns to an older table).
    sql.execute(f"CREATE OR REPLACE TABLE {gold}.exec_summary "
                f"COMMENT 'Command Center executive summary, written by deploy.py from the certified views' AS "
                f"SELECT current_timestamp() AS generated_at, DATE '{snapshot}' AS snapshot_date, '{escaped}' AS narrative, "
                f"{refreshed} AS data_refreshed_at")
    log(f"Executive summary written ({len(narrative)} characters):\n    {narrative}")


def step_genie(db: Databricks, sql: Sql, cfg: dict, state: dict, cfg_path: Path) -> None:
    sys.path.insert(0, str(DEPLOY_DIR / "genie"))
    from space import build_serialized_space  # noqa: E402

    gold = f"{cfg['catalog']}.{cfg['schema_prefix']}_gold"
    # The instructions quote thresholds from gold.business_rules_config ({{rule:}} / {{pct:}} / {{pts:}}).
    serialized = json.dumps(build_serialized_space(gold, business_rules(sql, cfg)))
    title = cfg["genie_space_title"]
    space_id = state.get("genie_space_id") or cfg["genie_space_id"]

    if not space_id:
        token = None
        while True:
            args = ["genie", "list-spaces"] + (["--page-token", token] if token else [])
            page = db.run(*args)
            for s in page.get("spaces", []):
                if s.get("title") == title:
                    space_id = s["space_id"]
            token = page.get("next_page_token")
            if space_id or not token:
                break

    if space_id and db.run("genie", "get-space", space_id, check=False) is None:
        log(f"Genie space {space_id} no longer exists — creating a new one")
        space_id = None

    body = {
        "serialized_space": serialized,
        "title": title,
        "description": "Optus collections: promises to pay, why they break, the contact centre (FCR, transfers, repeats) and the Scenario Guide scenarios (LensS, powered by Concentrix).",
        "warehouse_id": state["warehouse_id"],
    }
    if space_id:
        db.run("genie", "update-space", space_id, json_body=body)
        log(f"Updated Genie space {space_id}")
    else:
        created = db.run("api", "post", "/api/2.0/genie/spaces",
                         json_body={**body, "parent_path": f"/Users/{state['user']}"})
        space_id = created["space_id"]
        log(f"Created Genie space {space_id} ({created.get('title')})")
    state["genie_space_id"] = space_id
    save_state(cfg_path, state)
    # Same instructions and sources → same answers, so only a real change counts.
    genie_version = hashlib.sha256(f"{space_id}|{serialized}".encode()).hexdigest()[:12]
    bump_cache_version(db, cfg, state, cfg_path, "genie", genie_version)


def pg_connect(db: Databricks, state: dict, database: str):
    import psycopg2  # noqa: E402

    cred = db.run("postgres", "generate-database-credential", state["lakebase_endpoint"])
    return psycopg2.connect(
        host=state["lakebase_host"], port=5432, dbname=database,
        user=state["user"], password=cred["token"], sslmode="require",
    )


def bump_cache_version(db: Databricks, cfg: dict, state: dict, cfg_path: Path, name: str, version: str) -> None:
    """Record a new data or Genie version so the app's answer cache moves on.

    The app keys cached answers by these versions, so bumping one makes every
    older answer unreachable and triggers a fresh pre-warm. Kept in the state
    file too, so a first deploy (Lakebase not created yet) still gets them.
    """
    versions = state.setdefault("cache_versions", {})
    if versions.get(name) == version:
        return
    versions[name] = version
    save_state(cfg_path, state)
    if "lakebase_host" in state:
        write_cache_versions(db, cfg, state)


def write_cache_versions(db: Databricks, cfg: dict, state: dict) -> None:
    versions = state.get("cache_versions") or {}
    if not versions:
        return
    try:
        conn = pg_connect(db, state, cfg["lakebase_database"])
        conn.autocommit = True
        with conn.cursor() as cur:
            for name, version in versions.items():
                cur.execute(
                    "INSERT INTO chatapp.cache_versions (name, version, updated_at) VALUES (%s, %s, now()) "
                    "ON CONFLICT (name) DO UPDATE SET version = EXCLUDED.version, updated_at = now() "
                    "WHERE chatapp.cache_versions.version <> EXCLUDED.version",
                    (name, version))
        conn.close()
        log(f"Answer cache versions: {', '.join(f'{k}={v}' for k, v in versions.items())}")
    except Exception as e:  # the cache is an optimisation; never fail a deploy over it
        log(f"WARNING: could not update answer-cache versions ({e}); cached answers may be stale until the next deploy")


def write_eval_cases(db: Databricks, cfg: dict, state: dict) -> None:
    """Seed the evaluation suite (ground-truth, red-team and policy cases) into Lakebase.

    Upserts by (category, question), so re-running updates expectations and SQL
    without touching cases added from the app's feedback queue or switched off there.
    """
    sys.path.insert(0, str(DEPLOY_DIR / "evals"))
    from cases import eval_cases  # noqa: E402

    gold = f"{cfg['catalog']}.{cfg['schema_prefix']}_gold"
    cases = eval_cases(gold)
    try:
        conn = pg_connect(db, state, cfg["lakebase_database"])
        conn.autocommit = True
        with conn.cursor() as cur:
            for category, question, mode, expected, expected_sql, source, notes in cases:
                cur.execute(
                    "INSERT INTO chatapp.eval_cases (category, question, mode, expected, expected_sql, source, notes) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                    "ON CONFLICT (category, question) DO UPDATE SET mode = EXCLUDED.mode, expected = EXCLUDED.expected, "
                    "expected_sql = EXCLUDED.expected_sql, source = EXCLUDED.source, notes = EXCLUDED.notes",
                    (category, question, mode, expected, expected_sql, source, notes))
        conn.close()
        counts = {c: sum(1 for x in cases if x[0] == c) for c in ("accuracy", "guardrail", "policy", "routing")}
        log(f"Evaluation cases: {counts['accuracy']} accuracy, {counts['guardrail']} guardrail, {counts['policy']} policy, {counts['routing']} routing")
    except Exception as e:  # evals are optional; never fail a deploy over them
        log(f"WARNING: could not seed evaluation cases ({e})")


def step_lakebase(db: Databricks, cfg: dict, state: dict, cfg_path: Path) -> None:
    project = f"projects/{cfg['lakebase_project']}"
    proj = db.run("postgres", "get-project", project, check=False)
    if proj is None:
        log(f"Creating Lakebase project {cfg['lakebase_project']} (takes a minute)…")
        proj = db.run("postgres", "create-project", cfg["lakebase_project"])
    branch = proj["status"]["default_branch"]

    endpoints = db.run("postgres", "list-endpoints", branch)
    endpoints = endpoints if isinstance(endpoints, list) else endpoints.get("endpoints", [])
    rw = [e for e in endpoints if e["status"].get("endpoint_type") == "ENDPOINT_TYPE_READ_WRITE"]
    if not rw:
        raise DeployError(f"No read-write endpoint on {branch}")
    # The pooled "-pooler" host rejects OAuth/SASL logins; always use the direct host.
    state["lakebase_host"] = rw[0]["status"]["hosts"]["host"]
    state["lakebase_endpoint"] = rw[0]["name"]

    roles = db.run("postgres", "list-roles", branch)
    roles = roles if isinstance(roles, list) else roles.get("roles", [])
    mine = [r for r in roles if r["status"].get("postgres_role") == state["user"]]
    if not mine:
        raise DeployError(f"No Postgres role for {state['user']} on {branch} — you need CAN_MANAGE on the project.")

    dbs = db.run("postgres", "list-databases", branch)
    dbs = dbs if isinstance(dbs, list) else dbs.get("databases", [])
    if not any(d["status"].get("postgres_database") == cfg["lakebase_database"] for d in dbs):
        db.run("postgres", "create-database", branch, "--database-id", cfg["lakebase_database"],
               json_body={"spec": {"role": mine[0]["name"], "postgres_database": cfg["lakebase_database"]}})
        log(f"Created database {cfg['lakebase_database']}")

    conn = pg_connect(db, state, cfg["lakebase_database"])
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute((DEPLOY_DIR / "lakebase" / "schema.sql").read_text(encoding="utf-8"))
    conn.close()
    state["lakebase_branch"] = branch
    save_state(cfg_path, state)
    write_cache_versions(db, cfg, state)
    write_eval_cases(db, cfg, state)
    log(f"Lakebase ready: {state['lakebase_host']} / {cfg['lakebase_database']}")


def write_app_yaml(app_dir: Path, cfg: dict, state: dict) -> None:
    gold = f"{cfg['catalog']}.{cfg['schema_prefix']}_gold"
    (app_dir / "app.yaml").write_text(
        "# Generated by deploy/deploy.py — edit the config, not this file.\n"
        "command: ['npm', 'run', 'start']\n"
        "env:\n"
        "  - name: DATABRICKS_GENIE_SPACE_ID\n    valueFrom: genie-space\n"
        "  - name: DATABRICKS_WAREHOUSE_ID\n    valueFrom: sql-warehouse\n"
        f"  - name: LENSS_GOLD_SCHEMA\n    value: {gold}\n"
        "  # Direct endpoint host, not the '-pooler' one (it rejects OAuth logins).\n"
        f"  - name: PGHOST\n    value: {state['lakebase_host']}\n"
        f"  - name: PGDATABASE\n    value: {cfg['lakebase_database']}\n"
        "  - name: PGPORT\n    value: '5432'\n"
        "  - name: PGSSLMODE\n    value: require\n"
        f"  - name: LAKEBASE_ENDPOINT\n    value: {state['lakebase_endpoint']}\n"
        + ("  - name: LENSS_TITLE_ENDPOINT\n    valueFrom: title-model\n" if state.get("title_endpoint") else "")
        + f"  - name: LENSS_ANSWER_CACHE\n    value: '{'on' if cfg.get('answer_cache', True) else 'off'}'\n"
        + f"  - name: LENSS_PREWARM\n    value: '{'on' if cfg.get('prewarm_suggestions', True) else 'off'}'\n"
        # Idle stop (server/lib/idleStop.ts): the app's own name, and minutes without use before it stops itself.
        + f"  - name: LENSS_APP_NAME\n    value: {cfg['app_name']}\n"
        + f"  - name: LENSS_IDLE_STOP_MINUTES\n    value: '{int(cfg.get('idle_stop_minutes') or 0)}'\n"
        # Semantic cache, guardrails and judge settings (only the parts that are on).
        + (f"  - name: LENSS_AI_CONFIG\n    value: '{json.dumps(state['ai_config'], separators=(',', ':'))}'\n"
           if state.get("ai_config") else ""),
        encoding="utf-8",
    )


def grant_use_catalog(sql: Sql, catalog: str, sp: str) -> bool:
    """USE CATALOG for the app's service principal. Returns False if it's still missing.

    Granting it needs MANAGE on the catalog (or ownership), which the person
    deploying into a shared catalog often doesn't have. Many shared catalogs
    already give USE CATALOG to `account users`, which every service principal
    belongs to, so that counts too. Otherwise this warns instead of failing,
    so everything else still deploys and only this one grant is left to an admin.
    """
    try:
        sql.execute(f"GRANT USE CATALOG ON CATALOG {catalog} TO `{sp}`")
        log(f"Granted USE CATALOG on {catalog} to the app's service principal")
        return True
    except DeployError as e:
        if "PERMISSION_DENIED" not in str(e):
            raise
    try:
        grants = sql.execute(f"SHOW GRANTS ON CATALOG {catalog}")
    except DeployError:
        grants = []
    for principal, action, *_ in grants:
        if principal in ("account users", sp) and action.replace("_", " ").upper() in ("USE CATALOG", "ALL PRIVILEGES"):
            log(f"USE CATALOG on {catalog} already comes from `{principal}`; no catalog grant needed")
            return True
    log(f"WARNING: you can't grant USE CATALOG on {catalog} (it needs MANAGE on the catalog), and it isn't "
        f"granted to `account users`. Ask the catalog owner or an admin to run:\n"
        f"    GRANT USE CATALOG ON CATALOG {catalog} TO `{sp}`;\n"
        f"  It only lets the app enter the catalog; data access still comes only from your schema grants. "
        f"Until then the app loads, but its dashboard and Genie answers fail.")
    return False


def check_page_scripts(app_dir: Path) -> None:
    """Stop the deploy if two page scripts declare the same top-level name.

    public/js/*.js load as classic scripts that share one global scope, so a function or const
    declared at the top of two files makes the second file fail to load (or silently replaces the
    first). A duplicate dayLabel in home.js and monitoring.js once stopped Observability loading.
    Names inside an IIFE ("(() => {" ... "})();" at the start of a line) are private and not counted.
    """
    seen: dict[str, list[str]] = {}
    decl = re.compile(r"^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)")
    for f in sorted((app_dir / "public" / "js").glob("*.js")):
        private = False
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.startswith("(() => {") or line.startswith("(function"):
                private = True
            elif line.startswith("})();") or line.startswith("}());"):
                private = False
            elif not private and (m := decl.match(line)):
                seen.setdefault(m.group(1) or m.group(2), []).append(f.name)
    dupes = {name: files for name, files in seen.items() if len(files) > 1}
    if dupes:
        raise DeployError("Page scripts declare the same top-level name in more than one file (the second file "
                          "would not load): " + "; ".join(f"{n} in {', '.join(fs)}" for n, fs in sorted(dupes.items()))
                          + ". Rename one, or wrap that file in (() => { ... })();")
    log("Page scripts: no top-level name declared in two files")


def grant_source_read(db: Databricks, cfg: dict, ws_path: str, sp: str) -> bool:
    """CAN_READ on the app's source folder for everyone who may start the app.

    Starting a stopped app re-runs its last deployment, which downloads the code from this folder
    (in the deployer's home directory), as the person pressing Start. The deployer's own access covers
    that; anyone else (a demo giver with CAN_MANAGE, after idle stop) fails with "Error downloading
    source code ... no files found". Read access goes to:
      - the app's service principal;
      - every user, group or service principal with a direct CAN_MANAGE on the app at deploy time;
      - config `app_starters`: extra users or groups who start the app, so people added later only
        need to join that group.
    One principal at a time, so a rejected entry (a deleted user, an unknown group) doesn't block the
    rest. Only this folder is shared, read-only; it holds the app code and app.yaml, no secrets.
    Never fails the deploy.
    """
    status = db.run("workspace", "get-status", ws_path, check=False) or {}
    obj = status.get("object_id") if isinstance(status, dict) else None
    if not obj:
        log(f"WARNING: couldn't look up {ws_path}; only the person who deployed will be able to start the app")
        return False
    acl = [{"service_principal_name": sp, "permission_level": "CAN_READ"}]
    perms = db.run("apps", "get-permissions", cfg["app_name"], check=False) or {}
    for e in perms.get("access_control_list", []):
        if not any(p.get("permission_level") == "CAN_MANAGE" and not p.get("inherited") for p in e.get("all_permissions", [])):
            continue
        for key in ("user_name", "group_name", "service_principal_name"):
            if e.get(key) and e[key] != sp and e[key] != "admins":
                acl.append({key: e[key], "permission_level": "CAN_READ"})
    for who in cfg.get("app_starters") or []:
        acl.append({"user_name" if "@" in who else "group_name": who, "permission_level": "CAN_READ"})
    shared, failed = [], []
    for entry in acl:
        who = entry.get("user_name") or entry.get("group_name") or entry.get("service_principal_name")
        try:
            db.run("workspace", "update-permissions", "directories", str(obj), json_body={"access_control_list": [entry]})
            shared.append(who)
        except DeployError as e:
            reason = " ".join(str(e).split("failed:", 1)[-1].split())[:220]
            failed.append(who)
            log(f"WARNING: couldn't give {who} read access to the app's source folder: {reason}")
    log(f"Source folder readable by {len(shared)} of {len(acl)}: the app's service principal"
        + (f" and {len(shared) - 1} app manager(s)/starter(s)" if len(shared) > 1 else "")
        + (". Those who failed can't start the app until the folder is shared with them (Workspace → folder → Share → Can Read)."
           if failed else ", so they can start the app"))
    return not failed


def project_family(cfg: dict) -> tuple[str, str, str]:
    """The names every version of this project shares: v2, v3... are deployments of one project
    (the "-v3" / "_v3" / " v3" suffixes are only for reference), so cost is never split between them.
    Returns (app name base, Genie space title base, schema prefix base)."""
    return (re.sub(r"-v\d+$", "", cfg["app_name"]),
            re.sub(r" v\d+$", "", cfg["genie_space_title"]),
            re.sub(r"_v\d+$", "", cfg["schema_prefix"]))


def platform_cost_view(db: Databricks, sql: Sql, cfg: dict, state: dict) -> bool:
    """gold.qry_platform_cost: this project's Databricks usage at list price, for the
    Observability cost page.

    "This project" is every version of it in the workspace (project_family: v1, v2 and v3 are
    one project). Every billing row of the workspace gets a scope and the share that is this project's:
      - project (share 1): its apps' compute (APPS, by app name) and its Genie spaces (GENIE, by space ID);
      - other (share 0): other apps and Genie spaces, and other SQL warehouses;
      - shared: the SQL warehouse, Lakebase, model serving, storage and the rest, which other
        projects in the workspace may use too. Its share is worked out PER DAY: this project's
        part of that day's warehouse query time (system.query.history statements naming this
        project's schemas), the only usage signal the system tables give for shared services.
        Before the project's first day (its first app or Genie usage) the share is 0. Days after
        the last deploy use the share of the latest 7 days with queries. Query history shows each
        reader only their own queries (even through a view), so the shares are worked out here,
        as the person deploying, and written into the view. If query history can't be read,
        shared services count in full from the first day.
    Genie's free allowance (GENIE_FREE_USAGE) has no list price, so it is kept with cost 0.

    A view runs with its owner's access to the tables beneath it, so the app reads the
    system tables through this view with only its SELECT on gold: no grant on the system
    catalog (which needs a metastore admin). The view is not in the Genie space.
    """
    ws = state.get("workspace_id")
    if not ws:
        log("WARNING: workspace ID unknown (not in the app URL); skipping the cost view")
        return False
    gold = f"{cfg['catalog']}.{cfg['schema_prefix']}_gold"
    app_base, title_base, prefix = project_family(cfg)
    wh = state["warehouse_id"]
    # This project's Genie spaces: every version's, by title (deleted spaces can't be listed).
    spaces, token = {state.get("genie_space_id") or ""}, None
    while True:
        page = db.run(*(["genie", "list-spaces"] + (["--page-token", token] if token else [])), check=False) or {}
        spaces |= {s["space_id"] for s in page.get("spaces", []) if re.fullmatch(re.escape(title_base) + r"( v\d+)?", s.get("title", ""))}
        token = page.get("next_page_token")
        if not token:
            break
    space_list = ", ".join(f"'{s}'" for s in sorted(spaces) if s)
    app_match = f"(u.usage_metadata.app_name = '{app_base}' OR u.usage_metadata.app_name RLIKE '^{re.escape(app_base)}-v[0-9]+$')"
    space_in = space_list or "''"
    space_match = f"u.usage_metadata.genie.agent_id IN ({space_in})"

    def create(since: str, daily: dict, default: float) -> None:
        # One row per day with a measured share; other days after `since` use `default`.
        rows = ", ".join(f"(DATE'{d}', {s:.4f})" for d, s in sorted(daily.items()))
        shares = (f"SELECT * FROM VALUES {rows} AS t(share_date, share)" if rows
                  else "SELECT CAST(NULL AS DATE) AS share_date, CAST(NULL AS DOUBLE) AS share WHERE FALSE")
        sql.execute(f"""
            CREATE OR REPLACE VIEW {gold}.qry_platform_cost AS
            WITH priced AS (
              SELECT u.usage_date, u.billing_origin_product AS product, u.sku_name AS sku, u.usage_unit AS unit,
                     CASE WHEN u.billing_origin_product = 'APPS' THEN IF({app_match}, 'project', 'other')
                          WHEN u.billing_origin_product = 'GENIE' THEN IF({space_match}, 'project', 'other')
                          WHEN u.billing_origin_product = 'SQL' THEN IF(u.usage_metadata.warehouse_id = '{wh}', 'shared', 'other')
                          ELSE 'shared' END AS scope,
                     u.usage_quantity AS quantity,
                     u.usage_quantity * COALESCE(p.pricing.default, 0) AS cost,
                     p.currency_code, u.usage_end_time
              FROM system.billing.usage u
              LEFT JOIN system.billing.list_prices p
                ON u.sku_name = p.sku_name AND u.cloud = p.cloud AND u.usage_unit = p.usage_unit
               AND u.usage_end_time >= p.price_start_time
               AND (p.price_end_time IS NULL OR u.usage_end_time < p.price_end_time)
              WHERE u.workspace_id = '{ws}'
            ), shares AS ({shares})
            SELECT usage_date, product, sku, unit, scope,
                   CASE WHEN scope = 'project' THEN 1.0 WHEN scope = 'other' THEN 0.0
                        WHEN usage_date < DATE'{since}' THEN 0.0
                        ELSE COALESCE(MAX(shares.share), {default:.4f}) END AS project_share,
                   SUM(quantity) AS quantity, SUM(cost) AS cost,
                   MAX(currency_code) AS currency, MAX(usage_end_time) AS data_through
            FROM priced LEFT JOIN shares ON priced.usage_date = shares.share_date
            GROUP BY usage_date, product, sku, unit, scope""")

    try:
        # The project's first day: its first app or Genie usage in this workspace.
        first = sql.execute(f"""
            SELECT CAST(MIN(u.usage_date) AS STRING) FROM system.billing.usage u
            WHERE u.workspace_id = '{ws}' AND ((u.billing_origin_product = 'APPS' AND {app_match})
                                            OR (u.billing_origin_product = 'GENIE' AND {space_match}))""")
        since = (first[0][0] if first and first[0][0] else time.strftime("%Y-%m-%d"))
        try:
            rows = sql.execute(f"""
                SELECT CAST(DATE(start_time) AS STRING),
                       SUM(CASE WHEN INSTR(LOWER(statement_text), '{prefix.lower()}_') > 0 THEN total_duration_ms ELSE 0 END),
                       SUM(total_duration_ms)
                FROM system.query.history
                WHERE workspace_id = '{ws}' AND compute.warehouse_id = '{wh}' AND start_time >= DATE'{since}'
                GROUP BY 1 HAVING SUM(total_duration_ms) > 0 ORDER BY 1""")
            daily = {d: float(mine) / float(total) for d, mine, total in rows}
            # The same 7 calendar days for every project (up to the warehouse's last day with queries),
            # so on days without queries the projects' default shares still add up to at most 1.
            last = rows[-1][0] if rows else None
            recent = [r for r in rows if last and r[0] > (date.fromisoformat(last) - timedelta(days=7)).isoformat()]
            default = (sum(float(r[1]) for r in recent) / sum(float(r[2]) for r in recent)) if recent else 1.0
            how = (f"shared services split per day by warehouse query time from {since}, "
                   f"{len(daily)} days; latest 7 days {default:.0%}")
        except (DeployError, TypeError, ValueError, ZeroDivisionError) as e:
            log(f"Query history not readable ({str(e).splitlines()[0][:120] if str(e) else e!r}); shared services count in full")
            daily, default, how = {}, 1.0, f"shared services counted in full from {since}"
        create(since, daily, default)
        sql.execute(f"COMMENT ON TABLE {gold}.qry_platform_cost IS 'This project''s Databricks usage per day, service "
                    "(billing_origin_product), SKU and scope, priced at the list price in force when it was used "
                    "(system.billing.usage x system.billing.list_prices). scope: project (this app and its Genie space), "
                    "other (other apps, spaces and warehouses in the workspace), shared (warehouse, Lakebase, model serving, "
                    "storage); project_share is the part that is this project''s (for shared: its share of that day''s warehouse "
                    "query time, 0 before the project''s first day; days after the last deploy use the latest 7 days'' share). "
                    "cost x project_share = this project''s cost. List prices, before discounts; Genie''s free "
                    "allowance has cost 0. For the app''s Observability cost page; not part of the collections model.'")
        log(f"Cost view ready: {gold}.qry_platform_cost (workspace {ws}; apps {app_base}[-vN], "
            f"{len([s for s in spaces if s])} Genie space(s); {how})")
        return True
    except DeployError as e:
        log("WARNING: couldn't create the cost view, so the Observability cost page will say it isn't available "
            f"({str(e).splitlines()[0][:160]}). It needs SELECT on system.billing.usage and list_prices "
            "for the person deploying.")
        return False


def resolve_ai_config(db: Databricks, cfg: dict) -> dict:
    """The optional AI features for the app (semantic cache, guardrails, judge).

    A section missing from the config means that feature is off. Each model is
    checked like the Genie space and Lakebase are: if its serving endpoint
    doesn't exist in this workspace (models are enabled there by hand), the
    deploy warns and carries on without it instead of failing.
    """
    seen: dict = {}

    def exists(endpoint: str) -> bool:
        if endpoint not in seen:
            seen[endpoint] = db.run("serving-endpoints", "get", endpoint, check=False) is not None
            if not seen[endpoint]:
                log(f"WARNING: serving endpoint '{endpoint}' not found in this workspace (enable it under Serving, "
                    f"then re-run --only app)")
        return seen[endpoint]

    ai: dict = {}
    sc = cfg.get("semantic_cache")
    if sc and sc.get("threshold") not in (None, "", 0, "off"):
        threshold = float(sc["threshold"])
        threshold = threshold / 100 if threshold > 1 else threshold
        if not 0.5 <= threshold <= 1:
            raise DeployError(f"semantic_cache.threshold must be between 50 and 100 (or 0.5 and 1), got {sc['threshold']}")
        model = sc.get("embedding_model") or "databricks-gte-large-en"
        if exists(model):
            ai["semantic_cache"] = {"threshold": threshold, "embedding_model": model}
            log(f"Semantic cache: on, similarity >= {threshold:.2f}, embeddings from {model}")
        else:
            log("Semantic cache: off (embedding model missing)")
    else:
        log("Semantic cache: off")

    g = cfg.get("guardrails")
    if g:
        model = g.get("model") or None
        if model and not exists(model):
            model = None
        ai["guardrails"] = {"model": model, "input": g.get("input") or {}, "output": g.get("output") or {}}
        log(f"Guardrails: on ({'pattern checks + ' + model if model else 'pattern checks only, no classifier model'})")
    else:
        log("Guardrails: off")

    j = cfg.get("faithfulness_judge")
    if j:
        model = j.get("model") or None
        if model and not exists(model):
            model = None
        ai["faithfulness_judge"] = {"model": model, "sample_percent": j.get("sample_percent", 100),
                                    "warn_below": j.get("warn_below", 70)}
        log(f"Answer-quality judge: on ({'numbers check + ' + model if model else 'numbers check only, no judge model'}), "
            f"low-confidence warning below {j.get('warn_below', 70)}%")
    else:
        log("Answer-quality judge: off")

    f = cfg.get("follow_ups")
    if f and f.get("model") and exists(f["model"]):
        ai["follow_ups"] = {"model": f["model"]}
        log(f"Suggested follow-up questions: on ({f['model']})")
    else:
        log("Suggested follow-up questions: engine's own only")

    # Auto mode: "ai" (a small model routes each question to Quick answer or Deep analysis)
    # or "rules" (a word rule, no model). With no section, the guardrail classifier's model is
    # used when there is one; set "rules" to keep model calls to a minimum.
    am = cfg.get("auto_mode") or {}
    method = str(am.get("method") or ("ai" if (ai.get("guardrails") or {}).get("model") else "rules")).lower()
    if method not in ("ai", "rules"):
        raise DeployError(f'auto_mode.method must be "ai" or "rules", got {am.get("method")!r}')
    model = am.get("model") or (ai.get("guardrails") or {}).get("model") if method == "ai" else None
    if method == "ai" and model and exists(model):
        ai["auto_mode"] = {"method": "ai", "model": model, "timeout_ms": int(am.get("timeout_ms", 6000))}
        log(f"Auto mode: AI classifier ({model}), word rule as fallback")
    else:
        ai["auto_mode"] = {"method": "rules"}
        log("Auto mode: word rule (no model)" + (" - no model available for the AI classifier" if method == "ai" else ""))

    # Platform help: questions about LensS itself (tabs, navigation, how answers are checked) are
    # answered from the platform guide. "ai": a small model answers from the guide (default, with the
    # follow-up or guardrail model); "guide": the guide's own text, no model; "off": sent to the engine.
    ph = cfg.get("platform_help") or {}
    method = "off" if ph.get("enabled") is False else str(ph.get("method") or "ai").lower()
    if method not in ("ai", "guide", "off"):
        raise DeployError(f'platform_help.method must be "ai", "guide" or "off", got {ph.get("method")!r}')
    model = (ph.get("model") or (ai.get("follow_ups") or {}).get("model") or (ai.get("guardrails") or {}).get("model")) if method == "ai" else None
    if method == "ai" and model and exists(model):
        ai["platform_help"] = {"method": "ai", "model": model}
        log(f"Platform questions: answered from the platform guide by {model}")
    elif method == "off":
        ai["platform_help"] = {"method": "off"}
        log("Platform questions: disabled (every question goes to the query engine)")
    else:
        ai["platform_help"] = {"method": "guide"}
        log("Platform questions: answered with the platform guide's text (no model)")

    # Conversation memory: follow-ups carry a summary of older turns (compacted every
    # compact_every question-and-answer pairs, by a small model or a no-model digest) plus the
    # recent turns, so "tell me more about this" is understood whichever mode or source answered.
    cm = cfg.get("conversation_memory") or {}
    if cm.get("enabled") is False:
        ai["conversation_memory"] = {"enabled": False}
        log("Conversation memory: off (only the query engine's own conversation)")
    else:
        every = int(cm.get("compact_every", 5))
        if not 2 <= every <= 20:
            raise DeployError(f"conversation_memory.compact_every must be between 2 and 20, got {every}")
        model = cm.get("model") or (ai.get("follow_ups") or {}).get("model") or (ai.get("guardrails") or {}).get("model")
        model = model if model and exists(model) else None
        # Context budgets in estimated tokens (whole question-and-answer pairs, newest first); see aiConfig.ts.
        budgets = {k: int(cm[k]) for k in ("router_tokens", "guide_tokens", "genie_tokens", "genie_latest_max_tokens", "send_all_below_tokens") if k in cm}
        ai["conversation_memory"] = {"enabled": True, "compact_every": every, **({"model": model} if model else {}), **budgets}
        log(f"Conversation memory: on, compacted every {every} questions ({model or 'no-model digest'})")

    e = cfg.get("evals")
    if e:
        ai["evals"] = {"max_accuracy_cases": int(e.get("max_accuracy_cases", 5))}
        log(f"Evaluations: on (up to {ai['evals']['max_accuracy_cases']} ground-truth questions per run)")
    else:
        log("Evaluations: off")

    # Optional USD per million tokens, per endpoint, for Monitoring's cost estimate.
    if cfg.get("pricing"):
        ai["pricing"] = cfg["pricing"]
    return ai


def ai_endpoints(ai: dict) -> list[str]:
    eps = [(ai.get("semantic_cache") or {}).get("embedding_model"),
           (ai.get("guardrails") or {}).get("model"),
           (ai.get("faithfulness_judge") or {}).get("model"),
           (ai.get("follow_ups") or {}).get("model"),
           (ai.get("auto_mode") or {}).get("model"),
           (ai.get("platform_help") or {}).get("model"),
           (ai.get("conversation_memory") or {}).get("model")]
    return sorted({e for e in eps if e})


def step_app(db: Databricks, sql: Sql, cfg: dict, state: dict, cfg_path: Path) -> None:
    name = cfg["app_name"]
    app_dir = (REPO_DIR / cfg["app_dir"]).resolve()
    check_page_scripts(app_dir)   # before anything changes in the workspace
    ws_path = cfg["app_workspace_path"] or f"/Workspace/Users/{state['user']}/apps/{name}"
    space = db.run("genie", "get-space", state["genie_space_id"])
    spec = {
        "description": "LensS Collections Intelligence for Optus, powered by Concentrix: command center, explorer, assistant, observability.",
        # No on-behalf-of-user scopes: the app calls Genie and SQL as its own service
        # principal, so users need only CAN_USE on the app and are never asked to
        # authorize anything. (Empty list also clears a scope set by an older deploy.)
        "user_api_scopes": [],
        "resources": [
            {"name": "genie-space", "description": "Genie space for natural-language questions",
             "genie_space": {"name": space["title"], "space_id": state["genie_space_id"], "permission": "CAN_RUN"}},
            {"name": "sql-warehouse", "description": "Warehouse for dashboard queries",
             "sql_warehouse": {"id": state["warehouse_id"], "permission": "CAN_USE"}},
            # Lakebase database as a declared resource: Databricks creates the app's
            # Postgres login (named dbrx-apps-<sp id>) and grants CONNECT/CREATE on it.
            # Table-level grants on chatapp.* are still applied below.
            {"name": "database", "description": "Lakebase database for chat history and usage log",
             "postgres": {"branch": state["lakebase_branch"],
                          "database": f"{state['lakebase_branch']}/databases/{cfg['lakebase_database']}",
                          "permission": "CAN_CONNECT_AND_CREATE"}},
        ],
    }
    # Optional model that names chat sessions (the app falls back to the question text).
    state["title_endpoint"] = None
    if cfg["title_endpoint"]:
        if db.run("serving-endpoints", "get", cfg["title_endpoint"], check=False) is not None:
            state["title_endpoint"] = cfg["title_endpoint"]
            spec["resources"].append(
                {"name": "title-model", "description": "Chat model that names chat sessions",
                 "serving_endpoint": {"name": cfg["title_endpoint"], "permission": "CAN_QUERY"}})
        else:
            log(f"Serving endpoint {cfg['title_endpoint']} not found — sessions will be named from the question text")
    # Optional AI features: each model the app calls is bound with CAN_QUERY (no keys).
    state["ai_config"] = resolve_ai_config(db, cfg)
    for i, endpoint in enumerate(ai_endpoints(state["ai_config"]), start=1):
        if endpoint == state.get("title_endpoint"):
            continue  # already bound as title-model
        spec["resources"].append(
            {"name": f"ai-model-{i}", "description": "Model for the semantic cache, guardrails, answer-quality judge or follow-up suggestions",
             "serving_endpoint": {"name": endpoint, "permission": "CAN_QUERY"}})
    # `apps update` replaces the fields it is sent, so always send the full spec.
    if db.run("apps", "get", name, check=False) is None:
        log(f"Creating app {name} (starts compute; a few minutes)…")
        # With --json the CLI takes the name inside the body, not as an argument.
        app = db.run("apps", "create", json_body={**spec, "name": name})
    else:
        app = db.run("apps", "update", name, json_body=spec)
    sp = app["service_principal_client_id"]
    state["app_url"] = app.get("url")
    log(f"App {name}, service principal {sp}")

    # Unity Catalog: only the app's service principal reads gold (Genie runs its SQL
    # as the app too). App users get no data grants: they see data only through the app.
    c, p = cfg["catalog"], cfg["schema_prefix"]
    catalog_ok = grant_use_catalog(sql, c, sp)
    sql.execute(f"GRANT USE SCHEMA ON SCHEMA {c}.{p}_gold TO `{sp}`")
    sql.execute(f"GRANT SELECT ON SCHEMA {c}.{p}_gold TO `{sp}`")
    log("Granted USE SCHEMA / SELECT on gold to the app's service principal")
    state["catalog_access_pending"] = not catalog_ok
    # The workspace ID is in the app's URL (https://<app>-<workspace id>.<region>.databricksapps.com).
    m = re.search(r"-(\d{10,})\.", state["app_url"] or "")
    state["workspace_id"] = m.group(1) if m else state.get("workspace_id")
    platform_cost_view(db, sql, cfg, state)

    # Lakebase: a Postgres role for the app's service principal, then table grants.
    branch = state["lakebase_branch"]
    roles = db.run("postgres", "list-roles", branch)
    roles = roles if isinstance(roles, list) else roles.get("roles", [])
    if not any(r["status"].get("postgres_role") == sp for r in roles):
        # Unique per service principal: a recreated app gets a new one, and the old
        # role (same app name) may still exist.
        role_id = re.sub(r"[^a-z0-9-]", "-", f"app-{name}-{sp[:8]}".lower())[:63].strip("-")
        db.run("postgres", "create-role", branch, "--role-id", role_id, json_body={"spec": {
            "identity_type": "SERVICE_PRINCIPAL", "postgres_role": sp, "auth_method": "LAKEBASE_OAUTH_V1"}})
    conn = pg_connect(db, state, cfg["lakebase_database"])
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f'GRANT USAGE ON SCHEMA chatapp TO "{sp}"')
        cur.execute(f'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA chatapp TO "{sp}"')
        cur.execute(f'ALTER DEFAULT PRIVILEGES IN SCHEMA chatapp GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "{sp}"')
    conn.close()
    log("Granted the app's Postgres role access to chatapp.*")

    # People: CAN_USE on the app is the only permission they get — no Genie space,
    # warehouse, table or Lakebase access.
    if cfg["readers_group"]:
        db.run("apps", "update-permissions", name, json_body={"access_control_list": [
            {"group_name": cfg["readers_group"], "permission_level": "CAN_USE"}]})
        log(f"Granted CAN_USE on the app (and nothing else) to {cfg['readers_group']}")
    # Idle stop: the app's own service principal may stop this app (and only this app).
    if cfg.get("idle_stop_minutes"):
        ok = db.run("apps", "update-permissions", name, check=False, json_body={"access_control_list": [
            {"service_principal_name": sp, "permission_level": "CAN_MANAGE"}]}) is not None
        log(f"Idle stop: the app stops itself after {cfg['idle_stop_minutes']} minutes without use"
            if ok else "WARNING: couldn't let the app stop itself (CAN_MANAGE for its service principal); idle stop won't work")
    # Demo givers: CAN_MANAGE so they can press Start (Apps has no narrower level). The source-folder
    # read they also need is given by grant_source_read, which shares with every CAN_MANAGE holder.
    if cfg.get("demo_givers_group"):
        try:
            db.run("apps", "update-permissions", name, json_body={"access_control_list": [
                {"group_name": cfg["demo_givers_group"], "permission_level": "CAN_MANAGE"}]})
            log(f"Granted CAN_MANAGE on the app to {cfg['demo_givers_group']} (they can start it)")
        except DeployError as e:
            reason = " ".join(str(e).split("failed:", 1)[-1].split())[:200]
            log(f"WARNING: couldn't give {cfg['demo_givers_group']} CAN_MANAGE on the app ({reason}). "
                "Check the group name in the config and that the group exists in this workspace.")

    write_app_yaml(app_dir, cfg, state)
    log(f"Syncing {app_dir.name} -> {ws_path}")
    db.run("sync", str(app_dir), ws_path, "--full",
           "--exclude", "node_modules/**", "--exclude", "dist/**", "--exclude", ".git/**", output_json=False)
    grant_source_read(db, cfg, ws_path, sp)
    # A stopped app (idle policy, workspace quota, or someone pressed Stop) rejects deploys.
    compute = (db.run("apps", "get", name).get("compute_status") or {}).get("state")
    if compute != "ACTIVE":
        log(f"App compute is {compute}; starting it (a few minutes)…")
        db.run("apps", "start", name)
    # Starting an app redeploys its previous version, and only one deployment may run at a time.
    for _ in range(120):
        app_now = db.run("apps", "get", name)
        states = {(app_now.get(k) or {}).get("status", {}).get("state") for k in ("active_deployment", "pending_deployment")}
        if "IN_PROGRESS" not in states:
            break
        if _ == 0:
            log("Waiting for the app's current deployment to finish…")
        time.sleep(10)
    log("Deploying (the platform runs npm install + build)…")
    dep = db.run("apps", "deploy", name, "--source-code-path", ws_path)
    status = dep.get("status", {})
    if status.get("state") != "SUCCEEDED":
        raise DeployError(f"App deployment did not succeed: {status}")
    save_state(cfg_path, state)
    log(f"App live at {state['app_url']}")
    if state.get("catalog_access_pending"):
        log(f"Still needed from an admin: GRANT USE CATALOG ON CATALOG {c} TO `{sp}`; (see the warning above). "
            f"No redeploy is needed after they run it.")


def run_app_test(script: str, label: str, state: dict, db: Databricks, extra: list[str] | None = None) -> None:
    """Runs a test script against the deployed app as the smoke-test service principal, with the
    workspace host and app URL this deploy already knows (no need to look them up)."""
    if not (os.environ.get("LENSS_SMOKE_CLIENT_ID") and os.environ.get("LENSS_SMOKE_CLIENT_SECRET")):
        log(f"Skipping {label} (set LENSS_SMOKE_CLIENT_ID / LENSS_SMOKE_CLIENT_SECRET — see README)")
        return
    host = db.run("auth", "describe", check=False) or {}
    host = (host.get("details", {}) or {}).get("host") or os.environ.get("DATABRICKS_HOST")
    if not host:
        raise DeployError(f"Could not determine workspace host for the {label}; set DATABRICKS_HOST.")
    rc = subprocess.run([sys.executable, str(DEPLOY_DIR / script), "--host", host,
                         "--app-url", state["app_url"], *(extra or [])]).returncode
    if rc != 0:
        raise DeployError(f"{label.capitalize()} failed — see output above.")


def step_smoke(cfg: dict, state: dict, db: Databricks) -> None:
    run_app_test("smoke_test.py", "smoke test", state, db)


def step_routing(cfg: dict, state: dict, db: Databricks) -> None:
    run_app_test("routing_test.py", "routing test", state, db)


def on_personal(cfg: dict, state: dict, cfg_path: Path) -> bool:
    ws = state.get("workspace_id") or ""
    return (cfg_path.stem == "personal" or cfg.get("profile") == "personal" or ws in PERSONAL_WORKSPACE_IDS
            or any(w in (state.get("app_url") or "") for w in PERSONAL_WORKSPACE_IDS))


def step_org_smoke(db: Databricks, sql: Sql, cfg: dict, state: dict, cfg_path: Path, test_args: list[str]) -> None:
    """The org smoke test: workspace checks as the person deploying (app, permissions, data, descriptions,
    Genie, Lakebase, cost view), then org_smoke_test.py against the app as the smoke-test service principal.
    Organisation workspace only."""
    if on_personal(cfg, state, cfg_path):
        raise DeployError("org-smoke is for the organisation workspace only (it costs ~40 minutes of real usage); "
                          "this is the personal workspace. Use deploy/config/org2.json on the org laptop.")
    c, p, name = cfg["catalog"], cfg["schema_prefix"], cfg["app_name"]
    gold = f"{c}.{p}_gold"
    results: list[tuple[str, str, str]] = []
    details: dict[str, str] = {}

    def pc(cid: str, title: str, fn) -> None:
        try:
            status, detail = "PASS", fn()
        except DeployError as e:
            status, detail = "FAIL", str(e).splitlines()[0][:400]
        except Exception as e:  # noqa: BLE001 - report every failure, keep going
            status, detail = ("WARN", str(e)[7:]) if str(e).startswith("[warn] ") else ("FAIL", f"{type(e).__name__}: {e}"[:400])
        results.append((cid, status, title))
        details[cid] = str(detail)[:400]
        print(f"{status:<4} [{cid}] {title}\n       {detail}", flush=True)

    def warn(msg: str) -> Exception:
        return RuntimeError("[warn] " + msg)

    print("=== ORG SMOKE TEST: workspace checks (as the person deploying) ===", flush=True)

    def app_state():
        a = db.run("apps", "get", name)
        compute = (a.get("compute_status") or {}).get("state")
        dep = ((a.get("active_deployment") or {}).get("status") or {}).get("state")
        if compute != "ACTIVE" or dep != "SUCCEEDED":
            raise RuntimeError(f"compute {compute}, deployment {dep} (a stopped app is started by --only app)")
        return f"{name}: compute ACTIVE, deployment SUCCEEDED, {a.get('url')}"
    pc("P1", "App is running and its deployment succeeded", app_state)

    def permissions():
        acl = (db.run("apps", "get-permissions", name) or {}).get("access_control_list", [])
        level = {(x.get("service_principal_name") or x.get("group_name") or "user"): {q["permission_level"] for q in x.get("all_permissions", [])}
                 for x in acl}
        app_sp = (db.run("apps", "get", name) or {}).get("service_principal_client_id")
        problems = []
        if cfg.get("idle_stop_minutes") and "CAN_MANAGE" not in level.get(app_sp, set()):
            problems.append("the app's service principal lacks CAN_MANAGE, so idle stop can't stop it")
        smoke = os.environ.get("LENSS_SMOKE_CLIENT_ID", "")
        if smoke and not ({"CAN_USE", "CAN_MANAGE"} & level.get(smoke, set())):
            problems.append("the smoke-test service principal has no CAN_USE on the app")
        if cfg.get("readers_group") and not ({"CAN_USE", "CAN_MANAGE"} & level.get(cfg["readers_group"], set())):
            problems.append(f"readers group {cfg['readers_group']} has no CAN_USE")
        if cfg.get("demo_givers_group") and "CAN_MANAGE" not in level.get(cfg["demo_givers_group"], set()):
            problems.append(f"demo givers group {cfg['demo_givers_group']} has no CAN_MANAGE")
        if problems:
            raise RuntimeError("; ".join(problems))
        return (f"app SP CAN_MANAGE (idle stop {cfg.get('idle_stop_minutes') or 'off'} min), smoke SP CAN_USE, "
                f"readers {cfg.get('readers_group') or 'not set'}, demo givers {cfg.get('demo_givers_group') or 'not set'}; {len(acl)} entries")
    pc("P2", "App permissions (idle stop, smoke tester, readers, demo givers)", permissions)

    def data_facts():
        rows, accounts, promises = sql.execute(
            f"SELECT COUNT(*), COUNT(DISTINCT Account_ID), SUM(PTP_Flag) FROM {gold}.qry_account_month")[0]
        scen = {str(r[0]): int(r[1]) for r in sql.execute(f"SELECT Scenario_ID, Accounts FROM {gold}.qry_scenario_summary")}
        rules = int(sql.execute(f"SELECT COUNT(*) FROM {gold}.business_rules_config")[0][0])
        got = (int(rows), int(accounts), int(promises), scen.get("1"), scen.get("2"), scen.get("3"), rules)
        msg = (f"{got[0]:,} account-months, {got[1]:,} accounts, {got[2]:,} promises; scenarios {got[3]} / {got[4]} / {got[5]}; "
               f"{rules} rules")
        if got != (180000, 15000, 15648, 339, 115, 473, 16):
            raise warn(f"differs from the v2 workbook (180,000 / 15,000 / 15,648; Scenario_Guide 339 / 115 / 473; 16 rules): {msg}")
        return msg
    pc("P3", "Gold data matches the source data", data_facts)

    def described():
        tables = db.run("tables", "list", c, f"{p}_gold") or []
        tables = tables if isinstance(tables, list) else tables.get("tables", [])
        names = {t["name"] for t in tables}
        missing = [t["name"] for t in tables if not t.get("comment")]
        expected = {"business_rules_config", "qry_rules", "mv_collections", "qry_account_month", "qry_monthly_trend", "qry_ptp_break_drivers",
                    "qry_fcr_vs_promises", "qry_contact_by_segment", "qry_transfer_cost", "qry_repeat_after_unresolved", "qry_scenario_accounts",
                    "qry_scenario_summary", "qry_dpd_exposure", "qry_account_history", "qry_cc_kpis", "qry_cc_top_broken_accounts", "exec_summary"}
        absent = sorted(expected - names)
        if absent or missing:
            raise RuntimeError(f"missing objects {absent}; without a description {missing}")
        return f"{len(tables)} gold objects, every one described"
    pc("P4", "Every gold object exists and has a description", described)

    def metric_rules():
        (mv,) = sql.execute(f"SELECT MEASURE(broken_promises) FROM {gold}.mv_collections WHERE Credit_Band = 'Below 550'")[0]
        (qv,) = sql.execute(f"SELECT SUM(Broken_PTP_Flag) FROM {gold}.qry_account_month WHERE Credit_Band = 'Below 550'")[0]
        if int(float(mv or 0)) != int(float(qv or 0)):
            raise RuntimeError(f"metric view counts {mv} broken promises below 550, certified view {qv}: re-run transform")
        return f"metric view and certified view agree: {int(float(mv)):,} broken promises with a credit score below 550"
    pc("P5", "Metric view bands use the rules table's thresholds", metric_rules)

    def genie():
        sid = state.get("genie_space_id")
        if not sid:
            raise RuntimeError("no Genie space in the deploy state (run the genie step)")
        space = db.run("genie", "get-space", sid)
        m = db.run("genie", "start-conversation", sid, "How many promises to pay were made in the latest month, and how many were broken?",
                   check=False) or {}
        sql_text = " ".join(((a.get("query") or {}).get("query") or "") for a in m.get("attachments") or [])
        answer = " ".join(((a.get("text") or {}).get("content") or "") for a in m.get("attachments") or [])
        if m.get("status") != "COMPLETED":
            raise RuntimeError(f"Genie status {m.get('status')}: {str(m.get('error') or '')[:200]}")
        view = re.search(r"qry_\w+|mv_collections", sql_text)
        if not view:
            raise warn(f"answered without the certified views: {sql_text[:200]} | {answer[:150]}")
        return f"'{space.get('title')}' answered directly from {view.group(0)}: {answer[:150]}"
    pc("P6", "Genie space answers a question directly (as you)", genie)

    def lakebase():
        if "lakebase_host" not in state:
            raise RuntimeError("no Lakebase in the deploy state (run the lakebase step)")
        conn = pg_connect(db, state, cfg["lakebase_database"])
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'chatapp'")
            ntables = cur.fetchone()[0]
            cur.execute("SELECT category, COUNT(*) FROM chatapp.eval_cases GROUP BY 1 ORDER BY 1")
            cases = dict(cur.fetchall())
            cur.execute("SELECT name, version FROM chatapp.cache_versions ORDER BY 1")
            versions = dict(cur.fetchall())
        conn.close()
        if not ntables or not cases:
            raise RuntimeError(f"{ntables} chatapp tables, eval cases {cases}")
        return f"{ntables} chatapp tables, eval cases {cases}, cache versions {versions}"
    pc("P7", "Lakebase database, evaluation cases and cache versions", lakebase)

    def cost_view():
        try:
            total, mine, days = sql.execute(f"SELECT ROUND(SUM(cost), 2), ROUND(SUM(cost * project_share), 2), COUNT(DISTINCT usage_date) "
                                            f"FROM {gold}.qry_platform_cost")[0]
        except DeployError as e:
            raise warn(f"no cost view ({str(e).splitlines()[0][:120]}): the cost page shows 'Coming soon'")
        (bad,) = sql.execute(f"SELECT COUNT(*) FROM {gold}.qry_platform_cost WHERE project_share < 0 OR project_share > 1")[0]
        if int(bad):
            raise RuntimeError(f"{bad} rows with a share outside 0-1")
        return f"this project ${mine} of workspace ${total} over {days} days"
    pc("P8", "Cost view (this project's Databricks cost)", cost_view)

    pc("P9", "Smoke-test credentials are set",
       lambda: "LENSS_SMOKE_CLIENT_ID / SECRET set" if os.environ.get("LENSS_SMOKE_CLIENT_ID") and os.environ.get("LENSS_SMOKE_CLIENT_SECRET")
       else (_ for _ in ()).throw(DeployError("set LENSS_SMOKE_CLIENT_ID and LENSS_SMOKE_CLIENT_SECRET (setx), then open a new terminal")))

    failed = [r for r in results if r[1] == "FAIL"]
    print(f"Workspace checks: {sum(r[1] == 'PASS' for r in results)} passed, {sum(r[1] == 'WARN' for r in results)} warnings, "
          f"{len(failed)} failed\n", flush=True)
    app_failed = None
    try:
        run_app_test("org_smoke_test.py", "org smoke test", state, db, test_args)
    except DeployError as e:
        app_failed = e
    # Repeated last, after the app checks' summary, so one paste of the end holds both.
    print("\n=== WORKSPACE CHECKS SUMMARY (P1-P9, as the person deploying) ===", flush=True)
    for cid, status, title in results:
        print(f"  {status:<4} [{cid}] {title}" + (f": {details[cid]}" if status != "PASS" else ""), flush=True)
    print(f"  {sum(r[1] == 'PASS' for r in results)} passed, {sum(r[1] == 'WARN' for r in results)} warnings, {len(failed)} failed", flush=True)
    if failed or app_failed:
        raise DeployError(f"Org smoke test: {len(failed)} workspace check(s) failed"
                          + (f" ({', '.join(r[0] for r in failed)})" if failed else "") + ("; app checks failed (see above)" if app_failed else ""))


# --------------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", required=True, help="Path to a config JSON, e.g. deploy/config/org.json")
    ap.add_argument("--only", help=f"Comma-separated steps to run: {','.join(STEPS)} "
                    f"({', '.join(sorted(ON_REQUEST))} only when named here)")
    ap.add_argument("--skip", help="Comma-separated steps to skip")
    ap.add_argument("--test-args", default="", help='Extra arguments for the org smoke or org routing test, e.g. "--sections E,F --skip-slow" or "--matrix-only"')
    args = ap.parse_args()

    cfg_path = Path(args.config).resolve()
    cfg = load_config(cfg_path)
    steps = args.only.split(",") if args.only else [s for s in STEPS if s not in ON_REQUEST]
    if args.skip:
        steps = [s for s in steps if s not in args.skip.split(",")]
    unknown = set(steps) - set(STEPS)
    if unknown:
        sys.exit(f"Unknown steps: {sorted(unknown)}")

    db = Databricks(cfg["profile"])
    state = load_state(cfg_path)
    started = time.time()
    run_stamp = time.strftime("%Y%m%d-%H%M%S")
    try:
        step_preflight(db, cfg, state)
        sql = Sql(db, state["warehouse_id"])
        for step in STEPS:
            if step not in steps:
                continue
            log(f"=== {step} ===")
            if step == "schemas":
                step_schemas(sql, cfg)
            elif step == "ingest":
                step_ingest(db, sql, cfg)
            elif step == "context":
                step_context(sql, cfg)
            elif step == "transform":
                step_transform(sql, cfg)
            elif step == "views":
                step_views(sql, cfg)
            elif step == "summary":
                step_summary(sql, cfg)
            elif step == "genie":
                step_genie(db, sql, cfg, state, cfg_path)
            elif step == "lakebase":
                step_lakebase(db, cfg, state, cfg_path)
            elif step == "app":
                for needed in ("genie_space_id", "lakebase_host"):
                    if needed not in state:
                        raise DeployError(f"'app' needs '{needed}' — run the genie and lakebase steps first.")
                step_app(db, sql, cfg, state, cfg_path)
            elif step == "smoke":
                if "app_url" not in state:
                    raise DeployError("'smoke' needs a deployed app — run the app step first.")
                step_smoke(cfg, state, db)
            elif step == "routing":
                if "app_url" not in state:
                    raise DeployError("'routing' needs a deployed app — run the app step first.")
                step_routing(cfg, state, db)
            elif step == "org-smoke":
                if "app_url" not in state:
                    raise DeployError("'org-smoke' needs a deployed app — run the app step first.")
                step_org_smoke(db, sql, cfg, state, cfg_path, args.test_args.split())
            elif step == "org-routing":
                if "app_url" not in state:
                    raise DeployError("'org-routing' needs a deployed app — run the app step first.")
                if on_personal(cfg, state, cfg_path):
                    raise DeployError("org-routing is for the organisation workspace only (real usage); this is the personal workspace.")
                run_app_test("org_routing_test.py", "org routing test", state, db, args.test_args.split())
            if step in ("ingest", "transform", "views", "summary"):
                # New gold data or views → cached answers may be wrong. One stamp per run, so a full deploy bumps once.
                bump_cache_version(db, cfg, state, cfg_path, "data", run_stamp)
        save_state(cfg_path, state)
    except DeployError as e:
        log(f"FAILED: {e}")
        sys.exit(1)
    log(f"Done in {int(time.time() - started)}s. App: {state.get('app_url', '(not deployed)')}")


if __name__ == "__main__":
    main()
