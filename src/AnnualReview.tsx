// Annual review package: freeze the loan's facts into an immutable snapshot, attach
// the memo, and walk it through prepared → approved under the four-eyes rule. The
// published package is one print-ready document an examiner or committee can hold.
import { useEffect, useState } from 'react'
import { supabase, Org, DbLoan, DbCovenant, Payment, Guarantor, Spread, SPREAD_LINES, money, daysLate } from './supabase'
import { computeCashFlow, dsComposition, shockedDscr, breakevenBps, RATE_SHOCKS, CFScenarioData } from './CashFlow'
import { API_URL, aiDraft } from './api'
import { confirmDialog, promptDialog, toast, currentUserName } from './dialogs'
import { printHtml } from './Modify'
import { fmtDate } from './Loans'
import { Ico } from './Icons'

type Review = {
  id: string; period: string; status: 'prepared' | 'approved'
  snapshot: Snapshot; memo_md: string | null
  prepared_by: string; approved_by: string | null
  created_at: string; approved_at: string | null
}
type Snapshot = {
  generated_at: string
  lender: string
  loan: { loan_number: string; type: string; amount: number; current_balance: number | null; rate: string | null; maturity: string | null; collateral: string | null; rm: string | null }
  borrower: string
  spreads: { period: string; data: Record<string, number | null> }[]
  cashflow: { period: string; globalCF: number | null; businessCF: number | null; guarantorCF: number; totalDS: number; dscr: number | null; adjustments: { label: string; amount: number; note?: string; by?: string }[] } | null
  sensitivity: { shocks: { bps: number; dscr: number | null }[]; be125: number | null; floatBal: number } | null
  covenants: { name: string; requirement: string; actual: string | null; status: string }[]
  covenant_history: { tested_at: string; actual: string; status: string }[]
  payments: { total: number; on_time: number; late: number; open_past_due: number }
  guarantors: { name: string; pct: number | null; net_worth: number | null; liquidity: number | null; fico: number | null; pfs_date: string | null }[]
}

const esc = (s: unknown) => String(s ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;')

function packageHtml(r: Review): string {
  const s = r.snapshot
  const row = (k: string, v: unknown) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`
  const years = s.spreads.map(x => x.period)
  const spreadRows = SPREAD_LINES.map(([k, label]) =>
    `<tr><td>${esc(label)}</td>${s.spreads.map(x => `<td class="n">${x.data[k] == null ? '—' : '$' + Number(x.data[k]).toLocaleString()}</td>`).join('')}</tr>`).join('')
  const cf = s.cashflow
  const memoHtml = (r.memo_md ?? '').split('\n').map(l =>
    l.startsWith('## ') ? `<h3>${esc(l.slice(3))}</h3>` : l.startsWith('# ') ? `<h3>${esc(l.slice(2))}</h3>`
    : /^\s*[-*] /.test(l) ? `<li>${esc(l.replace(/^\s*[-*] /, ''))}</li>` : l.trim() ? `<p>${esc(l)}</p>` : '').join('')

  return `<!doctype html><html><head><meta charset="utf-8"><title>Annual Review — ${esc(s.loan.loan_number)} · ${esc(r.period)}</title>
<style>
  @page { margin: 0.9in; }
  body { font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.45; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 18px; margin: 0; } .bank { font-size: 12.5px; font-weight: 700; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .6px; color: #555; margin: 20px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 5px 8px; border-bottom: 1px solid #ddd; vertical-align: top; text-align: left; }
  td:first-child { color: #555; } .n { text-align: right; font-variant-numeric: tabular-nums; }
  .signs { display: flex; gap: 40px; margin-top: 36px; }
  .signs div { flex: 1; border-top: 1px solid #111; padding-top: 6px; font-size: 11px; color: #555; }
  .approved { border: 1.5px solid #117537; color: #117537; display: inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; }
  footer { margin-top: 28px; font-size: 10px; color: #888; }
  h3 { font-size: 12.5px; margin: 12px 0 4px; } p { margin: 6px 0; } li { margin: 3px 0 3px 16px; }
</style></head><body>
<header><div><h1>Annual Credit Review — ${esc(r.period)}</h1></div><div class="bank">${esc(s.lender)}</div></header>
${r.status === 'approved' ? `<p><span class="approved">APPROVED</span> &nbsp;Prepared by ${esc(r.prepared_by)} · Approved by ${esc(r.approved_by)} on ${esc(r.approved_at ? new Date(r.approved_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '')}</p>`
                            : `<p>Prepared by ${esc(r.prepared_by)} — awaiting approval.</p>`}

<h2>Relationship</h2>
<table>
  ${row('Borrower', s.borrower)}
  ${row('Loan', `${s.loan.loan_number} · ${s.loan.type}`)}
  ${row('Commitment / balance', `$${Number(s.loan.amount).toLocaleString()} / ${s.loan.current_balance == null ? '—' : '$' + Number(s.loan.current_balance).toLocaleString()}`)}
  ${row('Rate', s.loan.rate)} ${row('Maturity', s.loan.maturity)} ${row('Collateral', s.loan.collateral)} ${row('Relationship manager', s.loan.rm)}
</table>

<h2>Financial spreads (reviewed)</h2>
<table><tr><th>Line</th>${years.map(y => `<th class="n">${esc(y)}</th>`).join('')}</tr>${spreadRows}</table>

${cf ? `<h2>Global cash flow — base scenario · ${esc(cf.period)}</h2>
<table>
  ${row('Business cash flow', cf.businessCF == null ? '—' : '$' + cf.businessCF.toLocaleString())}
  ${cf.adjustments.map(a => row(`↳ ${a.label}${a.by ? ` (${a.by})` : ''}`, `${a.amount < 0 ? '-' : ''}$${Math.abs(a.amount).toLocaleString()}${a.note ? ` — ${a.note}` : ''}`)).join('')}
  ${row('Guarantor cash flow', '$' + cf.guarantorCF.toLocaleString())}
  ${row('Global cash flow', cf.globalCF == null ? '—' : '$' + cf.globalCF.toLocaleString())}
  ${row('Annual debt service (live)', '$' + Math.round(cf.totalDS).toLocaleString())}
  ${row('Global DSCR', cf.dscr == null ? '—' : cf.dscr.toFixed(2) + 'x')}
</table>` : ''}

${s.sensitivity ? `<h2>Interest-rate sensitivity</h2>
<table><tr><th>Shock</th>${s.sensitivity.shocks.map(x => `<th class="n">${x.bps === 0 ? 'today' : '+' + x.bps + 'bp'}</th>`).join('')}</tr>
<tr><td>Global DSCR</td>${s.sensitivity.shocks.map(x => `<td class="n">${x.dscr == null ? '—' : x.dscr.toFixed(2) + 'x'}</td>`).join('')}</tr></table>
<p style="font-size:11px;color:#555">$${s.sensitivity.floatBal.toLocaleString()} floating; ${s.sensitivity.be125 == null ? 'no floating-rate exposure' : s.sensitivity.be125 < 0 ? 'below 1.25x before any shock' : `holds ≥ 1.25x to +${s.sensitivity.be125}bp`}. Floating notes reprice at balance × Δrate; fixed notes hold until reset.</p>` : ''}

<h2>Covenants</h2>
<table><tr><th>Covenant</th><th>Requirement</th><th>Actual</th><th>Status</th></tr>
${s.covenants.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.requirement)}</td><td>${esc(c.actual)}</td><td>${esc(c.status)}</td></tr>`).join('')}</table>
${s.covenant_history.length ? `<h2>Covenant test trail</h2>
<table><tr><th>Tested</th><th>Result</th><th>Status</th></tr>
${s.covenant_history.map(h => `<tr><td>${esc(new Date(h.tested_at).toLocaleDateString())}</td><td>${esc(h.actual)}</td><td>${esc(h.status)}</td></tr>`).join('')}</table>` : ''}

<h2>Payment performance</h2>
<table>${row('Scheduled payments on record', s.payments.total)}${row('Paid on time', s.payments.on_time)}${row('Paid late', s.payments.late)}${row('Currently past due', s.payments.open_past_due)}</table>

<h2>Guarantors</h2>
<table><tr><th>Name</th><th class="n">Guarantee</th><th class="n">Net worth</th><th class="n">Liquidity</th><th class="n">FICO</th><th>PFS date</th></tr>
${s.guarantors.map(g => `<tr><td>${esc(g.name)}</td><td class="n">${g.pct == null ? '—' : g.pct + '%'}</td><td class="n">${g.net_worth == null ? '—' : '$' + Number(g.net_worth).toLocaleString()}</td><td class="n">${g.liquidity == null ? '—' : '$' + Number(g.liquidity).toLocaleString()}</td><td class="n">${g.fico ?? '—'}</td><td>${esc(g.pfs_date)}</td></tr>`).join('')}</table>

${r.memo_md ? `<h2>Review memo</h2>${memoHtml}` : ''}

<div class="signs"><div>Prepared: ${esc(r.prepared_by)}</div><div>Approved: ${esc(r.approved_by ?? '')}</div></div>
<footer>Generated by NoteSolo from data frozen ${esc(new Date(s.generated_at).toLocaleString())}. Figures in this package are the immutable snapshot taken at preparation; live pages may have moved since.</footer>
</body></html>`
}

export function AnnualReviewCard({ org, loan, spreads, covenants, covHistory, payments, relLoans, relGuarantors, onChange }: {
  org: Org; loan: DbLoan; spreads: Spread[]; covenants: DbCovenant[]
  covHistory: { tested_at: string; actual: string; status: string }[]
  payments: Payment[]; relLoans: DbLoan[]; relGuarantors: Guarantor[]
  onChange: () => void
}) {
  const [reviews, setReviews] = useState<Review[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('annual_reviews').select('*')
      .eq('loan_id', loan.id).order('created_at', { ascending: false })
    setReviews((data as Review[]) ?? [])
  }
  useEffect(() => { load() }, [loan.id])

  const buildSnapshot = async (): Promise<Snapshot> => {
    const { data: sc } = await supabase.from('cash_flow_scenarios').select('data')
      .eq('customer_id', loan.customer_id!).eq('is_base', true).limit(1)
    const scenario = (sc?.[0]?.data ?? null) as CFScenarioData | null
    const cols = scenario ? computeCashFlow(scenario, spreads, relGuarantors, relLoans) : []
    const last = cols[cols.length - 1] ?? null
    const comp = dsComposition(relLoans)
    const paid = payments.filter(p => p.status === 'paid')
    const late = paid.filter(p => p.paid_date && p.paid_date > p.due_date)
    return {
      generated_at: new Date().toISOString(),
      lender: org.name,
      loan: { loan_number: loan.loan_number, type: loan.type, amount: Number(loan.amount), current_balance: loan.current_balance, rate: loan.rate, maturity: loan.maturity ? fmtDate(loan.maturity) : null, collateral: loan.collateral, rm: loan.rm },
      borrower: loan.customers?.company ?? loan.customers?.name ?? '—',
      spreads: spreads.filter(s => s.status === 'reviewed').map(s => ({ period: s.period, data: s.data })),
      cashflow: last ? { period: last.period, globalCF: last.globalCF, businessCF: last.businessCF, guarantorCF: last.guarantorCF, totalDS: last.totalDS, dscr: last.dscr, adjustments: last.adjustments } : null,
      sensitivity: last && last.globalCF != null ? {
        shocks: [0, ...RATE_SHOCKS].map(bps => ({ bps, dscr: shockedDscr(last.globalCF, comp, last.proposedDS, bps).dscr })),
        be125: breakevenBps(last.globalCF, comp, last.proposedDS, 1.25), floatBal: comp.floatBal,
      } : null,
      covenants: covenants.map(c => ({ name: c.name, requirement: c.requirement, actual: c.actual, status: c.status })),
      covenant_history: covHistory.map(h => ({ tested_at: h.tested_at, actual: h.actual, status: h.status })),
      payments: { total: payments.length, on_time: paid.length - late.length, late: late.length, open_past_due: payments.filter(p => p.status !== 'paid' && daysLate(p.due_date) > 0).length },
      guarantors: relGuarantors.map(g => ({ name: g.name, pct: g.guarantee_pct, net_worth: g.net_worth, liquidity: g.liquidity, fico: (g as Guarantor & { fico?: number | null }).fico ?? null, pfs_date: g.pfs_date ? fmtDate(g.pfs_date) : null })),
    }
  }

  const prepare = async () => {
    const period = await promptDialog('Prepare annual review', 'Review period label', { initial: `${new Date().getFullYear()} annual review`, confirmText: 'Prepare' })
    if (!period) return
    setBusy(true)
    const snapshot = await buildSnapshot()
    // Memo: drafted by the local models when the gateway is up; blank otherwise.
    let memo: string | null = null
    if (API_URL) {
      toast('Drafting the memo with your models — a minute or two…')
      memo = (await aiDraft('annual_review', loan.id))?.markdown ?? null
    }
    const user = (await supabase.auth.getUser()).data.user
    const { error } = await supabase.from('annual_reviews').insert({
      org_id: org.id, loan_id: loan.id, period, snapshot, memo_md: memo,
      prepared_by: await currentUserName(), prepared_by_user: user?.id,
    })
    setBusy(false)
    if (error) { toast(`Could not prepare: ${error.message}`); return }
    toast('Review prepared — snapshot frozen. A different person approves it.')
    load()
  }

  const approve = async (r: Review) => {
    const approver = await promptDialog('Approve annual review', 'Approver name (must differ from the preparer)', { confirmText: 'Approve & publish' })
    if (!approver) return
    if (approver.trim().toLowerCase() === r.prepared_by.trim().toLowerCase()) {
      toast('Four-eyes rule: the approver must be a different person than the preparer.')
      return
    }
    const user = (await supabase.auth.getUser()).data.user
    const approved_at = new Date().toISOString()
    await supabase.from('annual_reviews').update({
      status: 'approved', approved_by: approver.trim(), approved_by_user: user?.id, approved_at,
    }).eq('id', r.id)
    await supabase.from('loan_notes').insert({
      org_id: org.id, loan_id: loan.id,
      body: `[Annual review approved] ${r.period} — prepared by ${r.prepared_by}, approved by ${approver.trim()}.`,
      author: approver.trim(), created_by: user?.id,
    })
    // The review closes its own tickler.
    const { data: ticks } = await supabase.from('ticklers').select('id, requirement, status').eq('loan_id', loan.id)
    for (const t of (ticks ?? []) as { id: string; requirement: string; status: string }[]) {
      if (/annual review/i.test(t.requirement) && (t.status === 'open' || t.status === 'requested'))
        await supabase.from('ticklers').update({ status: 'complete' }).eq('id', t.id)
    }
    printHtml(packageHtml({ ...r, status: 'approved', approved_by: approver.trim(), approved_at }))
    toast('Approved and published — package printed, note logged, tickler completed')
    load(); onChange()
  }

  const remove = async (r: Review) => {
    if (!(await confirmDialog(`Discard prepared review "${r.period}"?`, 'Only unapproved reviews can be discarded.', { danger: true, confirmText: 'Discard' }))) return
    await supabase.from('annual_reviews').delete().eq('id', r.id).eq('status', 'prepared')
    load()
  }

  if (reviews === null) return null
  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <div className="uw-head">
        <span><b>Annual reviews</b> <span className="small">frozen snapshot · four-eyes sign-off · published as one package</span></span>
        <button className="btn-dark" onClick={prepare} disabled={busy}>{busy ? 'Preparing…' : 'Prepare review'}</button>
      </div>
      {reviews.length === 0 && <p className="small" style={{ padding: '0 14px 14px' }}>No reviews yet. Preparing one freezes today's spreads, cash flow, covenant trail and payment record into an immutable package.</p>}
      {reviews.map(r => (
        <div className="wq-row" key={r.id}>
          <span style={{ flex: 1 }}>
            <b>{r.period}</b>
            <span className="small"> · prepared {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} by {r.prepared_by}{r.approved_by ? ` · approved by ${r.approved_by}` : ''}</span>
          </span>
          {r.status === 'approved'
            ? <span className="status s-green"><Ico.check /> Approved</span>
            : <span className="status s-amber"><Ico.clock /> Awaiting approval</span>}
          <button className="btn-light" onClick={() => printHtml(packageHtml(r))}>Package PDF</button>
          {r.status === 'prepared' && <button className="btn-dark" onClick={() => approve(r)}>Approve</button>}
          {r.status === 'prepared' && <button className="btn-light" onClick={() => remove(r)} aria-label={`Discard ${r.period}`}><Ico.x /></button>}
        </div>
      ))}
    </div>
  )
}
