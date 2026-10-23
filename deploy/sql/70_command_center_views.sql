-- Command Center views: the headline row and the list of broken promises with the most at stake.
-- Built on the certified views (60_certified_views.sql); thresholds read live from gold.qry_rules.
-- Each view carries a description for Genie and Catalog Explorer; edit descriptions here, never in
-- the UI (each deploy re-creates the views).

-- 1. The headline: the latest month, the month before, and the 12 months together (one row).
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_kpis AS
WITH d AS (
  SELECT Snapshot_Date, DENSE_RANK() OVER (ORDER BY Snapshot_Date DESC) AS rn
  FROM (SELECT DISTINCT Snapshot_Date FROM {{catalog}}.{{prefix}}_gold.qry_account_month)
), a AS (
  SELECT m.*, d.rn FROM {{catalog}}.{{prefix}}_gold.qry_account_month m JOIN d ON m.Snapshot_Date = d.Snapshot_Date
)
SELECT
  MAX(CASE WHEN rn = 1 THEN Snapshot_Date END)                                        AS As_Of_Date,
  MAX(CASE WHEN rn = 2 THEN Snapshot_Date END)                                        AS Prior_Date,
  MIN(Snapshot_Date)                                                                  AS First_Date,
  COUNT(DISTINCT Snapshot_Date)                                                       AS Months,
  -- Latest month
  COUNT(DISTINCT CASE WHEN rn = 1 THEN Account_ID END)                                AS Accounts,
  SUM(CASE WHEN rn = 1 THEN Overdue_Flag ELSE 0 END)                                  AS Overdue_Accounts,
  SUM(CASE WHEN rn = 1 THEN Overdue_Balance ELSE 0 END)                               AS Overdue_Balance,
  SUM(CASE WHEN rn = 1 THEN Outstanding_Balance ELSE 0 END)                           AS Total_Balance,
  SUM(CASE WHEN rn = 1 THEN PTP_Flag ELSE 0 END)                                      AS Promises,
  SUM(CASE WHEN rn = 1 THEN PTP_Amount ELSE 0 END)                                    AS Promised_Amount,
  SUM(CASE WHEN rn = 1 THEN Broken_PTP_Flag ELSE 0 END)                               AS Broken_Promises,
  SUM(CASE WHEN rn = 1 THEN Kept_PTP_Flag ELSE 0 END)                                 AS Kept_Promises,
  1.0*SUM(CASE WHEN rn = 1 THEN Broken_PTP_Flag ELSE 0 END)/NULLIF(SUM(CASE WHEN rn = 1 THEN PTP_Flag ELSE 0 END),0) AS Broken_Rate,
  SUM(CASE WHEN rn = 1 THEN Broken_PTP_Amount ELSE 0 END)                             AS Broken_Amount,
  SUM(CASE WHEN rn = 1 THEN Kept_PTP_Amount ELSE 0 END)                               AS Kept_Amount,
  SUM(CASE WHEN rn = 1 THEN Due_After_Latest_Snapshot_Flag ELSE 0 END)                AS Promises_Due_After_As_Of,
  SUM(CASE WHEN rn = 1 THEN Contacted_Flag ELSE 0 END)                                AS Contacts,
  1.0*SUM(CASE WHEN rn = 1 THEN FCR_Flag ELSE 0 END)/NULLIF(SUM(CASE WHEN rn = 1 THEN Contacted_Flag ELSE 0 END),0)         AS FCR_Rate,
  1.0*SUM(CASE WHEN rn = 1 THEN Transferred_Flag ELSE 0 END)/NULLIF(SUM(CASE WHEN rn = 1 THEN Contacted_Flag ELSE 0 END),0) AS Transfer_Rate,
  1.0*SUM(CASE WHEN rn = 1 THEN Repeat_Call_Flag ELSE 0 END)/NULLIF(SUM(CASE WHEN rn = 1 THEN Contacted_Flag ELSE 0 END),0) AS Repeat_Rate,
  AVG(CASE WHEN rn = 1 THEN Handle_Time_Seconds END)                                  AS Avg_Handle_Seconds,
  SUM(CASE WHEN rn = 1 THEN Repeat_After_Unresolved_Flag ELSE 0 END)                  AS Repeat_After_Unresolved,
  -- The month before
  SUM(CASE WHEN rn = 2 THEN Overdue_Flag ELSE 0 END)                                  AS Prior_Overdue_Accounts,
  SUM(CASE WHEN rn = 2 THEN Overdue_Balance ELSE 0 END)                               AS Prior_Overdue_Balance,
  SUM(CASE WHEN rn = 2 THEN PTP_Flag ELSE 0 END)                                      AS Prior_Promises,
  1.0*SUM(CASE WHEN rn = 2 THEN Broken_PTP_Flag ELSE 0 END)/NULLIF(SUM(CASE WHEN rn = 2 THEN PTP_Flag ELSE 0 END),0) AS Prior_Broken_Rate,
  1.0*SUM(CASE WHEN rn = 2 THEN FCR_Flag ELSE 0 END)/NULLIF(SUM(CASE WHEN rn = 2 THEN Contacted_Flag ELSE 0 END),0)         AS Prior_FCR_Rate,
  1.0*SUM(CASE WHEN rn = 2 THEN Transferred_Flag ELSE 0 END)/NULLIF(SUM(CASE WHEN rn = 2 THEN Contacted_Flag ELSE 0 END),0) AS Prior_Transfer_Rate,
  1.0*SUM(CASE WHEN rn = 2 THEN Repeat_Call_Flag ELSE 0 END)/NULLIF(SUM(CASE WHEN rn = 2 THEN Contacted_Flag ELSE 0 END),0) AS Prior_Repeat_Rate,
  AVG(CASE WHEN rn = 2 THEN Handle_Time_Seconds END)                                  AS Prior_Avg_Handle_Seconds,
  -- All 12 months
  SUM(PTP_Flag)                                                                       AS Promises_12M,
  SUM(Broken_PTP_Flag)                                                                AS Broken_Promises_12M,
  SUM(Kept_PTP_Flag)                                                                  AS Kept_Promises_12M,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(PTP_Flag),0)                                    AS Broken_Rate_12M,
  SUM(PTP_Amount)                                                                     AS Promised_Amount_12M,
  SUM(Broken_PTP_Amount)                                                              AS Broken_Amount_12M,
  SUM(Kept_PTP_Amount)                                                                AS Kept_Amount_12M,
  SUM(Contacted_Flag)                                                                 AS Contacts_12M,
  1.0*SUM(FCR_Flag)/NULLIF(SUM(Contacted_Flag),0)                                     AS FCR_Rate_12M,
  1.0*SUM(Transferred_Flag)/NULLIF(SUM(Contacted_Flag),0)                             AS Transfer_Rate_12M,
  1.0*SUM(Repeat_Call_Flag)/NULLIF(SUM(Contacted_Flag),0)                             AS Repeat_Rate_12M,
  AVG(Handle_Time_Seconds)                                                            AS Avg_Handle_Seconds_12M,
  SUM(Handle_Time_Seconds)/3600.0                                                     AS Handle_Hours_12M,
  SUM(Repeat_After_Unresolved_Flag)                                                   AS Repeat_After_Unresolved_12M
FROM a;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_kpis IS 'Answers: "How are we doing?", "How many promises were made in the latest month, and how many were broken?" and the headline contact-centre rates. One row: the latest month (As_Of_Date, 1 October 2026), the month before (Prior_*) and all 12 months (*_12M): overdue accounts and balance, promises made, kept and broken with amounts and the broken rate, contacts with FCR, transfer and repeat rates and average handle time. Promises_Due_After_As_Of counts the latest month''s promises that fall due after its snapshot date; their recorded outcomes are included like every other month. The Command Center headline.';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Overdue_Balance IS 'Balance on accounts more than 0 days past due, latest month (AUD)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Broken_Rate IS 'Broken promises / promises made, latest month';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Broken_Rate_12M IS 'Broken promises / promises made, all 12 months';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Promises_Due_After_As_Of IS 'Latest-month promises falling due after the snapshot date (outcome as recorded)';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.FCR_Rate IS 'Resolved on the first call / contacted, latest month';
COMMENT ON COLUMN {{catalog}}.{{prefix}}_gold.qry_cc_kpis.Repeat_After_Unresolved IS 'Repeat calls in the latest month after an unresolved call the month before';

-- 2. The broken promises with the most at stake in the latest month (Sample question: "Top 100
-- accounts by Outstanding_Balance where Broken_PTP_Flag = Y in the latest month").
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_cc_top_broken_accounts AS
SELECT * EXCEPT (Rank_In_Month) FROM (
  SELECT a.*, ROW_NUMBER() OVER (ORDER BY a.Outstanding_Balance DESC, a.Account_ID) AS Rank_In_Month
  FROM {{catalog}}.{{prefix}}_gold.qry_account_month a
  WHERE a.Is_Latest_Snapshot = 1 AND a.Broken_PTP_Flag = 1
) WHERE Rank_In_Month <= {{live:top_accounts}};
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_cc_top_broken_accounts IS 'Answers: "Show me the top 100 accounts by outstanding balance where the promise was broken last month." The top_accounts (100) accounts with a broken promise at the latest snapshot (1 October 2026), largest outstanding balance first, with every qry_account_month column.';
