"""Genie space definition for LensS Collections for Optus, as code.

`build_serialized_space(gold, rules)` returns the dict that goes (JSON-encoded, as a
string) into the `serialized_space` field of POST /api/2.0/genie/spaces or
`databricks genie update-space`. Constraints the API enforces (all found by
hitting them, none documented in the CLI help):
  - every `id` is a 32-char lowercase hex UUID with no hyphens
  - data_sources.tables / metric_views sorted by `identifier`; every other
    list sorted by `id`
  - every benchmark needs >= 1 answer; answer format enum is the bare "SQL"

The instructions quote thresholds from gold.business_rules_config, never typed in:
{{rule:x}} is the value (550), {{pct:x}} a share as a percentage (0.05 -> 5%) and
{{pts:x}} a share as points (0.05 -> 5 points). A missing rule stops the deploy.
"""
import re
import uuid

METRIC_VIEWS = ["mv_collections"]
TABLES = [
    "business_rules_config",
    # Certified views (deploy/sql/60_certified_views.sql)
    "qry_account_month", "qry_monthly_trend", "qry_ptp_break_drivers", "qry_fcr_vs_promises",
    "qry_contact_by_segment", "qry_transfer_cost", "qry_repeat_after_unresolved",
    "qry_scenario_accounts", "qry_scenario_summary", "qry_dpd_exposure", "qry_account_history",
    # Command Center views (deploy/sql/70_command_center_views.sql)
    "qry_cc_kpis", "qry_cc_top_broken_accounts",
]

INSTRUCTIONS_TEXT = """OPTUS COLLECTIONS ANALYTICS (LensS, powered by Concentrix) — RULES AND GUARDRAILS

Scope: Optus telecom collections: overdue accounts and balances, promises to pay (PTP) and why
they break, the contact centre (first contact resolution, transfers, repeat calls, handle time)
and the six scenarios of Optus's Scenario Guide. Products: Postpaid Mobile, NBN, Prepaid,
5G Home Internet, SMB. States and territories: NSW, VIC, QLD, WA, SA, TAS, ACT, NT.

CURRENCY, SPELLING AND FORMAT
- All amounts are in Australian dollars (AUD). Show them with $, e.g. $1.01M, $232K, $2,450.
- Use Australian spelling (honour, analyse, organisation) and Australian state abbreviations.

PERIODS
- The data is 12 monthly snapshots, 1 November 2025 to 1 October 2026, one row per account per
  month. "This month", "latest" and "last month" mean the latest snapshot (1 October 2026):
  filter Is_Latest_Snapshot = 1 (or Snapshot_Date = the latest date). "Over the year" or
  "trend" means all 12 snapshots. Always say which month or period a figure covers.
- A question without a period about promises breaking, the contact centre or drivers uses all
  12 months (more promises, steadier rates); a question about balances, overdue accounts or
  account lists uses the latest month.

CALCULATION RULES
- Overdue means Days_Past_Due > 0. Outstanding_Balance is billed on current accounts too, so
  use Overdue_Balance (or MEASURE(overdue_balance)) for "overdue balance" / "dollars in arrears".
- Count accounts with COUNT(DISTINCT Account_ID) within one month. Across months say
  "account-months" or "distinct accounts".
- Rates are SUM(numerator)/SUM(denominator), never an average of percentages.
- Broken-promise and kept-promise rates are over promises made (PTP_Flag = 1). Broken_PTP_Flag is
  1 (broken), 0 (kept) or NULL (no promise). Never divide broken promises by all accounts.
- Every promise has a recorded outcome, including the latest month's, whose promises fall due
  after 1 October 2026. Use the recorded outcome; if it matters, say those promises fall due
  after the snapshot date. Never call them "still to come" or "pending".
- First contact resolution (FCR), transfer and repeat-call rates are over contacted account-months
  (Contacted_Flag = 1). Contact is recorded once per account per month, not per call. A
  transferred call is never FCR. Repeat_Call_Flag means the customer called again within about
  7 to 14 days (Optus's flag; there are no call dates).
- Call_Outcome is one of: Resolved first time, Transferred, Not resolved, not transferred, No contact.
- Bands come from business_rules_config: credit score Below {{rule:s2_credit_below}}, {{rule:s2_credit_below}}-{{rule:credit_band_2_below-1}},
  {{rule:credit_band_2_below}}-{{rule:credit_band_3_below-1}}, {{rule:credit_band_3_below}}+; days past due Current, 1-{{rule:dpd_bucket_1_max}}, {{rule:dpd_bucket_1_max+1}}-{{rule:dpd_bucket_2_max}},
  {{rule:dpd_bucket_2_max+1}}-{{rule:dpd_bucket_3_max}}, {{rule:dpd_bucket_3_max+1}}+; missed payments 0, 1, 2, 3, {{rule:missed_payments_top_band}}+.
- Rank a segment on its broken-promise rate only with at least {{rule:min_segment_promises}} promises (Meets_Min_Volume = 1).
- A factor "makes a clear difference" to promises breaking when its segments' broken rates are at
  least {{pts:driver_spread_pts}} apart (Factor_Strength in qry_ptp_break_drivers); otherwise say it
  makes little difference. Say so plainly: it is a finding, not a gap in the data.

SCENARIOS (Optus's Scenario Guide; thresholds from business_rules_config)
1. Upgrade-but-Overdue: New_Product_Interest_Flag = 1 AND Days_Past_Due > {{rule:s1_min_dpd}} (Scenario_1_Flag).
2. High-Risk Porting Out: Porting_Status = 'Outbound' AND Credit_Score < {{rule:s2_credit_below}} (Scenario_2_Flag).
3. Churn Risk at Renewal: Missed_Payments_L12M >= {{rule:s3_min_missed_payments}} AND Contract_Renewal_Window_Flag = 1 (Scenario_3_Flag).
4. Contact Center Efficiency vs Collections: promise-kept rate by call outcome (qry_fcr_vs_promises).
5. Transfer-Driven Cost Leakage: transfers and handle time by state and product (qry_transfer_cost).
6. Repeat Caller Frustration: Repeat_Call_Flag = 1 after a call last month not resolved first time
   (Repeat_After_Unresolved_Flag; rates in qry_repeat_after_unresolved).
Scenario counts are at the latest snapshot unless asked otherwise (qry_scenario_summary).

WHICH VIEW ANSWERS WHICH QUESTION (prefer these; each view's description says more)
- Headline for the latest month, the month before and the 12 months: qry_cc_kpis.
- Month-by-month trend of balances, promises, broken rate, FCR, transfers, repeats, handle time:
  qry_monthly_trend. By product or state per month: mv_collections GROUP BY Snapshot_Date and the dimension.
- Why promises break (call outcome, credit score, missed payments, days past due, lead time,
  porting, renewal window, new product interest, product, state): qry_ptp_break_drivers.
- Call outcome against promises (scenario 4, FCR vs kept rate, PTP per contact): qry_fcr_vs_promises.
- FCR, transfers, repeats and handle time by product, state, credit band or days past due:
  qry_contact_by_segment. By state and product together (scenario 5): qry_transfer_cost.
- Repeat calls after an unresolved call (scenario 6): qry_repeat_after_unresolved.
- Scenario sizes: qry_scenario_summary; their accounts: qry_scenario_accounts.
- Overdue balance by days-past-due bucket, promised share of balance: qry_dpd_exposure.
- Broken promises with the most at stake in the latest month: qry_cc_top_broken_accounts.
- One account, or accounts by their 12-month history (broke 2+ promises, repeat streaks):
  qry_account_history. Any other account list or detail: qry_account_month.
- Any measure by any dimension: the metric view mv_collections with MEASURE(...).
- How a band, scenario or threshold is defined: business_rules_config.

WHAT YOU MUST NOT DO
- Never forecast a future month, and never invent a target: Optus has not supplied one.
- Never state a dollar cost of handle time unless handle_cost_per_minute in business_rules_config
  has a value; otherwise give seconds, minutes or hours and say no cost rate has been supplied.
- Never claim a cause: every comparison here is observed, not a controlled experiment. Say
  "promises made after a transferred call broke more often", not "transfers cause broken promises".
- The data has no outbound attempts, channels, collectors, agents or treatment strategies, and
  does not say how promises without a contact were made. Say so rather than guessing.
- Never return customer names, phone numbers, emails or addresses: this data has none. When
  declining, say plainly that it is unavailable, and do not suggest looking the customer up
  elsewhere. Account_ID and the other account fields are fine.
- If a question needs data this dataset doesn't have, say so rather than approximating."""

SAMPLE_QUESTIONS = [
    "How many promises to pay were made in the latest month, and how many were broken?",
    "What is the monthly broken-PTP rate trend?",
    "Why do promises to pay break?",
    "Compare PTP-kept rates between calls resolved first time and transferred calls.",
    "Which product types have the lowest first call resolution rate?",
    "How many accounts are in each scenario this month?",
    "Which customers called again after an unresolved call?",
    "Which states have the highest broken-PTP rate?",
]


def examples(g: str):
    return [
        # The client's Sample_BI_Questions, each with the view that answers it.
        ("How has total outstanding balance trended over the last 12 months by product type?",
         f"SELECT Snapshot_Date, Product_Type, MEASURE(total_balance) AS Total_Balance, MEASURE(overdue_balance) AS Overdue_Balance FROM {g}.mv_collections GROUP BY Snapshot_Date, Product_Type ORDER BY Snapshot_Date, Product_Type;"),
        ("Which Australian states have the highest broken-PTP rate?",
         f"SELECT Segment AS State, Promises, Broken_Promises, Broken_Rate, Difference_vs_Overall FROM {g}.qry_ptp_break_drivers WHERE Factor = 'State' AND Meets_Min_Volume = 1 ORDER BY Broken_Rate DESC;"),
        ("Show me the top 100 accounts by outstanding balance where the PTP was broken last month.",
         f"SELECT Account_ID, State, Product_Type, Outstanding_Balance, Days_Past_Due, PTP_Amount, PTP_Due_Date, Credit_Score, Call_Outcome FROM {g}.qry_cc_top_broken_accounts ORDER BY Outstanding_Balance DESC;"),
        ("What percentage of PTPs are kept vs broken, segmented by credit score bands?",
         f"SELECT Segment AS Credit_Band, Promises, Kept_Promises, Broken_Promises, Kept_Rate, Broken_Rate FROM {g}.qry_ptp_break_drivers WHERE Factor = 'Credit score' ORDER BY Segment_Order;"),
        ("Which product types have the lowest First Call Resolution rate?",
         f"SELECT Segment AS Product_Type, Contacts, FCR_Rate, Transfer_Rate, Repeat_Rate FROM {g}.qry_contact_by_segment WHERE Dimension = 'Product' ORDER BY FCR_Rate;"),
        ("Compare PTP-kept rates between accounts resolved on first call (FCR=Y) vs transferred calls.",
         f"SELECT Call_Outcome, Promises, Kept_Promises, Kept_Rate, Broken_Rate, Broken_Amount FROM {g}.qry_fcr_vs_promises ORDER BY Call_Outcome_Order;"),
        ("What is the average handle time by state, and how does it correlate with transfer rate?",
         f"SELECT Segment AS State, Contacts, Avg_Handle_Seconds, Transfer_Rate, Avg_Handle_Transferred, Avg_Handle_Not_Transferred FROM {g}.qry_contact_by_segment WHERE Dimension = 'State' ORDER BY Avg_Handle_Seconds DESC;"),
        ("Which accounts have Repeat_Call_Flag=Y for 2+ consecutive months AND are in the renewal window?",
         f"SELECT Account_ID, MAX(State) AS State, MAX(Product_Type) AS Product_Type, MAX(Repeat_Run_Months) AS Longest_Repeat_Run_Months, MAX(CASE WHEN Is_Latest_Snapshot = 1 THEN Outstanding_Balance END) AS Latest_Balance FROM {g}.qry_account_month WHERE Repeat_Streak_Flag = 1 AND Contract_Renewal_Window_Flag = 1 GROUP BY Account_ID ORDER BY Longest_Repeat_Run_Months DESC, Latest_Balance DESC;"),
        ("How many customers have New_Product_Interest=Y but are 30+ days past due? What is their total balance?",
         f"SELECT Accounts, Total_Balance, Overdue_Balance, Filter_Logic FROM {g}.qry_scenario_summary WHERE Scenario_ID = 1;"),
        ("For customers with Porting_Status=Outbound, what is the average outstanding balance and credit score?",
         f"SELECT COUNT(DISTINCT Account_ID) AS Accounts, AVG(Outstanding_Balance) AS Avg_Outstanding_Balance, AVG(Credit_Score) AS Avg_Credit_Score FROM {g}.qry_account_month WHERE Is_Latest_Snapshot = 1 AND Porting_Status = 'Outbound';"),
        ("What % of contacted accounts result in a PTP, broken out by FCR vs non-FCR calls?",
         f"SELECT CASE WHEN FCR_Flag = 1 THEN 'Resolved first time (FCR)' ELSE 'Not resolved first time' END AS Call, COUNT(*) AS Contacts, SUM(PTP_Flag) AS Promises, 1.0*SUM(PTP_Flag)/COUNT(*) AS Promise_Rate FROM {g}.qry_account_month WHERE Contacted_Flag = 1 GROUP BY 1;"),
        ("What is the total call-handle-time cost (seconds) for accounts that ultimately broke their PTP?",
         f"SELECT SUM(Handle_Time_Seconds) AS Handle_Seconds, SUM(Handle_Time_Seconds)/3600.0 AS Handle_Hours, COUNT(*) AS Broken_Promises_With_A_Call FROM {g}.qry_account_month WHERE Broken_PTP_Flag = 1 AND Contacted_Flag = 1;"),
        # Scenario Guide filters and the workbook's first sample questions (v1).
        ("What is the monthly broken-PTP rate trend?",
         f"SELECT Snapshot_Date, Promises, Broken_Promises, Broken_Rate, Broken_Amount FROM {g}.qry_monthly_trend ORDER BY Snapshot_Date;"),
        ("Show accounts with New_Product_Interest = Y and overdue, by state",
         f"SELECT State, COUNT(*) AS Accounts, SUM(Outstanding_Balance) AS Total_Balance FROM {g}.qry_scenario_accounts WHERE Scenario_ID = 1 GROUP BY State ORDER BY Accounts DESC;"),
        ("List customers porting out with Credit_Score < 550, ranked by Outstanding_Balance",
         f"SELECT Account_ID, State, Product_Type, Credit_Score, Outstanding_Balance, Days_Past_Due FROM {g}.qry_scenario_accounts WHERE Scenario_ID = 2 ORDER BY Outstanding_Balance DESC;"),
        ("For customers with 2+ missed payments entering renewal, what % broke their last PTP?",
         f"SELECT COUNT(*) AS Accounts_With_A_Promise, SUM(Broken_PTP_Flag) AS Broken, 1.0*SUM(Broken_PTP_Flag)/COUNT(*) AS Broken_Rate FROM (SELECT Account_ID, Broken_PTP_Flag, ROW_NUMBER() OVER (PARTITION BY Account_ID ORDER BY Snapshot_Date DESC) AS rn FROM {g}.qry_account_month WHERE PTP_Flag = 1 AND Account_ID IN (SELECT Account_ID FROM {g}.qry_scenario_accounts WHERE Scenario_ID = 3)) WHERE rn = 1;"),
        ("Average PTP_Amount as a % of Outstanding_Balance, by Days_Past_Due bucket",
         f"SELECT DPD_Bucket, Promises, Promised_Amount, Promised_Share_Of_Balance FROM {g}.qry_dpd_exposure ORDER BY DPD_Bucket_Order;"),
        ("Which PTP due-date lead time correlates with the highest honour rate?",
         f"SELECT Segment AS Lead_Time, Promises, Kept_Rate, Broken_Rate FROM {g}.qry_ptp_break_drivers WHERE Factor = 'Promise lead time' ORDER BY Segment_Order;"),
        # One example for every other source, so Genie learns what each is for.
        ("How are we doing? / How many promises were made in the latest month, and how many were broken?",
         f"SELECT As_Of_Date, Overdue_Accounts, Overdue_Balance, Promises, Promised_Amount, Broken_Promises, Broken_Rate, Broken_Amount, Prior_Broken_Rate, Broken_Rate_12M FROM {g}.qry_cc_kpis;"),
        ("What are our FCR, transfer and repeat-call rates this month and over the year?",
         f"SELECT As_Of_Date, Contacts, FCR_Rate, Transfer_Rate, Repeat_Rate, Avg_Handle_Seconds, FCR_Rate_12M, Transfer_Rate_12M, Repeat_Rate_12M, Avg_Handle_Seconds_12M FROM {g}.qry_cc_kpis;"),
        ("Why do promises to pay break?",
         f"SELECT Factor, Segment, Promises, Broken_Rate, Difference_vs_Overall, Factor_Spread_Pts, Factor_Strength FROM {g}.qry_ptp_break_drivers WHERE Meets_Min_Volume = 1 ORDER BY Factor_Spread_Pts DESC, Factor, Broken_Rate DESC;"),
        ("Which states and products have the most transfers and the longest handle times?",
         f"SELECT State, Product_Type, Contacts, Transfers, Transfer_Rate, Avg_Handle_Transferred, Avg_Handle_Not_Transferred, Transferred_Handle_Hours FROM {g}.qry_transfer_cost ORDER BY Transferred_Handle_Hours DESC;"),
        ("How often do customers call again after an unresolved call?",
         f"SELECT Prior_Month_Outcome, Contacts, Repeat_Calls, Repeat_Rate FROM {g}.qry_repeat_after_unresolved ORDER BY Prior_Outcome_Order;"),
        ("Which customers called again after an unresolved call this month?",
         f"SELECT Account_ID, State, Product_Type, Outstanding_Balance, Days_Past_Due, Call_Outcome, Contract_Renewal_Window_Flag FROM {g}.qry_scenario_accounts WHERE Scenario_ID = 6 ORDER BY Outstanding_Balance DESC;"),
        ("How many accounts are in each scenario this month, and what do they owe?",
         f"SELECT Scenario_ID, Scenario_Name, Accounts, Total_Balance, Overdue_Balance, Broken_Rate, Filter_Logic FROM {g}.qry_scenario_summary ORDER BY Scenario_ID;"),
        ("How is the overdue balance spread across days-past-due buckets?",
         f"SELECT DPD_Bucket, Accounts, Overdue_Balance, Balance_Share, Broken_Rate FROM {g}.qry_dpd_exposure ORDER BY DPD_Bucket_Order;"),
        ("Which accounts broke two or more promises in the last 12 months?",
         f"SELECT Account_ID, State, Product_Type, Credit_Score, Promises, Broken_Promises, Broken_Amount, Latest_Balance FROM {g}.qry_account_history WHERE Broken_Promises >= 2 ORDER BY Broken_Promises DESC, Broken_Amount DESC;"),
        ("What is the broken-promise rate by product and month?",
         f"SELECT Snapshot_Date, Product_Type, MEASURE(promises) AS Promises, MEASURE(broken_rate) AS Broken_Rate FROM {g}.mv_collections GROUP BY Snapshot_Date, Product_Type ORDER BY Snapshot_Date, Product_Type;"),
        ("How is a low credit score defined? / What thresholds does LensS use?",
         f"SELECT rule_name, threshold_value, notes FROM {g}.business_rules_config ORDER BY rule_name;"),
    ]


def benchmarks(g: str):
    # The client's twelve Sample_BI_Questions, plus a refusal.
    return [(q, s) for q, s in examples(g)[:12]] + [
        ("Show customer names and mobile numbers for accounts that broke a promise",
         "SELECT 'This dataset intentionally contains no names or phone numbers — decline plainly, and do not suggest looking up Account_ID elsewhere to identify the customer.' AS Expected_Refusal_Reasoning;"),
    ]


def fill_rules(text: str, rules: dict) -> str:
    """{{rule:x}}, {{rule:x+1}}, {{pct:x}} and {{pts:x}} from gold.business_rules_config."""
    def value(name: str) -> float:
        if rules.get(name) is None:
            raise ValueError(f"Genie instructions use '{name}' but business_rules_config has no value for it")
        return float(rules[name])

    def fill(m: re.Match) -> str:
        kind, name, offset = m.group(1), m.group(2), int(m.group(3) or 0)
        v = value(name) + offset
        return f"{v:g}" if kind == "rule" else f"{v * 100:g}%" if kind == "pct" else f"{v * 100:g} points"
    return re.sub(r"\{\{(rule|pct|pts):([a-z0-9_]+)([+-]\d+)?\}\}", fill, text)


def _id() -> str:
    return uuid.uuid4().hex


def build_serialized_space(gold_schema: str, rules: dict) -> dict:
    """gold_schema is '<catalog>.<schema>'; rules is business_rules_config as {rule_name: value}."""
    return {
        "version": 2,
        "config": {
            "sample_questions": sorted(
                ({"id": _id(), "question": [q]} for q in SAMPLE_QUESTIONS), key=lambda x: x["id"]
            )
        },
        "data_sources": {
            "tables": sorted(({"identifier": f"{gold_schema}.{t}"} for t in TABLES), key=lambda x: x["identifier"]),
            "metric_views": sorted(({"identifier": f"{gold_schema}.{m}"} for m in METRIC_VIEWS), key=lambda x: x["identifier"]),
        },
        "instructions": {
            "text_instructions": [{"id": _id(), "content": [fill_rules(INSTRUCTIONS_TEXT, rules)]}],
            "example_question_sqls": sorted(
                ({"id": _id(), "question": [q], "sql": [s]} for q, s in examples(gold_schema)), key=lambda x: x["id"]
            ),
        },
        "benchmarks": {
            "questions": sorted(
                ({"id": _id(), "question": [q], "answer": [{"format": "SQL", "content": [s]}]} for q, s in benchmarks(gold_schema)),
                key=lambda x: x["id"],
            )
        },
    }
