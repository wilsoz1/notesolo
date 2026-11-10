import { useEffect, useState } from 'react'
import { supabase, DbLoan, Doc, Org, ShareLink, Attempt, Payment, DbCovenant, DbTickler, Guarantor, Note, Spread, Deposit, CreditLine, SPREAD_LINES, money, daysLate, spreadFromDocument, autoTestCovenants, completeMatchingTicklers } from './supabase'
import { CashFlowPanel } from './CashFlow'
import { fmtDate } from './Loans'
import { classifyType } from './Documents'
import { API_URL, aiSpread, aiProcessDocument, aiObligations } from './api'
import { confirmDialog, promptDialog, toast, currentUserName, Skeleton } from './dialogs'
import { DraftButton } from './Ai'
import { ModifyButton } from './Modify'
import { PortalCard } from './Portal'
import { AnnualReviewCard } from './AnnualReview'
import { Ico } from './Icons'

const shareUrl = (token: string) => `${window.location.origin}/#/share/${token}`
// Loans whose covenant auto-test is currently writing — stops double-logging.
const testingLoans = new Set<string>()
const covCls = { Pass: 's-green', Near: 's-amber', Fail: 's-red' } as const
type CovTest = { id: string; tested_at: string; actual: string; status: 'Pass' | 'Near' | 'Fail'; covenant_id: string }
type Tab = string

// Inside a loan, a SECOND sidebar navigates the record (the app sidebar stays
// put). Clicking an item swaps the main area to that section, laid out vertically.
const LOAN_NAV: { key: string; label: string }[] = [
  { key: 'Overview', label: 'Overview' },
  { key: 'Borrower', label: 'Borrower' },
  { key: 'Payments', label: 'Payments' },
  { key: 'Spreads', label: 'Financials' },
  { key: 'Compliance', label: 'Compliance' },
  { key: 'Structure', label: 'Structure' },
  { key: 'Documents', label: 'Documents' },
  { key: 'Activity', label: 'Communication' },
]

// Notes carry a color by what they're about — classified from the text itself.
const NOTE_KINDS: [RegExp, string, string][] = [
  [/payment|paid|past.?due|wire|funds|ach|deposit/i, 'payment', 'var(--green)'],
  [/document|pfs|tax return|statement|upload|insurance|appraisal|report|1120|1040|k-?1/i, 'documentation', 'var(--blue)'],
  [/call|called|site visit|check.?in|spoke|met |meeting|discussed|visit/i, 'check in', '#7c5cd6'],
  [/covenant|dscr|ratio|compliance|annual review/i, 'covenant', 'var(--amber)'],
]
const noteKind = (body: string): { label: string; color: string } => {
  for (const [re, label, color] of NOTE_KINDS) if (re.test(body)) return { label, color }
  return { label: 'general', color: 'var(--faint)' }
}

const payStatus = (p: Payment) => {
  if (p.status === 'paid') {
    const late = p.paid_date && p.paid_date > p.due_date
    return <span className={`status ${late ? 's-amber' : 's-green'}`}><Ico.check /> {late ? `Paid late (${fmtDate(p.paid_date)})` : 'Paid on time'}</span>
  }
  const d = daysLate(p.due_date)
  if (d <= 0) return <span className="status s-gray">Upcoming</span>
  return <span className="status s-red"><Ico.x /> {d} days past due</span>
}
const tickStatus = (t: DbTickler) => {
  if (t.status === 'complete') return <span className="status s-green"><Ico.check /> Complete</span>
  if (t.status === 'waived') return <span className="status s-gray">Waived</span>
  if (daysLate(t.due_date) > 0) return <span className="status s-red"><Ico.x /> Past due {daysLate(t.due_date)}d</span>
  return <span className={`status ${t.status === 'requested' ? 's-amber' : 's-gray'}`}>{t.status === 'requested' ? 'Requested' : 'Upcoming'}</span>
}

export default function LoanPage({ org, loanId, initialTab }: { org: Org; loanId: string; initialTab?: string }) {
  const [loan, setLoan] = useState<DbLoan | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [links, setLinks] = useState<ShareLink[]>([])
  const [outreach, setOutreach] = useState<Attempt[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [covenants, setCovenants] = useState<DbCovenant[]>([])
  const [ticklers, setTicklers] = useState<DbTickler[]>([])
  const [guarantors, setGuarantors] = useState<Guarantor[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [spreads, setSpreads] = useState<Spread[]>([])
  const [covHistory, setCovHistory] = useState<CovTest[]>([])
  // Relationship-level data for the Borrower tab: every loan the customer has,
  // their deposits and lines, and all guarantors across the relationship.
  const [relLoans, setRelLoans] = useState<DbLoan[]>([])
  const [relGuarantors, setRelGuarantors] = useState<Guarantor[]>([])
  const [deposits, setDeposits] = useState<Deposit[]>([])
  const [lines, setLines] = useState<CreditLine[]>([])
  const [loading, setLoading] = useState(true)
  // Click a cite -> see the page. Chrome renders #page=N natively in the iframe.
  const [src, setSrc] = useState<{ url: string; name: string; page: number } | null>(null)
  const openSource = async (documentId: string | null, page: number | null | undefined, line: string) => {
    if (!documentId) { toast('No source document attached to this spread'); return }
    const d = docs.find(x => x.id === documentId)
    if (!d) { toast('Source document not found on this loan'); return }
    const path = (d as Doc & { storage_path?: string }).storage_path
    if (!path) { toast('Source file is not in storage'); return }
    const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600)
    if (!data?.signedUrl) { toast('Could not open the source file'); return }
    setSrc({ url: `${data.signedUrl}#page=${page ?? 1}`, name: `${d.filename} — ${line}`, page: page ?? 1 })
  }
  const [sel, setSel] = useState<Tab>(LOAN_NAV.some(n => n.key === initialTab) ? initialTab! : 'Overview')
  // Deep links (`…/loans/<id>/Payments`) select that section.
  const setTab = (t: Tab) => {
    setSel(t)
    window.scrollTo({ top: 0 })
    history.replaceState(null, '', `#/app/loans/${loanId}/${encodeURIComponent(t)}`)
  }
  const load = async () => {
    const { data: l } = await supabase.from('loans').select('*, customers(name, company, email, phone)').eq('id', loanId).single()
    setLoan((l as DbLoan) ?? null)
    let freshSpreads: Spread[] = []
    if (l?.customer_id) {
      const [sp, rl, dp, cl] = await Promise.all([
        supabase.from('financial_spreads').select('*').eq('customer_id', l.customer_id).order('period'),
        supabase.from('loans').select('*, customers(name, company, email, phone)').eq('customer_id', l.customer_id).order('amount', { ascending: false }),
        supabase.from('deposits').select('*, customers(name, company)').eq('customer_id', l.customer_id),
        supabase.from('credit_lines').select('*, customers(name, company)').eq('customer_id', l.customer_id),
      ])
      freshSpreads = (sp.data as Spread[]) ?? []
      setSpreads(freshSpreads)
      const rls = (rl.data as DbLoan[]) ?? []
      setRelLoans(rls)
      setDeposits((dp.data as Deposit[]) ?? []); setLines((cl.data as CreditLine[]) ?? [])
      if (rls.length) {
        const { data: rg } = await supabase.from('guarantors').select('*').in('loan_id', rls.map(x => x.id))
        // The same person often guarantees several loans — one row per person.
        const seen = new Set<string>()
        setRelGuarantors(((rg as Guarantor[]) ?? []).filter(x => !seen.has(x.name) && !!seen.add(x.name)))
      }
    }
    const [d, s, pay, cov, tick, g, n, o] = await Promise.all([
      supabase.from('documents').select('*, loans(loan_number), customers(company)').eq('loan_id', loanId).order('created_at', { ascending: false }),
      supabase.from('share_links').select('*').eq('loan_id', loanId).order('created_at', { ascending: false }),
      supabase.from('loan_payments').select('*').eq('loan_id', loanId).order('due_date', { ascending: false }),
      supabase.from('covenants').select('*').eq('loan_id', loanId).order('created_at'),
      supabase.from('ticklers').select('*').eq('loan_id', loanId).order('due_date'),
      supabase.from('guarantors').select('*').eq('loan_id', loanId),
      supabase.from('loan_notes').select('*').eq('loan_id', loanId).order('created_at', { ascending: false }),
      l?.customer_id
        ? supabase.from('outreach_attempts').select('*, customers(name, company)').eq('customer_id', l.customer_id).order('created_at', { ascending: false }).limit(25)
        : Promise.resolve({ data: [] }),
    ])
    setDocs((d.data as Doc[]) ?? []); setLinks((s.data as ShareLink[]) ?? [])
    setPayments((pay.data as Payment[]) ?? [])
    setTicklers((tick.data as DbTickler[]) ?? []); setGuarantors((g.data as Guarantor[]) ?? [])
    setNotes((n.data as Note[]) ?? []); setOutreach(((o as { data: Attempt[] | null }).data as Attempt[]) ?? [])

    // Auto-test computable covenants from the newest reviewed spread and persist any changes —
    // both the current value on the covenant AND an immutable covenant_tests history row,
    // so every retest leaves a trail an examiner can follow. Two guards keep the
    // trail honest: an in-flight lock (concurrent loads were double-logging every
    // test) and a check against the newest history row before inserting.
    let covRows = (cov.data as DbCovenant[]) ?? []
    let { data: hist } = await supabase.from('covenant_tests')
      .select('id, tested_at, actual, status, covenant_id')
      .eq('loan_id', loanId).order('tested_at', { ascending: false }).limit(12)
    if (l && !testingLoans.has(loanId)) {
      testingLoans.add(loanId)
      try {
        const updates = autoTestCovenants(l, freshSpreads, covRows)
        let inserted = false
        for (const u of updates) {
          await supabase.from('covenants').update({ actual: u.actual, status: u.status }).eq('id', u.id)
          const last = ((hist as CovTest[]) ?? []).find(h => h.covenant_id === u.id)
          if (!last || last.actual !== u.actual || last.status !== u.status) {
            await supabase.from('covenant_tests').insert({
              org_id: org.id, covenant_id: u.id, loan_id: loanId, actual: u.actual, status: u.status, source: 'auto',
            })
            inserted = true
          }
          covRows = covRows.map(c => (c.id === u.id ? { ...c, actual: u.actual, status: u.status } : c))
        }
        if (inserted) {
          const fresh = await supabase.from('covenant_tests')
            .select('id, tested_at, actual, status, covenant_id')
            .eq('loan_id', loanId).order('tested_at', { ascending: false }).limit(12)
          hist = fresh.data
        }
      } finally {
        testingLoans.delete(loanId)
      }
    }
    setCovenants(covRows)
    setCovHistory((hist as CovTest[]) ?? [])
    setLoading(false)
  }
  useEffect(() => {
    load()
  }, [loanId])

  if (loading) return <Skeleton rows={7} />
  if (!loan) return <><h1>Loan not found</h1><p className="subtitle"><a href="#/app/loans">Back to all loans</a></p></>

  // Issue rollup — drives the header strip, the badges, and the Overview triage list.
  const overdue = payments.filter(p => p.status !== 'paid' && daysLate(p.due_date) > 0)
  const covFails = covenants.filter(c => c.status === 'Fail')
  const covNear = covenants.filter(c => c.status === 'Near')
  const tickPastDue = ticklers.filter(t => (t.status === 'open' || t.status === 'requested') && daysLate(t.due_date) > 0)
  const stalePfs = guarantors.filter(g => g.pfs_date && daysLate(g.pfs_date) > 365)
  const docsReview = docs.filter(d => d.status === 'needs_review')
  const healthy = !overdue.length && !covFails.length && !tickPastDue.length

  const draftSpreads = spreads.filter(s => s.status === 'draft')

  return (
    <>
      <div className="crumb-row"><a href="#/app/portfolio">← Portfolio</a></div>

      {/* Level 0: identity + health + actions */}
      <div className="viewbar" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{loan.loan_number}</h1>
          <p className="subtitle" style={{ marginBottom: 10 }}>
            {loan.customer_id
              ? <button className="linkish" onClick={() => setTab('Borrower')} title="Borrower tab — contact, guarantors, cash flow">{loan.customers?.company}</button>
              : loan.customers?.company}
            {' · '}{loan.type} · {loan.stage === 'Servicing' ? 'Active' : loan.stage}
          </p>
          <div className="stat-row">
            <span><b>{loan.current_balance === null ? money(loan.amount) : money(loan.current_balance)}</b><i>{loan.current_balance === null ? 'commitment' : `balance of ${money(loan.amount)}`}</i></span>
            <span><b>{loan.next_payment_amount ? money(loan.next_payment_amount) : '—'}</b><i>{loan.next_payment_date ? `next pmt · ${fmtDate(loan.next_payment_date)}` : 'next payment'}</i></span>
            <span><b>{loan.rate ?? '—'}</b><i>rate{loan.rate_floor ? ` · floor ${loan.rate_floor}` : ''}</i></span>
            <span><b>{fmtDate(loan.maturity)}</b><i>maturity</i></span>
          </div>
        </div>
        <span className="spacer" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <DraftButton
            kind="annual_review" loanId={loanId} label="Draft annual review"
            onSave={async md => {
              const user = (await supabase.auth.getUser()).data.user
              await supabase.from('loan_notes').insert({
                org_id: org.id, loan_id: loanId, body: `[AI-drafted annual review]\n${md}`,
                author: (user?.user_metadata?.full_name as string) ?? user?.email ?? 'Unknown', created_by: user?.id,
              })
              load()
            }}
          />
          <ModifyButton org={org} loan={loan} />
          <button className="btn-light" onClick={() => setTab('Activity')}>Add note</button>
          <ShareControls org={org} loanId={loanId} docs={docs} onChange={load} />
        </div>
      </div>

      {healthy ? (
        <div className="alert-strip ok"><span className="status s-green"><Ico.check /> Current · in compliance</span>{covNear.length > 0 && <span className="status s-amber"><Ico.clock /> {covNear.length} covenant near threshold</span>}</div>
      ) : (
        <div className="alert-strip">
          {overdue.length > 0 && <span className="status s-red"><Ico.x /> {overdue.length} payment{overdue.length > 1 ? 's' : ''} past due — {money(overdue.reduce((s, p) => s + Number(p.amount), 0))} ({Math.max(...overdue.map(p => daysLate(p.due_date)))} days)</span>}
          {covFails.length > 0 && <span className="status s-red"><Ico.x /> {covFails.length} covenant failure{covFails.length > 1 ? 's' : ''}</span>}
          {tickPastDue.length > 0 && <span className="status s-amber"><Ico.clock /> {tickPastDue.length} reporting item{tickPastDue.length > 1 ? 's' : ''} past due</span>}
        </div>
      )}

      {loan.stage !== 'Servicing' && (
        <PipelineCard loan={loan} spreads={spreads} covenants={covenants} guarantors={guarantors} docs={docs} onChange={load} />
      )}

      <div className="loan-layout">
        <nav className="loan-nav" aria-label="Loan sections">
          {LOAN_NAV.map(n => {
            const badge =
              n.key === 'Payments' ? (overdue.length ? { n: overdue.length, cls: 'red' } : null)
              : n.key === 'Spreads' ? (draftSpreads.length ? { n: draftSpreads.length, cls: 'amber' } : null)
              : n.key === 'Compliance' ? (covFails.length + tickPastDue.length ? { n: covFails.length + tickPastDue.length, cls: covFails.length ? 'red' : 'amber' } : null)
              : n.key === 'Documents' ? (docsReview.length ? { n: docsReview.length, cls: 'amber' } : null)
              : null
            return (
              <button key={n.key} className={sel === n.key ? 'on' : ''} onClick={() => setTab(n.key)}>
                {n.label}
                {badge && <span className={`tab-badge ${badge.cls}`}>{badge.n}</span>}
              </button>
            )
          })}
        </nav>

        <div className="loan-main">
          {sel === 'Overview' && <>
            <Overview {...{ overdue, covFails, covNear, tickPastDue, stalePfs, docsReview, setTab }} />
            <StructureTab loan={loan} guarantors={guarantors} />
          </>}
          {sel === 'Borrower' && <BorrowerTab org={org} loan={loan} relLoans={relLoans} relGuarantors={relGuarantors} deposits={deposits} lines={lines} />}
          {sel === 'Payments' && <PaymentsTab loan={loan} payments={payments} onChange={load} />}
          {sel === 'Spreads' && <>
            <SpreadsTab loan={loan} spreads={spreads} onChange={load} openSource={openSource} />
            {loan.customer_id && (
              <CashFlowPanel org={org} customerId={loan.customer_id} guarantors={relGuarantors} spreads={spreads} loans={relLoans} />
            )}
          </>}
          {sel === 'Compliance' && <>
            <AnnualReviewCard org={org} loan={loan} spreads={spreads} covenants={covenants} covHistory={covHistory} payments={payments} relLoans={relLoans} relGuarantors={relGuarantors} onChange={load} />
            <ComplianceTab org={org} loanId={loanId} covenants={covenants} ticklers={ticklers} history={covHistory} docs={docs} onChange={load} />
          </>}
          {sel === 'Structure' && <StructureTab loan={loan} guarantors={guarantors} />}
          {sel === 'Documents' && <DocumentsTab org={org} loan={loan} docs={docs} links={links} onChange={load} />}
          {sel === 'Activity' && <ActivityTab org={org} loan={loan} notes={notes} outreach={outreach} onChange={load} />}
        </div>
      </div>

      {src && (
        <div className="src-drawer" role="dialog" aria-label="Source page">
          <div className="src-drawer-h">
            <b className="ellipsis" title={src.name}>{src.name}</b>
            <span className="small">p. {src.page}</span>
            <button className="btn-light" onClick={() => setSrc(null)}>Close</button>
          </div>
          <iframe src={src.url} title="Source document page" />
        </div>
      )}
    </>
  )
}

// A pipeline deal moves stage by stage, each gate a computable checklist —
// advance unlocks when the data says ready (override allowed, with eyes open).
const STAGE_ORDER = ['Application', 'Screening', 'Underwriting', 'Approval', 'Closing', 'Servicing']
function PipelineCard({ loan, spreads, covenants, guarantors, docs, onChange }: {
  loan: DbLoan; spreads: Spread[]; covenants: DbCovenant[]; guarantors: Guarantor[]; docs: Doc[]; onChange: () => void
}) {
  const idx = STAGE_ORDER.indexOf(loan.stage)
  const next = STAGE_ORDER[idx + 1]
  if (idx === -1 || !next) return null
  const reqsFor = (target: string): { label: string; ok: boolean }[] => {
    switch (target) {
      case 'Underwriting': return [
        { label: 'Borrower linked', ok: !!loan.customer_id },
        { label: 'At least one document on file', ok: docs.length > 0 },
      ]
      case 'Approval': return [
        { label: 'Borrower linked', ok: !!loan.customer_id },
        { label: 'A spread reviewed', ok: spreads.some(sp => sp.status === 'reviewed') },
        { label: 'At least one document on file', ok: docs.length > 0 },
      ]
      case 'Closing': return [
        { label: 'Covenants defined', ok: covenants.length > 0 },
        { label: 'Guarantor on file', ok: guarantors.length > 0 },
        { label: 'A spread reviewed', ok: spreads.some(sp => sp.status === 'reviewed') },
      ]
      default: return [
        { label: 'Payment schedule set', ok: !!loan.next_payment_date && !!loan.next_payment_amount },
        { label: 'Maturity set', ok: !!loan.maturity },
        { label: 'Origination date set', ok: !!loan.origination_date },
      ]
    }
  }
  const reqs = reqsFor(next)
  const ready = reqs.every(r => r.ok)
  const advance = async () => {
    if (!ready && !(await confirmDialog(`Advance to ${next} anyway?`, `${reqs.filter(r => !r.ok).length} requirement(s) unmet — they'll still be waiting there.`, { confirmText: 'Advance anyway' }))) return
    await supabase.from('loans').update({ stage: next }).eq('id', loan.id)
    toast(next === 'Servicing' ? `${loan.loan_number} booked — it now lives in the portfolio` : `${loan.loan_number} advanced to ${next}`)
    onChange()
  }
  return (
    <div className="grid" style={{ margin: '14px 0 2px' }}>
      <div className="uw-head">
        <span><b>Pipeline</b> <span className="small">deal in flight — each stage gate is a checklist, computed from the file</span></span>
        <button className={ready ? 'btn-dark' : 'btn-light'} onClick={advance}>
          {next === 'Servicing' ? 'Book the loan' : `Advance to ${next}`}{!ready && ' (requirements unmet)'}
        </button>
      </div>
      <div style={{ padding: '10px 16px 14px', display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div className="stage-track">
          {STAGE_ORDER.map((st, i) => (
            <span key={st} className={`stage-dot ${i < idx ? 'done' : i === idx ? 'on' : ''}`}>{st === 'Servicing' ? 'Booked' : st}</span>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {reqs.map(r => (
            <span key={r.label} className="small" style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <span style={{ color: r.ok ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>{r.ok ? '\u2713' : '\u2717'}</span>
              {r.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

const Card = ({ title, sub, children, right }:  { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="grid" style={{ marginBottom: 20 }}>
    <div className="uw-head"><span><b>{title}</b> {sub && <span className="small">{sub}</span>}</span>{right}</div>
    {children}
  </div>
)

// ——— Needs attention: the triage list, always visible above the sections ———
function Overview({ overdue, covFails, covNear, tickPastDue, stalePfs, docsReview, setTab }: {
  overdue: Payment[]; covFails: DbCovenant[]; covNear: DbCovenant[]; tickPastDue: DbTickler[]
  stalePfs: Guarantor[]; docsReview: Doc[]; setTab: (t: Tab) => void
}) {
  const items: { sev: 'red' | 'amber'; text: string; tab: Tab }[] = [
    ...overdue.map(p => ({ sev: 'red' as const, text: `Payment of ${money(Number(p.amount))} due ${fmtDate(p.due_date)} is ${daysLate(p.due_date)} days past due`, tab: 'Payments' as Tab })),
    ...covFails.map(c => ({ sev: 'red' as const, text: `Covenant failing: ${c.name} — ${c.actual ?? ''} vs. ${c.requirement}`, tab: 'Compliance' as Tab })),
    ...covNear.map(c => ({ sev: 'amber' as const, text: `Covenant near threshold: ${c.name} — ${c.actual ?? ''} vs. ${c.requirement}`, tab: 'Compliance' as Tab })),
    ...tickPastDue.map(t => ({ sev: 'amber' as const, text: `${t.requirement} past due ${daysLate(t.due_date)} days (${t.responsible})`, tab: 'Compliance' as Tab })),
    ...stalePfs.map(g => ({ sev: 'amber' as const, text: `${g.name}'s personal financial statement is over a year old (${fmtDate(g.pfs_date)})`, tab: 'Structure' as Tab })),
    ...docsReview.map(d => ({ sev: 'amber' as const, text: `Document needs review: ${d.filename}`, tab: 'Documents' as Tab })),
  ]
  if (!items.length) return (
    <Card title="Needs attention">
      <p className="small" style={{ padding: 14 }}><Ico.check /> Nothing needs attention. Payments current, covenants in compliance, reporting up to date.</p>
    </Card>
  )
  return (
    <Card title="Needs attention" sub={`${items.length} item${items.length > 1 ? 's' : ''}`}>
      {items.map((it, i) => (
        <div className="alert" key={i}>
          <span className={`dot2 ${it.sev}`} />
          <span style={{ flex: 1 }}>{it.text}</span>
          <button className="linkish" onClick={() => setTab(it.tab)}>{it.tab} →</button>
        </div>
      ))}
    </Card>
  )
}

// ——— Borrower: the relationship, reached from the loan — contact, guarantors,
// cash flow, deposits, lines, and the borrower's other loans ———
function BorrowerTab({ org, loan, relLoans, relGuarantors, deposits, lines }: {
  org: Org; loan: DbLoan; relLoans: DbLoan[]; relGuarantors: Guarantor[]
  deposits: Deposit[]; lines: CreditLine[]
}) {
  if (!loan.customer_id) return <p className="small" style={{ padding: 14 }}>No borrower on file for this loan.</p>
  const c = loan.customers
  const exposure = relLoans.reduce((s, l) => s + Number(l.current_balance ?? l.amount), 0)
  const depTotal = deposits.reduce((s, d) => s + Number(d.balance), 0)
  const others = relLoans.filter(l => l.id !== loan.id)

  return (
    <>
      <div className="two-col">
        <Card title={c?.company ?? c?.name ?? 'Borrower'} sub="relationship across all loans">
          <table className="kv"><tbody>
            <tr><td>Contact</td><td>{c?.name ?? '—'}</td></tr>
            <tr><td>Email</td><td>{c?.email ?? '—'}</td></tr>
            <tr><td>Phone</td><td>{c?.phone ?? '—'}</td></tr>
            <tr><td>Total exposure</td><td className="mono">{money(exposure)} <span className="small">across {relLoans.length} loan{relLoans.length === 1 ? '' : 's'}</span></td></tr>
            <tr><td>Deposits</td><td className="mono">{depTotal ? money(depTotal) : '—'}</td></tr>
          </tbody></table>
        </Card>
        <Card title="Guarantors" sub="everyone standing behind the relationship">
          <table>
            <tbody>
              {relGuarantors.map(g => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td className="small">{g.guarantee_pct ? `${g.guarantee_pct}% ` : ''}{g.guarantee_type ?? ''}</td>
                  <td className="small">PFS {fmtDate(g.pfs_date)}{g.pfs_date && daysLate(g.pfs_date) > 365 ? ' · stale' : ''}</td>
                  <td className="num mono">{g.net_worth ? money(Number(g.net_worth)) : '—'}</td>
                </tr>
              ))}
              {!relGuarantors.length && <tr><td className="small">No guarantors on record.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>

      <PortalCard org={org} customerId={loan.customer_id} loanId={loan.id} />

      <div className="two-col">
        <Card title="Other loans" sub={others.length ? 'same borrower' : undefined}>
          <table><tbody>
            {others.map(l => (
              <tr key={l.id}>
                <td className="mono"><a className="cell-link" href={`#/app/loans/${l.id}`}>{l.loan_number}</a></td>
                <td className="small">{l.type}</td>
                <td className="num mono">{money(Number(l.current_balance ?? l.amount))}</td>
                <td className="small">mat. {fmtDate(l.maturity)}</td>
              </tr>
            ))}
            {!others.length && <tr><td className="small">This is the borrower's only loan.</td></tr>}
          </tbody></table>
        </Card>
        <div>
          <Card title="Deposits">
            <table><tbody>
              {deposits.map(d => <tr key={d.id}><td>{d.account_name}</td><td><span className="pill">{d.type.replace('_', ' ')}</span></td><td className="num mono">{money(Number(d.balance))}</td></tr>)}
              {!deposits.length && <tr><td className="small">None.</td></tr>}
            </tbody></table>
          </Card>
          <Card title="Credit lines">
            <table><tbody>
              {lines.map(x => <tr key={x.id}><td>{x.name}</td><td className="num mono">{money(Number(x.outstanding))} / {money(Number(x.commitment))}</td></tr>)}
              {!lines.length && <tr><td className="small">None.</td></tr>}
            </tbody></table>
          </Card>
        </div>
      </div>
    </>
  )
}

// ——— Payments: balances + history (paid history collapsed) ———
function PaymentsTab({ loan, payments, onChange }: { loan: DbLoan; payments: Payment[]; onChange: () => void }) {
  const markPaid = async (p: Payment) => {
    const today = new Date().toISOString().slice(0, 10)
    const late = p.due_date < today
    if (!(await confirmDialog(`Record ${money(Number(p.amount))} as paid today?`, `Due ${fmtDate(p.due_date)}${late ? ' — will show as paid late' : ''}.`, { confirmText: 'Record payment' }))) return
    await supabase.from('loan_payments').update({ status: 'paid', paid_date: today }).eq('id', p.id)
    toast(late ? 'Payment recorded — past-due cleared' : 'Payment recorded')
    onChange()
  }
  const [showAll, setShowAll] = useState(false)
  const unpaid = payments.filter(p => p.status !== 'paid')
  const paid = payments.filter(p => p.status === 'paid')
  const shown = showAll ? payments : [...unpaid, ...paid.slice(0, 3)].sort((a, b) => (a.due_date < b.due_date ? 1 : -1))

  return (
    <div className="two-col">
      <Card title="Balances">
        <table className="kv"><tbody>
          <tr><td>Current balance</td><td className="mono">{loan.current_balance === null ? '—' : money(loan.current_balance)} <span className="small">of {money(loan.amount)} commitment</span></td></tr>
          <tr><td>Next payment</td><td className="mono">{loan.next_payment_amount ? `${money(loan.next_payment_amount)} on ${fmtDate(loan.next_payment_date)}` : '—'}</td></tr>
          {loan.budget_total !== null && <>
            <tr><td>Construction budget</td><td className="mono">{money(loan.budget_total)}</td></tr>
            <tr><td>Draws to date</td><td>
              <span className="mono">{money(loan.draws_to_date ?? 0)} ({Math.round(((loan.draws_to_date ?? 0) / loan.budget_total) * 100)}%)</span>
              <div className="bar big" style={{ maxWidth: 220 }}><span style={{ width: `${Math.min(((loan.draws_to_date ?? 0) / loan.budget_total) * 100, 100)}%` }} /></div>
            </td></tr>
            <tr><td>Interest reserve remaining</td><td className="mono">{money(loan.interest_reserve_remaining ?? 0)}</td></tr>
          </>}
        </tbody></table>
      </Card>
      <Card title="Payment history" sub="drives the delinquency rules"
        right={paid.length > 3 && <button className="linkish" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show recent' : `Show all ${payments.length}`}</button>}>
        <table>
          <thead><tr><th>Due</th><th className="num">Amount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {shown.map(p => (
              <tr key={p.id}>
                <td>{fmtDate(p.due_date)}</td>
                <td className="num mono">{money(p.amount)}</td>
                <td>{payStatus(p)}</td>
                <td>{p.status !== 'paid' && <button className="linkish" onClick={() => markPaid(p)}>Mark paid</button>}</td>
              </tr>
            ))}
            {!payments.length && <tr><td colSpan={4} className="small">No payment schedule yet{loan.stage !== 'Servicing' ? ` — loan is in ${loan.stage}.` : '.'}</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ——— Spreads: borrower financials, one column per period, populated from uploaded statements ———
function SpreadsTab({ loan, spreads, onChange, openSource }: { loan: DbLoan; spreads: Spread[]; onChange: () => void; openSource: (docId: string | null, page: number | null | undefined, line: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [extracting, setExtracting] = useState<string | null>(null)

  const extract = async (s: Spread) => {
    if (!s.source_document_id) return
    setExtracting(s.id)
    await aiSpread(s.source_document_id)
    setExtracting(null)
    onChange()
  }

  const startEdit = (s: Spread) => {
    setEditing(s.id)
    setDraft(Object.fromEntries(SPREAD_LINES.map(([k]) => [k, s.data[k] == null ? '' : String(s.data[k])])))
  }
  // Paste a column straight from Excel: multi-line clipboard fills downward.
  const pasteFill = (k: string) => (e: React.ClipboardEvent) => {
    const vals = e.clipboardData.getData('text').split(/\r?\n/).map(v => v.replace(/[$,()\s]/g, '')).filter(v => v !== '')
    if (vals.length < 2) return
    e.preventDefault()
    const start = SPREAD_LINES.findIndex(([key]) => key === k)
    const nd = { ...draft }
    vals.forEach((v, i) => {
      const key = SPREAD_LINES[start + i]?.[0]
      if (key !== undefined) nd[key] = Number.isFinite(+v) ? String(+v) : ''
    })
    setDraft(nd)
    toast(`Pasted ${Math.min(vals.length, SPREAD_LINES.length - start)} values — check and save`)
  }
  const save = async (s: Spread, markReviewed: boolean) => {
    const data = Object.fromEntries(SPREAD_LINES.map(([k]) => [k, draft[k] === '' ? null : +draft[k]]))
    await supabase.from('financial_spreads').update({ data, ...(markReviewed ? { status: 'reviewed' } : {}) }).eq('id', s.id)
    setEditing(null)
    if (markReviewed) toast(`${s.period} reviewed — covenants retest and the cash flow updates now. Next stop: Compliance.`)
    onChange()
  }
  const remove = async (s: Spread) => {
    if (!(await confirmDialog(`Delete the ${s.period} spread?`, 'This cannot be undone.', { danger: true, confirmText: 'Delete' }))) return
    await supabase.from('financial_spreads').delete().eq('id', s.id)
    toast(`${s.period} spread deleted`)
    onChange()
  }

  const annualDS = loan.next_payment_amount ? loan.next_payment_amount * 12 : null
  const num = (s: Spread, k: string) => (editing === s.id ? (draft[k] === '' ? null : +draft[k]) : s.data[k] ?? null)
  const ratio = (label: string, fn: (s: Spread) => string) => (
    <tr key={label} className="ratio-row"><td>{label}</td>{spreads.map(s => <td key={s.id} className="num mono">{fn(s)}</td>)}<td /></tr>
  )
  const fmt = (v: number | null) => (v == null ? '—' : `$${Math.round(v).toLocaleString()}`)

  if (!spreads.length) return (
    <Card title="Financial spreads">
      <p className="small" style={{ padding: 14 }}>
        No spreads yet for this borrower. Upload a <b>tax return</b> or <b>financial statement</b> on the Documents tab — a draft spread
        column is created automatically for each statement, ready for analyst input.
      </p>
    </Card>
  )

  return (
    <Card title="Financial spreads" sub="one column per statement · cited values open their source page · in edit, paste a column from Excel and it fills downward">
      <table className="spread-tight">
        <thead>
          <tr>
            <th style={{ width: 160 }}>Line item</th>
            {spreads.map(s => (
              <th key={s.id} className="num">
                <div>{s.period}</div>
                <div className="small" style={{ fontWeight: 400 }}>{s.statement_type}</div>
                <span className={`status ${s.status === 'reviewed' ? 's-green' : 's-amber'}`} style={{ marginTop: 4 }}>{s.status === 'reviewed' ? 'Reviewed' : 'Draft'}</span>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {SPREAD_LINES.map(([k, label]) => (
            <tr key={k}>
              <td className={k === 'ebitda' || k === 'net_income' ? 'bold' : ''}>{label}</td>
              {spreads.map(s => (
                <td key={s.id} className="num mono">
                  {editing === s.id
                    ? <input className="cell-input" type="number" aria-label={`${label} — ${s.period}`} value={draft[k]} onChange={e => setDraft({ ...draft, [k]: e.target.value })} onPaste={pasteFill(k)} />
                    : s.cites?.[k] && s.data[k] != null
                      ? <button className="cellv linkish" style={{ font: 'inherit', color: 'inherit' }}
                          onClick={() => openSource(s.source_document_id, s.cites![k].page, `${label} · ${s.period}`)}>
                          {fmt(s.data[k] ?? null)}
                          <span className="tip">p. {s.cites[k].page ?? '—'}{s.cites[k].text ? ` · read \u201c${s.cites[k].text}\u201d` : ''} · click to view the page</span>
                        </button>
                      : fmt(s.data[k] ?? null)}
                </td>
              ))}
              <td />
            </tr>
          ))}
          {ratio('EBITDA margin', s => { const e = num(s, 'ebitda'), r = num(s, 'revenue'); return e != null && r ? `${((e / r) * 100).toFixed(1)}%` : '—' })}
          {ratio('Debt / EBITDA', s => { const e = num(s, 'ebitda'), d = num(s, 'total_debt'); return e && d != null ? `${(d / e).toFixed(1)}x` : '—' })}
          {ratio('Debt / TNW', s => { const t = num(s, 'tangible_net_worth'), d = num(s, 'total_debt'); return t && d != null ? `${(d / t).toFixed(1)}x` : '—' })}
          {ratio(`DSCR (this loan${annualDS ? `, ${money(annualDS)}/yr DS` : ''})`, s => { const e = num(s, 'ebitda'); return e != null && annualDS ? `${(e / annualDS).toFixed(2)}x` : '—' })}
          <tr>
            <td />
            {spreads.map(s => (
              <td key={s.id} className="num">
                {editing === s.id ? (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    <button className="btn-light" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn-light" onClick={() => save(s, false)}>Save</button>
                    <button className="btn-dark" onClick={() => save(s, true)}>Save & review</button>
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', gap: 6 }}>
                    {API_URL && s.status === 'draft' && s.source_document_id && (
                      <button className="btn-dark" onClick={() => extract(s)} disabled={extracting === s.id}>
                        {extracting === s.id ? 'Extracting…' : 'AI extract'}
                      </button>
                    )}
                    <button className="btn-light" onClick={() => startEdit(s)}>Edit</button>
                    <button className="btn-light" onClick={() => remove(s)}>Delete</button>
                  </span>
                )}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </Card>
  )
}

// ——— Compliance: covenants + ticklers + the immutable test trail ———
const ComplianceTab = ({ org, loanId, covenants, ticklers, history, docs, onChange }: { org: Org; loanId: string; covenants: DbCovenant[]; ticklers: DbTickler[]; history: CovTest[]; docs: Doc[]; onChange: () => void }) => (
  <>
    {API_URL && docs.length > 0 && <ObligationReader docs={docs} onChange={onChange} />}
    <Card title="Covenants" sub={`${covenants.length} tracked`}>
      <table>
        <thead><tr><th>Covenant</th><th>Requirement</th><th>Actual</th><th>Status</th><th>Next test</th></tr></thead>
        <tbody>
          {covenants.map(c => (
            <tr key={c.id}>
              <td><b>{c.name}</b><div className="src">{c.source}</div></td>
              <td className="small">{c.requirement}</td>
              <td className="small mono">{c.actual ?? '—'}</td>
              <td><span className={`status ${covCls[c.status]}`}>{c.status === 'Near' ? 'Near violation' : c.status}</span></td>
              <td className="small">{fmtDate(c.next_test)}</td>
            </tr>
          ))}
          {!covenants.length && <tr><td colSpan={5} className="small">No covenants recorded.</td></tr>}
        </tbody>
      </table>
    </Card>
    {history.length > 0 && (
      <Card title="Test history" sub="every automated retest, kept forever — the examiner's trail">
        <table>
          <thead><tr><th>Tested</th><th>Covenant</th><th>Result</th><th>Status</th></tr></thead>
          <tbody>
            {history.map(h => (
              <tr key={h.id}>
                <td className="small mono">{new Date(h.tested_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="small">{covenants.find(c => c.id === h.covenant_id)?.name ?? '—'}</td>
                <td className="small mono">{h.actual}</td>
                <td><span className={`status ${covCls[h.status]}`}>{h.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    )}
    <Card title="Ticklers & reporting" sub="what the loan agreement requires, and when">
      <table>
        <thead><tr><th>Requirement</th><th>Responsible</th><th>Due</th><th>Status</th><th /></tr></thead>
        <tbody>
          {ticklers.map(t => (
            <tr key={t.id}>
              <td><b>{t.requirement}</b><div className="src">{t.source}</div></td>
              <td className="small">{t.responsible}</td>
              <td>{fmtDate(t.due_date)}</td>
              <td>{tickStatus(t)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {(t.status === 'open' || t.status === 'requested') && (
                  <span style={{ display: 'inline-flex', gap: 10 }}>
                    {t.status === 'open' && (
                      <button className="linkish" onClick={async () => {
                        await supabase.from('ticklers').update({ status: 'requested' }).eq('id', t.id)
                        toast(`${t.requirement} marked requested — send it via Communication or the borrower portal`)
                        onChange()
                      }}>Request</button>
                    )}
                    <button className="linkish" onClick={async () => {
                      await supabase.from('ticklers').update({ status: 'complete' }).eq('id', t.id)
                      toast(`${t.requirement} received — reporting current`)
                      onChange()
                    }}>Received</button>
                    <button className="linkish" onClick={async () => {
                      const reason = await promptDialog(`Waive "${t.requirement}"?`, 'Reason (goes in the loan notes)')
                      if (reason === null) return
                      await supabase.from('ticklers').update({ status: 'waived' }).eq('id', t.id)
                      const user = (await supabase.auth.getUser()).data.user
                      await supabase.from('loan_notes').insert({
                        org_id: org.id, loan_id: loanId, body: `[Waived] ${t.requirement} — ${reason || 'no reason given'}`,
                        author: (user?.user_metadata?.full_name as string) ?? user?.email ?? 'Unknown', created_by: user?.id,
                      })
                      toast(`${t.requirement} waived — noted on the loan`)
                      onChange()
                    }}>Waive</button>
                  </span>
                )}
              </td>
            </tr>
          ))}
          {!ticklers.length && <tr><td colSpan={5} className="small">No ticklers yet.</td></tr>}
        </tbody>
      </table>
    </Card>
  </>
)

// ——— Covenant builder: the loan agreement writes its own compliance setup ———
function ObligationReader({ docs, onChange }: { docs: Doc[]; onChange: () => void }) {
  const agreements = docs.filter(d => /agreement|loan doc|note|modification/i.test(d.doc_type) || /agreement|loan.?doc/i.test(d.filename))
  const pool = agreements.length ? agreements : docs
  const [docId, setDocId] = useState(pool[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  return (
    <div className="viewbar" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
      <span className="small"><b>Set up compliance from the documents:</b> the model reads the agreement and files every covenant and tickler with its \u00a7-cite.</span>
      <span className="spacer" />
      <select className="mini" value={docId} onChange={e => setDocId(e.target.value)} aria-label="Document to read">
        {pool.map(d => <option key={d.id} value={d.id}>{d.filename}</option>)}
      </select>
      <button className="btn-dark" disabled={busy || !docId} onClick={async () => {
        setBusy(true)
        const out = await aiObligations(docId)
        setBusy(false)
        if (!out) { toast('Could not read the document — is the gateway running?'); return }
        toast(`Added ${out.ticklers_created} tickler${out.ticklers_created === 1 ? '' : 's'} and ${out.covenants_created} covenant${out.covenants_created === 1 ? '' : 's'} — every item cites its section. Review below; waive anything wrong.`)
        onChange()
      }}>{busy ? 'Reading\u2026' : 'Read with AI'}</button>
    </div>
  )
}

// ——— Structure: full terms (top rows first) + guarantors ———
function StructureTab({ loan, guarantors }: { loan: DbLoan; guarantors: Guarantor[] }) {
  const [all, setAll] = useState(false)
  const rows: [string, string][] = [
    ['Borrower', loan.customers?.company ?? '—'],
    ['Contact', `${loan.customers?.name ?? '—'} · ${loan.customers?.email ?? 'no email'} · ${loan.customers?.phone ?? 'no phone'}`],
    ['Payment structure', loan.payment_type],
    ['Rate', `${loan.rate ?? '—'}${loan.rate_floor ? ` · floor ${loan.rate_floor}` : ''}`],
    ['Term / amortization', loan.term ?? '—'],
    ['Collateral', loan.collateral ?? '—'],
    ['Rate reset', fmtDate(loan.rate_reset_date)],
    ['I/O period ends', fmtDate(loan.io_end_date)],
    ['Origination → maturity', `${fmtDate(loan.origination_date)} → ${fmtDate(loan.maturity)}`],
    ['Draw period ends', fmtDate(loan.draw_period_end)],
    ['LTV / DSCR', `${loan.ltv === null ? '—' : Math.round(loan.ltv * 100) + '%'} / ${loan.dscr === null ? '—' : Number(loan.dscr).toFixed(2) + 'x'}`],
    ['Relationship manager', loan.rm ?? '—'],
  ]
  return (
    <div className="two-col">
      <Card title="Terms" right={<button className="linkish" onClick={() => setAll(a => !a)}>{all ? 'Key terms' : 'All terms'}</button>}>
        <table className="kv"><tbody>
          {(all ? rows : rows.slice(0, 6)).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}
        </tbody></table>
      </Card>
      <Card title="Guarantors">
        <table>
          <thead><tr><th>Name</th><th className="num">Guarantee</th><th>Latest PFS</th><th className="num">Net worth</th><th className="num">Liquidity</th></tr></thead>
          <tbody>
            {guarantors.map(g => (
              <tr key={g.id}>
                <td><b>{g.name}</b></td>
                <td className="num">{g.guarantee_pct ? `${g.guarantee_pct}%` : ''} {g.guarantee_type}</td>
                <td>{fmtDate(g.pfs_date)}{g.pfs_date && daysLate(g.pfs_date) > 365 && <span className="status s-amber" style={{ marginLeft: 6 }}>Stale</span>}</td>
                <td className="num mono">{g.net_worth ? money(g.net_worth) : '—'}</td>
                <td className="num mono">{g.liquidity ? money(g.liquidity) : '—'}</td>
              </tr>
            ))}
            {!guarantors.length && <tr><td colSpan={5} className="small">No guarantors recorded.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ——— Documents: per-loan upload + files + share links ———
const DocumentsTab = ({ org, loan, docs, links, onChange }: { org: Org; loan: DbLoan; docs: Doc[]; links: ShareLink[]; onChange: () => void }) => {
  const [busy, setBusy] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const revoke = async (s: ShareLink) => {
    if (!(await confirmDialog(`Revoke ${s.institution}'s link?`, 'They will lose access immediately.', { danger: true, confirmText: 'Revoke' }))) return
    await supabase.from('share_links').update({ revoked: true }).eq('id', s.id)
    toast('Link revoked')
    onChange()
  }

  const upload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      setBusy(file.name)
      const { docType, confidence } = classifyType(file.name)
      const path = `${org.id}/${crypto.randomUUID()}-${file.name}`
      const { error } = await supabase.storage.from('documents').upload(path, file)
      if (!error) {
        const { data: row } = await supabase.from('documents').insert({
          org_id: org.id, loan_id: loan.id, customer_id: loan.customer_id,
          filename: file.name, storage_path: path, doc_type: docType, confidence, status: 'routed',
        }).select().single()
        if (row) {
          // A matching document closes its own tickler — the loop the analyst
          // otherwise closes by hand.
          const closed = await completeMatchingTicklers(loan.id, docType)
          let spreadNote = ''
          if (loan.customer_id) {
            if (API_URL) {
              // Gateway on: OCR + extraction populate the spread with no typing.
              await aiProcessDocument(row.id, docType, true)
              spreadNote = ' · read & spread — review it in Financials'
            } else {
              // Gateway off: create the empty draft column for manual entry.
              const made = await spreadFromDocument(org.id, loan.customer_id, row.id, file.name, docType)
              if (made) spreadNote = ' · draft spread created — review it in Financials'
            }
          }
          toast(`${file.name} filed as ${docType}${closed.length ? ` · tickler completed: ${closed[0]}` : ''}${spreadNote}`)
        }
      }
    }
    setBusy(null)
    onChange()
  }

  return (
    <div className="two-col">
      <Card title="Documents" sub={`${docs.length} on this loan`}>
        <label
          className={`drop slim ${drag ? 'drag' : ''}`} style={{ margin: 12, marginBottom: 4 }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files) }}
        >
          <input type="file" multiple hidden onChange={e => e.target.files && upload(e.target.files)} />
          {busy ? <span className="small"><span className="spin" style={{ display: 'inline-block', verticalAlign: -2 }} /> Uploading {busy}…</span>
            : <><Ico.doc /> <b>Drop files for this loan</b> <span className="small">classified on upload, filed directly here</span></>}
        </label>
        <table><tbody>
          {docs.map(d => (
            <tr key={d.id}>
              <td className="mono small ellipsis" title={d.filename}>{d.filename}</td>
              <td><span className="pill">{d.doc_type}</span></td>
              <td className="small mono">{new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
            </tr>
          ))}
          {!docs.length && <tr><td className="small">None yet — drop files above, or use portfolio-wide routing on the Dashboard's Operations tab.</td></tr>}
        </tbody></table>
      </Card>
      <Card title="Share links" sub="every access is logged">
        <table>
          <thead><tr><th>Institution</th><th>Scope</th><th>Expires</th><th className="num">Opens</th><th>Status</th><th /></tr></thead>
          <tbody>
            {links.map(s => {
              const expired = new Date(s.expires_at) < new Date()
              return (
                <tr key={s.id}>
                  <td><b>{s.institution}</b><div className="small mono ellipsis">{shareUrl(s.token)}</div></td>
                  <td className="small">{s.doc_ids ? `${s.doc_ids.length} docs` : 'All docs'}{s.passcode ? ' · passcode' : ''}</td>
                  <td className="small">{new Date(s.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td className="num mono">{s.access_count}</td>
                  <td><span className={`status ${s.revoked ? 's-red' : expired ? 's-gray' : 's-green'}`}>{s.revoked ? 'Revoked' : expired ? 'Expired' : 'Active'}</span></td>
                  <td>{!s.revoked && !expired && <button className="btn-light" onClick={() => revoke(s)}>Revoke</button>}</td>
                </tr>
              )
            })}
            {!links.length && <tr><td colSpan={6} className="small">Nothing shared yet — use Share documents above.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

// ——— Activity: send outreach + note composer + merged communications record ———
function Compose({ org, loan, onSent }: { org: Org; loan: DbLoan; onSent: () => void }) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const recipient = channel === 'email' ? loan.customers?.email : loan.customers?.phone

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recipient) { setErr(`No ${channel === 'email' ? 'email address' : 'phone number'} on file for this borrower.`); return }
    setBusy(true); setErr(null)
    const { data, error } = await supabase.functions.invoke('send-outreach', {
      body: { org_id: org.id, customer_id: loan.customer_id, channel, recipient, subject: channel === 'email' ? subject : null, body },
    })
    setBusy(false)
    if (error || data?.error) { setErr(error?.message ?? data.error); return }
    setSubject(''); setBody('')
    onSent()
  }

  return (
    <form className="compose-inline" onSubmit={send}>
      <div className="seg" style={{ width: 220 }}>
        <button type="button" className={channel === 'email' ? 'on' : ''} onClick={() => setChannel('email')}>Email</button>
        <button type="button" className={channel === 'sms' ? 'on' : ''} onClick={() => setChannel('sms')}>Text</button>
      </div>
      <span className="small mono">to {recipient ?? `no ${channel} on file`}</span>
      {channel === 'email' && <input aria-label="Subject" placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />}
      <input required aria-label="Message" placeholder={channel === 'sms' ? 'Text message…' : 'Message…'} value={body} onChange={e => setBody(e.target.value)} style={{ flex: 2 }} />
      <button className="btn-dark" disabled={busy}>{busy ? 'Sending…' : 'Send'}</button>
      {err && <span className="small" style={{ color: 'var(--red)', flexBasis: '100%' }}>{err}</span>}
    </form>
  )
}

function ActivityTab({ org, loan, notes, outreach, onChange }: { org: Org; loan: DbLoan; notes: Note[]; outreach: Attempt[]; onChange: () => void }) {
  const [body, setBody] = useState('')
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const user = (await supabase.auth.getUser()).data.user
    await supabase.from('loan_notes').insert({
      org_id: org.id, loan_id: loan.id, body,
      author: (user?.user_metadata?.full_name as string) ?? user?.email ?? 'Unknown',
      created_by: user?.id,
    })
    setBody('')
    onChange()
  }

  // The conversation reads like Messages: our outreach on the right in blue,
  // oldest first, day markers between gaps. (Inbound replies will sit left.)
  const thread = [...outreach].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <>
      <Card title="Conversation" sub={`with ${loan.customers?.name ?? loan.customers?.company ?? 'the borrower'} — email & text, every send logged`}>
        <div className="ios-thread">
          {thread.map((a, i) => {
            const newDay = i === 0 || dayOf(thread[i - 1].created_at) !== dayOf(a.created_at)
            return (
              <div key={a.id}>
                {newDay && <div className="ios-day">{dayOf(a.created_at)}</div>}
                <div className="ios-row me">
                  <div className={`ios-b me ${a.channel === 'sms' ? 'sms' : ''}`}>
                    {a.subject && <b style={{ display: 'block', marginBottom: 2 }}>{a.subject}</b>}
                    {a.body}
                  </div>
                </div>
                <div className="ios-meta">
                  {a.rule_id ? 'Auto · ' : ''}{a.channel === 'sms' ? 'Text' : 'Email'} to {a.recipient} · {new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  {' · '}<span className={a.status === 'failed' ? 'bad' : a.status === 'sent' ? 'ok' : ''}>{a.status}</span>
                </div>
              </div>
            )
          })}
          {!thread.length && <p className="small" style={{ padding: '8px 2px' }}>No messages yet — the composer below sends real email or text, and it lands here.</p>}
        </div>
        <Compose org={org} loan={loan} onSent={onChange} />
      </Card>

      <Card title="Notes" sub="color-coded by what they're about — classified from the text">
        <div className="notes">
          <form onSubmit={add} className="note-form">
            <input required placeholder="Add a note — e.g. 'Called borrower re: Aug payment; promised funds by 9/15'" value={body} onChange={e => setBody(e.target.value)} />
            <button className="btn-dark">Add</button>
          </form>
          {notes.map(n => {
            const k = noteKind(n.body)
            return (
              <div className="note" key={n.id}>
                <div className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="note-kind" style={{ background: k.color }} />
                  <span className="note-kind-label" style={{ color: k.color }}>{k.label}</span>
                  <b>{n.author}</b>
                  <span className="spacer" style={{ flex: 1 }} />
                  <span className="mono">{new Date(n.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <div style={{ marginTop: 4 }}>{n.body}</div>
              </div>
            )
          })}
          {!notes.length && <p className="small" style={{ padding: '0 14px 12px' }}>No notes yet.</p>}
        </div>
      </Card>
    </>
  )
}

// ——— Share popover (header action) ———
function ShareControls({ org, loanId, docs, onChange }: { org: Org; loanId: string; docs: Doc[]; onChange: () => void }) {
  const [open, setOpen] = useState(false)
  const [institution, setInstitution] = useState('')
  const [passcode, setPasscode] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [justCreated, setJustCreated] = useState<string | null>(null)

  const toggle = (id: string) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('share_links').insert({
      org_id: org.id, loan_id: loanId, institution,
      passcode: passcode || null,
      doc_ids: selected.size && selected.size < docs.length ? [...selected] : null,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single()
    if (!error && data) {
      setJustCreated(shareUrl(data.token))
      navigator.clipboard?.writeText(shareUrl(data.token)).catch(() => {})
      toast(`Share link for ${institution} created & copied`)
      setOpen(false); setInstitution(''); setPasscode(''); setSelected(new Set())
      onChange()
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn-dark" onClick={() => { setOpen(o => !o); setJustCreated(null) }}><Ico.link /> Share documents</button>
      {open && (
        <form className="share-pop" onSubmit={create}>
          <b>Share documents with an institution</b>
          <p className="small">Protected link: unguessable token · expires in 14 days · revocable · every open logged.</p>
          <input required placeholder="Institution name" value={institution} onChange={e => setInstitution(e.target.value)} />
          <input placeholder="Optional passcode (share it separately)" value={passcode} onChange={e => setPasscode(e.target.value)} />
          <div className="share-docs-list">
            {docs.map(d => (
              <label key={d.id} className="share-doc">
                <input type="checkbox" checked={selected.size === 0 || selected.has(d.id)} onChange={() => toggle(d.id)} />
                <span className="ellipsis">{d.filename}</span>
              </label>
            ))}
            {!docs.length && <span className="small">No documents on this loan yet — the link will show an empty room.</span>}
          </div>
          <p className="small">{selected.size === 0 || selected.size === docs.length ? `Sharing all ${docs.length}` : `Sharing ${selected.size} of ${docs.length}`} document{docs.length === 1 ? '' : 's'}.</p>
          <button className="btn-dark" style={{ width: '100%', justifyContent: 'center' }}>Create link</button>
        </form>
      )}
      {justCreated && <div className="share-toast">Link created & copied<br /><span className="mono small">{justCreated}</span></div>}
    </div>
  )
}
