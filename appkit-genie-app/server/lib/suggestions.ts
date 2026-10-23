/**
 * The suggested questions: the six tiles on an empty chat, plus four more in
 * the side panel (five per mode). One list, served to the front end and used
 * to pre-warm the answer cache. Built from Optus's Sample_BI_Questions and
 * Scenario_Guide; check each against the live Genie space before a demo.
 */
export interface Suggestion {
  mode: 'chat' | 'agent';
  label: string;
  q: string;
}

export const STARTERS: Suggestion[] = [
  { mode: 'chat', label: 'Promises made and broken this month', q: 'How many promises to pay were made in the latest month, and how many were broken?' },
  { mode: 'chat', label: 'Kept rate: resolved first time vs transferred', q: 'Compare PTP-kept rates between calls resolved first time and transferred calls.' },
  { mode: 'chat', label: 'Customers in each scenario', q: 'How many accounts are in each scenario this month, and what do they owe?' },
  { mode: 'agent', label: 'Why do promises break, and what should we do?', q: 'Why are promises to pay breaking, and what should we do about it?' },
  { mode: 'agent', label: 'Is the contact centre hurting collections?', q: 'How do first contact resolution, transfers and repeat calls affect whether customers keep their promises to pay?' },
  { mode: 'agent', label: 'Where are transfers costing us time?', q: 'Which states and products combine high transfer rates with long handle times, and where is the training opportunity?' },
];

export const MORE_SUGGESTIONS: Suggestion[] = [
  { mode: 'chat', label: 'Monthly broken-promise rate', q: 'What is the monthly broken-PTP rate trend?' },
  { mode: 'chat', label: 'Lowest first call resolution by product', q: 'Which product types have the lowest First Call Resolution rate?' },
  { mode: 'agent', label: 'Repeat callers after an unresolved call', q: 'Which customers called again after an unresolved call this month, and what do they have in common?' },
  { mode: 'agent', label: 'Chronic late payers at renewal', q: 'For customers with 2+ missed payments entering renewal, what % broke their last PTP, and how should we handle their renewal?' },
];

export const ALL_SUGGESTIONS: Suggestion[] = [...STARTERS, ...MORE_SUGGESTIONS];

/**
 * Quick-start prompts: one-click analyses shown on the Assistant's welcome screen
 * and at the top of the prompts panel (icon, category, title, one-line description).
 */
export interface QuickStart { icon: string; category: string; title: string; desc: string; q: string; mode: 'chat' | 'agent' }

export const QUICK_START: QuickStart[] = [
  { icon: 'promise', category: 'Promises', title: 'Why promises break', desc: 'The factors that make a difference, and what to do', mode: 'agent',
    q: 'Why are promises to pay breaking, and what should we do about it?' },
  { icon: 'alert', category: 'Operational', title: 'Broken promises with the most at stake', desc: 'The top 100 by outstanding balance, latest month', mode: 'chat',
    q: 'Show me the top 100 accounts by outstanding balance where the PTP was broken last month.' },
  { icon: 'gap', category: 'Contact centre', title: 'FCR and kept promises', desc: 'Resolved first time against transferred calls', mode: 'agent',
    q: 'How do first contact resolution, transfers and repeat calls affect whether customers keep their promises to pay?' },
  { icon: 'cash', category: 'Efficiency', title: 'Transfers and handle time', desc: 'Where transfers add handle time, by state and product', mode: 'agent',
    q: 'Which states and products combine high transfer rates with long handle times, and where is the training opportunity?' },
  { icon: 'shield', category: 'Scenarios', title: 'Customers to treat differently', desc: 'Upgrade-but-overdue, porting out, renewal, repeat callers', mode: 'agent',
    q: 'Walk me through the scenarios this month: how many accounts are in each, what they owe, and how we should approach each group.' },
  { icon: 'brief', category: 'Executive', title: 'Executive decision brief', desc: 'One page: promises, drivers, contact centre, actions', mode: 'agent',
    q: 'Write a one-page executive brief for this month: promises to pay and how many broke, why they break, how the contact centre is doing, and the top three actions.' },
];

/** The categorized question library, by what a leader is trying to do. */
export const LIBRARY: Array<{ category: string; items: Array<{ q: string; tag: string; mode: 'chat' | 'agent' }> }> = [
  { category: 'Executive', items: [
    { q: 'What can you help me with?', tag: 'capabilities', mode: 'chat' },
    { q: 'How many promises to pay were made in the latest month, and how many were broken?', tag: 'promises', mode: 'chat' },
    { q: 'How has total outstanding balance trended over the last 12 months by product type?', tag: 'trend', mode: 'chat' },
    { q: 'Write a one-page executive brief for this month: promises to pay and how many broke, why they break, how the contact centre is doing, and the top three actions.', tag: 'brief', mode: 'agent' },
  ] },
  { category: 'Promises', items: [
    { q: 'Why are promises to pay breaking, and what should we do about it?', tag: 'root cause', mode: 'agent' },
    { q: 'What percentage of PTPs are kept vs broken, segmented by credit score bands?', tag: 'credit', mode: 'chat' },
    { q: 'Which Australian states have the highest broken-PTP rate?', tag: 'states', mode: 'chat' },
    { q: 'Which PTP due-date lead time correlates with the highest honour rate?', tag: 'lead time', mode: 'chat' },
  ] },
  { category: 'Contact centre', items: [
    { q: 'Compare PTP-kept rates between accounts resolved on first call (FCR=Y) vs transferred calls.', tag: 'FCR', mode: 'chat' },
    { q: 'Which product types have the lowest First Call Resolution rate?', tag: 'FCR by product', mode: 'chat' },
    { q: 'What is the average handle time by state, and how does it correlate with transfer rate?', tag: 'handle time', mode: 'chat' },
    { q: 'What % of contacted accounts result in a PTP, broken out by FCR vs non-FCR calls?', tag: 'PTP per contact', mode: 'chat' },
  ] },
  { category: 'Scenarios', items: [
    { q: 'How many customers have New_Product_Interest=Y but are 30+ days past due? What is their total balance?', tag: 'upgrade but overdue', mode: 'chat' },
    { q: 'List customers porting out with Credit_Score < 550, ranked by Outstanding_Balance.', tag: 'porting out', mode: 'chat' },
    { q: 'For customers with 2+ missed payments entering renewal, what % broke their last PTP?', tag: 'renewal', mode: 'chat' },
    { q: 'Which accounts have Repeat_Call_Flag=Y for 2+ consecutive months AND are in the renewal window?', tag: 'repeat callers', mode: 'chat' },
  ] },
  { category: 'Risk', items: [
    { q: 'Show me the top 100 accounts by outstanding balance where the PTP was broken last month.', tag: 'at stake', mode: 'chat' },
    { q: 'How is the overdue balance spread across days-past-due buckets?', tag: 'exposure', mode: 'chat' },
    { q: 'Which accounts broke two or more promises in the last 12 months?', tag: 'repeat breakers', mode: 'chat' },
    { q: 'For customers with Porting_Status=Outbound, what is the average outstanding balance and credit score?', tag: 'porting', mode: 'chat' },
  ] },
];
