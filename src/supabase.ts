import { createClient } from '@supabase/supabase-js'

// The anon key is public by design; all data access is gated by RLS.
export const supabase = createClient(
  'https://ngmpmyuwacwbwtqtinos.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nbXBteXV3YWN3Ynd0cXRpbm9zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5OTY1NDQsImV4cCI6MjEwNDU3MjU0NH0.bwtntQy3JLw7ytM2obVWk3WBGS_7bjwRKcYB43pCFuw',
)

export type Org = { id: string; name: string; invite_code: string }
export type Customer = { id: string; name: string; company: string | null; email: string | null; phone: string | null }
export type PaymentType = 'P&I' | 'I/O' | 'Deferred' | 'I/O Deferred' | 'Construction'
export type DbLoan = {
  id: string; loan_number: string; type: string; stage: string; amount: number; rate: string | null
  term: string | null; ltv: number | null; dscr: number | null; maturity: string | null
  collateral: string | null; rm: string | null; payment_type: PaymentType
  draw_period_end: string | null; origination_date: string | null; customer_id: string | null
  current_balance: number | null; next_payment_amount: number | null; next_payment_date: string | null
  io_end_date: string | null; rate_reset_date: string | null; rate_floor: string | null
  budget_total: number | null; draws_to_date: number | null; interest_reserve_remaining: number | null
  customers: { name: string; company: string | null; email: string | null; phone: string | null } | null
}
export type ShareLink = {
  id: string; token: string; institution: string; expires_at: string; revoked: boolean
  access_count: number; last_accessed_at: string | null; created_at: string
  passcode: string | null; doc_ids: string[] | null
}
export type Payment = { id: string; loan_id: string; due_date: string; amount: number; status: 'due' | 'paid' | 'late' | 'missed'; paid_date: string | null }
export type DbCovenant = { id: string; name: string; requirement: string; actual: string | null; status: 'Pass' | 'Near' | 'Fail'; frequency: string | null; next_test: string | null; source: string | null }
export type DbTickler = { id: string; requirement: string; responsible: string; frequency: string | null; due_date: string; status: 'open' | 'requested' | 'complete' | 'waived'; source: string | null }
export type Guarantor = { id: string; name: string; guarantee_pct: number | null; guarantee_type: string | null; pfs_date: string | null; net_worth: number | null; liquidity: number | null }
export type Note = { id: string; body: string; author: string | null; created_at: string }
export type Rule = { id: string; days_past_due: number; channel: 'email' | 'sms' | 'both'; subject: string | null; body: string; enabled: boolean }

export type Spread = {
  id: string; customer_id: string; period: string; statement_type: string
  status: 'draft' | 'reviewed'; data: Record<string, number | null>; source_document_id: string | null
}
export const SPREAD_LINES: [string, string][] = [
  ['revenue', 'Revenue'], ['cogs', 'Cost of goods sold'], ['opex', 'Operating expenses'],
  ['ebitda', 'EBITDA'], ['depreciation', 'Depreciation & amort.'], ['interest_expense', 'Interest expense'],
  ['net_income', 'Net income'], ['distributions', 'Distributions'],
  ['total_debt', 'Total debt'], ['tangible_net_worth', 'Tangible net worth'],
]
export const SPREAD_DOC_TYPES = ['Tax Return', 'Financial Statement']
export type Queued = { loan_number: string; company: string; channel: string; recipient: string; days_late: number; rule_days: number; subject: string | null; body: string }

/** Auth-scoped call to the rules engine; dryRun returns the queue without sending. */
export async function runRules(dryRun: boolean) {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  const res = await fetch(`https://ngmpmyuwacwbwtqtinos.supabase.co/functions/v1/run-rules${dryRun ? '?dry_run=1' : ''}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  return res.json()
}

/** Create a draft spread shell when a financial document lands on a customer. */
export async function spreadFromDocument(orgId: string, customerId: string, docId: string, filename: string, docType: string): Promise<boolean> {
  if (!SPREAD_DOC_TYPES.includes(docType)) return false
  const year = filename.match(/20\d{2}/)?.[0]
  await supabase.from('financial_spreads').insert({
    org_id: orgId, customer_id: customerId, source_document_id: docId,
    period: year ? `FY ${year}` : 'New period', statement_type: docType, status: 'draft',
  })
  return true
}

// ——— Deterministic covenant auto-testing (no model involved) ———
// Computes covenant actuals from the newest reviewed spread + the loan's debt service,
// so nobody types a ratio by hand. Covenants we can't compute are left untouched.
export function autoTestCovenants(
  loan: { next_payment_amount: number | null },
  spreads: Spread[],
  covenants: { id: string; name: string; requirement: string; actual: string | null; status: string }[],
): { id: string; actual: string; status: 'Pass' | 'Near' | 'Fail' }[] {
  const reviewed = spreads.filter(s => s.status === 'reviewed')
  if (!reviewed.length) return []
  const s = reviewed[reviewed.length - 1] // periods are sorted ascending
  const n = (k: string) => (s.data[k] == null ? null : Number(s.data[k]))
  const ds = loan.next_payment_amount ? loan.next_payment_amount * 12 : null
  const ebitda = n('ebitda'), debt = n('total_debt'), tnw = n('tangible_net_worth'), dist = n('distributions')

  const out: { id: string; actual: string; status: 'Pass' | 'Near' | 'Fail' }[] = []
  for (const c of covenants) {
    let value: number | null = null
    if (/fixed.?charge/i.test(c.name)) value = ebitda != null && dist != null && ds ? (ebitda - dist) / ds : null
    else if (/dscr|debt.?service/i.test(c.name)) value = ebitda != null && ds ? ebitda / ds : null
    else if (/debt\s*\/\s*ebitda|leverage/i.test(c.name)) value = ebitda && debt != null ? debt / ebitda : null
    else if (/tnw|tangible net worth/i.test(c.name)) value = tnw && debt != null ? debt / tnw : null
    if (value == null) continue

    const m = c.requirement.match(/([≥≤])\s*([\d.]+)\s*x/)
    if (!m) continue
    const threshold = parseFloat(m[2])
    const atLeast = m[1] === '≥'
    const pass = atLeast ? value >= threshold : value <= threshold
    const near = pass && (atLeast ? value < threshold * 1.1 : value > threshold * 0.9)
    const status: 'Pass' | 'Near' | 'Fail' = !pass ? 'Fail' : near ? 'Near' : 'Pass'
    const actual = `${value.toFixed(2)}x (auto · ${s.period})`
    if (actual !== c.actual || status !== c.status) out.push({ id: c.id, actual, status })
  }
  return out
}

export const daysLate = (due: string) => Math.floor((Date.now() - new Date(due + 'T00:00:00').getTime()) / 86400000)
export const pastDueOf = (payments: Payment[], loanId: string) => {
  const overdue = payments.filter(p => p.loan_id === loanId && p.status !== 'paid' && daysLate(p.due_date) > 0)
  if (!overdue.length) return null
  const oldest = overdue.reduce((a, b) => (a.due_date < b.due_date ? a : b))
  return { days: daysLate(oldest.due_date), amount: overdue.reduce((s, p) => s + Number(p.amount), 0), count: overdue.length }
}
export type Deposit = { id: string; account_name: string; type: string; balance: number; opened: string | null; customers: { company: string | null; name: string } | null }
export type CreditLine = { id: string; name: string; commitment: number; outstanding: number; rate: string | null; maturity: string | null; customers: { company: string | null; name: string } | null }
export type Attempt = { id: string; channel: string; recipient: string; subject: string | null; body: string; status: string; error: string | null; created_at: string; rule_id: string | null; customers: { name: string; company: string | null } | null }
export type Doc = { id: string; filename: string; doc_type: string; confidence: number; status: string; created_at: string; loan_id: string | null; loans: { loan_number: string } | null; customers: { company: string | null } | null }

export const money = (n: number) => `$${Math.round(n).toLocaleString()}`

// A document arriving IS the tickler being satisfied — connect the loop.
// Returns the requirements it completed so the caller can say so.
const TICK_DOC_RE: [RegExp, RegExp][] = [
  [/personal financial statement/i, /personal financial statement|pfs/i],
  [/tax return/i, /tax return/i],
  [/financial statement/i, /financial statement|interim/i],
  [/insurance/i, /insurance/i],
  [/rent roll/i, /rent roll/i],
]
export async function completeMatchingTicklers(loanId: string, docType: string): Promise<string[]> {
  const docRe = TICK_DOC_RE.find(([d]) => d.test(docType))
  if (!docRe) return []
  const { data } = await supabase.from('ticklers')
    .select('id, requirement, status').eq('loan_id', loanId).in('status', ['open', 'requested'])
  const hits = ((data as { id: string; requirement: string }[]) ?? []).filter(t => docRe[1].test(t.requirement))
  for (const t of hits) await supabase.from('ticklers').update({ status: 'complete' }).eq('id', t.id)
  return hits.map(t => t.requirement)
}
