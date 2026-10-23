-- Silver: typed, constrained, canonical. One row per account per monthly snapshot (12 months).
-- The workbook writes "not applicable" as text: 'N/A' for the call flags when there was no contact,
-- 'None' for no porting, and Broken_PTP_Flag 'N' on rows with no promise. Here every Y/N flag
-- becomes 1/0, a flag that does not apply becomes NULL (so Broken_PTP_Flag is NULL without a
-- promise, and the call flags are NULL without a contact), and Porting_Status keeps 'None'.
CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot AS
SELECT
  CAST(Snapshot_Date AS DATE)                AS Snapshot_Date,
  CAST(Account_ID AS STRING)                 AS Account_ID,
  CAST(State AS STRING)                      AS State,
  CAST(Product_Type AS STRING)               AS Product_Type,
  CAST(Credit_Score AS INT)                  AS Credit_Score,
  CAST(Outstanding_Balance AS DECIMAL(18,2)) AS Outstanding_Balance,
  CAST(Days_Past_Due AS INT)                 AS Days_Past_Due,
  CAST(Missed_Payments_L12M AS INT)          AS Missed_Payments_L12M,
  CASE WHEN PTP_Flag = 'Y' THEN 1 ELSE 0 END AS PTP_Flag,
  CASE WHEN PTP_Flag = 'Y' THEN CAST(PTP_Amount AS DECIMAL(18,2)) END AS PTP_Amount,
  CASE WHEN PTP_Flag = 'Y' THEN CAST(PTP_Due_Date AS DATE) END        AS PTP_Due_Date,
  CASE WHEN PTP_Flag = 'Y' THEN CASE WHEN Broken_PTP_Flag = 'Y' THEN 1 ELSE 0 END END AS Broken_PTP_Flag,
  CASE WHEN Contacted_This_Month_Flag = 'Y' THEN 1 ELSE 0 END AS Contacted_Flag,
  CASE WHEN Contacted_This_Month_Flag = 'Y' THEN CASE WHEN First_Call_Resolution_Flag = 'Y' THEN 1 ELSE 0 END END AS FCR_Flag,
  CASE WHEN Contacted_This_Month_Flag = 'Y' THEN CASE WHEN Call_Transferred_Flag = 'Y' THEN 1 ELSE 0 END END      AS Transferred_Flag,
  CASE WHEN Contacted_This_Month_Flag = 'Y' THEN CASE WHEN Repeat_Call_Flag = 'Y' THEN 1 ELSE 0 END END           AS Repeat_Call_Flag,
  CASE WHEN Contacted_This_Month_Flag = 'Y' THEN CAST(Call_Handle_Time_Seconds AS INT) END AS Handle_Time_Seconds,
  CASE WHEN New_Product_Interest_Flag = 'Y' THEN 1 ELSE 0 END      AS New_Product_Interest_Flag,
  COALESCE(NULLIF(CAST(Porting_Status AS STRING), ''), 'None')     AS Porting_Status,
  CASE WHEN Contract_Renewal_Window_Flag = 'Y' THEN 1 ELSE 0 END   AS Contract_Renewal_Window_Flag
FROM {{catalog}}.{{prefix}}_bronze.fact_collections_snapshot;

-- A PRIMARY KEY needs NOT NULL columns first; CTAS doesn't infer it.
ALTER TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot ALTER COLUMN Account_ID SET NOT NULL;
ALTER TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot ALTER COLUMN Snapshot_Date SET NOT NULL;
ALTER TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot ADD CONSTRAINT pk_snapshot PRIMARY KEY (Account_ID, Snapshot_Date);

COMMENT ON TABLE {{catalog}}.{{prefix}}_silver.fact_collections_snapshot IS 'Optus collections, one row per account per monthly snapshot (15,000 accounts x 12 months, Nov 2025 to Oct 2026). Typed from the workbook''s Collections_Fact: Y/N flags are 1/0, and a flag that does not apply is NULL (Broken_PTP_Flag without a promise; FCR, transfer, repeat and handle time without a contact). Amounts in AUD.';
