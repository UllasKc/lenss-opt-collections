# Changelog and development log

Everything that has changed in LensS Collections Intelligence for Optus, newest first, with the reasons and what was verified. For how things work, see `README.md`.

Versions match git tags where one exists.

---

## Unreleased

### Call-outcome driver card
- Command Center chapter 2: the call-outcome card shows contacted customers only (no "No contact" bar). Its line and colours compare against contacted customers' broken rate (45.4%), not the overall 44.6%.

### Explorer tiles
- The Accounts and Overdue accounts tiles are removed; the account count is still in the line under the Explorer title.

### Error handling aligned with LensS v1.12.7
- 503 only for real outages: connection failures, a disabled or suspended endpoint, a stopped warehouse, capacity errors. The bare "503" and the broad "warehouse" patterns are dropped, so an ordinary SQL error stays a 500.

### Optus logo (2026-10-23, at the user's request)
- The Optus logo (supplied by the user, cropped to `public/img/optus-logo.png`) replaces the "FOR OPTUS" text tag in the header ("for [logo]"). It also appears on its own, in a white chip, at the top of the Command Center hero, and in the footer. It sits on a white chip so it reads the same in light and dark mode. The page title still says "for Optus". This reverses the v1.0.0 choice of no Optus logo; it is still LensS, powered by Concentrix, presented for Optus, not by Optus.

### Explorer: two dimensions at once, more charts (deployed to personal and checked, 2026-10-23)
- **Heatmap: product by arrears stage, or any pair.** A new panel under the slicer shows one measure for each product × days-past-due cell, coloured against the view's own overall figure (red: worse by 5+ percentage points; blue: within 5; green: better by 5+). Cells with fewer than 30 promises are faded. You can pick the rows, the columns (any two filters, month included) and the measure: broken-promise rate (the default), kept-promise rate, promise rate (promises ÷ account-months), FCR, transferred, called again, or overdue balance (shaded by size). Click a cell to see its accounts. The current filters apply. New endpoint: `GET /api/explorer/grid?rows=&cols=` (both must be known dimensions); new measures `promise_rate` and `kept_rate`.
- **The call-outcome chart uses contacted customers as its base,** like the FCR tile. It showed shares of all account-months, so with about 82% not contacted, "resolved first time" read as about 12% by product against 67% overall. Each bar is now resolved first time, transferred and left unresolved (adding up to 100%), and the label gives the share contacted.
- **Chart review: bases, axes and explanations.**
  - Command Center 12-month trend: the axis now starts at zero. The overdue balance moves about 3% month to month ($985K to $1.04M), and the auto-scaled axis made that look like large swings. A note says what each series counts.
  - Every chart says what a bar is and what its colours mean: the chapter 2 driver cards (3-point bands), Scenario 4 ("promised in 23% of these months" now reads "made in 23% of 21,009 account-months with this outcome"), Scenario 5 (transfers ÷ contacted customers by state, and what the hours are) and Scenario 6.
  - Scenario 6: "Not resolved last month" includes transferred calls and now says so. "First month (no history)" is labelled "November 2025 (no month before)". Bars read "called again, of contacted".
  - Chapter 4 table: the "Broken" column is now "Broken rate", with a note on what the promises are.
  - Explorer slicer: a note explains the colours and the marker, and says that balances and accounts are monthly averages over several months. The call-outcome and promised-money panels say what a bar is.
  - Explorer heatmap: each measure has its own band (5 points for broken, kept and FCR; 3 for transferred and repeat; 2 for a promise rate of about 8%, where 5 points coloured everything blue). The legend gives the band, and says when the overdue balance is a monthly average.
- **The heatmap leaves out a row or column with no value for the measure,** e.g. "Current" for the promise measures (accounts that are not overdue make no promises), instead of a line of dashes.
- **Two charts follow the slicer's dimension:** promised money, kept against broken (stacked); and call outcomes (resolved first time, transferred, left unresolved, no contact) as shares of account-months that add up to 100%.
- **The 12-month trend panel has a line chart** of the broken, FCR, transferred and repeat rates above its table.
- **Account records: the sorts say what they do.** "Overdue balance" and "Balance" looked like the same thing, because the table shows only Balance. On a row, the overdue balance is the balance if the account is past due and $0 if it is current. The sorts are now "Overdue first, largest balance" (the default) and "Largest balance, all accounts".
- **No "pts" in the Explorer tiles.** "+1.2 pts vs whole book" now reads "whole book 38.5%".

### Org test fixes (from the first org run, 2026-10-23)
- **I1 / routing turn 5.1 failed, plus 4 WARNs on the same multi-step question.** The router did offer a deep analysis for "Why are promises breaking after transferred calls, and which states and products should we fix first?" (its reason says so), but `POST /api/chat/route` left `suggestDeep` out of its response. Only the tests read that endpoint's field, so the app's own "go deeper" offer worked. The endpoint now returns `suggestDeep`.
- **F4 (off-topic) and F10 (contact details) were false warnings.** Both answers declined correctly ("That isn't related to the collections database…", "That's unavailable in this dataset… no customer phone numbers"), but the test's patterns missed curly apostrophes, "unavailable" and "no customer phone". The patterns are fixed in `org_smoke_test.py`.
- **G1 (accuracy 9/10) was a bug in the faithfulness check, not a wrong answer.** On "Which accounts have Repeat_Call_Flag=Y for 2+ consecutive months AND are in the renewal window?" the answer matched 100% of the ground truth but scored 50% faithfulness. The numbers check read the digits of every account ID (OPT-10000123) as a figure, found none of them in the results (where the ID is text), and scored 0; averaged with the judge model's 1.0, that gave 50%. Identifiers like OPT-10000001 are no longer read as figures (`judge.ts`). This also corrects the faithfulness scores of live answers that list accounts.
- **D5 / P8 (cost page "Coming soon") is expected:** the person deploying can't read `system.billing`. It needs a metastore admin to grant SELECT on `system.billing.usage` and `system.billing.list_prices`, then a re-run of the deploy.

### Command Center review fixes (deployed to personal and checked, 2026-10-23)
- **The contact-centre figures add up now.** The executive summary (line 3) and the chapter 3 opening said "67.0% resolved first time, 12.9% transferred and 14.0% called again", which reads as one split that comes to 93.9%. They now give the three call outcomes, which add up to 100%, with repeat calls separate: "67.0% resolved first time, 12.9% transferred and 20.1% left unresolved; separately, 14.0% called again within about two weeks." "Left unresolved" (neither resolved first time nor transferred) is computed as 1 − FCR − transferred, and the KPI dictionary has a new entry for it.
- **Bug fixed: "Factors that make little difference" listed every factor**, the three clear ones included (credit score, call outcome, missed payments), and so did chapter 2's opening sentence. `renderDrivers` compared two separately built lists of factor objects by identity, so nothing ever matched. It now compares factor names.
- **No more "pts".** A gap between two rates ("19 pts") reads as a percentage. The driver cards now show the range ("Clear difference: 37.9% to 57.0% broken"), and so does the executive summary's chapter 2 figure ("38%–57%, broken, by credit score"). The little-difference panel and the KPI dictionary say "10 percentage points". The Scenario 4 card shows the broken rate after a transfer, against the rate after a first-time resolution.
- **The hero "Overdue balance" tile says what changed.** "3,820 accounts · down 2.5% on last month" read as though the accounts had fallen; it was the balance. It now reads "3,820 accounts · balance down $25K (2.5%) from $1.04M in September" (`Prior_Overdue_Balance`, `prior_date`).
- **"No contact" is explained under the call-outcome chart:** no contact-centre contact was recorded that month; those promises were made another way (app, SMS, IVR, online, store), and the data doesn't say which.
- **"Scenario Guide", not "Scenario_Guide", in everything a person reads:** the Command Center, the Assistant's platform guide, the Genie space text, the view descriptions, the app description and the README. The sheet name stays as it is in the code and in the README's sheet table.
- **Also found in the review:**
  - The hero note said "All N of this month's promises fall due after…" even when only some did. It now says "All" only when the count equals the month's promises.
  - The top-100 "Ask LensS" question said "broken last month" but meant the latest month, which could send Genie to September. It now says "in the latest month".

- **Every test ends with a summary that stands on its own,** so pasting the end of the output is enough to diagnose. Each starts with the app, date and options, and gives the counts:
  - **Smoke test:** a `=== SUMMARY ===` with every failure in full.
  - **Org smoke test:** every FAIL and WARN with up to 500 characters of detail (was 220). The deploy step then repeats the nine workspace checks (P1–P9) with the detail of any that didn't pass.
  - **Org routing test:** every FAIL and every WARN probe (what it routed to and what was expected), every end-to-end check, and the conversation result. Previously the summary listed failures only.
- **Fix: one database error stopped the whole app.**
  - **What happened on personal:** the shared Lakebase endpoint was disabled ("The endpoint has been disabled"). `GET /api/chat/sessions` awaited it with no try/catch. Express 4 doesn't catch a rejected async handler, so the rejection went unhandled and Node stopped the server. The Assistant then showed "Sorry, that question couldn't be answered".
  - **The fix:** every router is wrapped (`server/lib/asyncRoutes.ts`, `catchAsync`), so an async error reaches one error handler. It answers 503 "a data service is unavailable" for Lakebase or warehouse outages and 500 otherwise, and closes a stream already under way. A failure in background work is logged, never fatal (`unhandledRejection`).
  - **Verified locally:** a handler failing like the disabled endpoint gets a 503 and the server keeps answering; type-check passes.
  - **Not yet deployed:** the personal workspace's Lakebase endpoint is disabled and its warehouse won't start.
- **Org test suites for the org laptop,** modelled on the Lens MLOps ones. Both refuse to run on the personal workspace. See README, "Org tests".
  - **`deploy/org_smoke_test.py`, sections A–K (about 40 minutes):**
    - the Command Center's headline adds up and matches the source data;
    - every "View accounts" list matches its card, and the driver and transfer lists add up;
    - the Explorer reconciles to the Command Center for the latest month and the 12 months;
    - Optus's 12 sample questions, each checked for its fact (from the app's own figures, so a data change doesn't break them);
    - guardrails and policy for Optus: no forecast, target, handle-time dollar cost, causal claim, contact details or outbound channels;
    - the in-app evaluations, clicks and buttons, six live conversations, sessions and memory, the answer cache.
  - **Workspace checks:** `--only org-smoke` first runs nine checks as the person deploying (P1–P9): app, permissions including the demo-givers group, data vs the workbook, descriptions, metric-view bands, Genie, Lakebase, cost view, credentials.
  - **`deploy/org_routing_test.py`, about 30 minutes:** a 261-probe routing grid (22 messages × 3 settings × 4 starting points) plus end-to-end clicks and the six conversations.
  - **Firm rules verified offline:** every firm rule holds for all 12,789 combinations of probe and router-model reading through the real `decide()`, so a FAIL is a real routing bug.
  - **New deploy steps:** `org-smoke` and `org-routing` (only when named) and `--test-args`. `routing_test.py` now exposes `run_conversations` for both suites.
  - **Not run yet:** they need the org deployment and the test service principal.
- The cost route's fallback schema name is now Optus's, like the other routes.
- **Optus diagrams** (`docs/`, PNG and SVG), adapted from the LensS Collections set. Every fact comes from the Optus build: Optus's data and views, 16 business rules, 29 Genie examples and Optus's 12 sample questions as benchmarks, the `chatapp-optus` database, no targets or outbound.
  - `LensS_Optus_How_It_Works`: the four steps for a non-technical audience.
  - `LensS_Optus_Architecture`: the technical view, including the medallion pipeline and the 11-step deploy.
  - `LensS_Optus_Agentic_Architecture`: the governed agentic view. Engines not built yet are dashed "ready to add" (more Genie agents, document knowledge, MCP tools, Teams/API channels).
  - Branding: LensS, powered by Concentrix, with a "FOR OPTUS" tag and a yellow rule under the title. No Optus logo.
  - The scripts that draw them are in `docs/diagrams/`. Each was rendered and checked for overlaps.
- **Ported from LensS Collections v1.12.1–v1.12.5,** each checked against the Optus code first:
  - **Folder sharing (v1.12.1, 6481ee3):** the source-folder share now covers everyone who may start the app. Start re-runs the deployment as the person pressing it, and in org, sharing with the app's service principal alone wasn't enough. Now shared: the service principal, every direct CAN_MANAGE holder on the app (not "admins"), and config `app_starters` (a name with "@" is a user, otherwise a group).
  - **One at a time (v1.12.2, 8acfd4a):** principals are shared one at a time, so a rejected one (for example a CAN_MANAGE user not in the workspace) doesn't block the rest. Each failure is logged with Databricks' reason, then a "readable by N of M" line.
  - **Demo givers (v1.12.3, ef74a16):** a new config `demo_givers_group` gets CAN_MANAGE on the app before the sync, so the folder sharing includes it. A wrong name only warns. The model: readers = Consumer access + CAN_USE; demo givers = Workspace access only + CAN_MANAGE + folder read. Not set in the Optus configs yet: waiting for the group names.
  - **Cost card (v1.12.4, 6459fdf):** when cost figures aren't available, the cost tab shows a "Coming soon: Databricks cost is a work in progress" card instead of the metastore-grant instructions. The technical reason goes to the browser console.
  - **Not applicable (v1.12.5, bbfb1c0):** the collector-row grid fix. Optus has no collector rows, and no grid here holds a View button.
  - **Verified:** `deploy.py` parses, the call order is right (demo givers before the sync, folder sharing after) and cost.js parses. **Not yet deployed:** the personal workspace's only warehouse (Serverless Starter, 2X-Small) still refuses to start with "Cannot create the resource, please try again later".
- **Ported from LensS Collections v1.12.0 (fd9deb9),** each checked against the Optus code first:
  - **Deploy guard (`check_page_scripts`):** the app step now stops before changing anything if two page scripts declare the same top-level name, the bug that stopped Observability loading here. The Optus scripts pass; a planted `dayLabel` / `renderCost` duplicate is caught.
  - **Router:** a vague follow-up ("Tell me more", "Can you explain that?") after a data answer stays at the chosen depth instead of becoming a fresh deep analysis. Two routing eval cases in Optus wording (42 in all).
  - **Responsible AI** lists only the assistant's data sources, leaving out the app's internals (`qry_rules`, `qry_platform_cost`).
  - **Privacy:** a real email in a code comment is replaced with `jane.doe@example.com`.
  - Already in Optus: the Genie threshold tokens. Not applicable: `qry_cc_actions`, which Optus doesn't have.
  - **Verified:** type-check, the guard on the real scripts and on a planted duplicate. **Not yet deployed:** the personal workspace couldn't start its SQL warehouse ("Cannot create the resource, please try again later"), so `--only lakebase,app` is still to run.
- **Others can start the app after idle stop.** Starting a stopped app re-runs its last deployment, which downloads the code from the folder the deploy synced to, in the deployer's home. For anyone else with CAN_MANAGE, Start failed with "Error downloading source code … no files found". The app step now gives the app's service principal CAN_READ on that folder (`grant_source_read`, right after the sync; a failure only warns). Ported from LensS Collections. Verified on personal: the folder's permissions now show the service principal with CAN_READ.

## v1.0.0 (deployed to personal, 16 Oct 2026)

LensS Collections for Optus: the LensS Collections product (v1.11.0, commit `09ff2c1`), rebuilt around Optus's telecom collections data. It is LensS, powered by Concentrix, for Optus: no Optus logo, and the Concentrix Data & Analytics Practice credit is kept.

### Data
- **Optus's v2 workbook** (`Data/Optus_GenBI_Collections_Demo_Data_v2.xlsx`). It replaces v1, which had no interaction data. Profiled first:
  - 15,000 accounts × 12 monthly snapshots (1 Nov 2025 to 1 Oct 2026), 180,000 rows, no duplicates;
  - the rules the data dictionary states hold: a transferred call is never FCR, and every non-contact row is 'N/A';
  - the three filter scenarios match the Scenario_Guide's counts (339 / 115 / 473).
- **Ingest** keeps 'N/A' and 'None' as text. pandas reads both as missing by default, which would have lost "no porting".
- **Silver** turns Y/N into 1/0, and a flag that doesn't apply into NULL:
  - `Broken_PTP_Flag` without a promise: the workbook writes 'N', which would have counted as kept;
  - the call flags without a contact.

### Gold
- **Rules:** `business_rules_config` holds the three Scenario_Guide thresholds, the bands (days past due, credit, missed payments, lead time), the 30-promise minimum, the driver spread, the repeat streak, the top-100 list and an empty `handle_cost_per_minute`.
- **The driver spread is 10 points, not 5:** at 5 the eight states (41.8% to 46.9%) would have read as a driver, but that gap is about what segments of a few hundred promises vary by chance. Call outcome (19 points), credit score (34) and missed payments (13.5) clearly exceed 10.
- **Views:**
  - `qry_account_month`, the governed account-month view: bands, call outcome, last month's outcome, repeat streaks, scenario flags;
  - one metric view, `mv_collections`;
  - eleven certified views: trend, break drivers, FCR vs promises, contact by segment, transfer cost, repeat after unresolved, scenario summary and accounts, DPD exposure, account history;
  - two Command Center views.
  
  Every view and key column is described.
- **Removed:** targets, achievement, gap, outlook, outbound, channels, collectors and strategies. The data has none of them.
- **Promises due after the latest snapshot:** all 1,277 October promises fall due after 1 October 2026 but already have an outcome. Every page, the summary and the Genie instructions use the recorded outcome and say they fall due after the snapshot date.
- **`deploy.py`:**
  - the ingest reads the four Optus sheets;
  - `{{rule:x+1}}` / `{{rule:x-1}}` fill band edges in the metric view;
  - a rule with no value stops the deploy instead of failing on `float(None)`;
  - the transform checks the row, account, promise and scenario counts against the workbook;
  - the executive summary is written from the new views;
  - amounts are in AUD.

### Genie space (as code)
- **Sources:** 14 gold tables and views plus the metric view.
- **Instructions** cover AUD and Australian spelling, the periods, the rate definitions, the scenarios and what the data doesn't have. Thresholds are filled from the rules table (`{{rule:}}`, `{{pct:}}`, `{{pts:}}`).
- **A guide to which view answers which question.**
- **Examples:** 29, with one for every source; the first twelve are Optus's Sample_BI_Questions.
- **Benchmarks:** those twelve questions plus a personal-data refusal.

### App
- **Command Center:** five chapters, and every figure opens its accounts.
  1. Promises this month: kept and broken, against the 12-month rate.
  2. Why promises break: factors that make a clear difference, and those that make little.
  3. Contact centre: FCR, transfers, repeat calls and handle time, with scenarios 4, 5 and 6.
  4. Where the money is: overdue balance by days past due, and a 12-month trend chart.
  5. Scenarios: the six Scenario_Guide scenarios, and the top 100 broken promises.
- **Explorer:** ten filters (month first, opening on the latest month), the slicer, promises by call outcome, the 12-month trend of the view, account records and CSV export.
- **Assistant:**
  - router prompt and `DATA_WORDS` in Optus vocabulary (states, products, FCR, transfers, repeats);
  - platform guide rewritten for the new screens;
  - suggestions, quick starts and the library come from Optus's questions;
  - follow-up and empty-result prompts updated;
  - answer-cache key details use products, states and call outcomes.
- **Guardrails:**
  - Australian phone, Medicare and tax file number patterns;
  - the classifier and messages cover Optus's scope;
  - policy checks: causal claims, forecasts, a dollar cost of handle time (there is no cost rate) and probabilities stated as fact. They replace cure rate and probability of hitting a target.
- **Judge:** Optus band names are not read as figures, and the rule numbers are Optus's.
- **Branding:**
  - "LensS Collections Intelligence for Optus", with a small "for Optus" tag;
  - a light teal and yellow accent on the hero;
  - Concentrix logo and credit kept;
  - Responsible AI text for Optus, including Australia's AI Ethics Principles.
- **Evals:** guardrail, policy and routing cases rewritten in Optus terms. The accuracy cases are Optus's sample questions.
- **Tests:**
  - the smoke test checks the new endpoints;
  - the account lists must match their cards;
  - the Explorer must reconcile to the Command Center for the latest month;
  - the routing test conversations use Optus questions.
- **Removed from this repo:**
  - LensS Collections' workbook and specification documents;
  - its docs/ folder, design log, leadership summary, plan and review PDF;
  - its deploy configs;
  - the generated `app.yaml` and the template `databricks.yml`, which pointed at its workspace. `app.yaml` is now a placeholder the deploy overwrites.

### Verified (offline, before any deploy)
- **Server type-check:** passes. Every front-end script parses.
- **42 offline checks** of the deterministic parts: guardrail patterns, policy checks, router signals, judge figure extraction and answer-cache keys. 41 pass. The one miss is the test's own expectation: the judge reads "550," with its trailing comma, and the value is still recognised as a rule number.
- **A pandas reproduction of the gold views** on the v2 workbook matches the profile:
  - latest month: 1,277 promises, 561 broken (43.9%), $107K; 12 months 44.6%;
  - broken rate by call outcome: 37.9% after FCR, 55.1% after a transfer, 57.0% unresolved;
  - repeat calls: 44.5% after an unresolved month, 8.2% after FCR;
  - scenarios 339 / 115 / 473, and 86 repeat callers this month.
  
  `deploy.py`'s own `build_exec_summary` ran on those figures and wrote the expected text.
### Deployed to personal (16 Oct 2026)
- **Fix found on the first run:** a metric-view field takes at most 10 synonyms (State and Product_Type had 11).
- **Ingest:** 180,000 / 20 / 6 / 12 rows, as in the workbook.
- **Transform check:**
  - 180,000 account-months, 15,000 accounts and 15,648 promises;
  - scenarios 339 / 115 / 473, as in the Scenario_Guide, and 86 repeat callers.
- **The executive summary on the warehouse** is word for word the offline one.
- **Every gold view queried on the warehouse:**
  - 100 top broken promises, 1,013 scenario-account rows, 39 driver rows;
  - only credit score (34 points), call outcome (19) and missed payments (13.5) make a clear difference;
  - the metric view's broken rates by call outcome equal the certified view's.
- **Created:**
  - Genie space "LensS Optus Collections Analytics";
  - database `chatapp-optus` in the shared Lakebase project, with 13 accuracy, 15 guardrail, 8 policy and 40 routing eval cases;
  - app `lenss-optus-collections`, idle stop 15 minutes;
  - the cost view.
- **No smoke or routing tests on personal** (cost); they run in org.
- **Fix: Observability loaded forever.** The new Command Center script declared a global `dayLabel`, which monitoring.js also declares. The browser then refused to load monitoring.js, so Observability's data was never requested. The server logs showed it: no `/api/admin/usage` or `/insights` calls. The Command Center's copy is now `asOfDate`. No other top-level name is declared in two scripts: cost.js keeps its `renderCost` inside a wrapper.
