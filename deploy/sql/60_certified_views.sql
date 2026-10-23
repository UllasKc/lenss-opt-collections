-- Certified views over the Optus collections data, answering the client's Scenario Guide and
-- Sample_BI_Questions. Thresholds and bands are read live from gold.qry_rules (CROSS JOIN, or
-- {{live:<name>}} expanded by the deploy), so every value comes from gold.business_rules_config.
-- Each view carries a description (COMMENT ON TABLE / COLUMN) saying the business question it
-- answers, its grain and rules, and when to use it. Genie and Catalog Explorer read these; edit them
-- here, never in the UI (CREATE OR REPLACE on every deploy would wipe UI edits).
--
-- Periods: "latest month" is the latest snapshot (1 October 2026); "12 months" is every snapshot
-- (November 2025 to October 2026). Promise outcomes are the recorded Broken_PTP_Flag in every month,
-- including the latest, whose promises fall due after the snapshot date.

-- 1. The governed account-month view: every row of silver with its bands, call outcome, last
-- month's call outcome and the scenario flags. The source of every account list.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_account_month AS
WITH rl AS (
  SELECT r.*,
    CONCAT('Below ', string(int(s2_credit_below)))                                         AS cb1,
    CONCAT(string(int(s2_credit_below)), '-', string(int(credit_band_2_below) - 1))         AS cb2,
    CONCAT(string(int(credit_band_2_below)), '-', string(int(credit_band_3_below) - 1))     AS cb3,
    CONCAT(string(int(credit_band_3_below)), '+')                                          AS cb4,
    CONCAT('1-', string(int(dpd_bucket_1_max)))                                            AS d1,
    CONCAT(string(int(dpd_bucket_1_max) + 1), '-', string(int(dpd_bucket_2_max)))           AS d2,
    CONCAT(string(int(dpd_bucket_2_max) + 1), '-', string(int(dpd_bucket_3_max)))           AS d3,
    CONCAT(string(int(dpd_bucket_3_max) + 1), '+')                                         AS d4,
    CONCAT('Up to ', string(int(lead_short_max_days)), ' days')                            AS l1,
    CONCAT(string(int(lead_short_max_days) + 1), '-', string(int(lead_mid_max_days)), ' days') AS l2,
    CONCAT(string(int(lead_mid_max_days) + 1), '+ days')                                   AS l3
  FROM {{catalog}}.{{prefix}}_gold.qry_rules r
), f AS (
  SELECT s.*,
    LAG(s.Snapshot_Date)  OVER (PARTITION BY s.Account_ID ORDER BY s.Snapshot_Date) AS Prior_Snapshot_Date,
    LAG(s.Contacted_Flag) OVER (PARTITION BY s.Account_ID ORDER BY s.Snapshot_Date) AS Prior_Contacted_Flag,
    LAG(s.FCR_Flag)       OVER (PARTITION BY s.Account_ID ORDER BY s.Snapshot_Date) AS Prior_FCR_Flag,
    -- Runs of consecutive months with a repeat call: a new group starts after every month without one.
    SUM(CASE WHEN COALESCE(s.Repeat_Call_Flag, 0) = 0 THEN 1 ELSE 0 END)
      OVER (PARTITION BY s.Account_ID ORDER BY s.Snapshot_Date ROWS UNBOUNDED PRECEDING) AS Repeat_Group,
    MAX(s.Snapshot_Date) OVER () AS Latest_Snapshot_Date
  FROM {{catalog}}.{{prefix}}_silver.fact_collections_snapshot s
), g AS (
  SELECT f.*,
    SUM(COALESCE(f.Repeat_Call_Flag, 0)) OVER (PARTITION BY f.Account_ID, f.Repeat_Group ORDER BY f.Snapshot_Date ROWS UNBOUNDED PRECEDING) AS Repeat_Run_Months,
    DATEDIFF(f.PTP_Due_Date, f.Snapshot_Date) AS PTP_Lead_Days
  FROM f
)
SELECT
  g.Snapshot_Date,
  DATE_FORMAT(g.Snapshot_Date, 'MMM yyyy')                                    AS Snapshot_Month,
  CASE WHEN g.Snapshot_Date = g.Latest_Snapshot_Date THEN 1 ELSE 0 END        AS Is_Latest_Snapshot,
  g.Account_ID, g.State, g.Product_Type, g.Credit_Score,
  CASE WHEN g.Credit_Score < rl.s2_credit_below THEN rl.cb1 WHEN g.Credit_Score < rl.credit_band_2_below THEN rl.cb2
       WHEN g.Credit_Score < rl.credit_band_3_below THEN rl.cb3 ELSE rl.cb4 END AS Credit_Band,
  CASE WHEN g.Credit_Score < rl.s2_credit_below THEN 1 WHEN g.Credit_Score < rl.credit_band_2_below THEN 2
       WHEN g.Credit_Score < rl.credit_band_3_below THEN 3 ELSE 4 END          AS Credit_Band_Order,
  g.Outstanding_Balance, g.Days_Past_Due,
  CASE WHEN g.Days_Past_Due > 0 THEN 1 ELSE 0 END                             AS Overdue_Flag,
  CASE WHEN g.Days_Past_Due > 0 THEN g.Outstanding_Balance ELSE 0 END         AS Overdue_Balance,
  CASE WHEN g.Days_Past_Due = 0 THEN 'Current' WHEN g.Days_Past_Due <= rl.dpd_bucket_1_max THEN rl.d1
       WHEN g.Days_Past_Due <= rl.dpd_bucket_2_max THEN rl.d2 WHEN g.Days_Past_Due <= rl.dpd_bucket_3_max THEN rl.d3 ELSE rl.d4 END AS DPD_Bucket,
  CASE WHEN g.Days_Past_Due = 0 THEN 0 WHEN g.Days_Past_Due <= rl.dpd_bucket_1_max THEN 1
       WHEN g.Days_Past_Due <= rl.dpd_bucket_2_max THEN 2 WHEN g.Days_Past_Due <= rl.dpd_bucket_3_max THEN 3 ELSE 4 END AS DPD_Bucket_Order,
  g.Missed_Payments_L12M,
  CASE WHEN g.Missed_Payments_L12M >= rl.missed_payments_top_band THEN CONCAT(string(int(rl.missed_payments_top_band)), '+')
       ELSE string(g.Missed_Payments_L12M) END                                 AS Missed_Payments_Band,
  LEAST(g.Missed_Payments_L12M, int(rl.missed_payments_top_band))             AS Missed_Payments_Band_Order,
  g.PTP_Flag, g.PTP_Amount, g.PTP_Due_Date, g.PTP_Lead_Days,
  CASE WHEN g.PTP_Flag = 1 THEN CASE WHEN g.PTP_Lead_Days <= rl.lead_short_max_days THEN rl.l1
       WHEN g.PTP_Lead_Days <= rl.lead_mid_max_days THEN rl.l2 ELSE rl.l3 END END AS PTP_Lead_Band,
  CASE WHEN g.PTP_Flag = 1 THEN CASE WHEN g.PTP_Lead_Days <= rl.lead_short_max_days THEN 1
       WHEN g.PTP_Lead_Days <= rl.lead_mid_max_days THEN 2 ELSE 3 END END     AS PTP_Lead_Band_Order,
  g.Broken_PTP_Flag,
  CASE WHEN g.PTP_Flag = 1 THEN 1 - g.Broken_PTP_Flag END                     AS Kept_PTP_Flag,
  CASE WHEN g.Broken_PTP_Flag = 1 THEN g.PTP_Amount ELSE 0 END                AS Broken_PTP_Amount,
  CASE WHEN g.Broken_PTP_Flag = 0 THEN g.PTP_Amount ELSE 0 END                AS Kept_PTP_Amount,
  CASE WHEN g.PTP_Due_Date > g.Latest_Snapshot_Date THEN 1 ELSE 0 END         AS Due_After_Latest_Snapshot_Flag,
  g.Contacted_Flag, g.FCR_Flag, g.Transferred_Flag, g.Repeat_Call_Flag, g.Handle_Time_Seconds,
  CASE WHEN g.Contacted_Flag = 0 THEN 'No contact' WHEN g.Transferred_Flag = 1 THEN 'Transferred'
       WHEN g.FCR_Flag = 1 THEN 'Resolved first time' ELSE 'Not resolved, not transferred' END AS Call_Outcome,
  CASE WHEN g.Contacted_Flag = 0 THEN 4 WHEN g.Transferred_Flag = 1 THEN 2 WHEN g.FCR_Flag = 1 THEN 1 ELSE 3 END AS Call_Outcome_Order,
  CASE WHEN g.Prior_Snapshot_Date IS NULL THEN 'First month (no history)' WHEN g.Prior_Contacted_Flag = 0 THEN 'No contact last month'
       WHEN g.Prior_FCR_Flag = 1 THEN 'Resolved first time last month' ELSE 'Not resolved last month' END AS Prior_Month_Outcome,
  CASE WHEN g.Repeat_Call_Flag = 1 AND g.Prior_FCR_Flag = 0 THEN 1 ELSE 0 END AS Repeat_After_Unresolved_Flag,
  g.Repeat_Run_Months,
  CASE WHEN g.Repeat_Run_Months >= rl.repeat_streak_months THEN 1 ELSE 0 END AS Repeat_Streak_Flag,
  g.New_Product_Interest_Flag, g.Porting_Status, g.Contract_Renewal_Window_Flag,
  CASE WHEN g.New_Product_Interest_Flag = 1 AND g.Days_Past_Due > rl.s1_min_dpd THEN 1 ELSE 0 END AS Scenario_1_Flag,
  CASE WHEN g.Porting_Status = 'Outbound' AND g.Credit_Score < rl.s2_credit_below THEN 1 ELSE 0 END AS Scenario_2_Flag,
  CASE WHEN g.Missed_Payments_L12M >= rl.s3_min_missed_payments AND g.Contract_Renewal_Window_Flag = 1 THEN 1 ELSE 0 END AS Scenario_3_Flag
FROM g CROSS JOIN rl;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_account_month IS 'The governed detail view: one row per account per monthly snapshot (15,000 accounts x 12 months, Nov 2025 to Oct 2026), amounts in AUD. Adds the bands (credit, days past due, missed payments, promise lead time), the call outcome, last month''s call outcome, repeat-call streaks and the Scenario Guide flags, all from business_rules_config. Use for account lists and any question the summary views don''t cover. Filter Is_Latest_Snapshot = 1 for "this month" / "latest month". Broken_PTP_Flag is NULL when no promise was made; FCR, transfer and repeat flags are NULL when there was no contact.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Is_Latest_Snapshot IS '1 on the latest snapshot (1 October 2026)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Overdue_Balance IS 'Outstanding_Balance when the account is overdue (Days_Past_Due > 0), else 0 (AUD)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.DPD_Bucket IS 'Current, 1-30, 31-60, 61-90 or 91+ days past due (dpd_bucket_* rules); sort by DPD_Bucket_Order';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Credit_Band IS 'Below 550, 550-649, 650-749 or 750+ (s2_credit_below and credit_band_* rules); sort by Credit_Band_Order';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.PTP_Lead_Days IS 'Days from the snapshot to the promised payment date';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Broken_PTP_Flag IS '1 = the promise was broken, 0 = kept, NULL = no promise this month';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Due_After_Latest_Snapshot_Flag IS '1 when the promise falls due after the latest snapshot (every promise of 1 October 2026). Its outcome is still the recorded Broken_PTP_Flag';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Call_Outcome IS 'Resolved first time (FCR), Transferred (never FCR), Not resolved, not transferred, or No contact this month';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Prior_Month_Outcome IS 'Last month''s call outcome for this account: Resolved first time last month, Not resolved last month, No contact last month, or First month (no history)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Repeat_After_Unresolved_Flag IS '1 = called again this month (Repeat_Call_Flag) after a call last month that was not resolved first time: the Scenario Guide''s "Repeat Caller Frustration"';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Repeat_Run_Months IS 'Consecutive months up to this one with a repeat call';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Repeat_Streak_Flag IS '1 = repeat calls in at least repeat_streak_months (2) consecutive months up to this one';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Scenario_1_Flag IS 'Scenario 1, Upgrade-but-Overdue: interested in a new product and more than s1_min_dpd (30) days past due';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Scenario_2_Flag IS 'Scenario 2, High-Risk Porting Out: porting out (Outbound) with a credit score below s2_credit_below (550)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_month.Scenario_3_Flag IS 'Scenario 3, Churn Risk at Renewal: s3_min_missed_payments (2) or more missed payments and in the contract renewal window';

-- 2. The month-by-month trend (Sample questions: "How has total Outstanding_Balance evolved?",
-- "What is the monthly broken-PTP rate trend?").
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_monthly_trend AS
SELECT Snapshot_Date, MAX(Snapshot_Month) AS Snapshot_Month,
  COUNT(DISTINCT Account_ID)                                            AS Accounts,
  SUM(Overdue_Flag)                                                     AS Overdue_Accounts,
  SUM(Outstanding_Balance)                                              AS Total_Balance,
  SUM(Overdue_Balance)                                                  AS Overdue_Balance,
  SUM(PTP_Flag)                                                         AS Promises,
  SUM(PTP_Amount)                                                       AS Promised_Amount,
  SUM(Broken_PTP_Flag)                                                  AS Broken_Promises,
  SUM(Kept_PTP_Flag)                                                    AS Kept_Promises,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(PTP_Flag),0)                      AS Broken_Rate,
  SUM(Broken_PTP_Amount)                                                AS Broken_Amount,
  SUM(Kept_PTP_Amount)                                                  AS Kept_Amount,
  SUM(Contacted_Flag)                                                   AS Contacts,
  1.0*SUM(Contacted_Flag)/NULLIF(COUNT(*),0)                            AS Contact_Rate,
  1.0*SUM(FCR_Flag)/NULLIF(SUM(Contacted_Flag),0)                       AS FCR_Rate,
  1.0*SUM(Transferred_Flag)/NULLIF(SUM(Contacted_Flag),0)               AS Transfer_Rate,
  1.0*SUM(Repeat_Call_Flag)/NULLIF(SUM(Contacted_Flag),0)               AS Repeat_Rate,
  AVG(Handle_Time_Seconds)                                              AS Avg_Handle_Seconds,
  SUM(Handle_Time_Seconds)/3600.0                                       AS Handle_Hours,
  SUM(Repeat_After_Unresolved_Flag)                                     AS Repeat_After_Unresolved
FROM {{catalog}}.{{prefix}}_gold.qry_account_month
GROUP BY Snapshot_Date;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_monthly_trend IS 'Answers: "How has outstanding balance evolved over the last 12 months?", "What is the monthly broken-promise rate trend?" and any month-by-month contact-centre trend (FCR, transfers, repeats, handle time). One row per monthly snapshot, Nov 2025 to Oct 2026, ordered by Snapshot_Date. Broken_Rate is over promises made; FCR, transfer and repeat rates are over contacted accounts. By product or state per month, use mv_collections grouped by Snapshot_Date and the dimension.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_monthly_trend.Overdue_Balance IS 'Balance on accounts more than 0 days past due (AUD)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_monthly_trend.Total_Balance IS 'Balance on every account, current or overdue (AUD)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_monthly_trend.Broken_Rate IS 'Broken promises / promises made that month';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_monthly_trend.Contacts IS 'Accounts contacted that month (one contact flag per account per month)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_monthly_trend.FCR_Rate IS 'Resolved on the first call / contacted';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_monthly_trend.Repeat_Rate IS 'Called again within about 7-14 days / contacted';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_monthly_trend.Repeat_After_Unresolved IS 'Repeat calls after a call last month that was not resolved first time (Scenario: Repeat Caller Frustration)';

-- 3. Why promises break: the broken-promise rate by every factor, over 12 months of promises.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_ptp_break_drivers AS
WITH p AS (SELECT * FROM {{catalog}}.{{prefix}}_gold.qry_account_month WHERE PTP_Flag = 1),
seg AS (
  SELECT 'Call outcome' AS Factor, 1 AS Factor_Order, Call_Outcome AS Segment, Call_Outcome_Order AS Segment_Order,
         COUNT(*) AS Promises, SUM(Broken_PTP_Flag) AS Broken_Promises, SUM(PTP_Amount) AS Promised_Amount, SUM(Broken_PTP_Amount) AS Broken_Amount
    FROM p GROUP BY Call_Outcome, Call_Outcome_Order
  UNION ALL
  SELECT 'Credit score', 2, Credit_Band, Credit_Band_Order, COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY Credit_Band, Credit_Band_Order
  UNION ALL
  SELECT 'Missed payments (last 12 months)', 3, Missed_Payments_Band, Missed_Payments_Band_Order, COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY Missed_Payments_Band, Missed_Payments_Band_Order
  UNION ALL
  SELECT 'Days past due', 4, DPD_Bucket, DPD_Bucket_Order, COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY DPD_Bucket, DPD_Bucket_Order
  UNION ALL
  SELECT 'Promise lead time', 5, PTP_Lead_Band, PTP_Lead_Band_Order, COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY PTP_Lead_Band, PTP_Lead_Band_Order
  UNION ALL
  SELECT 'Porting status', 6, Porting_Status, CASE Porting_Status WHEN 'None' THEN 1 WHEN 'Inbound' THEN 2 ELSE 3 END,
         COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY Porting_Status
  UNION ALL
  SELECT 'Contract renewal window', 7, CASE WHEN Contract_Renewal_Window_Flag = 1 THEN 'In renewal window' ELSE 'Not in renewal window' END,
         2 - Contract_Renewal_Window_Flag, COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY Contract_Renewal_Window_Flag
  UNION ALL
  SELECT 'New product interest', 8, CASE WHEN New_Product_Interest_Flag = 1 THEN 'Interested in a new product' ELSE 'No new product interest' END,
         2 - New_Product_Interest_Flag, COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY New_Product_Interest_Flag
  UNION ALL
  SELECT 'Product', 9, Product_Type, 0, COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY Product_Type
  UNION ALL
  SELECT 'State', 10, State, 0, COUNT(*), SUM(Broken_PTP_Flag), SUM(PTP_Amount), SUM(Broken_PTP_Amount)
    FROM p GROUP BY State
), tot AS (
  SELECT 1.0*SUM(Broken_PTP_Flag)/COUNT(*) AS Overall_Broken_Rate FROM p
), m AS (
  SELECT seg.*, 1.0*Broken_Promises/NULLIF(Promises,0) AS Broken_Rate,
         CASE WHEN Promises >= r.min_segment_promises THEN 1 ELSE 0 END AS Meets_Min_Volume,
         r.driver_spread_pts
  FROM seg CROSS JOIN {{catalog}}.{{prefix}}_gold.qry_rules r
), s AS (
  SELECT m.*,
         MAX(CASE WHEN Meets_Min_Volume = 1 THEN Broken_Rate END) OVER (PARTITION BY Factor)
           - MIN(CASE WHEN Meets_Min_Volume = 1 THEN Broken_Rate END) OVER (PARTITION BY Factor) AS Factor_Spread_Pts
  FROM m
)
SELECT s.Factor, s.Factor_Order, s.Segment, s.Segment_Order, s.Promises, s.Broken_Promises,
       s.Promises - s.Broken_Promises AS Kept_Promises, s.Broken_Rate, 1 - s.Broken_Rate AS Kept_Rate,
       s.Promised_Amount, s.Broken_Amount, tot.Overall_Broken_Rate,
       s.Broken_Rate - tot.Overall_Broken_Rate AS Difference_vs_Overall,
       s.Meets_Min_Volume, s.Factor_Spread_Pts,
       CASE WHEN s.Factor_Spread_Pts >= s.driver_spread_pts THEN 'Clear difference' ELSE 'Little difference' END AS Factor_Strength
FROM s CROSS JOIN tot;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_ptp_break_drivers IS 'Answers: "Why do promises break?", "Compare PTP keep-rate across Product_Type", "Which states have the highest broken-promise rate?", "What % are kept vs broken by credit score band?" and "Which promise lead time has the highest honour rate?". One row per factor x segment over 12 months of promises (Nov 2025 to Oct 2026): promises, broken and kept, rates, amounts and the difference from the overall broken rate. Factors: call outcome, credit score, missed payments, days past due, promise lead time, porting status, renewal window, new product interest, product, state. Factor_Strength says whether the factor makes a clear difference (segments at least driver_spread_pts, 10 points, apart) or little difference. Rank only rows with Meets_Min_Volume = 1. Observed associations, not causes. For a single month use mv_collections with a Snapshot_Date filter.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_ptp_break_drivers.Broken_Rate IS 'Broken promises / promises in this segment';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_ptp_break_drivers.Difference_vs_Overall IS 'This segment''s broken rate minus the overall broken rate (a fraction: 0.10 = 10 points worse)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_ptp_break_drivers.Meets_Min_Volume IS '1 when the segment has at least min_segment_promises (30) promises';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_ptp_break_drivers.Factor_Spread_Pts IS 'Highest minus lowest broken rate across this factor''s segments with enough promises';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_ptp_break_drivers.Factor_Strength IS 'Clear difference (spread >= driver_spread_pts) or Little difference';

-- 4. Scenario "Contact Center Efficiency vs Collections": the call outcome against promises.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_fcr_vs_promises AS
SELECT Call_Outcome, MIN(Call_Outcome_Order) AS Call_Outcome_Order,
  COUNT(*)                                                    AS Account_Months,
  SUM(PTP_Flag)                                               AS Promises,
  1.0*SUM(PTP_Flag)/NULLIF(COUNT(*),0)                        AS Promise_Rate,
  SUM(Broken_PTP_Flag)                                        AS Broken_Promises,
  SUM(Kept_PTP_Flag)                                          AS Kept_Promises,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(PTP_Flag),0)            AS Broken_Rate,
  1.0*SUM(Kept_PTP_Flag)/NULLIF(SUM(PTP_Flag),0)              AS Kept_Rate,
  SUM(PTP_Amount)                                             AS Promised_Amount,
  SUM(Broken_PTP_Amount)                                      AS Broken_Amount,
  AVG(Handle_Time_Seconds)                                    AS Avg_Handle_Seconds,
  SUM(Handle_Time_Seconds)/3600.0                             AS Handle_Hours
FROM {{catalog}}.{{prefix}}_gold.qry_account_month
GROUP BY Call_Outcome;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_fcr_vs_promises IS 'Answers the Scenario Guide''s "Contact Center Efficiency vs Collections" ("Compare FCR rates against PTP-kept rates"), "Compare PTP-kept rates between accounts resolved on first call and transferred calls" and "What % of contacted accounts result in a PTP, by FCR vs non-FCR?". One row per call outcome (Resolved first time, Transferred, Not resolved, not transferred, No contact) over 12 months of account-months: how many promised to pay (Promise_Rate), how many of those promises broke or were kept, the amounts and average handle time. Observed, not causal.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_fcr_vs_promises.Promise_Rate IS 'Account-months with a promise / account-months with this call outcome';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_fcr_vs_promises.Kept_Rate IS 'Kept promises / promises made with this call outcome';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_fcr_vs_promises.Avg_Handle_Seconds IS 'Average handle time in seconds (NULL for No contact)';

-- 5. Contact-centre measures by product, state, credit band and days past due.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_contact_by_segment AS
WITH c AS (
  SELECT Product_Type, State, Credit_Band, Credit_Band_Order, DPD_Bucket, DPD_Bucket_Order,
         FCR_Flag, Transferred_Flag, Repeat_Call_Flag, Handle_Time_Seconds, PTP_Flag, Broken_PTP_Flag
  FROM {{catalog}}.{{prefix}}_gold.qry_account_month WHERE Contacted_Flag = 1
), seg AS (
  SELECT 'Product' AS Dimension, Product_Type AS Segment, 0 AS Segment_Order, FCR_Flag, Transferred_Flag, Repeat_Call_Flag, Handle_Time_Seconds, PTP_Flag, Broken_PTP_Flag FROM c
  UNION ALL SELECT 'State', State, 0, FCR_Flag, Transferred_Flag, Repeat_Call_Flag, Handle_Time_Seconds, PTP_Flag, Broken_PTP_Flag FROM c
  UNION ALL SELECT 'Credit score', Credit_Band, Credit_Band_Order, FCR_Flag, Transferred_Flag, Repeat_Call_Flag, Handle_Time_Seconds, PTP_Flag, Broken_PTP_Flag FROM c
  UNION ALL SELECT 'Days past due', DPD_Bucket, DPD_Bucket_Order, FCR_Flag, Transferred_Flag, Repeat_Call_Flag, Handle_Time_Seconds, PTP_Flag, Broken_PTP_Flag FROM c
)
SELECT seg.Dimension, seg.Segment, MIN(seg.Segment_Order) AS Segment_Order,
  COUNT(*)                                                                    AS Contacts,
  1.0*SUM(FCR_Flag)/COUNT(*)                                                  AS FCR_Rate,
  1.0*SUM(Transferred_Flag)/COUNT(*)                                          AS Transfer_Rate,
  1.0*SUM(Repeat_Call_Flag)/COUNT(*)                                          AS Repeat_Rate,
  AVG(Handle_Time_Seconds)                                                    AS Avg_Handle_Seconds,
  AVG(CASE WHEN Transferred_Flag = 1 THEN Handle_Time_Seconds END)            AS Avg_Handle_Transferred,
  AVG(CASE WHEN Transferred_Flag = 0 THEN Handle_Time_Seconds END)            AS Avg_Handle_Not_Transferred,
  SUM(Handle_Time_Seconds)/3600.0                                             AS Handle_Hours,
  SUM(CASE WHEN Transferred_Flag = 1 THEN Handle_Time_Seconds ELSE 0 END)/3600.0 AS Transferred_Handle_Hours,
  SUM(PTP_Flag)                                                               AS Promises,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(PTP_Flag),0)                            AS Broken_Rate
FROM seg
GROUP BY seg.Dimension, seg.Segment;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_contact_by_segment IS 'Answers: "Which product types have the lowest First Call Resolution rate?", "What is the average handle time by state, and how does it correlate with transfer rate?" and FCR, transfer, repeat and handle time by product, state, credit band or days past due. One row per Dimension x Segment over 12 months of contacted account-months. Rates are over contacted accounts. For the Transfer-Driven Cost Leakage scenario by state and product together, use qry_transfer_cost.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_contact_by_segment.Dimension IS 'Product, State, Credit score or Days past due';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_contact_by_segment.Contacts IS 'Contacted account-months';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_contact_by_segment.Transferred_Handle_Hours IS 'Hours of handle time on transferred calls';

-- 6. Scenario "Transfer-Driven Cost Leakage": transfers and handle time by state and product.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_transfer_cost AS
SELECT a.State, a.Product_Type,
  COUNT(*)                                                                    AS Contacts,
  SUM(a.Transferred_Flag)                                                     AS Transfers,
  1.0*SUM(a.Transferred_Flag)/COUNT(*)                                        AS Transfer_Rate,
  AVG(a.Handle_Time_Seconds)                                                  AS Avg_Handle_Seconds,
  AVG(CASE WHEN a.Transferred_Flag = 1 THEN a.Handle_Time_Seconds END)        AS Avg_Handle_Transferred,
  AVG(CASE WHEN a.Transferred_Flag = 0 THEN a.Handle_Time_Seconds END)        AS Avg_Handle_Not_Transferred,
  SUM(a.Handle_Time_Seconds)/3600.0                                           AS Handle_Hours,
  SUM(CASE WHEN a.Transferred_Flag = 1 THEN a.Handle_Time_Seconds ELSE 0 END)/3600.0 AS Transferred_Handle_Hours,
  SUM(CASE WHEN a.Transferred_Flag = 1 THEN a.Handle_Time_Seconds ELSE 0 END)/60.0 * MAX(r.handle_cost_per_minute) AS Transferred_Handle_Cost
FROM {{catalog}}.{{prefix}}_gold.qry_account_month a CROSS JOIN {{catalog}}.{{prefix}}_gold.qry_rules r
WHERE a.Contacted_Flag = 1
GROUP BY a.State, a.Product_Type;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_transfer_cost IS 'Answers the Scenario Guide''s "Transfer-Driven Cost Leakage" ("accounts with high transfer rates + high AHT, by state and product"). One row per state x product over 12 months of contacted account-months: transfers, transfer rate, average handle time for transferred and other calls, and hours of handle time on transferred calls. Transferred_Handle_Cost is NULL until business rule handle_cost_per_minute is set: never state a dollar cost of handle time otherwise. Sum the rows for a state or product total, and recompute rates as SUM/SUM.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_transfer_cost.Transferred_Handle_Cost IS 'Transferred handle minutes x handle_cost_per_minute (AUD); NULL while that rule is not set';

-- 7. Scenario "Repeat Caller Frustration": repeat calls by last month's call outcome.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_repeat_after_unresolved AS
SELECT Prior_Month_Outcome,
  CASE Prior_Month_Outcome WHEN 'Resolved first time last month' THEN 1 WHEN 'Not resolved last month' THEN 2
       WHEN 'No contact last month' THEN 3 ELSE 4 END                AS Prior_Outcome_Order,
  COUNT(*)                                                          AS Contacts,
  SUM(Repeat_Call_Flag)                                             AS Repeat_Calls,
  1.0*SUM(Repeat_Call_Flag)/COUNT(*)                                AS Repeat_Rate,
  COUNT(DISTINCT CASE WHEN Repeat_Call_Flag = 1 THEN Account_ID END) AS Repeat_Caller_Accounts
FROM {{catalog}}.{{prefix}}_gold.qry_account_month
WHERE Contacted_Flag = 1
GROUP BY Prior_Month_Outcome;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_repeat_after_unresolved IS 'Answers the Scenario Guide''s "Repeat Caller Frustration" (Repeat_Call_Flag = Y AND prior month FCR = N): how often a contacted customer calls again (within about 7-14 days) depending on how last month''s call went. One row per last-month outcome over 12 months of contacted account-months. The accounts themselves: qry_account_month WHERE Repeat_After_Unresolved_Flag = 1.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_repeat_after_unresolved.Repeat_Rate IS 'Repeat calls / contacted account-months with this last-month outcome';

-- 8. The Scenario Guide's account scenarios at the latest snapshot.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_scenario_accounts AS
WITH a AS (SELECT * FROM {{catalog}}.{{prefix}}_gold.qry_account_month WHERE Is_Latest_Snapshot = 1)
SELECT 1 AS Scenario_ID, 'Upgrade-but-Overdue' AS Scenario_Name, a.* FROM a WHERE Scenario_1_Flag = 1
UNION ALL SELECT 2, 'High-Risk Porting Out', a.* FROM a WHERE Scenario_2_Flag = 1
UNION ALL SELECT 3, 'Churn Risk at Renewal', a.* FROM a WHERE Scenario_3_Flag = 1
UNION ALL SELECT 6, 'Repeat Caller Frustration', a.* FROM a WHERE Repeat_After_Unresolved_Flag = 1;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_scenario_accounts IS 'Answers: "Show accounts with New_Product_Interest = Y and overdue", "List customers porting out with Credit_Score < 550 ranked by balance", "customers with 2+ missed payments entering renewal" and the repeat callers after an unresolved call. One row per account per scenario at the latest snapshot (1 October 2026), with every qry_account_month column. Scenario_ID 1-3 and 6 follow the Scenario Guide (4 and 5 are analytical: qry_fcr_vs_promises and qry_transfer_cost). An account can be in more than one scenario.';

CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_scenario_summary AS
WITH r AS (SELECT * FROM {{catalog}}.{{prefix}}_gold.qry_rules),
s AS (
  SELECT Scenario_ID, Scenario_Name,
    COUNT(DISTINCT Account_ID)                          AS Accounts,
    SUM(Outstanding_Balance)                            AS Total_Balance,
    SUM(Overdue_Balance)                                AS Overdue_Balance,
    SUM(PTP_Flag)                                       AS Promises,
    SUM(Broken_PTP_Flag)                                AS Broken_Promises,
    1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(PTP_Flag),0)    AS Broken_Rate,
    AVG(Credit_Score)                                   AS Avg_Credit_Score,
    AVG(Days_Past_Due)                                  AS Avg_Days_Past_Due
  FROM {{catalog}}.{{prefix}}_gold.qry_scenario_accounts
  GROUP BY Scenario_ID, Scenario_Name
)
SELECT s.*,
  CASE s.Scenario_ID
    WHEN 1 THEN CONCAT('New_Product_Interest_Flag = Y AND Days_Past_Due > ', string(int(r.s1_min_dpd)))
    WHEN 2 THEN CONCAT('Porting_Status = Outbound AND Credit_Score < ', string(int(r.s2_credit_below)))
    WHEN 3 THEN CONCAT('Missed_Payments_L12M >= ', string(int(r.s3_min_missed_payments)), ' AND Contract_Renewal_Window_Flag = Y')
    ELSE 'Repeat_Call_Flag = Y AND last month''s call not resolved first time' END AS Filter_Logic,
  CASE s.Scenario_ID
    WHEN 1 THEN 'Customers interested in new products who are also overdue: a bundled offer plus collection.'
    WHEN 2 THEN 'Low-credit customers porting out: likely leaving with an unpaid balance.'
    WHEN 3 THEN 'Chronic late payers approaching contract renewal: proactive retention and a payment plan.'
    ELSE 'Customers calling again after an unresolved call: churn and complaint risk.' END AS Business_Question
FROM s CROSS JOIN r;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_scenario_summary IS 'Answers: "How many accounts are in each scenario, and what do they owe?" One row per account scenario of the Scenario Guide at the latest snapshot (1 October 2026): 1 Upgrade-but-Overdue, 2 High-Risk Porting Out, 3 Churn Risk at Renewal, 6 Repeat Caller Frustration. Accounts, balances, promises and broken rate, with the filter in force (thresholds from business_rules_config). The accounts: qry_scenario_accounts.';

-- 9. Overdue exposure by days past due, latest month.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_dpd_exposure AS
SELECT DPD_Bucket, MIN(DPD_Bucket_Order) AS DPD_Bucket_Order,
  COUNT(DISTINCT Account_ID)                                                         AS Accounts,
  SUM(Overdue_Balance)                                                               AS Overdue_Balance,
  1.0*COUNT(DISTINCT Account_ID)/SUM(COUNT(DISTINCT Account_ID)) OVER ()             AS Account_Share,
  1.0*SUM(Overdue_Balance)/SUM(SUM(Overdue_Balance)) OVER ()                         AS Balance_Share,
  SUM(PTP_Flag)                                                                      AS Promises,
  SUM(PTP_Amount)                                                                    AS Promised_Amount,
  1.0*SUM(PTP_Amount)/NULLIF(SUM(CASE WHEN PTP_Flag = 1 THEN Outstanding_Balance END),0) AS Promised_Share_Of_Balance,
  SUM(Broken_PTP_Flag)                                                               AS Broken_Promises,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(PTP_Flag),0)                                   AS Broken_Rate,
  SUM(Broken_PTP_Amount)                                                             AS Broken_Amount,
  SUM(Contacted_Flag)                                                                AS Contacted_Accounts
FROM {{catalog}}.{{prefix}}_gold.qry_account_month
WHERE Is_Latest_Snapshot = 1 AND Overdue_Flag = 1
GROUP BY DPD_Bucket;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_dpd_exposure IS 'Answers: "How is the overdue balance spread across days-past-due buckets?" and "Average PTP_Amount as a % of Outstanding_Balance by DPD bucket" (latest month). One row per days-past-due bucket (1-30, 31-60, 61-90, 91+; order by DPD_Bucket_Order) of overdue accounts at the latest snapshot (1 October 2026): accounts, overdue balance and their shares, promises, the amount promised as a share of those accounts'' balance, broken promises and contacts. For 12 months, use mv_collections by DPD_Bucket and Snapshot_Date.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_dpd_exposure.Promised_Share_Of_Balance IS 'Amount promised / outstanding balance of the accounts that promised (SUM/SUM)';

-- 10. Each account over the 12 months.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_account_history AS
SELECT Account_ID,
  MAX(State) AS State, MAX(Product_Type) AS Product_Type, MAX(Credit_Score) AS Credit_Score, MAX(Credit_Band) AS Credit_Band,
  MAX(Porting_Status) AS Porting_Status, MAX(Contract_Renewal_Window_Flag) AS Contract_Renewal_Window_Flag,
  MAX(New_Product_Interest_Flag) AS New_Product_Interest_Flag,
  MAX(CASE WHEN Is_Latest_Snapshot = 1 THEN Outstanding_Balance END)   AS Latest_Balance,
  MAX(CASE WHEN Is_Latest_Snapshot = 1 THEN Days_Past_Due END)         AS Latest_Days_Past_Due,
  MAX(CASE WHEN Is_Latest_Snapshot = 1 THEN Missed_Payments_L12M END)  AS Latest_Missed_Payments_L12M,
  MAX(Days_Past_Due)                                                   AS Max_Days_Past_Due,
  SUM(Overdue_Flag)                                                    AS Months_Overdue,
  SUM(PTP_Flag)                                                        AS Promises,
  SUM(Broken_PTP_Flag)                                                 AS Broken_Promises,
  SUM(Kept_PTP_Flag)                                                   AS Kept_Promises,
  SUM(PTP_Amount)                                                      AS Promised_Amount,
  SUM(Broken_PTP_Amount)                                               AS Broken_Amount,
  SUM(Contacted_Flag)                                                  AS Months_Contacted,
  SUM(FCR_Flag)                                                        AS Months_Resolved_First_Time,
  SUM(Transferred_Flag)                                                AS Months_Transferred,
  SUM(Repeat_Call_Flag)                                                AS Months_With_Repeat_Call,
  SUM(Repeat_After_Unresolved_Flag)                                    AS Repeats_After_Unresolved,
  MAX(Repeat_Run_Months)                                               AS Longest_Repeat_Run_Months,
  SUM(Handle_Time_Seconds)/60.0                                        AS Handle_Minutes
FROM {{catalog}}.{{prefix}}_gold.qry_account_month
GROUP BY Account_ID;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_account_history IS 'Answers: "Tell me about account OPT-...", "Which accounts broke two or more promises?" and "Which accounts called again in two or more consecutive months?". One row per account over the 12 months: its fixed attributes, latest balance and days past due, months overdue, promises made, broken and kept with amounts, months contacted, resolved first time, transferred, with a repeat call, the longest run of consecutive repeat months, and total handle minutes.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_account_history.Longest_Repeat_Run_Months IS 'Most consecutive months with a repeat call';
