/**
 * What LensS knows about itself. Questions about the platform ("What is LensS?",
 * "How do I filter by region?", "What does Observability show?") are answered from
 * this guide instead of the collections data. Keep it in step with the UI: it is the
 * only source the platform answers may use. No data figures here (those come from
 * the query engine), so the guide never goes stale when the data is reloaded.
 */

export interface GuideSection { id: string; title: string; keywords: string[]; text: string }

export const GUIDE: GuideSection[] = [
  {
    id: 'about', title: 'What LensS is',
    keywords: ['lenss', 'lens', 'concentrix', 'optus', 'what is', 'who built', 'who made', 'platform', 'about', 'purpose', 'what are you', 'who are you', 'what can you do'],
    text: `**LensS** is Concentrix's decision-intelligence platform, built by the **Concentrix Data & Analytics Practice**. It turns governed business data into answers people can act on, with every figure traceable to its source.
**LensS Collections Intelligence for Optus** is LensS applied to Optus's telecom collections: promises to pay and why they break, the contact centre (first contact resolution, transfers, repeat calls, handle time), where the overdue balance sits, and the customer scenarios in Optus's Scenario_Guide. LensS is a Concentrix product, set up for Optus with Optus's demo data.
It has four tabs: **Command Center** (how collections are doing, in about a minute), **Explorer** (why, with filters and drill-downs), **Assistant** (ask questions in plain language) and **Observability** (how every answer was made, its quality, cost and safety).
The answers come from the **LensS Intelligence Engine**, which turns a question into SQL over certified, governed views of the collections data, runs it and explains the result. Every figure on the dashboards comes from those same views; no AI computes them.`,
  },
  {
    id: 'command-center', title: 'Command Center tab',
    keywords: ['command center', 'command centre', 'home', 'dashboard', 'first page', 'overview', 'kpi', 'metrics', 'summary', 'chapters', 'scenarios', 'scenario', 'trend', 'view accounts', 'accounts behind'],
    text: `The **Command Center** is the one-minute view of Optus collections, told as one story in five chapters (the bar under the summary jumps to each):
- **1 · Promises (the top banner):** the latest month's promises to pay, how many were kept and broken and their amounts, against the 12-month rate; four tiles: overdue balance, promises broken, resolved first time (FCR) and customers who called again after an unresolved call.
- **Executive summary:** "The month in 30 seconds", five lines (one per chapter) and a bottom line; each line jumps to its chapter.
- **2 · Why promises break:** a card per factor that makes a clear difference (call outcome, credit score, missed payments…), with the broken rate of each segment against the overall rate, and the factors that make little difference (product, state, porting, renewal window, new product interest) grouped together.
- **3 · Contact centre:** FCR, transfers, repeat calls and average handle time (latest month, last month and 12 months), then Scenario 4 (promises broken by call outcome), Scenario 5 (transfers and handle time by state) and Scenario 6 (repeat calls after an unresolved call).
- **4 · Where the money is:** the overdue balance by days-past-due bucket, and a 12-month trend chart (switch between overdue balance, broken rate, amount promised, FCR, transfers and repeat calls).
- **5 · Scenarios:** a card for each of the six scenarios in Optus's Scenario_Guide, and the broken promises with the most at stake.
- **View accounts** (or **View**) on any figure opens the accounts behind it, with **Export CSV**. **KPI definitions** (in the banner and at the bottom) explain every figure.
Every panel has an **Ask LensS** button; hover over it to see the exact question it will ask.`,
  },
  {
    id: 'explorer', title: 'Explorer tab',
    keywords: ['explorer', 'filter', 'filters', 'drill', 'drill down', 'slice', 'slicer', 'why', 'state', 'product', 'month', 'credit', 'call outcome', 'export', 'csv', 'download data', 'accounts list', 'records', 'segment'],
    text: `The **Explorer** answers "why": it slices the same governed data by any combination of filters.
- **Filters:** month (or all 12 months), product, state, credit score, days past due, missed payments (12 months), call outcome, porting status, contract renewal window and new product interest. It opens on the latest month. Active filters show as chips; click a chip's × to remove it, or **Reset filters** (back to the latest month).
- **Headline tiles** show the filtered figures (overdue balance, promises, broken rate, FCR, transfers, repeat calls, handle time), compared with the whole book in the same period.
- **Analytical exploration workspace:** pick a dimension and a measure to compare, as bars or a table. **Click any bar to filter the whole page to it** (drill-down).
- **Promises broken by call outcome** and the **12-month trend of this view** follow the filters (the trend ignores the month filter).
- **Account records:** the account-months with the most overdue in the current view, with search, sort and paging. **Export CSV** downloads them. **View** on any item opens its accounts.
- **Ask LensS about this view** asks why the filtered slice differs from the rest of the book; every panel's question carries the active filters.
With the latest month and no other filter, every Explorer figure reconciles exactly to the Command Center.`,
  },
  {
    id: 'assistant', title: 'Assistant tab',
    keywords: ['assistant', 'chat', 'ask', 'question', 'conversation', 'history', 'new chat', 'search chats', 'sidebar', 'prompts', 'quick start', 'library', 'suggested', 'follow-up', 'pdf', 'download', 'voice', 'microphone', 'rename', 'delete', 'notification'],
    text: `The **Assistant** answers questions about the collections data in plain language, with charts.
- **Modes** (menu at the top left): **Quick answer** (one query, about 20 seconds), **Deep analysis** (investigates step by step with several queries and charts, 1–3 minutes), or **Auto**, which picks one for each question.
- **Quick start prompts and the question library** (lightbulb icon, top right): one-click analyses and questions grouped by Executive, Promises, Contact centre, Scenarios and Risk.
- **Conversations** are saved per person. The sidebar has **New chat**, **Search** and the list of chats; when it is collapsed, the same three icons stay on the left. Hover a chat to rename or delete it.
- **Under each answer:** copy, 👍 / 👎 (👎 asks what was wrong and goes to a review queue), regenerate, and **Details**: the quality score, the data sources, the SQL that ran and how long each step took, with a link to inspect it in Observability. Follow-up questions appear after the answer.
- **Download PDF** (icon at the top right) saves the conversation, charts included.
- Answers to common questions may come from the **answer cache** (instant); **Refresh** asks the engine again.
- If you switch tabs while a deep analysis runs, you get a notification when it is ready. Where the browser supports it, the microphone lets you ask by voice.`,
  },
  {
    id: 'howto', title: 'How to do common things (exact steps)',
    keywords: ['how do i', 'how can i', 'how to', 'steps', 'filter', 'state', 'product', 'month', 'export', 'csv', 'drill', 'pdf', 'download', 'new chat', 'search', 'rename', 'delete', 'mode', 'log out', 'kpi definitions', 'sql', 'feedback', 'evals', 'run evals', 'accounts'],
    text: `- **Filter the Explorer (for example by state):** open the **Explorer** tab. At the top of the page are dropdown boxes, one per filter (Month, Product, State, Credit score, Days past due, Missed payments, Call outcome, Porting status, Contract renewal window, New product interest). Choose a value in the **State** dropdown; the whole page updates. The filter appears as a chip; click its × to remove it, or **Reset filters** (top right of the Explorer) to go back to the latest month.
- **Look at another month or the whole year:** in the Explorer, use the **Month** dropdown; choose **All 12 months** for the year.
- **Drill down:** in the Explorer's analytical exploration workspace, choose a **Dimension** and a **Measure**, then click any bar.
- **See the accounts behind a figure:** click **View accounts** (or **View**) next to it on the Command Center or in the Explorer; the window has **Export CSV**.
- **Export accounts:** in the Explorer, click **Export CSV** (top right); it downloads the account records for the current filters.
- **See the SQL and quality of an answer:** in the Assistant, click **Details** under the answer.
- **Choose Quick answer, Deep analysis or Auto:** in the Assistant, click the mode name at the top left (it shows "Auto" by default) and pick one.
- **Start, find, rename or delete a chat:** in the Assistant's left sidebar, **New chat**, **Search**, or hover a chat in the list for rename and delete.
- **Download a conversation:** in the Assistant, the download icon at the top right saves it as a PDF.
- **See how a figure is calculated:** on the Command Center, click **KPI definitions**.
- **Log out:** click the round letter at the top right, then **Log out**.
- **Run the evaluation suite:** Observability → **6. Evaluations** → choose the categories → **Run evals**.`,
  },
  {
    id: 'modes', title: 'Quick answer, Deep analysis and Auto',
    keywords: ['quick answer', 'deep analysis', 'auto', 'auto mode', 'mode', 'agent', 'how long', 'slow', 'fast'],
    text: `**Quick answer** runs one query and answers in about 20 seconds: best for "what is / which / show me" questions.
**Deep analysis** plans and runs several queries, builds charts and explains the reasons and actions: best for "why" and "what should we do" questions. It takes 1–3 minutes.
**Auto** (the default) chooses for each question: depending on the deployment, a small AI model or a word rule decides, and the reason is recorded in Observability. Prompts and Ask LensS buttons that name a mode always use it.`,
  },
  {
    id: 'observability', title: 'Observability tab',
    keywords: ['observability', 'monitoring', 'trace', 'traces', 'audit', 'quality', 'faithfulness', 'groundedness', 'latency', 'performance', 'drift', 'security', 'guardrail', 'guardrails', 'evals', 'evaluation', 'evaluations', 'responsible ai', 'cost', 'tokens', 'feedback review', 'cache'],
    text: `**Observability** shows how every answer was made, from live logs, for a chosen period (24 hours, 7 days, 30 days, all time). A headline row shows groundedness, numeric reconciliation, average latency and the personal-data guardrail. Eight areas:
1. **Pipeline traces:** every question with its path (ask, secure, cache, plan, retrieve, verify, synthesize, deliver, log), timings and SQL; filter by passed, blocked or failed, by user, or search.
2. **Answer quality & faithfulness:** quality per day, low-confidence answers, reasons for 👎, and the **feedback review** queue (mark fixed, dismiss, or add to the evaluation suite).
3. **Performance & latency:** questions and answer time per day, time per stage, the answer cache, AI usage and cost, and usage by user.
4. **Data & model drift:** data and semantic-model versions, the models in use, the quick/deep mix and evaluation pass rates.
5. **Security & guardrails:** checks that fired and recent guardrail events.
6. **Evaluations:** run the test suite (ground-truth accuracy, red-team guardrail tests, policy checks) and see results by run.
7. **Responsible AI:** purpose, the AI models and when they run, the data used, protections, how quality is measured, data handling and known limits.
8. **Databricks cost:** what this project has cost on the data platform since its first day, by service, at list price.`,
  },
  {
    id: 'trust', title: 'How answers are checked and kept safe',
    keywords: ['trust', 'accurate', 'accuracy', 'hallucinate', 'made up', 'verify', 'quality score', 'faithfulness', 'pii', 'personal data', 'privacy', 'secure', 'security', 'safe', 'governed', 'certified', 'sql', 'source'],
    text: `- **Governed data only:** the engine reads certified gold views of the collections data, read-only, through the app's own service identity. The data holds account IDs, not customer names or contact details.
- **Guardrails** check each question (personal data is masked, abusive language and prompt-injection attempts are blocked, off-topic questions are flagged) and each answer (personal data, profanity, policy wording).
- **Quality check:** after an answer, every figure is looked up in the query results, and a judge model scores faithfulness, relevance, completeness and safety. Answers that score low carry a visible warning. **Details** under each answer shows the score, the sources and the exact SQL.
- **People in the loop:** 👎 feedback goes to a review queue and can become a permanent test case.
- Questions and answers are not used to train any model.`,
  },
  {
    id: 'navigation', title: 'Navigation and account',
    keywords: ['navigate', 'navigation', 'tabs', 'menu', 'account', 'profile', 'log out', 'logout', 'sign out', 'sign in', 'user', 'name', 'email', 'where', 'find', 'open', 'go to', 'mobile', 'phone'],
    text: `- The **top bar** has the four tabs (Command Center, Explorer, Assistant, Observability).
- The **round letter at the top right** is your account: click it to see your full name, email and **Log out**. Log out ends the LensS session in this browser; your organisation (Databricks) sign-in stays active until you sign out of the workspace or close the browser.
- Any **Ask LensS** button on the Command Center or Explorer opens the Assistant with that question; **Explore the why** on the Command Center opens the Explorer.
- The pages also work on tablets and phones.`,
  },
  {
    id: 'data', title: 'What data LensS uses',
    keywords: ['data', 'snapshot', 'as of', 'date', 'month', 'months', 'refresh', 'updated', 'population', 'currency', 'dollars', 'aud', 'tables', 'views', 'definitions', 'kpi definitions', 'scenario guide'],
    text: `- **Data:** Optus's collections demo data: 15,000 accounts in 12 monthly snapshots (November 2025 to October 2026), one row per account per month, across five products (Postpaid Mobile, NBN, Prepaid, 5G Home Internet, SMB) and all eight states and territories. Amounts are in Australian dollars.
- **Latest month** means the latest snapshot (1 October 2026). Overdue means more than 0 days past due.
- **Contact centre:** contact is recorded once per account per month, with whether it was resolved first time, transferred, followed by a repeat call within about 7 to 14 days, and its handle time.
- **Definitions** of every figure are in **KPI definitions** on the Command Center (for example: broken-promise rate = broken promises ÷ promises made; FCR = resolved on the first call ÷ contacted).
- The dashboards and the Assistant use the same certified views, so their figures agree.`,
  },
  {
    id: 'limits', title: 'Known limits',
    keywords: ['limit', 'limits', 'limitation', 'cannot', "can't", 'forecast', 'predict', 'target', 'cost', 'wrong', 'mistake', 'not able'],
    text: `- LensS does not forecast future months, and there is no collections target in the data.
- Every promise has a recorded outcome, including the latest month's, which fall due after the snapshot date.
- No cost per minute of handle time has been supplied, so handle time is shown in seconds and hours, not dollars.
- The data has no call dates, outbound attempts, channels or agents; about half of the promises have no contact recorded that month, and the data doesn't say how they were made.
- Comparisons show observed differences (for example promises after a transfer against a first-time resolution), not what a change would cause.
- AI answers can be wrong: check the quality score and the SQL under **Details** before acting on an answer.
- It answers about collections data and this platform; it does not give personal details of customers.`,
  },
];

/**
 * Cheap first filter: does the question mention the platform at all? Only these go on
 * to the platform step, so data questions never pay for it. `strict` is used when no
 * model is available to confirm, and leaves out the words data questions also use.
 */
const STRONG = /\b(lenss|concentrix|this (app|application|platform|tool|site|dashboard|assistant)|what can you (do|answer|help)|who (built|made|created|are you)|what are you|command cent(er|re)|explorer tab|observability|kpi (dictionary|definitions)|quick answer|deep analysis|auto mode|responsible ai|log ?out|sign ?out|how (do|can) i (use|ask|filter|export|download|switch|change|log|sign|search|delete|rename|start|open|find the|go to|navigate)|which tab|what tabs|the tabs|navigate|navigation)\b/i;
const LOOSE = /\b(lens|explorer|assistant|tab|tabs|page|evals?|evaluations?|guardrails?|faithfulness|groundedness|trace|traces|cache|pdf|feature|features|help|how does (this|it) work|where (do|can|is))\b/i;
/** Words that make a question about the collections data, not the platform ("and for NSW?"). */
export const DATA_WORDS = /\b(accounts?|collect(ed|ions?)?|overdue|arrears|dpd|days past due|buckets?|promises?|ptps?|broken|kept|honou?r(ed)?|products?|plans?|mobile|postpaid|prepaid|nbn|broadband|5g|home internet|smb|states?|territor(y|ies)|nsw|vic(toria)?|qld|queensland|wa|sa|tas(mania)?|act|nt|new south wales|fcr|first (call|contact) resolution|resolved|transfer(s|red)?|repeats?|repeat calls?|callers?|calls?|handle time|aht|contacts?|contacted|credit( scores?)?|missed payments?|porting|port(ed|ing)? out|renewal|upgrade|scenarios?|rates?|balances?|outstanding|segments?|customers?|book|month|months|monthly|week|trend|lowest|highest|top|figures?|numbers?)\b|\$|\d/i;
/** Things on screen: a data word next to one of these ("where is the DPD filter?") is still a platform question. */
const UI_WORDS = /\b(tabs?|pages?|buttons?|filters?|drop-?downs?|menus?|click|screen|export|download|explorer|assistant|observability|dashboard|chart type|settings)\b/i;
export function platformCandidate(question: string, strict: boolean): boolean {
  if (STRONG.test(question)) return true;
  if (strict || !LOOSE.test(question)) return false;
  // A loose word alone ("where is the risk concentrated?") doesn't make a data question a platform one:
  // a small model asked to confirm can answer it from the guide anyway, with made-up steps.
  return !DATA_WORDS.test(question) || UI_WORDS.test(question);
}

/** The guide sections that best match a question (keyword overlap), for the model or for a no-model answer. */
export function relevantSections(question: string, max = 3): GuideSection[] {
  const q = question.toLowerCase();
  const has = (k: string) => new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`).test(q);   // whole words: "bu" must not match "built"
  const scored = GUIDE.map((s) => ({ s, score: s.keywords.reduce((a, k) => a + (has(k) ? (k.includes(' ') ? 2 : 1) : 0), 0) }));
  scored.sort((a, b) => b.score - a.score);
  const hits = scored.filter((x) => x.score > 0).slice(0, max).map((x) => x.s);
  return hits.length ? hits : [GUIDE[0]];
}

export const guideText = () => GUIDE.map((s) => `## ${s.title}\n${s.text}`).join('\n\n');
