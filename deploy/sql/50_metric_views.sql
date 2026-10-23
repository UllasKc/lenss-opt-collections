-- Governed metric view. Requires DBR 16.4+ / a current SQL warehouse.
-- Metric views can't read a table at query time: {{rule:<name>}} is filled in by the deploy from
-- gold.business_rules_config, so the bands always match the table after a deploy.
-- Grain: one row per account per monthly snapshot. Filter Snapshot_Date for a single month.
CREATE OR REPLACE VIEW {{catalog}}.{{prefix}}_gold.mv_collections WITH METRICS LANGUAGE YAML AS $$
version: 1.1
comment: "Optus collections and contact-centre measures over account-months (12 monthly snapshots, Nov 2025 to Oct 2026, amounts in AUD). Promise rates are over promises made; FCR, transfer and repeat rates are over contacted account-months. Filter Snapshot_Date for one month; without it, measures cover all 12 months."
source: {{catalog}}.{{prefix}}_silver.fact_collections_snapshot
fields:
  - name: Snapshot_Date
    expr: source.Snapshot_Date
    synonyms: [month, snapshot, period, as of]
  - name: Account_ID
    expr: source.Account_ID
  - name: State
    expr: source.State
    synonyms: [territory, region, NSW, VIC, QLD, WA, SA, TAS, ACT, NT]
  - name: Product_Type
    expr: source.Product_Type
    synonyms: [product, plan, service, postpaid, prepaid, NBN, broadband, 5G, home internet, SMB]
  - name: Credit_Band
    expr: "CASE WHEN source.Credit_Score < {{rule:s2_credit_below}} THEN 'Below {{rule:s2_credit_below}}' WHEN source.Credit_Score < {{rule:credit_band_2_below}} THEN '{{rule:s2_credit_below}}-{{rule:credit_band_2_below-1}}' WHEN source.Credit_Score < {{rule:credit_band_3_below}} THEN '{{rule:credit_band_2_below}}-{{rule:credit_band_3_below-1}}' ELSE '{{rule:credit_band_3_below}}+' END"
    synonyms: [credit score band, credit rating, credit risk]
  - name: DPD_Bucket
    expr: "CASE WHEN source.Days_Past_Due = 0 THEN 'Current' WHEN source.Days_Past_Due <= {{rule:dpd_bucket_1_max}} THEN '1-{{rule:dpd_bucket_1_max}}' WHEN source.Days_Past_Due <= {{rule:dpd_bucket_2_max}} THEN '{{rule:dpd_bucket_1_max+1}}-{{rule:dpd_bucket_2_max}}' WHEN source.Days_Past_Due <= {{rule:dpd_bucket_3_max}} THEN '{{rule:dpd_bucket_2_max+1}}-{{rule:dpd_bucket_3_max}}' ELSE '{{rule:dpd_bucket_3_max+1}}+' END"
    synonyms: [days past due bucket, arrears stage, delinquency bucket, aging band, DPD]
  - name: Missed_Payments_Band
    expr: "CASE WHEN source.Missed_Payments_L12M >= {{rule:missed_payments_top_band}} THEN '{{rule:missed_payments_top_band}}+' ELSE CAST(source.Missed_Payments_L12M AS STRING) END"
    synonyms: [missed payments, payment history, late payments]
  - name: Call_Outcome
    expr: "CASE WHEN source.Contacted_Flag = 0 THEN 'No contact' WHEN source.Transferred_Flag = 1 THEN 'Transferred' WHEN source.FCR_Flag = 1 THEN 'Resolved first time' ELSE 'Not resolved, not transferred' END"
    synonyms: [call result, contact outcome, FCR, first call resolution, transfer]
  - name: Porting_Status
    expr: source.Porting_Status
    synonyms: [porting, port out, port in, leaving, churn]
  - name: Contract_Renewal_Window
    expr: "CASE WHEN source.Contract_Renewal_Window_Flag = 1 THEN 'In renewal window' ELSE 'Not in renewal window' END"
    synonyms: [renewal, contract renewal, up for renewal]
  - name: New_Product_Interest
    expr: "CASE WHEN source.New_Product_Interest_Flag = 1 THEN 'Interested in a new product' ELSE 'No new product interest' END"
    synonyms: [upgrade interest, new purchase interest, upsell]
measures:
  - name: account_months
    expr: COUNT(1)
    comment: "Account-month rows (one per account per snapshot)"
  - name: accounts
    expr: COUNT(DISTINCT source.Account_ID)
    comment: "Distinct accounts"
  - name: overdue_accounts
    expr: COUNT(DISTINCT CASE WHEN source.Days_Past_Due > 0 THEN source.Account_ID END)
    comment: "Distinct accounts more than 0 days past due"
    synonyms: [accounts in arrears, delinquent accounts, past due accounts]
  - name: total_balance
    expr: SUM(source.Outstanding_Balance)
    comment: "Outstanding balance on every account, current or overdue (AUD)"
  - name: overdue_balance
    expr: SUM(CASE WHEN source.Days_Past_Due > 0 THEN source.Outstanding_Balance ELSE 0 END)
    comment: "Outstanding balance on overdue accounts (AUD)"
    synonyms: [arrears, overdue amount, dollars overdue, dollar value at risk]
  - name: promises
    expr: SUM(source.PTP_Flag)
    comment: "Promises to pay made"
    synonyms: [PTP, promise to pay, payment promise, commitment to pay]
  - name: promised_amount
    expr: SUM(source.PTP_Amount)
    comment: "Amount promised (AUD)"
  - name: broken_promises
    expr: SUM(source.Broken_PTP_Flag)
    comment: "Promises broken (not honoured)"
  - name: kept_promises
    expr: SUM(CASE WHEN source.Broken_PTP_Flag = 0 THEN 1 ELSE 0 END)
    comment: "Promises kept"
  - name: broken_rate
    expr: SUM(source.Broken_PTP_Flag) / NULLIF(SUM(source.PTP_Flag), 0)
    comment: "Broken promises / promises made"
    synonyms: [broken PTP rate, broken promise rate, BPTP, failed promises]
  - name: kept_rate
    expr: SUM(CASE WHEN source.Broken_PTP_Flag = 0 THEN 1 ELSE 0 END) / NULLIF(SUM(source.PTP_Flag), 0)
    comment: "Kept promises / promises made"
    synonyms: [keep rate, honour rate, honor rate, PTP kept rate]
  - name: broken_amount
    expr: SUM(CASE WHEN source.Broken_PTP_Flag = 1 THEN source.PTP_Amount ELSE 0 END)
    comment: "Amount promised on broken promises (AUD)"
  - name: kept_amount
    expr: SUM(CASE WHEN source.Broken_PTP_Flag = 0 THEN source.PTP_Amount ELSE 0 END)
    comment: "Amount promised on kept promises (AUD)"
  - name: contacts
    expr: SUM(source.Contacted_Flag)
    comment: "Contacted account-months (contact is recorded once per account per month)"
  - name: contact_rate
    expr: SUM(source.Contacted_Flag) / NULLIF(COUNT(1), 0)
    comment: "Contacted account-months / account-months"
  - name: fcr_rate
    expr: SUM(source.FCR_Flag) / NULLIF(SUM(source.Contacted_Flag), 0)
    comment: "First contact resolution: resolved on the first call / contacted"
    synonyms: [FCR, first call resolution, first contact resolution, resolved first time]
  - name: transfer_rate
    expr: SUM(source.Transferred_Flag) / NULLIF(SUM(source.Contacted_Flag), 0)
    comment: "Transferred calls / contacted"
    synonyms: [transfers, transferred calls]
  - name: repeat_rate
    expr: SUM(source.Repeat_Call_Flag) / NULLIF(SUM(source.Contacted_Flag), 0)
    comment: "Called again within about 7-14 days / contacted"
    synonyms: [repeat calls, repeat callers, call backs, repeats]
  - name: avg_handle_seconds
    expr: AVG(source.Handle_Time_Seconds)
    comment: "Average handle time in seconds, contacted account-months"
    synonyms: [AHT, average handle time, call length]
  - name: handle_hours
    expr: SUM(source.Handle_Time_Seconds) / 3600.0
    comment: "Total handle time in hours"
  - name: ptp_per_contact
    expr: SUM(CASE WHEN source.Contacted_Flag = 1 THEN source.PTP_Flag ELSE 0 END) / NULLIF(SUM(source.Contacted_Flag), 0)
    comment: "Promises made in contacted account-months / contacted account-months"
    synonyms: [PTP conversion, promise rate per contact]
  - name: avg_credit_score
    expr: AVG(source.Credit_Score)
    comment: "Average credit score"
  - name: avg_days_past_due
    expr: AVG(CASE WHEN source.Days_Past_Due > 0 THEN source.Days_Past_Due END)
    comment: "Average days past due, overdue accounts"
$$;
