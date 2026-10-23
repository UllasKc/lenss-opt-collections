-- Business thresholds as data, not hardcoded logic. Every certified and Command Center view reads
-- them through gold.qry_rules, so changing a value here and re-running the deploy's transform and
-- views steps moves every figure. The three scenario thresholds come from the workbook's
-- Scenario_Guide; the others are this app's own choices, each explained in its notes.
CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_gold.business_rules_config (
  rule_name STRING COMMENT 'Name used by gold.qry_rules and the views',
  threshold_value DOUBLE COMMENT 'The value in force (NULL = not set)',
  notes STRING COMMENT 'What the rule means, where it comes from and which views use it'
) COMMENT 'Every business threshold the gold views use, with its meaning and source (the Scenario_Guide for the three scenario rules). Views read these values through gold.qry_rules; quote this table when asked how a figure is defined (for example what counts as a low credit score).';

INSERT INTO {{catalog}}.{{prefix}}_gold.business_rules_config VALUES
-- Scenario_Guide (the workbook)
('s1_min_dpd', 30, 'Scenario 1, Upgrade-but-Overdue: New_Product_Interest_Flag = Y and Days_Past_Due greater than this. Used by qry_account_month (Scenario_1_Flag), qry_scenario_summary and qry_scenario_accounts.'),
('s2_credit_below', 550, 'Scenario 2, High-Risk Porting Out: Porting_Status = Outbound and Credit_Score below this. Also the top of the lowest credit band.'),
('s3_min_missed_payments', 2, 'Scenario 3, Churn Risk at Renewal: Missed_Payments_L12M at least this and Contract_Renewal_Window_Flag = Y.'),
-- Bands
('dpd_bucket_1_max', 30, 'Days-past-due buckets: 1-30 up to this many days ...'),
('dpd_bucket_2_max', 60, '... 31-60 up to this ...'),
('dpd_bucket_3_max', 90, '... 61-90 up to this, then 91+. Days_Past_Due = 0 is "Current".'),
('credit_band_2_below', 650, 'Credit bands: below s2_credit_below (550) is "Below 550", then 550-649 up to this ...'),
('credit_band_3_below', 750, '... 650-749 up to this, then 750+.'),
('missed_payments_top_band', 4, 'Missed payments in the last 12 months are banded 0, 1, 2, 3 and this many or more ("4+").'),
('lead_short_max_days', 10, 'Promise lead time (days from the snapshot to PTP_Due_Date): up to this many days is "7-10 days" ...'),
('lead_mid_max_days', 14, '... up to this is "11-14 days", then "15+ days".'),
-- Analysis
('min_segment_promises', 30, 'Minimum promises before a segment''s broken-promise rate is ranked or called out. Used by qry_ptp_break_drivers (Meets_Min_Volume).'),
('driver_spread_pts', 0.10, 'A factor "makes a clear difference" to promises breaking when the broken-promise rates of its segments (each with min_segment_promises or more) are at least this far apart (10 percentage points); otherwise it "makes little difference". Set at 10 because the eight states spread 5 points (41.8% to 46.9%), about what segments of a few hundred promises vary by chance, while call outcome (19), credit score (34) and missed payments (13.5) clearly exceed it. Used by qry_ptp_break_drivers (Factor_Strength).'),
('repeat_streak_months', 2, 'A repeat caller "in a streak" called again (Repeat_Call_Flag) in at least this many consecutive months. Used by qry_account_month (Repeat_Streak_Flag).'),
('top_accounts', 100, 'Size of the Command Center''s list of broken promises with the most at stake (qry_cc_top_broken_accounts).'),
-- Not supplied
('handle_cost_per_minute', NULL, 'Cost of one minute of handle time (AUD). Not supplied by Optus, so no dollar cost of handle time is shown; set it here and re-run transform and views to add Handle_Cost columns.');

-- One row, one column per rule, for the views to read. Every column is the table's value.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.qry_rules AS
SELECT
  MAX(CASE WHEN rule_name = 's1_min_dpd' THEN threshold_value END)               AS s1_min_dpd,
  MAX(CASE WHEN rule_name = 's2_credit_below' THEN threshold_value END)          AS s2_credit_below,
  MAX(CASE WHEN rule_name = 's3_min_missed_payments' THEN threshold_value END)   AS s3_min_missed_payments,
  MAX(CASE WHEN rule_name = 'dpd_bucket_1_max' THEN threshold_value END)         AS dpd_bucket_1_max,
  MAX(CASE WHEN rule_name = 'dpd_bucket_2_max' THEN threshold_value END)         AS dpd_bucket_2_max,
  MAX(CASE WHEN rule_name = 'dpd_bucket_3_max' THEN threshold_value END)         AS dpd_bucket_3_max,
  MAX(CASE WHEN rule_name = 'credit_band_2_below' THEN threshold_value END)      AS credit_band_2_below,
  MAX(CASE WHEN rule_name = 'credit_band_3_below' THEN threshold_value END)      AS credit_band_3_below,
  MAX(CASE WHEN rule_name = 'missed_payments_top_band' THEN threshold_value END) AS missed_payments_top_band,
  MAX(CASE WHEN rule_name = 'lead_short_max_days' THEN threshold_value END)      AS lead_short_max_days,
  MAX(CASE WHEN rule_name = 'lead_mid_max_days' THEN threshold_value END)        AS lead_mid_max_days,
  MAX(CASE WHEN rule_name = 'min_segment_promises' THEN threshold_value END)     AS min_segment_promises,
  MAX(CASE WHEN rule_name = 'driver_spread_pts' THEN threshold_value END)        AS driver_spread_pts,
  MAX(CASE WHEN rule_name = 'repeat_streak_months' THEN threshold_value END)     AS repeat_streak_months,
  MAX(CASE WHEN rule_name = 'top_accounts' THEN threshold_value END)             AS top_accounts,
  MAX(CASE WHEN rule_name = 'handle_cost_per_minute' THEN threshold_value END)   AS handle_cost_per_minute
FROM {{catalog}}.{{prefix}}_gold.business_rules_config;
COMMENT ON TABLE {{catalog}}.{{prefix}}_gold.qry_rules IS 'Every business threshold as one row (one column per rule), read by the gold views. Values come from gold.business_rules_config, which explains each one.';
