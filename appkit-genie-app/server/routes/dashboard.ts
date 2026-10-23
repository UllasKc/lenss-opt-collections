import express from 'express';
import { currentVersions, type Lakebase } from '../lib/answerCache.js';
import { runSql } from '../lib/sql.js';

const GOLD = process.env.LENSS_GOLD_SCHEMA ?? 'optus_collections.optus_collections_gold';
if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(GOLD)) {
  throw new Error(`LENSS_GOLD_SCHEMA must be "<catalog>.<schema>", got: ${GOLD}`);
}

/** Keep results this long if the data version can't be read (e.g. Lakebase down). */
const FALLBACK_TTL_MS = 10 * 60_000;

/** How often the app checks whether the data changed, to have the Command Center ready again. */
const WARM_EVERY_MS = 5 * 60_000;

/**
 * The Command Center only changes when deploy.py reloads gold data, so each
 * panel's result is kept in memory for the current data version: every
 * visitor gets it instantly and the warehouse isn't queried. The app fills it
 * itself when it starts and when the data changes (see `warm`), so the first
 * visitor doesn't wait for the warehouse either; visitors arriving while it is
 * being computed share that one computation.
 */
function dashboardCache(db: Lakebase) {
  const entries = new Map<string, { version: string | null; at: number; value: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();
  const get = async (name: string, compute: () => Promise<unknown>): Promise<{ value: unknown; hit: boolean }> => {
    const version = await currentVersions(db).then((v) => v.data, () => null);
    const e = entries.get(name);
    if (e && (version && e.version ? e.version === version : Date.now() - e.at < FALLBACK_TTL_MS)) return { value: e.value, hit: true };
    const key = `${name}|${version}`;
    let p = inflight.get(key);
    if (!p) {
      p = compute()
        .then((value) => { entries.set(name, { version, at: Date.now(), value }); return value; })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return { value: await p, hit: false };
  };
  const send = async (name: string, res: express.Response, compute: () => Promise<unknown>) => {
    try {
      const { value, hit } = await get(name, compute);
      res.setHeader('X-Cache', hit ? 'hit' : 'miss');
      res.json(value);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  };
  return { get, send };
}

/** A factor of qry_ptp_break_drivers and the qry_account_month column (or expression) behind its segments. */
const FACTOR_COLUMN: Record<string, string> = {
  'Call outcome': 'b.Call_Outcome',
  'Credit score': 'b.Credit_Band',
  'Missed payments (last 12 months)': 'b.Missed_Payments_Band',
  'Days past due': 'b.DPD_Bucket',
  'Promise lead time': 'b.PTP_Lead_Band',
  'Porting status': 'b.Porting_Status',
  'Contract renewal window': "CASE WHEN b.Contract_Renewal_Window_Flag = 1 THEN 'In renewal window' ELSE 'Not in renewal window' END",
  'New product interest': "CASE WHEN b.New_Product_Interest_Flag = 1 THEN 'Interested in a new product' ELSE 'No new product interest' END",
  Product: 'b.Product_Type',
  State: 'b.State',
};

export function buildDashboardRouter(db: Lakebase): express.Router {
  const router = express.Router();
  const cache = dashboardCache(db);
  const cached = cache.send;

  const computeSummary = async () => {
    const [[kpis], [narrative], [rules]] = await Promise.all([
      runSql(`SELECT *, CAST(As_Of_Date AS STRING) AS as_of, CAST(Prior_Date AS STRING) AS prior_date,
                     CAST(First_Date AS STRING) AS first_date FROM ${GOLD}.qry_cc_kpis`),
      // Written once by deploy.py's `summary` step; missing until that step has run.
      runSql(`
        SELECT narrative, CAST(generated_at AS STRING) AS narrative_generated_at,
               CAST(data_refreshed_at AS STRING) AS data_refreshed_at FROM ${GOLD}.exec_summary LIMIT 1
      `).catch(() => [{ narrative: null, narrative_generated_at: null }]),
      // Every threshold, so the cards name the values in force (gold.business_rules_config).
      runSql(`SELECT * FROM ${GOLD}.qry_rules`).catch(() => [{}]),
    ]);
    return { ...kpis, ...narrative, rules: rules ?? {} };
  };
  router.get('/api/dashboard/summary', (_req, res) => cached('summary', res, computeSummary));

  /**
   * Everything the Command Center shows beyond the headline, in one round trip:
   * each panel is a certified-view query (no AI), run in parallel and cached per
   * data version like the rest. A panel that fails comes back empty rather than
   * failing the page.
   */
  const computeOverview = async () => {
    const q = (sql: string) => runSql(sql).catch((err) => {
      console.warn('[dashboard] overview panel failed:', err instanceof Error ? err.message : err);
      return [] as Record<string, string | null>[];
    });
    const [trend, drivers, callOutcomes, contactBySegment, transferByState, repeat, scenarios, exposure, topBroken] = await Promise.all([
      q(`SELECT *, CAST(Snapshot_Date AS STRING) AS d FROM ${GOLD}.qry_monthly_trend ORDER BY Snapshot_Date`),
      q(`SELECT * FROM ${GOLD}.qry_ptp_break_drivers ORDER BY Factor_Order, Segment_Order, Segment`),
      q(`SELECT * FROM ${GOLD}.qry_fcr_vs_promises ORDER BY Call_Outcome_Order`),
      q(`SELECT * FROM ${GOLD}.qry_contact_by_segment ORDER BY Dimension, Segment_Order, Segment`),
      q(`SELECT State, SUM(Contacts) AS Contacts, SUM(Transfers) AS Transfers, 1.0*SUM(Transfers)/SUM(Contacts) AS Transfer_Rate,
                SUM(Handle_Hours) AS Handle_Hours, SUM(Transferred_Handle_Hours) AS Transferred_Handle_Hours,
                SUM(Transferred_Handle_Cost) AS Transferred_Handle_Cost
           FROM ${GOLD}.qry_transfer_cost GROUP BY State ORDER BY Transfer_Rate DESC`),
      q(`SELECT * FROM ${GOLD}.qry_repeat_after_unresolved ORDER BY Prior_Outcome_Order`),
      q(`SELECT * FROM ${GOLD}.qry_scenario_summary ORDER BY Scenario_ID`),
      q(`SELECT * FROM ${GOLD}.qry_dpd_exposure ORDER BY DPD_Bucket_Order`),
      q(`SELECT Account_ID, State, Product_Type, Credit_Score, Outstanding_Balance, Days_Past_Due, PTP_Amount,
                CAST(PTP_Due_Date AS STRING) AS PTP_Due_Date, Call_Outcome, Missed_Payments_L12M
           FROM ${GOLD}.qry_cc_top_broken_accounts ORDER BY Outstanding_Balance DESC LIMIT 8`),
    ]);
    return { trend, drivers, callOutcomes, contactBySegment, transferByState, repeat, scenarios, exposure, topBroken };
  };
  router.get('/api/dashboard/overview', (_req, res) => cached('overview', res, computeOverview));

  /**
   * The accounts behind a Command Center figure: every card can show its list. Each list
   * uses the same rule as the card's number, on the governed account-month view. Lists are
   * fixed here; a request only picks one, plus a value where the list needs it (a bucket, a
   * scenario, a state or a factor's segment), checked against the data.
   * `period`: 'latest' lists are one month (one row per account); '12m' lists are account-months.
   */
  const LATEST = 'b.Is_Latest_Snapshot = 1';
  type Needs = 'bucket' | 'scenario' | 'state' | 'segment';
  const LISTS: Record<string, { where: (v: string, extra?: string) => string; order: string; period: 'latest' | '12m'; needs?: Needs; from?: string }> = {
    overdue: { where: () => `${LATEST} AND b.Overdue_Flag = 1`, order: 'b.Overdue_Balance DESC', period: 'latest' },
    promises: { where: () => `${LATEST} AND b.PTP_Flag = 1`, order: 'b.PTP_Amount DESC', period: 'latest' },
    broken: { where: () => `${LATEST} AND b.Broken_PTP_Flag = 1`, order: 'b.Outstanding_Balance DESC', period: 'latest' },
    kept: { where: () => `${LATEST} AND b.Broken_PTP_Flag = 0`, order: 'b.PTP_Amount DESC', period: 'latest' },
    bucket: { where: (v) => `${LATEST} AND b.Overdue_Flag = 1 AND b.DPD_Bucket = ${v}`, order: 'b.Outstanding_Balance DESC', period: 'latest', needs: 'bucket' },
    contacted: { where: () => `${LATEST} AND b.Contacted_Flag = 1`, order: 'b.Handle_Time_Seconds DESC', period: 'latest' },
    unresolved: { where: () => `${LATEST} AND b.Contacted_Flag = 1 AND b.FCR_Flag = 0`, order: 'b.Handle_Time_Seconds DESC', period: 'latest' },
    transferred: { where: () => `${LATEST} AND b.Transferred_Flag = 1`, order: 'b.Handle_Time_Seconds DESC', period: 'latest' },
    repeat: { where: () => `${LATEST} AND b.Repeat_Call_Flag = 1`, order: 'b.Outstanding_Balance DESC', period: 'latest' },
    repeat_unresolved: { where: () => `${LATEST} AND b.Repeat_After_Unresolved_Flag = 1`, order: 'b.Outstanding_Balance DESC', period: 'latest' },
    scenario: {
      where: (v) => `${LATEST} AND EXISTS (SELECT 1 FROM ${GOLD}.qry_scenario_accounts s WHERE s.Scenario_ID = ${v} AND s.Account_ID = b.Account_ID)`,
      order: 'b.Outstanding_Balance DESC', period: 'latest', needs: 'scenario',
    },
    top_broken: {
      where: () => `EXISTS (SELECT 1 FROM ${GOLD}.qry_cc_top_broken_accounts t WHERE t.Account_ID = b.Account_ID AND t.Snapshot_Date = b.Snapshot_Date)`,
      order: 'b.Outstanding_Balance DESC', period: 'latest',
    },
    // Twelve months: the broken promises in one segment of a factor ("Factor|Segment").
    segment_broken: { where: (v, col) => `b.Broken_PTP_Flag = 1 AND ${col} = ${v}`, order: 'b.Snapshot_Date DESC, b.PTP_Amount DESC', period: '12m', needs: 'segment' },
    transferred_state: { where: (v) => `b.Transferred_Flag = 1 AND b.State = ${v}`, order: 'b.Snapshot_Date DESC, b.Handle_Time_Seconds DESC', period: '12m', needs: 'state' },
    repeat_unresolved_12m: { where: () => 'b.Repeat_After_Unresolved_Flag = 1', order: 'b.Snapshot_Date DESC, b.Outstanding_Balance DESC', period: '12m' },
  };
  const FROM = `FROM ${GOLD}.qry_account_month b`;
  /** The values a list may be narrowed to, from the data itself (so nothing else reaches the SQL). */
  const allowed = (needs: Needs) => cache.get(`values:${needs}`, async () => {
    const sql = needs === 'bucket' ? `SELECT DISTINCT DPD_Bucket AS v FROM ${GOLD}.qry_dpd_exposure`
      : needs === 'scenario' ? `SELECT DISTINCT CAST(Scenario_ID AS STRING) AS v FROM ${GOLD}.qry_scenario_summary`
        : needs === 'state' ? `SELECT DISTINCT State AS v FROM ${GOLD}.qry_transfer_cost`
          : `SELECT DISTINCT CONCAT(Factor, '|', Segment) AS v FROM ${GOLD}.qry_ptp_break_drivers`;
    return (await runSql(sql)).map((r) => String(r.v));
  }).then((r) => r.value as string[]);

  router.get('/api/dashboard/accounts', async (req, res) => {
    const name = String(req.query.list ?? '');
    const list = LISTS[name];
    if (!list) { res.status(400).json({ error: 'unknown list' }); return; }
    let value = '';
    let col: string | undefined;
    if (list.needs) {
      const v = String(req.query.value ?? '');
      if (!(await allowed(list.needs).catch(() => [] as string[])).includes(v)) { res.status(400).json({ error: `unknown ${list.needs}` }); return; }
      if (list.needs === 'segment') {
        const [factor, segment] = v.split('|');
        col = FACTOR_COLUMN[factor];
        if (!col) { res.status(400).json({ error: 'unknown factor' }); return; }
        value = `'${segment.replace(/'/g, "''")}'`;
      } else {
        value = list.needs === 'scenario' ? String(Number(v)) : `'${v.replace(/'/g, "''")}'`;
      }
    }
    const where = `WHERE ${list.where(value, col)}`;
    await cached(`accounts:${name}:${value}:${col ?? ''}`, res, async () => {
      const [[totals], rows] = await Promise.all([
        runSql(`SELECT COUNT(*) AS rows, COUNT(DISTINCT b.Account_ID) AS accounts, SUM(b.Outstanding_Balance) AS balance,
                       SUM(b.Overdue_Balance) AS overdue_balance, SUM(b.PTP_Amount) AS promised, SUM(b.Broken_PTP_Amount) AS broken_amount
                  ${FROM} ${where}`),
        runSql(`SELECT b.Account_ID, b.Snapshot_Month, b.State, b.Product_Type, b.Credit_Score, b.Outstanding_Balance, b.Days_Past_Due,
                       b.DPD_Bucket, b.PTP_Amount, CAST(b.PTP_Due_Date AS STRING) AS PTP_Due_Date, b.Broken_PTP_Flag, b.Call_Outcome,
                       b.Repeat_Call_Flag, b.Handle_Time_Seconds, b.Missed_Payments_L12M, b.Porting_Status,
                       b.Contract_Renewal_Window_Flag, b.New_Product_Interest_Flag
                  ${FROM} ${where} ORDER BY ${list.order} LIMIT 1000`),
      ]);
      return { totals, rows, period: list.period, truncated: Number(totals?.rows ?? 0) > rows.length };
    });
  });

  // Have the Command Center ready before anyone asks: when the app starts, then whenever the
  // data version changes (a quick Lakebase read every few minutes; the warehouse is only
  // queried when something changed).
  const warm = () => {
    void Promise.all([cache.get('summary', computeSummary), cache.get('overview', computeOverview)])
      .catch((err: unknown) => console.warn('[dashboard] warm-up failed:', err instanceof Error ? err.message : err));
  };
  setTimeout(warm, 3000).unref();
  setInterval(warm, WARM_EVERY_MS).unref();

  return router;
}
