-- Governance content that is not in the workbook: how SQL must be written, what the data can't
-- answer, and the demo order. The workbook's own Data_Dictionary, Scenario_Guide and
-- Sample_BI_Questions land in the context schema at ingest.
CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_context.sql_generation_controls (
  control_id INT, control_text STRING
);

INSERT INTO {{catalog}}.{{prefix}}_context.sql_generation_controls VALUES
(1,  'State the Snapshot_Date (month) of every figure. "This month" / "latest" means the latest snapshot, 1 October 2026; "over the year" means all 12 snapshots (November 2025 to October 2026).'),
(2,  'Overdue means Days_Past_Due > 0. Outstanding_Balance is also billed on current accounts, so say "overdue balance" (Overdue_Balance) when only overdue accounts are meant.'),
(3,  'Use COUNT(DISTINCT Account_ID) for account counts within one month. Across several months, count account-months, or say "distinct accounts".'),
(4,  'Calculate rates as SUM(numerator)/SUM(denominator), never an average of per-segment percentages.'),
(5,  'Broken-promise and kept-promise rates are over promises made (PTP_Flag = 1) only. Broken_PTP_Flag is NULL when no promise was made.'),
(6,  'FCR, transfer and repeat-call rates are over contacted account-months (Contacted_Flag = 1) only. Contact is recorded once per account per month, not per call.'),
(7,  'Apply a minimum of min_segment_promises (30) promises before ranking a segment on its broken-promise rate.'),
(8,  'Label every comparison as observed, not causal: the data has no controlled experiment.'),
(9,  'Return a plain limitation message when required data is unavailable, rather than approximating.'),
(10, 'Return account identifiers only; the data has no names, phone numbers or addresses.');

CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_context.known_limitations (
  topic STRING, question_pattern STRING, why_blocked STRING, required_behavior STRING
);

INSERT INTO {{catalog}}.{{prefix}}_context.known_limitations VALUES
('Forecasting', 'What will next month''s broken-promise rate / balance be?',
 'Twelve monthly snapshots exist, but no model or plan to project from.',
 'Do not forecast. Report the 12-month trend (qry_monthly_trend) and say a forecast is not part of this data.'),
('Targets', 'Are we on track against target?',
 'Optus has not supplied a collections target.',
 'Say there is no target in the data; report the month and its change from the previous month instead.'),
('Cost of handle time', 'What does handle time cost in dollars?',
 'The data has handle time in seconds only; no cost per minute has been supplied (business rule handle_cost_per_minute is empty).',
 'Report handle time in seconds, minutes or hours. Give a dollar cost only if handle_cost_per_minute has a value.'),
('Promise channel', 'How were promises made without a call?',
 'About half of all promises have no contact recorded that month; the data does not say how they were made (app, SMS, IVR, store).',
 'Report them as "no contact recorded this month" without guessing the channel.'),
('Repeat calls', 'Did the customer call back within 14 days?',
 'Repeat_Call_Flag is Optus''s own flag (a further call about 7 to 14 days after a contact); call dates are not in the data.',
 'Use Repeat_Call_Flag as given and describe it as "called again within about 7 to 14 days".'),
('Promises due after the latest snapshot', 'Are October''s promises still to come?',
 'Every promise in the 1 October 2026 snapshot falls due after 1 October, but the data already records whether each was kept or broken.',
 'Use the recorded outcome (Broken_PTP_Flag) like every other month. Mention, where it matters, that these promises fall due after 1 October.'),
('Outbound contact, channels, collectors', 'Which channel / collector / outbound strategy works best?',
 'The data has no outbound attempts, channels, collectors or treatment strategies.',
 'Say this data does not include them.');

CREATE OR REPLACE TABLE {{catalog}}.{{prefix}}_context.demo_query_sequence (
  step_order INT, question STRING
);

INSERT INTO {{catalog}}.{{prefix}}_context.demo_query_sequence VALUES
(1, 'How many promises to pay were made in the latest month, and how many were broken?'),
(2, 'What is the monthly broken-promise rate trend?'),
(3, 'Why do promises break?'),
(4, 'Compare promise-kept rates between calls resolved first time and transferred calls.'),
(5, 'Which accounts called again after an unresolved call?'),
(6, 'Show the accounts in each scenario at the latest snapshot.');
