import express from 'express';
import { currentVersions, type Lakebase } from '../lib/answerCache.js';
import { runSql } from '../lib/sql.js';

const GOLD = process.env.LENSS_GOLD_SCHEMA ?? 'optus_collections.optus_collections_gold';
if (!/^[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(GOLD)) {
  throw new Error(`LENSS_GOLD_SCHEMA must be "<catalog>.<schema>", got: ${GOLD}`);
}
const BASE = `${GOLD}.qry_account_month`;

/** Filterable dimensions: query parameter -> column (or expression) of qry_account_month for a table alias, and its sort order. */
const DIMS: Record<string, { col: (a?: string) => string; order?: string }> = {
  month: { col: (a = '') => `${a}Snapshot_Month`, order: 'MIN(Snapshot_Date)' },
  product: { col: (a = '') => `${a}Product_Type` },
  state: { col: (a = '') => `${a}State` },
  credit: { col: (a = '') => `${a}Credit_Band`, order: 'MIN(Credit_Band_Order)' },
  bucket: { col: (a = '') => `${a}DPD_Bucket`, order: 'MIN(DPD_Bucket_Order)' },
  missed: { col: (a = '') => `${a}Missed_Payments_Band`, order: 'MIN(Missed_Payments_Band_Order)' },
  outcome: { col: (a = '') => `${a}Call_Outcome`, order: 'MIN(Call_Outcome_Order)' },
  porting: { col: (a = '') => `${a}Porting_Status` },
  renewal: { col: (a = '') => `CASE WHEN ${a}Contract_Renewal_Window_Flag = 1 THEN 'In renewal window' ELSE 'Not in renewal window' END` },
  interest: { col: (a = '') => `CASE WHEN ${a}New_Product_Interest_Flag = 1 THEN 'Interested in a new product' ELSE 'No new product interest' END` },
};

/**
 * Every measure uses the same formula as the certified views (deploy/sql/60_certified_views.sql,
 * 70_command_center_views.sql), so with the latest month selected and no other filter the
 * Explorer reconciles exactly to the Command Center. Balances and overdue accounts are per
 * month: over several months they are the monthly average.
 */
const MEASURES = `
  COUNT(DISTINCT Account_ID) AS accounts,
  COUNT(*) AS account_months,
  COUNT(DISTINCT Snapshot_Date) AS months,
  1.0*SUM(Overdue_Flag)/COUNT(DISTINCT Snapshot_Date) AS overdue_accounts,
  SUM(Overdue_Balance)/COUNT(DISTINCT Snapshot_Date) AS overdue_balance,
  SUM(Outstanding_Balance)/COUNT(DISTINCT Snapshot_Date) AS total_balance,
  SUM(PTP_Flag) AS promises,
  SUM(Broken_PTP_Flag) AS broken,
  SUM(Kept_PTP_Flag) AS kept,
  1.0*SUM(Broken_PTP_Flag)/NULLIF(SUM(PTP_Flag),0) AS broken_rate,
  SUM(PTP_Amount) AS promised_amount,
  SUM(Broken_PTP_Amount) AS broken_amount,
  SUM(Contacted_Flag) AS contacts,
  1.0*SUM(Contacted_Flag)/NULLIF(COUNT(*),0) AS contact_rate,
  1.0*SUM(FCR_Flag)/NULLIF(SUM(Contacted_Flag),0) AS fcr_rate,
  1.0*SUM(Transferred_Flag)/NULLIF(SUM(Contacted_Flag),0) AS transfer_rate,
  1.0*SUM(Repeat_Call_Flag)/NULLIF(SUM(Contacted_Flag),0) AS repeat_rate,
  AVG(Handle_Time_Seconds) AS avg_handle,
  SUM(Repeat_After_Unresolved_Flag) AS repeat_after_unresolved,
  AVG(Credit_Score) AS avg_credit`;

type Rows = Record<string, string | null>[];
type Options = { dims: Record<string, string[]>; latestMonth: string | null };

const sqlStr = (v: string) => `'${v.replace(/'/g, "''")}'`;

export function buildExplorerRouter(db: Lakebase): express.Router {
  const router = express.Router();

  // Results are cached per data version, like the Command Center; filters are part of the key.
  const entries = new Map<string, { version: string | null; at: number; value: unknown }>();
  async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const version = await currentVersions(db).then((v) => v.data, () => null);
    const e = entries.get(key);
    if (e && (version && e.version ? e.version === version : Date.now() - e.at < 10 * 60_000)) return e.value as T;
    const value = await compute();
    if (entries.size > 300) entries.clear();
    entries.set(key, { version, at: Date.now(), value });
    return value;
  }

  const options = () => cached<Options>('options', async () => {
    const dims: Record<string, string[]> = {};
    const lists = await Promise.all(Object.entries(DIMS).map(([k, d]) =>
      runSql(`SELECT ${d.col()} AS v FROM ${BASE} WHERE ${d.col()} IS NOT NULL GROUP BY ${d.col()} ORDER BY ${d.order ?? d.col()}`)
        .then((rows) => [k, rows.map((r) => String(r.v))] as const)));
    for (const [k, v] of lists) dims[k] = v;
    const [l] = await runSql(`SELECT MAX(Snapshot_Month) AS m FROM ${BASE} WHERE Is_Latest_Snapshot = 1`);
    return { dims, latestMonth: l?.m ?? null };
  });

  /**
   * The WHERE clause for the request's filters; `alias` prefixes the columns (e.g. 'b.'). Only values that
   * exist in the data are accepted, so nothing user-typed reaches the SQL. `skip` leaves one filter out
   * (the 12-month trend ignores the month filter).
   */
  async function filtersFrom(query: express.Request['query'], alias = '', skip?: string) {
    const opts = await options();
    const clauses: string[] = [];
    const applied: Record<string, string> = {};
    for (const [k, d] of Object.entries(DIMS)) {
      const v = typeof query[k] === 'string' ? query[k] as string : '';
      if (!v) continue;
      if (!opts.dims[k]?.includes(v)) throw Object.assign(new Error(`Unknown ${k}: ${v}`), { status: 400 });
      applied[k] = v;
      if (k === skip) continue;
      clauses.push(`${d.col(alias)} = ${sqlStr(v)}`);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', applied };
  }

  const fail = (res: express.Response, err: unknown) => {
    const status = (err as { status?: number }).status ?? 500;
    res.status(status).json({ error: err instanceof Error ? err.message : String(err) });
  };

  router.get('/api/explorer/options', async (_req, res) => {
    try { res.json(await options()); } catch (err) { fail(res, err); }
  });

  /**
   * The accounts behind any Explorer item: the current filters plus the item's own (a product,
   * state, … sent as one more filter, so it is checked the same way), optionally narrowed to a
   * promise or call stage. Same columns as the Command Center's lists, shown in the same window.
   */
  const STAGES: Record<string, string> = {
    overdue: 'b.Overdue_Flag = 1', promised: 'b.PTP_Flag = 1', broken: 'b.Broken_PTP_Flag = 1', kept: 'b.Broken_PTP_Flag = 0',
    contacted: 'b.Contacted_Flag = 1', resolved: 'b.FCR_Flag = 1', transferred: 'b.Transferred_Flag = 1',
    repeat: 'b.Repeat_Call_Flag = 1', repeat_unresolved: 'b.Repeat_After_Unresolved_Flag = 1',
  };
  router.get('/api/explorer/accounts', async (req, res) => {
    try {
      const { where, applied } = await filtersFrom(req.query, 'b.');
      const clauses = where ? [where.replace(/^WHERE /, '')] : [];
      const stage = typeof req.query.stage === 'string' ? req.query.stage : '';
      if (stage) {
        if (!STAGES[stage]) throw Object.assign(new Error(`Unknown stage: ${stage}`), { status: 400 });
        clauses.push(STAGES[stage]);
      }
      const w = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const from = `FROM ${BASE} b`;
      const value = await cached('accounts:' + JSON.stringify({ applied, stage }), async () => {
        const [[totals], rows] = await Promise.all([
          runSql(`SELECT COUNT(*) AS rows, COUNT(DISTINCT b.Account_ID) AS accounts, SUM(b.Outstanding_Balance) AS balance,
                         SUM(b.Overdue_Balance) AS overdue_balance, SUM(b.PTP_Amount) AS promised, SUM(b.Broken_PTP_Amount) AS broken_amount ${from} ${w}`),
          runSql(`SELECT b.Account_ID, b.Snapshot_Month, b.State, b.Product_Type, b.Credit_Score, b.Outstanding_Balance, b.Days_Past_Due,
                         b.DPD_Bucket, b.PTP_Amount, CAST(b.PTP_Due_Date AS STRING) AS PTP_Due_Date, b.Broken_PTP_Flag, b.Call_Outcome,
                         b.Repeat_Call_Flag, b.Handle_Time_Seconds, b.Missed_Payments_L12M, b.Porting_Status,
                         b.Contract_Renewal_Window_Flag, b.New_Product_Interest_Flag
                    ${from} ${w} ORDER BY b.Snapshot_Date DESC, b.Overdue_Balance DESC, b.Outstanding_Balance DESC LIMIT 1000`),
        ]);
        return { totals, rows, period: applied.month ? 'latest' : '12m', truncated: Number(totals?.rows ?? 0) > rows.length };
      });
      res.json(value);
    } catch (err) { fail(res, err); }
  });

  /**
   * One round trip for the whole Explorer: filtered headline measures (and the same month for the
   * whole book, for comparison), every breakdown, the 12-month trend of this view, promises by call
   * outcome and the account records. A breakdown that fails comes back empty.
   */
  router.get('/api/explorer/data', async (req, res) => {
    try {
      const { where, applied } = await filtersFrom(req.query);
      const { where: trendWhere } = await filtersFrom(req.query, '', 'month');
      const monthOnly = applied.month ? `WHERE Snapshot_Month = ${sqlStr(applied.month)}` : '';
      const key = 'data:' + JSON.stringify(applied);
      const value = await cached(key, async () => {
        const q = (sql: string) => runSql(sql).catch((err): Rows => {
          console.warn('[explorer] query failed:', err instanceof Error ? err.message : err);
          return [];
        });
        const by = (k: string) => {
          const d = DIMS[k];
          return q(`SELECT ${d.col()} AS k, ${d.order ?? 'NULL'} AS ord, ${MEASURES} FROM ${BASE} ${where} GROUP BY ${d.col()} ORDER BY ${d.order ?? 'overdue_balance DESC'}`);
        };
        const dimKeys = Object.keys(DIMS).filter((k) => k !== 'month');
        const [totals, book, trend, accounts, ...breakdowns] = await Promise.all([
          q(`SELECT ${MEASURES} FROM ${BASE} ${where}`),
          cached(`book:${applied.month ?? ''}`, () => q(`SELECT ${MEASURES} FROM ${BASE} ${monthOnly}`)),
          q(`SELECT Snapshot_Month AS k, MIN(Snapshot_Date) AS d, ${MEASURES} FROM ${BASE} ${trendWhere} GROUP BY Snapshot_Month ORDER BY d`),
          q(`SELECT Account_ID, Snapshot_Month, State, Product_Type, Credit_Score, Credit_Band, Outstanding_Balance, Overdue_Balance,
                    Days_Past_Due, DPD_Bucket, PTP_Flag, PTP_Amount, CAST(PTP_Due_Date AS STRING) AS PTP_Due_Date, Broken_PTP_Flag,
                    Call_Outcome, Repeat_Call_Flag, Handle_Time_Seconds, Missed_Payments_L12M, Porting_Status,
                    Contract_Renewal_Window_Flag, New_Product_Interest_Flag
               FROM ${BASE} ${where} ORDER BY Snapshot_Date DESC, Overdue_Balance DESC, Outstanding_Balance DESC LIMIT 500`),
          ...dimKeys.map(by),
        ]);
        return {
          applied, latestMonth: (await options()).latestMonth,
          totals: totals[0] ?? null, book: book[0] ?? null, trend, accounts,
          by: Object.fromEntries(dimKeys.map((k, i) => [k, breakdowns[i]])),
        };
      });
      res.json(value);
    } catch (err) { fail(res, err); }
  });

  return router;
}
