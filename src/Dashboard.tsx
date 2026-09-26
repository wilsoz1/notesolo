// Dashboard — the home page. Live analytics over the real book (the cards the
// marketing page only mocks), a grouped to-do list, and what's coming up next.
import { useEffect, useState } from 'react'
import { supabase, Org, Payment, Spread, Guarantor, DbCovenant, money, daysLate, pastDueOf } from './supabase'
import { DbLoan } from './supabase'
import { latestGlobalDSCR, CFScenarioData } from './CashFlow'
import { AskBar, DraftButton } from './Ai'
import { Skeleton } from './dialogs'
import { Ico } from './Icons'

type Item = {
  sev: 0 | 1 | 2            // 0 = red, 1 = amber, 2 = info
  chip: string
  text: string
  who?: string
  action: string
  href: string
}
type Upcoming = { on: string; what: string; loan_id: string; loan_number: string }

// Accent palette for the analytics cards (facts stay monochrome elsewhere;
// these are the marketing collage's colors, now driven by real data).
const C = { blue: '#7aa7ff', purple: '#b39bf5', green: '#3ecf8e', pink: '#f06fa8', amber: '#e2b93b', red: '#e5484d' }

const fmtShort = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`)
const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function Spark({ series, color }: { series: number[]; color: string }) {
  const w = 240, h = 56
  const max = Math.max(...series, 1), min = Math.min(...series, 0)
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - 6 - ((v - min) / (max - min || 1)) * (h - 12)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden="true" style={{ display: 'block', marginTop: 10 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function Donut({ total, good, near, fail }: { total: number; good: number; near: number; fail: number }) {
  const r = 44, cir = 2 * Math.PI * r
  const seg = (n: number) => (total ? (n / total) * cir : 0)
  let off = cir * 0.25 // start at 12 o'clock
  const arcs: { n: number; color: string }[] = [
    { n: good, color: C.green }, { n: near, color: C.amber }, { n: fail, color: C.red },
  ]
  return (
    <div style={{ position: 'relative', width: 110, height: 110, margin: '6px auto 2px' }}>
      <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
        <circle cx="55" cy="55" r={r} stroke="var(--line)" strokeWidth="9" fill="none" />
        {arcs.map((a, i) => {
          const el = a.n > 0 && (
            <circle key={i} cx="55" cy="55" r={r} stroke={a.color} strokeWidth="9" fill="none"
              strokeLinecap="butt" strokeDasharray={`${seg(a.n)} ${cir - seg(a.n)}`} strokeDashoffset={off} />
          )
          off -= seg(a.n)
          return el
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div><b style={{ fontSize: 20 }}>{total}</b><div style={{ fontSize: 10, color: 'var(--sub)' }}>tested</div></div>
      </div>
    </div>
  )
}

export default function Dashboard({ org }: { org: Org }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [strip, setStrip] = useState<{ label: string; value: string; alert?: boolean }[]>([])
  const [loans, setLoans] = useState<(DbLoan & { customers: { company: string | null } | null })[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [covenants, setCovenants] = useState<(DbCovenant & { loan_id?: string })[]>([])
  const [upcoming, setUpcoming] = useState<Upcoming[]>([])
  const [deposits, setDeposits] = useState<{ balance: number; opened: string | null }[]>([])
  const [dscrs, setDscrs] = useState<{ company: string; dscr: number; loanId: string }[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('loans').select('*, customers(company)'),
      supabase.from('loan_payments').select('id, loan_id, due_date, amount, status, paid_date'),
      supabase.from('deposits').select('balance, opened'),
      supabase.from('credit_lines').select('commitment, outstanding'),
      supabase.from('covenants').select('*'),
      supabase.from('ticklers').select('id, requirement, due_date, status, responsible, loan_id, loans(loan_number)'),
      supabase.from('financial_spreads').select('id, period, customer_id, customers(company)').eq('status', 'draft'),
      supabase.from('cash_flow_scenarios').select('id, customer_id, name, data, customers(company)').eq('is_base', true),
      supabase.from('financial_spreads').select('*').eq('status', 'reviewed'),
      supabase.from('guarantors').select('*, loans(customer_id)'),
    ]).then(([ln, pay, dep, loc, cov, tick, drafts, cfs, reviewed, guar]) => {
      const allLoans = (ln.data as unknown as (DbLoan & { customers: { company: string | null } | null })[]) ?? []
      const allPayments = (pay.data as Payment[]) ?? []
      const allCovs = (cov.data as DbCovenant[]) ?? []
      const ticks = (tick.data as unknown as { id: string; requirement: string; due_date: string; status: string; responsible: string; loan_id: string; loans: { loan_number: string } | null }[]) ?? []
      setLoans(allLoans); setPayments(allPayments); setCovenants(allCovs)

      const out: Item[] = []
      const loanFor = (customerId: string | null) =>
        allLoans.filter(l => l.customer_id === customerId).sort((a, b) => Number(b.amount) - Number(a.amount))[0] ?? null

      for (const l of allLoans) {
        const pd = pastDueOf(allPayments, l.id)
        if (pd) out.push({ sev: 0, chip: 'past due', text: `${l.customers?.company} — ${money(pd.amount)} past due ${pd.days} days on ${l.loan_number}`, action: 'Open loan', href: `#/app/loans/${l.id}/Payments` })
      }
      for (const c of allCovs) {
        if (c.status === 'Fail') {
          const loan = allLoans.find(l => l.id === (c as DbCovenant & { loan_id?: string }).loan_id)
          out.push({ sev: 0, chip: 'covenant', text: `Covenant failing on ${loan?.loan_number ?? 'loan'}: ${c.name} (${c.actual ?? ''})`, action: 'Review', href: `#/app/loans/${(c as DbCovenant & { loan_id?: string }).loan_id}/Compliance` })
        }
      }
      for (const t of ticks) {
        if ((t.status === 'open' || t.status === 'requested') && daysLate(t.due_date) > 0)
          out.push({ sev: 1, chip: 'reporting', text: `${t.requirement} past due ${daysLate(t.due_date)}d on ${t.loans?.loan_number}`, who: t.responsible, action: 'Open', href: `#/app/loans/${t.loan_id}/Compliance` })
      }
      for (const s of (drafts.data as unknown as { id: string; period: string; customer_id: string; customers: { company: string | null } | null }[]) ?? []) {
        const l = loanFor(s.customer_id)
        if (l) out.push({ sev: 2, chip: 'spread', text: `Draft spread awaiting review: ${s.customers?.company} · ${s.period}`, action: 'Review', href: `#/app/loans/${l.id}/Spreads` })
      }
      const allSpreads = (reviewed.data as Spread[]) ?? []
      const allGuar = (guar.data as unknown as (Guarantor & { loans: { customer_id: string | null } | null })[]) ?? []
      const dscrList: { company: string; dscr: number; loanId: string }[] = []
      for (const cf of (cfs.data as unknown as { id: string; customer_id: string; name: string; data: CFScenarioData; customers: { company: string | null } | null }[]) ?? []) {
        const r = latestGlobalDSCR(
          cf.data ?? {},
          allSpreads.filter(s => s.customer_id === cf.customer_id),
          allGuar.filter(g => g.loans?.customer_id === cf.customer_id),
          allLoans.filter(l => l.customer_id === cf.customer_id),
        )
        const target = loanFor(cf.customer_id)
        if (!r || !target) continue
        dscrList.push({ company: cf.customers?.company ?? '—', dscr: r.dscr, loanId: target.id })
        if (r.dscr < 1.2) out.push({
          sev: r.dscr < 1 ? 0 : 1, chip: 'cash flow',
          text: `Global DSCR ${r.dscr.toFixed(2)}x on ${cf.customers?.company} (${cf.name} · ${r.period})`,
          action: 'Open cash flow', href: `#/app/loans/${target.id}/Borrower`,
        })
      }
      setDscrs(dscrList)
      setDeposits((dep.data as { balance: number; opened: string | null }[]) ?? [])
      out.sort((a, b) => a.sev - b.sev)
      setItems(out)

      // Coming up: everything with a date in the next 90 days, across the book.
      const today = new Date().toISOString().slice(0, 10)
      const horizon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
      const within = (d: string | null): d is string => !!d && d >= today && d <= horizon
      const up: Upcoming[] = []
      for (const l of allLoans) {
        if (within(l.maturity)) up.push({ on: l.maturity, what: `${l.loan_number} matures`, loan_id: l.id, loan_number: l.loan_number })
        if (within(l.draw_period_end)) up.push({ on: l.draw_period_end, what: `${l.loan_number} draw period ends`, loan_id: l.id, loan_number: l.loan_number })
        if (within(l.rate_reset_date)) up.push({ on: l.rate_reset_date, what: `${l.loan_number} rate resets`, loan_id: l.id, loan_number: l.loan_number })
        if (within(l.io_end_date)) up.push({ on: l.io_end_date, what: `${l.loan_number} interest-only period ends`, loan_id: l.id, loan_number: l.loan_number })
      }
      for (const t of ticks) {
        if ((t.status === 'open' || t.status === 'requested') && within(t.due_date))
          up.push({ on: t.due_date, what: `${t.requirement} due (${t.responsible})`, loan_id: t.loan_id, loan_number: t.loans?.loan_number ?? '' })
      }
      setUpcoming(up.sort((a, b) => (a.on < b.on ? -1 : 1)).slice(0, 8))

      const loanTotal = allLoans.reduce((s, l) => s + Number(l.amount), 0)
      const balTotal = allLoans.reduce((s, l) => s + Number(l.current_balance ?? 0), 0)
      const depTotal = ((dep.data as { balance: number }[]) ?? []).reduce((s, d) => s + Number(d.balance), 0)
      const locs = (loc.data as { commitment: number; outstanding: number }[]) ?? []
      const commit = locs.reduce((s, c) => s + Number(c.commitment), 0)
      const drawn = locs.reduce((s, c) => s + Number(c.outstanding), 0)
      const pastDueTotal = allLoans.reduce((s, l) => s + (pastDueOf(allPayments, l.id)?.amount ?? 0), 0)
      setStrip([
        { label: `${allLoans.length} loans committed`, value: money(loanTotal) },
        { label: 'outstanding balances', value: money(balTotal) },
        { label: 'deposits', value: money(depTotal) },
        { label: `line utilization · ${money(drawn)} drawn`, value: commit ? `${Math.round((drawn / commit) * 100)}%` : '—' },
        ...(pastDueTotal ? [{ label: 'past due', value: money(pastDueTotal), alert: true }] : []),
      ])
    })
  }, [org.id])

  // ——— Analytics, all computed from real rows ———

  // Committed exposure by month: cumulative originations over the last 12 months.
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    months.push(d.toISOString().slice(0, 7))
  }
  // A loan with no (or future-dated) origination counts from the current month,
  // so the trend's endpoint always matches the header strip's committed total.
  const nowMonth = months[months.length - 1]
  const exposureSeries = months.map(m =>
    loans.reduce((s, l) => {
      const om = l.origination_date ? (l.origination_date.slice(0, 7) > nowMonth ? nowMonth : l.origination_date.slice(0, 7)) : nowMonth
      return s + (om <= m ? Number(l.amount) : 0)
    }, 0))
  const expNow = exposureSeries[exposureSeries.length - 1] ?? 0
  const expThen = exposureSeries[0] ?? 0
  const expDelta = expThen ? ((expNow - expThen) / expThen) * 100 : null

  // Late dollars by month: payments due that month that were paid late or are still unpaid past due.
  const todayStr = new Date().toISOString().slice(0, 10)
  const lateSeries = months.map(m =>
    payments.reduce((s, p) => {
      if (p.due_date.slice(0, 7) !== m) return s
      const late = p.status === 'paid' ? !!p.paid_date && p.paid_date > p.due_date : p.due_date < todayStr
      return s + (late ? Number(p.amount) : 0)
    }, 0))
  const pastDueNow = loans.reduce((s, l) => s + (pastDueOf(payments, l.id)?.amount ?? 0), 0)
  const pastDueLoans = loans.filter(l => pastDueOf(payments, l.id)).length

  const covPass = covenants.filter(c => c.status === 'Pass').length
  const covNear = covenants.filter(c => c.status === 'Near').length
  const covFail = covenants.filter(c => c.status === 'Fail').length

  const mixColors = [C.blue, C.purple, C.green, C.pink]
  const mix = [...new Set(loans.map(l => l.type))]
    .map(t => ({ type: t, total: loans.filter(l => l.type === t).reduce((s, l) => s + Number(l.amount), 0) }))
    .sort((a, b) => b.total - a.total)
  const mixMax = Math.max(...mix.map(m => m.total), 1)

  // Top 5 relationships by outstanding exposure.
  const byCustomer = new Map<string, { company: string; total: number; loanId: string }>()
  for (const l of loans) {
    const key = l.customer_id ?? l.id
    const cur = byCustomer.get(key)
    const bal = Number(l.current_balance ?? l.amount)
    if (cur) { cur.total += bal; if (Number(l.amount) > 0 && !cur.loanId) cur.loanId = l.id }
    else byCustomer.set(key, { company: l.customers?.company ?? l.loan_number, total: bal, loanId: l.id })
  }
  const topExposures = [...byCustomer.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  const topMax = Math.max(...topExposures.map(t => t.total), 1)

  // Global DSCR distribution across relationships with a computable base case.
  const buckets = [
    { label: '< 1.00x', color: C.red, n: dscrs.filter(d => d.dscr < 1).length },
    { label: '1.00 – 1.25x', color: C.amber, n: dscrs.filter(d => d.dscr >= 1 && d.dscr < 1.25).length },
    { label: '1.25 – 1.50x', color: C.blue, n: dscrs.filter(d => d.dscr >= 1.25 && d.dscr < 1.5).length },
    { label: '≥ 1.50x', color: C.green, n: dscrs.filter(d => d.dscr >= 1.5).length },
  ]
  const bucketMax = Math.max(...buckets.map(b => b.n), 1)

  // Deposits: cumulative balances by account-open month (we keep no balance history —
  // this is growth of the deposit book, not statement balances).
  const depTotalNow = deposits.reduce((s, d) => s + Number(d.balance), 0)
  const depSeries = months.map(m =>
    deposits.reduce((s, d) => {
      const om = d.opened ? (d.opened.slice(0, 7) > nowMonth ? nowMonth : d.opened.slice(0, 7)) : nowMonth
      return s + (om <= m ? Number(d.balance) : 0)
    }, 0))

  // Payments due in the next 7 days: scheduled payment rows plus each loan's
  // next-payment fields (future payments usually exist only on the loan record).
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const weekFromRows = payments
    .filter(p => p.status !== 'paid' && p.due_date >= todayStr && p.due_date <= weekEnd)
    .map(p => ({ key: `${p.loan_id}:${p.due_date}`, due_date: p.due_date, amount: Number(p.amount), loan: loans.find(l => l.id === p.loan_id) }))
  const seen = new Set(weekFromRows.map(w => w.key))
  const weekFromLoans = loans
    .filter(l => l.next_payment_date && l.next_payment_amount && l.next_payment_date >= todayStr && l.next_payment_date <= weekEnd
      && !seen.has(`${l.id}:${l.next_payment_date}`))
    .map(l => ({ key: `${l.id}:${l.next_payment_date}`, due_date: l.next_payment_date!, amount: Number(l.next_payment_amount), loan: l as (typeof loans)[number] | undefined }))
  const weekPayments = [...weekFromRows, ...weekFromLoans].sort((a, b) => (a.due_date < b.due_date ? -1 : 1))

  // Covenant test calendar: next scheduled tests, overdue ones first.
  const covCal = covenants
    .filter(c => c.next_test)
    .sort((a, b) => (a.next_test! < b.next_test! ? -1 : 1))
    .slice(0, 8)
    .map(c => ({ ...c, loan: loans.find(l => l.id === c.loan_id) }))

  // The to-do list, grouped so each kind of work reads as its own block.
  const GROUPS: { chip: string; label: string }[] = [
    { chip: 'past due', label: 'Past-due payments' },
    { chip: 'covenant', label: 'Covenant failures' },
    { chip: 'cash flow', label: 'Cash flow watch' },
    { chip: 'reporting', label: 'Reporting past due' },
    { chip: 'spread', label: 'Spreads awaiting review' },
  ]

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <>
      <div className="viewbar" style={{ marginBottom: 4, alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Dashboard</h1>
          <p className="subtitle" style={{ marginBottom: 10 }}>
            {greeting}. {items === null ? 'Pulling your book together…'
              : items.length === 0 ? 'Nothing needs you right now — the book is clean.'
              : `${items.length} thing${items.length > 1 ? 's' : ''} need${items.length === 1 ? 's' : ''} attention.`}
          </p>
          <div className="stat-row">
            {strip.map(s => <span key={s.label}><b style={s.alert ? { color: 'var(--red)' } : undefined}>{s.value}</b><i>{s.label}</i></span>)}
          </div>
        </div>
        <span className="spacer" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <DraftButton kind="brief" label="Draft Monday brief" />
          <a className="btn-dark" href="#/app/screener" style={{ textDecoration: 'none' }}>Screen a new loan <Ico.chevron /></a>
        </div>
      </div>

      <div style={{ marginTop: 16 }}><AskBar /></div>

      {/* Analytics — the marketing page's collage, on live data */}
      <div className="dash-cards">
        <div className="dash-card">
          <h4>Committed exposure <i>last 12 months</i></h4>
          <div className="dash-big">{money(expNow)}</div>
          {expDelta !== null && expDelta !== 0 && (
            <div className="dash-delta" style={{ color: C.green }}>▲ {expDelta.toFixed(1)}% vs. a year ago</div>
          )}
          <Spark series={exposureSeries} color={C.blue} />
        </div>
        <div className="dash-card">
          <h4>Covenants <i>current tests</i></h4>
          <Donut total={covenants.length} good={covPass} near={covNear} fail={covFail} />
          <div className="dash-bar-row"><span className="swatch" style={{ background: C.green }} /> Passing <span className="spacer" /><b>{covPass}</b></div>
          <div className="dash-bar-row"><span className="swatch" style={{ background: C.amber }} /> Near threshold <span className="spacer" /><b>{covNear}</b></div>
          <div className="dash-bar-row"><span className="swatch" style={{ background: C.red }} /> Failing <span className="spacer" /><b>{covFail}</b></div>
        </div>
        <div className="dash-card">
          <h4>Portfolio mix <i>by commitment</i></h4>
          {mix.map((m, i) => (
            <div className="dash-bar-row" key={m.type}>
              <span className="swatch" style={{ background: mixColors[i % mixColors.length] }} />
              <span className="ellipsis" style={{ width: 130 }}>{m.type}</span>
              <span className="dash-track"><i style={{ width: `${(m.total / mixMax) * 100}%`, background: mixColors[i % mixColors.length] }} /></span>
              <b>{fmtShort(m.total)}</b>
            </div>
          ))}
        </div>
        <div className="dash-card">
          <h4>Past-due dollars <i>rules firing daily</i></h4>
          <div className="dash-big" style={pastDueNow ? { color: C.pink } : undefined}>{money(pastDueNow)}</div>
          <div className="dash-delta small">
            {pastDueNow ? `${pastDueLoans} loan${pastDueLoans > 1 ? 's' : ''} · delinquency rules handle outreach` : 'nothing past due'}
          </div>
          <Spark series={lateSeries} color={C.pink} />
        </div>

        <div className="dash-card">
          <h4>Top exposures <i>by relationship</i></h4>
          {topExposures.map(t => (
            <div className="dash-bar-row" key={t.company}>
              <a className="cell-link ellipsis" style={{ width: 130, flex: 'none' }} href={`#/app/loans/${t.loanId}/Borrower`} title={t.company}>{t.company}</a>
              <span className="dash-track"><i style={{ width: `${(t.total / topMax) * 100}%`, background: C.blue }} /></span>
              <b>{fmtShort(t.total)}</b>
            </div>
          ))}
          {!topExposures.length && <p className="small">No loans yet.</p>}
        </div>

        <div className="dash-card">
          <h4>Global DSCR <i>{dscrs.length} relationship{dscrs.length === 1 ? '' : 's'} measured</i></h4>
          {buckets.map(b => (
            <div className="dash-bar-row" key={b.label}>
              <span className="swatch" style={{ background: b.color }} />
              <span style={{ width: 90 }}>{b.label}</span>
              <span className="dash-track"><i style={{ width: `${(b.n / bucketMax) * 100}%`, background: b.color }} /></span>
              <b>{b.n}</b>
            </div>
          ))}
          <div className="dash-delta small" style={{ marginTop: 8 }}>from each relationship's base cash-flow scenario</div>
        </div>

        <div className="dash-card">
          <h4>Deposit balances <i>{deposits.length} account{deposits.length === 1 ? '' : 's'}</i></h4>
          <div className="dash-big">{money(depTotalNow)}</div>
          <div className="dash-delta small">book growth by account opening — no balance history kept</div>
          <Spark series={depSeries} color={C.green} />
        </div>
      </div>

      {items === null ? <div style={{ marginTop: 20 }}><Skeleton rows={6} /></div> : (
        <div className="two-col" style={{ marginTop: 20 }}>
          <div className="grid">
            <div className="uw-head"><span><b>To do</b> <span className="small">{items.length ? `${items.length} item${items.length > 1 ? 's' : ''} · most urgent first` : 'all clear'}</span></span></div>
            {items.length === 0 && (
              <p className="small" style={{ padding: 18 }}>
                <Ico.check /> All clear. Payments current, covenants passing, reporting up to date.
              </p>
            )}
            {GROUPS.map(gr => {
              const group = items.filter(it => it.chip === gr.chip)
              if (!group.length) return null
              return (
                <div key={gr.chip}>
                  <div className="wq-group">{gr.label} · {group.length}</div>
                  {group.map((it, i) => (
                    <div className="wq-row" key={i}>
                      <span className={`dot2 ${it.sev === 0 ? 'red' : it.sev === 1 ? 'amber' : 'info'}`} />
                      <span style={{ flex: 1 }}>{it.text}{it.who && <span className="small"> · {it.who}</span>}</span>
                      <a className="btn-light" href={it.href} style={{ textDecoration: 'none' }}>{it.action}</a>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          <div>
            <div className="grid" style={{ marginBottom: 20 }}>
              <div className="uw-head"><span><b>Coming up</b> <span className="small">next 90 days — maturities, draw periods, resets, reporting</span></span></div>
              {upcoming.length === 0 && <p className="small" style={{ padding: 18 }}>Nothing on the calendar for the next 90 days.</p>}
              {upcoming.map((u, i) => (
                <div className="wq-row" key={i}>
                  <span className="small mono" style={{ width: 58 }}>{fmtDay(u.on)}</span>
                  <span style={{ flex: 1 }}>{u.what}</span>
                  <a className="linkish" href={`#/app/loans/${u.loan_id}`}>{u.loan_number} →</a>
                </div>
              ))}
            </div>

            <div className="grid" style={{ marginBottom: 20 }}>
              <div className="uw-head"><span><b>Payments due this week</b> <span className="small">{weekPayments.length ? money(weekPayments.reduce((s, p) => s + Number(p.amount), 0)) + ' expected' : 'next 7 days'}</span></span></div>
              {weekPayments.length === 0 && <p className="small" style={{ padding: 18 }}>No payments fall due in the next 7 days.</p>}
              {weekPayments.map(p => (
                <div className="wq-row" key={p.key}>
                  <span className="small mono" style={{ width: 58 }}>{fmtDay(p.due_date)}</span>
                  <span style={{ flex: 1 }}>{p.loan?.customers?.company ?? '—'}</span>
                  <span className="mono">{money(p.amount)}</span>
                  <a className="linkish" href={`#/app/loans/${p.loan?.id}/Payments`}>{p.loan?.loan_number ?? 'loan'} →</a>
                </div>
              ))}
            </div>

            <div className="grid">
              <div className="uw-head"><span><b>Covenant tests</b> <span className="small">next scheduled tests across the book</span></span></div>
              {covCal.length === 0 && <p className="small" style={{ padding: 18 }}>No covenant tests scheduled.</p>}
              {covCal.map(c => {
                const overdue = c.next_test! < todayStr
                return (
                  <div className="wq-row" key={c.id}>
                    <span className="small mono" style={{ width: 58 }}>{fmtDay(c.next_test!)}</span>
                    <span style={{ flex: 1 }}>{c.name}{overdue && <span className="status s-amber" style={{ marginLeft: 8 }}><Ico.clock /> overdue</span>}</span>
                    <span className={`status ${c.status === 'Fail' ? 's-red' : c.status === 'Near' ? 's-amber' : 's-gray'}`}>{c.status}</span>
                    <a className="linkish" href={`#/app/loans/${c.loan_id}/Compliance`}>{c.loan?.loan_number ?? 'loan'} →</a>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
