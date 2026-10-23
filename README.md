# LensS Collections Intelligence for Optus

Decision intelligence for Optus's telecom collections, built on Databricks by the Concentrix Data & Analytics Practice and presented as **Concentrix LensS**. It is LensS, powered by Concentrix, set up for Optus with Optus's demo data; the Optus logo marks it as prepared for Optus (header, Command Center, footer). Governed bronze → silver → gold data feeds a web app with four tabs:

| Tab | What it does |
|---|---|
| **Command Center** | An executive summary ("the month in 30 seconds"), then one story in five chapters: where promises to pay stand this month, why they break, how the contact centre is doing and what it does to promises, where the money is, and which customers need a different conversation (the six scenarios of Optus's Scenario Guide). Every figure opens the accounts behind it |
| **Explorer** | Self-service drill-down by month, product, state, credit score, days past due, missed payments, call outcome, porting, renewal window and new product interest, with the accounts behind each item and CSV export. A heatmap of any two dimensions (product by arrears stage by default; broken, kept or promise rate, FCR, transfers, repeats or overdue balance), charts of promised money kept against broken and of call outcomes, and a 12-month trend chart |
| **Assistant** | Plain-language questions answered by a Genie space ("LensS query engine"): Quick answer, Deep analysis or Auto, with a conversation-aware router (data or platform guide, quick or deep, escalation to a deep analysis when an answer is not enough or a question is asked again), conversation memory, charts, SQL and a quality score |
| **Observability** | Pipeline traces, answer quality and faithfulness, performance, drift, security and guardrails, Evaluations, Responsible AI and Databricks cost |

Every Command Center and Explorer figure comes from certified SQL views; no AI computes them. Current version: **v1.0.0** (see [CHANGELOG.md](CHANGELOG.md)). Built from LensS Collections v1.11.0.

> **Deploying to a new workspace or a new laptop?** [SETUP_GUIDE.md](SETUP_GUIDE.md) covers installing the tools, configuring a workspace, deploying and troubleshooting. It comes from LensS Collections: the steps are the same, but its examples name that project's configs and figures.

## The data

`Data/Optus_GenBI_Collections_Demo_Data_v2.xlsx` (synthetic, from Optus). `Data/Optus_GenBI_Collections_Demo_Data.xlsx` is the first version, superseded by v2 and not used.

| Sheet | Lands in | What it is |
|---|---|---|
| `Collections_Fact` | `bronze.fact_collections_snapshot` → `silver` → gold | 15,000 accounts × 12 monthly snapshots (1 Nov 2025 to 1 Oct 2026), 180,000 rows: balance, days past due, missed payments, the promise to pay and whether it broke, the month's contact (first call resolution, transfer, repeat call, handle time), credit score, product, state, porting, renewal window, new product interest |
| `Data_Dictionary` | `context.data_dictionary` | Optus's column definitions; the source of the view and column descriptions |
| `Scenario_Guide` | `context.scenario_guide` | Six scenarios: three account filters (counts 339 / 115 / 473 at the latest snapshot, which the deploy checks) and three analytical ones |
| `Sample_BI_Questions` | `context.sample_bi_questions` | Twelve questions: the Genie space's first examples and its benchmarks |

How silver reads it:
- **Flags** become 1/0. A flag that doesn't apply is NULL: `Broken_PTP_Flag` without a promise (the workbook writes 'N'), and the FCR, transfer and repeat flags and handle time without a contact (the workbook writes 'N/A'). `Porting_Status` keeps 'None'. The ingest keeps 'N/A' and 'None' as text, not missing values.
- **Rates:** broken and kept rates are over promises made; FCR, transfer and repeat rates are over contacted account-months. Contact is one flag per account per month, not per call.
- **Overdue** means more than 0 days past due. Current accounts carry a billed balance too, so "overdue balance" counts only overdue accounts.
- **Promise outcomes:** every promise has a recorded outcome, including the latest month's, all of which fall due after 1 October 2026. Every page and the Assistant use the recorded outcome and say that these promises fall due after the snapshot date; none are shown as "still to come".

Not in the data, and said so wherever it matters (the Genie instructions, `context.known_limitations`, the guide, Responsible AI):
- no target;
- no forecasting;
- no outbound attempts, channels, collectors or treatment strategies;
- no call dates: the repeat flag is Optus's own "about 7 to 14 days";
- no channel for promises made without a contact (about half of them);
- no cost per minute of handle time;
- no subscription/legacy product grouping: the five products are as given.

## Documentation

| Document | For | What's in it |
|---|---|---|
| [CHANGELOG.md](CHANGELOG.md) | Everyone | Every change by version: what, why, what was verified |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Whoever deploys | Installing tools, configuring a workspace, deploying, updating, troubleshooting (from LensS Collections) |
| [APP_SERVICE_PRINCIPAL_SETUP.md](APP_SERVICE_PRINCIPAL_SETUP.md) | Special case | Converting an app created in the Databricks UI to service-principal access (`deploy.py` does this automatically) |
| [appkit-genie-app/README.md](appkit-genie-app/README.md) | App developers | The app's structure, API routes and running it locally |
| [docs/LensS_Optus_How_It_Works.png](docs/LensS_Optus_How_It_Works.png) | Leadership, clients | How LensS works for Optus, in four steps, for a non-technical audience |
| [docs/LensS_Optus_Architecture.png](docs/LensS_Optus_Architecture.png) | Engineers, reviewers | Technical architecture: people and access, the app, Databricks services, the data pipeline and the one-command deploy |
| [docs/LensS_Optus_Agentic_Architecture.png](docs/LensS_Optus_Agentic_Architecture.png) | Architects, clients | The governed agentic view: request to response through the router, approved engines (live, and dashed = ready to add) and the checks |

## Deploy everything with one command

```bash
python deploy/deploy.py --config deploy/config/<your-config>.json
```

That single run, idempotently and in order:

| Step | What it does |
|---|---|
| `schemas` | Creates `<catalog>.<prefix>_{bronze,silver,gold,context}` (prefix `optus_collections` by default) and the `raw_files` volume (and the catalog itself if `create_catalog` is true) |
| `ingest` | Uploads the workbook to the volume and lands its 4 sheets as bronze/context tables, verifying row counts |
| `context` | Creates the governance tables that are not in the workbook: SQL-generation controls, known limitations, the demo order |
| `transform` | Builds silver (typed + primary key), `business_rules_config` and `qry_rules`, the metric view `mv_collections` and 11 certified views; checks the row, account, promise and scenario counts against the workbook |
| `views` | Builds the Command Center views (`qry_cc_kpis`, `qry_cc_top_broken_accounts`) |
| `summary` | Writes the executive summary and the time the data was last loaded to `gold.exec_summary` (no LLM); re-run it when the data changes |
| `genie` | Creates or updates the Genie space: sources, instructions (thresholds filled from the rules table), examples, sample questions, benchmarks |
| `lakebase` | Creates or upgrades the Lakebase database: chat history, usage log, answer cache, evaluations, conversation memory |
| `app` | Writes `app.yaml`, creates or updates the Databricks App, binds the Genie space, SQL warehouse and model endpoints, grants the app's service principal read access on gold and access to Lakebase, creates the cost view, then syncs and deploys |
| `smoke` | Calls the deployed URL end to end (skipped unless smoke-test credentials are set — see below) |

Re-running is safe. Run part of it with `--only views,summary,app` or `--skip smoke`. Common combinations:

| Situation | Steps |
|---|---|
| App code changed | `--only app` |
| Views, rules, the summary or the Genie space changed | `--only transform,views,summary,genie,app` |
| New data in the workbook | `--only ingest,transform,views,summary,app` |
| A brand-new workspace | everything (no `--only`) |

### Prerequisites (once per laptop)

1. **Python 3.10+** and the packages: `pip install -r deploy/requirements.txt`
2. **Databricks CLI** on `PATH` (`winget install Databricks.DatabricksCLI` on Windows, `brew install databricks` on Mac). If you only have the one bundled with the VS Code extension, set `DATABRICKS_CLI_PATH` to it.
3. **An authenticated CLI profile:** `databricks auth login --host https://<your-workspace> --profile <name>`. Put the profile name in the config's `profile` field.

Node.js is **not** needed to deploy; Databricks builds the app.

### Configuration

Configs live in `deploy/config/`, one per deployment. Each names its own schema prefix, Genie space, Lakebase database and app, so an Optus deployment never touches another project's objects in the same workspace. Every field, including the optional AI features (semantic cache, guardrails, faithfulness judge, follow-ups, the question router (`auto_mode`), platform questions, conversation memory, evaluations, idle stop), is described in [SETUP_GUIDE.md section 7](SETUP_GUIDE.md#7-point-the-config-at-your-workspace).

Permissions you need in the workspace: `CREATE SCHEMA` on the catalog, permission to create Genie spaces, Lakebase project creation, and Databricks Apps creation. If any of those is missing, the script stops at that step with the platform's error message.

## Giving people access (including people outside the company)

Databricks Apps **cannot** be made public or anonymous. The app is reachable over HTTPS, but every visitor must sign in with a Databricks-recognised identity:

- **People:** add them to the workspace, then grant them `CAN_USE` on the app (or set `readers_group`).
- **Systems / APIs:** a service principal with an OAuth M2M secret, `CAN_USE` on the app **and the `workspace-access` entitlement** (without it the app returns 401).

### Databricks cost (Observability 8)

The cost page reads `gold.qry_platform_cost`, which the deploy's app step creates over `system.billing.usage` and `system.billing.list_prices`, scoped to this project: its own apps (`lenss-optus-collections`, with any `-vN`) and Genie spaces in full, other projects' apps and spaces left out, and shared services (warehouse, Lakebase, model serving, storage) at this project's daily share of warehouse query time (statements naming the `optus_collections_` schemas). The person deploying must be able to read the two billing tables; otherwise the deploy warns and the page says the figures aren't available. Costs are list prices.

### Idle stop

The app stops itself after `idle_stop_minutes` without use (default 60; `null` or 0 = never), so it doesn't bill while idle. Someone with CAN_MANAGE on the app starts it again (Compute → Apps → Start); a deploy also starts it.

## Smoke test

```bash
set LENSS_SMOKE_CLIENT_ID=<service principal application id>
set LENSS_SMOKE_CLIENT_SECRET=<its OAuth secret>
set PYTHONIOENCODING=utf-8
python deploy/smoke_test.py --host https://<workspace> --app-url https://<app>.databricksapps.com
```

It runs as a real, non-admin identity, which is what catches missing grants. Its checks cover:
- the UI shell, the account endpoint and the Auto-mode router;
- the Command Center headline and panels, and that the account lists match their cards (the broken promises and scenario 1);
- the Explorer, which must reconcile to the Command Center for the latest month;
- Quick-answer and Deep-analysis questions from Optus's sample questions, including the personal-data refusal (skip the deep ones with `--skip-agent`);
- a session end to end (chart, auto-naming, feedback, rename, delete);
- a platform question and its follow-up, guardrails, the answer cache with Refresh, Monitoring, Evals and Responsible AI.

Run the smoke and routing tests against an organisation workspace, not a personal one: they make real engine and model calls.

### Routing test (live conversations)

`deploy/routing_test.py` plays three scripted conversations through the deployed app, the way the browser does (ask the router, then send), switching between the data and the platform guide and between Quick answer and Deep analysis. For every turn it checks where the question went, its mode, escalation, the "You asked this before" choice, whether the engine was sent the turns it missed, and that an answer came back. It takes about 10–15 minutes of real engine calls:

```bash
python deploy/deploy.py --config deploy/config/<config>.json --only routing
```

`--only routing` runs only when named; a full deploy never runs it. The routing evaluation in the app (Observability → Evaluations → Routing) checks the router alone, in about a minute.

### Org tests (run these on the org laptop)

Two fuller suites, for the organisation workspace only. Both refuse to run against the personal workspace (cost), print PASS / WARN / FAIL / SKIP for every check, and write a log to `deploy/.state/`. A WARN is for a person to judge: a worded answer, or a figure that differs from the source data as profiled. It doesn't fail the run.

**Once on the org laptop:**
1. `git pull`, then `pip install -r deploy/requirements.txt`.
2. `databricks auth login --host https://<org workspace> --profile lenss-org2`.
3. Deploy (or update) the app: `python deploy/deploy.py --config deploy/config/org2.json`.
4. Set the test service principal's credentials. It needs CAN_USE on the app (it's in the readers group). After setting them, open a new terminal:

   ```bat
   setx LENSS_SMOKE_CLIENT_ID <service principal application id>
   setx LENSS_SMOKE_CLIENT_SECRET <its OAuth secret>
   setx PYTHONIOENCODING utf-8
   ```

**Org smoke test** (about 40 minutes):

```bash
python deploy/deploy.py --config deploy/config/org2.json --only org-smoke
python deploy/deploy.py --config deploy/config/org2.json --only org-smoke --test-args "--sections B,C --skip-slow"   # a quick subset
```

First, 9 workspace checks run as you (P1–P9):
- the app is running and its permissions are right;
- the gold data matches the v2 workbook (180,000 / 15,000 / 15,648; scenarios 339 / 115 / 473; 16 rules);
- every gold object exists and is described;
- the metric view bands match the certified views;
- Genie answers directly;
- Lakebase and its eval cases are in place;
- the cost view works and your credentials are set.

Then the app checks, as the service principal (sections A–K):

| Section | What it checks |
|---|---|
| A. Access | Tokens are needed; the page says "for Optus" and credits Concentrix; every asset loads |
| B. Command Center | The headline adds up and matches the source data; every panel has data; the rules reach the app and the drivers follow them; every "View accounts" list matches its card; driver and transfer lists add up; hostile input is refused; the summary; caching |
| C. Explorer | Filter options; reconciles to the Command Center for the latest month and the 12 months; each product sums to the book; combined filters; hostile filters |
| D. Observability | Usage, insights, the eval cases (13 / 15 / 8 / 42), the 15 data sources, the cost page, the suggestions |
| E. Key questions | Optus's 12 Sample_BI_Questions, each with the fact the answer should contain (e.g. WA highest broken rate, 62.1% kept after FCR vs 44.9% after a transfer), plus a deep analysis and the answer's trace and quality score |
| F. Guardrails and policy | Injection, abuse, personal details (email, Australian mobile), off-topic, a thank-you; no forecast, no target, no dollar cost of handle time, no causal claim, no contact details, no outbound channels |
| G. Evaluations | Runs the in-app suites: routing, guardrail and policy must all pass; accuracy misses are warnings |
| H. Clicks and buttons | Clicked suggestions, "Answer from the data instead", "Go deeper" |
| I. Conversations | The three routing-test conversations plus three org ones (pushback, Quick kept for a multi-step question, memory) |
| J. Sessions | Chart and naming, a follow-up, history, feedback, the audit trail, memory, rename and delete |
| K. Answer cache | A suggested question from the cache; Refresh answers live |

**Org routing test** (about 30 minutes):

```bash
python deploy/deploy.py --config deploy/config/org2.json --only org-routing
python deploy/deploy.py --config deploy/config/org2.json --only org-routing --test-args "--matrix-only"   # router decisions only
```

1. **Routing grid:** 22 kinds of message × Auto / Quick / Deep × 4 starting points: a new chat, after a quick data answer, after a deep analysis, and after a guide answer. That's about 260 router decisions, with no query-engine calls.
   - **FAIL:** a firm rule of `router.ts` was broken. Every firm rule was checked offline against `decide()` for every possible router-model reading (12,789 decisions), so a FAIL is a real routing bug.
   - **WARN:** the router model's judgement went the other way where the rules let it decide.
2. **End to end:** clicked suggestions and buttons in each mode, then the six live conversations.

Paste the summary at the end of each log (or the whole log) back for review.

## Repository layout

| Path | Contents |
|---|---|
| `Data/` | Optus's workbook (v2 is used) |
| `deploy/deploy.py` | The one-command deploy |
| `deploy/config/` | Workspace configs |
| `deploy/sql/` | All table/view DDL, templated by catalog and schema prefix |
| `deploy/genie/space.py` | Genie space as code: sources, instructions, examples, benchmarks |
| `deploy/lakebase/schema.sql` | Chat history, usage log, answer cache, evaluation and memory tables |
| `deploy/evals/cases.py` | Evaluation cases: ground truth (Optus's sample questions), red-team guardrail, policy and routing cases (seeded into Lakebase) |
| `deploy/smoke_test.py`, `deploy/routing_test.py` | End-to-end tests of a deployed app |
| `appkit-genie-app/` | The app: Node/Express server (`server/`) and static UI (`public/`) |
| `docs/` | Architecture diagrams (PNG and SVG); `docs/diagrams/` holds the Node scripts that draw them (sharp, react-icons) |

## Gold views

| View | Answers |
|---|---|
| `qry_account_month` | The governed detail: every account-month with its bands, call outcome, last month's outcome, repeat streaks and scenario flags; the source of every account list |
| `mv_collections` | Metric view: every measure (balances, promises, broken and kept rates, FCR, transfers, repeats, handle time) by any dimension and month |
| `qry_monthly_trend` | The month-by-month trend |
| `qry_ptp_break_drivers` | Why promises break: the broken rate of each segment of ten factors over 12 months, with whether the factor makes a clear difference |
| `qry_fcr_vs_promises` | Scenario 4: promises and broken rates by call outcome |
| `qry_contact_by_segment`, `qry_transfer_cost` | FCR, transfers, repeats and handle time by product, state, credit band or days past due; scenario 5 by state × product |
| `qry_repeat_after_unresolved` | Scenario 6: repeat calls by last month's call outcome |
| `qry_scenario_summary`, `qry_scenario_accounts` | Scenarios 1, 2, 3 and 6 at the latest snapshot: sizes, balances and the accounts |
| `qry_dpd_exposure` | Overdue balance by days-past-due bucket, latest month |
| `qry_account_history` | Each account over the 12 months |
| `qry_cc_kpis`, `qry_cc_top_broken_accounts` | The Command Center headline (latest month, last month, 12 months) and the 100 broken promises with the most at stake |

## Business rules and view descriptions

- **Every threshold is a row in `gold.business_rules_config`** (`deploy/sql/40_gold_config.sql`):
  - the three Scenario Guide thresholds: more than 30 days past due; credit score below 550; 2+ missed payments;
  - the bands for days past due, credit score, missed payments and promise lead time;
  - the 30-promise minimum before a segment is ranked;
  - the 10-point spread for a factor to "make a clear difference";
  - the 2-month repeat streak and the top-100 list;
  - `handle_cost_per_minute`, empty until Optus supplies a rate.

  Each row says what it means and why.
  - **Certified and Command Center views** read the values live through `gold.qry_rules` (a `CROSS JOIN`, or `{{live:<rule>}}`, which the deploy expands into a read of `qry_rules`).
  - **The metric view** can't read a table at query time, so the deploy writes the value in (`{{rule:<rule>}}`, `{{rule:<rule>+1}}` for a band's next value) and stops if a rule has no value.
  - **The Genie instructions** quote thresholds through `{{rule:}}`, `{{pct:}}` and `{{pts:}}`, filled from the table at each `genie` step.
  - **To change a threshold:** edit its row in `40_gold_config.sql`, then run `--only transform,views,summary,genie`.
- **Every gold view has a description** (`COMMENT ON TABLE` / `COLUMN`, next to the view in `deploy/sql/60_certified_views.sql` and `70_command_center_views.sql`): the business question it answers (from Optus's Sample_BI_Questions and Scenario Guide), its grain, its rules, and when to prefer it over a similar view. Edit descriptions and the Genie space in the repo, not the UI: every deploy re-creates them.
- **The app's account lists use the same rules:** each list behind a Command Center card reads the same view and columns as the card's number (`server/routes/dashboard.ts`).

## Known limits and future work

- **Questions for Optus after the demo:**
  - the channel of promises made without a contact;
  - a cost per minute of handle time;
  - whether `Missed_Payments_L12M` is a rolling 12-month count (it goes down for some accounts);
  - whether they want a subscription/legacy grouping of the products.
- **Running the app on more than one server (scale-out):** the question router's short-lived decision memory (`server/lib/router.ts`) and the "one evaluation at a time" check (`server/lib/evals.ts`) are kept in the server's memory; both would need moving to Lakebase first. Everything else already lives in Lakebase.
