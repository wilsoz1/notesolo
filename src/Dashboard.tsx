// Home — a CRM-style three-zone page. The middle is the working inbox: an
// exposure trend, the tasks the agents queued for a human, and a feed of what
// they completed. The right rail is the portfolio profile with details folded
// behind collapsible sections — minimum cognitive load, everything one click away.
import { useEffect, useState } from 'react'
import { supabase, Org, Payment, Spread, Guarantor, DbCovenant, money, daysLate, pastDueOf } from './supabase'
import { DbLoan } from './supabase'
import { latestGlobalDSCR, CFScenarioData } from './CashFlow'
import { Skeleton } from './dialogs'
import { Ico } from './Icons'

type Item = {
  sev: 0 | 1 | 2
  chip: string
  text: string
  who?: string
  href: string
  when?: string
}
type Feed = { icon: 'ok' | 'doc' | 'ai'; text: string; on: string; href?: string }
type Upcoming = { on: string; what: string; loan_id: string; loan_number: string }

const fmtShort = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`)
const fmtDay = (d: string) => new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const fmtAgo = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
}

// Colored tags for task kinds — the only color on the page besides state chips.
const TAGS: Record<string, { bg: string; fg: string }> = {
  'past due': { bg: 'var(--red-bg)', fg: 'var(--red)' },
  covenant: { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  'cash flow': { bg: 'var(--amber-bg)', fg: 'var(--amber)' },
  reporting: { bg: 'var(--blue-bg)', fg: 'var(--blue)' },
  spread: { bg: '#f1edfd', fg: '#6d4fd2' },
  review: { bg: '#f1edfd', fg: '#6d4fd2' },
}

// Ramp-style insight chart: soft gradient area under the line, a dashed
// prior-period line for comparison, tiny uppercase month labels.
function TrendChart({ series, prior, labels }: { series: number[]; prior?: number[]; labels: string[] }) {
  const w = 760, h = 180, padL = 44, padB = 24, padT = 12
  const max = Math.max(...series, ...(prior ?? []), 1)
  const x = (i: number) => padL + (i / (series.length - 1)) * (w - padL - 8)
  const y = (v: number) => padT + (1 - v / max) * (h - padT - padB)
  const pts = series.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  const area = `${padL},${y(0)} ${pts} ${x(series.length - 1)},${y(0)}`
  const priorPts = prior?.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg className="hm-chart" viewBox={`0 0 ${w} ${h}`} width="100%" aria-hidden="true">
      <defs>
        <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9d3f2" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#c9d3f2" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      {[max / 2, max].map(t => (
        <g key={t}>
          <line x1={padL} x2={w - 8} y1={y(t)} y2={y(t)} stroke="var(--line-2)" strokeWidth="1" />
          <text x={padL - 8} y={y(t) + 3} textAnchor="end">{fmtShort(t)}</text>
        </g>
      ))}
      <line x1={padL} x2={w - 8} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1" />
      {[0, 3, 6, 9, 11].map(i => (
        <text key={i} x={x(i)} y={h - 6} textAnchor={i === 11 ? 'end' : 'middle'} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {i === 11 ? 'TODAY' : new Date(labels[i] + '-15').toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
        </text>
      ))}
      <polygon points={area} fill="url(#expGrad)" />
      {priorPts && <polyline points={priorPts} fill="none" stroke="#c9c6bd" strokeWidth="1.5" strokeDasharray="4 4" />}
      <polyline points={pts} fill="none" stroke="#5b74e6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function Dashboard({ org }: { org: Org }) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [feed, setFeed] = useState<Feed[]>([])
  const [loans, setLoans] = useState<(DbLoan & { customers: { company: string | null } | null })[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [covenants, setCovenants] = useState<(DbCovenant & { loan_id?: string })[]>([])
  const [upcoming, setUpcoming] = useState<Upcoming[]>([])
  const [depTotal, setDepTotal] = useState(0)
  const [lineUtil, setLineUtil] = useState<string>('—')
  const [dscrs, setDscrs] = useState<number[]>([])
  const [annuals, setAnnuals] = useState<{ id: string; due: string; status: string; loan_id: string; loan_number: string; company: string }[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('loans').select('*, customers(company)'),
      supabase.from('loan_payments').select('id, loan_id, due_date, amount, status, paid_date'),
      supabase.from('deposits').select('balance'),
      supabase.from('credit_lines').select('commitment, outstanding'),
      supabase.from('covenants').select('*'),
      supabase.from('ticklers').select('id, requirement, due_date, status, responsible, loan_id, loans(loan_number, customers(company))'),
      supabase.from('financial_spreads').select('id, period, customer_id, created_at, customers(company)').eq('status', 'draft'),
      supabase.from('cash_flow_scenarios').select('id, customer_id, name, data, customers(company)').eq('is_base', true),
      supabase.from('financial_spreads').select('*').eq('status', 'reviewed'),
      supabase.from('guarantors').select('*, loans(customer_id)'),
      supabase.from('documents').select('id, filename, doc_type, status, created_at, loan_id').order('created_at', { ascending: false }).limit(8),
    ]).then(([ln, pay, dep, loc, cov, tick, drafts, cfs, reviewed, guar, docs]) => {
      const allLoans = (ln.data as unknown as (DbLoan & { customers: { company: string | null } | null })[]) ?? []
      const allPayments = (pay.data as Payment[]) ?? []
      const allCovs = (cov.data as DbCovenant[]) ?? []
      const ticks = (tick.data as unknown as { id: string; requirement: string; due_date: string; status: string; responsible: string; loan_id: string; loans: { loan_number: string; customers: { company: string | null } | null } | null }[]) ?? []
      setLoans(allLoans); setPayments(allPayments); setCovenants(allCovs)

      const loanFor = (customerId: string | null) =>
        allLoans.filter(l => l.customer_id === customerId).sort((a, b) => Number(b.amount) - Number(a.amount))[0] ?? null

      const out: Item[] = []
      for (const l of allLoans) {
        const pd = pastDueOf(allPayments, l.id)
        if (pd) out.push({ sev: 0, chip: 'past due', text: `${l.customers?.company} — ${money(pd.amount)} past due ${pd.days} days on ${l.loan_number}`, href: `#/app/loans/${l.id}/Payments` })
      }
      for (const c of allCovs) {
        if (c.status === 'Fail') {
          const loan = allLoans.find(l => l.id === (c as DbCovenant & { loan_id?: string }).loan_id)
          out.push({ sev: 0, chip: 'covenant', text: `Covenant failing on ${loan?.loan_number ?? 'loan'}: ${c.name} (${c.actual ?? ''})`, href: `#/app/loans/${(c as DbCovenant & { loan_id?: string }).loan_id}/Compliance` })
        }
      }
      for (const t of ticks) {
        if ((t.status === 'open' || t.status === 'requested') && daysLate(t.due_date) > 0 && !/annual review/i.test(t.requirement))
          out.push({ sev: 1, chip: 'reporting', text: `${t.requirement} past due ${daysLate(t.due_date)}d on ${t.loans?.loan_number}`, who: t.responsible, href: `#/app/loans/${t.loan_id}/Compliance` })
      }
      const draftRows = (drafts.data as unknown as { id: string; period: string; customer_id: string; created_at: string; customers: { company: string | null } | null }[]) ?? []
      for (const s of draftRows) {
        const l = loanFor(s.customer_id)
        if (l) out.push({ sev: 2, chip: 'spread', text: `Review the drafted spread — ${s.customers?.company} · ${s.period}`, href: `#/app/loans/${l.id}/Spreads` })
      }
      const allSpreads = (reviewed.data as Spread[]) ?? []
      const allGuar = (guar.data as unknown as (Guarantor & { loans: { customer_id: string | null } | null })[]) ?? []
      const dscrList: number[] = []
      for (const cf of (cfs.data as unknown as { id: string; customer_id: string; name: string; data: CFScenarioData; customers: { company: string | null } | null }[]) ?? []) {
        const r = latestGlobalDSCR(
          cf.data ?? {},
          allSpreads.filter(s => s.customer_id === cf.customer_id),
          allGuar.filter(g => g.loans?.customer_id === cf.customer_id),
          allLoans.filter(l => l.customer_id === cf.customer_id),
        )
        const target = loanFor(cf.customer_id)
        if (!r || !target) continue
        dscrList.push(r.dscr)
        if (r.dscr < 1.2) out.push({
          sev: r.dscr < 1 ? 0 : 1, chip: 'cash flow',
          text: `Global DSCR ${r.dscr.toFixed(2)}x on ${cf.customers?.company} (${r.period})`,
          href: `#/app/loans/${target.id}/Borrower`,
        })
      }
      setDscrs(dscrList)
      setDepTotal(((dep.data as { balance: number }[]) ?? []).reduce((s, d) => s + Number(d.balance), 0))
      const locs = (loc.data as { commitment: number; outstanding: number }[]) ?? []
      const commit = locs.reduce((s, c) => s + Number(c.commitment), 0)
      setLineUtil(commit ? `${Math.round((locs.reduce((s, c) => s + Number(c.outstanding), 0) / commit) * 100)}%` : '—')

      const reviews = ticks.filter(t => /annual review/i.test(t.requirement))
      setAnnuals(reviews.map(t => ({ id: t.id, due: t.due_date, status: t.status, loan_id: t.loan_id, loan_number: t.loans?.loan_number ?? '', company: t.loans?.customers?.company ?? t.loans?.loan_number ?? '—' }))
        .sort((a, b) => (a.due < b.due ? -1 : 1)))
      for (const r of reviews) {
        if (r.status !== 'complete' && r.status !== 'waived')
          out.push({ sev: 2, chip: 'review', text: `Annual review — ${r.loans?.customers?.company ?? r.loans?.loan_number}`, who: r.responsible, href: `#/app/loans/${r.loan_id}/Compliance`, when: r.due_date })
      }
      out.sort((a, b) => a.sev - b.sev)
      setItems(out)

      // ——— Activity: what the agents completed, newest first ———
      const f: Feed[] = []
      for (const d of (docs.data as unknown as { id: string; filename: string; doc_type: string; status: string; created_at: string; loan_id: string | null }[]) ?? []) {
        f.push({ icon: 'doc', text: `Read ${d.filename} — classified as ${d.doc_type}`, on: d.created_at, href: d.loan_id ? `#/app/loans/${d.loan_id}/Documents` : undefined })
      }
      for (const s of draftRows) {
        const l = loanFor(s.customer_id)
        f.push({ icon: 'ai', text: `Spread ${s.period} financials — ${s.customers?.company}`, on: s.created_at, href: l ? `#/app/loans/${l.id}/Spreads` : undefined })
      }
      for (const r of reviews.filter(t => t.status === 'complete')) {
        f.push({ icon: 'ok', text: `Annual review package prepared — ${r.loans?.customers?.company ?? r.loans?.loan_number}`, on: r.due_date, href: `#/app/loans/${r.loan_id}/Compliance` })
      }
      setFeed(f.sort((a, b) => (a.on < b.on ? 1 : -1)).slice(0, 7))

      // Coming up: dated events in the next 90 days.
      const today = new Date().toISOString().slice(0, 10)
      const horizon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
      const within = (d: string | null): d is string => !!d && d >= today && d <= horizon
      const up: Upcoming[] = []
      for (const l of allLoans) {
        if (within(l.maturity)) up.push({ on: l.maturity, what: `${l.loan_number} matures`, loan_id: l.id, loan_number: l.loan_number })
        if (within(l.draw_period_end)) up.push({ on: l.draw_period_end, what: `${l.loan_number} draw period ends`, loan_id: l.id, loan_number: l.loan_number })
        if (within(l.rate_reset_date)) up.push({ on: l.rate_reset_date, what: `${l.loan_number} rate resets`, loan_id: l.id, loan_number: l.loan_number })
        if (within(l.io_end_date)) up.push({ on: l.io_end_date, what: `${l.loan_number} interest-only ends`, loan_id: l.id, loan_number: l.loan_number })
      }
      for (const t of ticks) {
        if ((t.status === 'open' || t.status === 'requested') && within(t.due_date))
          up.push({ on: t.due_date, what: `${t.requirement} (${t.responsible})`, loan_id: t.loan_id, loan_number: t.loans?.loan_number ?? '' })
      }
      setUpcoming(up.sort((a, b) => (a.on < b.on ? -1 : 1)).slice(0, 8))
    })
  }, [org.id])

  // ——— Computed, all from real rows ———
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    months.push(d.toISOString().slice(0, 7))
  }
  const nowMonth = months[months.length - 1]
  const cumAt = (m: string) =>
    loans.reduce((s, l) => {
      const om = l.origination_date ? (l.origination_date.slice(0, 7) > nowMonth ? nowMonth : l.origination_date.slice(0, 7)) : nowMonth
      return s + (om <= m ? Number(l.amount) : 0)
    }, 0)
  const exposureSeries = months.map(cumAt)
  // Prior-period comparison: the same cumulative curve, one year earlier.
  const priorMonths: string[] = []
  for (let i = 23; i >= 12; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    priorMonths.push(d.toISOString().slice(0, 7))
  }
  const priorSeries = priorMonths.map(cumAt)
  const expNow = exposureSeries[exposureSeries.length - 1] ?? 0
  const expThen = exposureSeries[0] ?? 0
  const expDelta = expThen ? ((expNow - expThen) / expThen) * 100 : null

  const todayStr = new Date().toISOString().slice(0, 10)
  const pastDueNow = loans.reduce((s, l) => s + (pastDueOf(payments, l.id)?.amount ?? 0), 0)
  const covPass = covenants.filter(c => c.status === 'Pass').length
  const covNear = covenants.filter(c => c.status === 'Near').length
  const covFail = covenants.filter(c => c.status === 'Fail').length
  const borrowerCount = new Set(loans.map(l => l.customer_id ?? l.id)).size
  const wtdDscr = dscrs.length ? dscrs.reduce((s, d) => s + d, 0) / dscrs.length : null
  const reviewsDue = annuals.filter(a => a.status !== 'complete' && a.status !== 'waived').length
  const nextMaturity = loans.map(l => l.maturity).filter((m): m is string => !!m && m >= todayStr).sort()[0]

  const mixColors = ['#4f63f5', '#7c5cd6', '#17803d', '#e07b39']
  const mix = [...new Set(loans.map(l => l.type))]
    .map(t => ({ type: t, total: loans.filter(l => l.type === t).reduce((s, l) => s + Number(l.amount), 0) }))
    .sort((a, b) => b.total - a.total)
  const mixMax = Math.max(...mix.map(m => m.total), 1)

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

  const covCal = covenants
    .filter(c => c.next_test)
    .sort((a, b) => (a.next_test! < b.next_test! ? -1 : 1))
    .slice(0, 6)
    .map(c => ({ ...c, loan: loans.find(l => l.id === c.loan_id) }))

  const GROUPS: { chip: string; label: string }[] = [
    { chip: 'past due', label: 'Past-due payments' },
    { chip: 'covenant', label: 'Covenant failures' },
    { chip: 'cash flow', label: 'Cash flow watch' },
    { chip: 'reporting', label: 'Reporting past due' },
    { chip: 'spread', label: 'Spreads awaiting review' },
    { chip: 'review', label: 'Annual reviews' },
  ]
  const dismiss = (it: Item) => setItems(prev => (prev ? prev.filter(x => x !== it) : prev))

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="hm">
      <div className="hm-main">
        <div className="crumbs2"><a href="#/app">{org.name}</a> / Home</div>
        <h1 className="hm-h1">
          {greeting}
          <span className="small">
            {items === null ? 'pulling your book together…'
              : items.length === 0 ? 'nothing needs you — the book is clean'
              : `${items.length} task${items.length > 1 ? 's' : ''} need a human`}
          </span>
        </h1>

        <div className="hm-sec">
          <b>Committed exposure</b>
          <span className="small">{money(expNow)}{expDelta !== null && expDelta > 0 ? ` · ▲ ${expDelta.toFixed(1)}% vs. a year ago` : ''}</span>
          <span className="spacer" />
          <span className="small">12 months</span>
        </div>
        <TrendChart series={exposureSeries} prior={priorSeries} labels={months} />

        <div className="hm-sec">
          <b>Tasks</b>
          <span className="small">what needs a human — the agents queued these</span>
          <span className="spacer" />
          <a className="btn-dark" href="#/app/screener" style={{ textDecoration: 'none' }}>Screen a package <Ico.chevron /></a>
        </div>
        {items === null ? <Skeleton rows={5} /> : items.length === 0 ? (
          <p className="small" style={{ padding: '14px 2px' }}><Ico.check /> All clear. Payments current, covenants passing, reporting up to date.</p>
        ) : (
          GROUPS.map(gr => {
            const group = items.filter(it => it.chip === gr.chip)
            if (!group.length) return null
            return (
              <div key={gr.chip}>
                <div className="task-group">{gr.label}</div>
                {group.map((it, i) => (
                  <div className="task-row" key={i}>
                    <button className="task-check" aria-label="Mark handled" onClick={() => dismiss(it)} />
                    <span className="t"><a href={it.href}>{it.text.split(' — ')[0]}</a>{it.text.includes(' — ') ? ` — ${it.text.split(' — ').slice(1).join(' — ')}` : ''}{it.who && <span className="small"> · {it.who}</span>}</span>
                    <span className="task-tag" style={{ background: TAGS[it.chip]?.bg, color: TAGS[it.chip]?.fg }}>{it.chip}</span>
                    <span className="task-when"><Ico.clock /> {it.when ? fmtDay(it.when) : it.sev === 0 ? 'now' : it.sev === 1 ? 'this week' : 'when free'}</span>
                  </div>
                ))}
              </div>
            )
          })
        )}

        <div className="hm-sec"><b>Activity</b><span className="small">what the agents completed</span></div>
        {feed.length === 0 && <p className="small" style={{ padding: '10px 2px' }}>Nothing yet — screen a package or upload documents and the agents get to work.</p>}
        {feed.map((fi, i) => (
          <div className="feed-row" key={i}>
            <span className={`feed-ic ${fi.icon}`}>{fi.icon === 'ok' ? <Ico.check /> : fi.icon === 'doc' ? <Ico.doc /> : <Ico.logo />}</span>
            <span className="ellipsis">{fi.href ? <a className="cell-link" href={fi.href}>{fi.text}</a> : fi.text}</span>
            <span className="when">{fmtAgo(fi.on)}</span>
          </div>
        ))}
      </div>

      <aside className="hm-rail">
        <div className="prof">
          <div className="prof-cover" />
          <div className="prof-body">
            <div className="prof-av">{(org.name || 'N').slice(0, 1).toUpperCase()}</div>
            <div className="prof-name">{org.name}</div>
            <div className="prof-sub">Commercial loan portfolio · {loans.length} loans · {borrowerCount} borrowers</div>
            <div className="prof-stats">
              <span><div className="l">Committed</div><div className="v">{fmtShort(expNow)}</div></span>
              <span><div className="l">Deposits</div><div className="v">{fmtShort(depTotal)}</div></span>
              <span><div className="l">Past due</div><div className="v" style={pastDueNow ? { color: 'var(--red)' } : undefined}>{pastDueNow ? fmtShort(pastDueNow) : '$0'}</div></span>
              <span><div className="l">Avg DSCR</div><div className="v">{wtdDscr ? `${wtdDscr.toFixed(2)}x` : '—'}</div></span>
            </div>
          </div>
        </div>

        <div className="rr-card">
          <div className="rr-head">Concentrations <span className="small">by commitment</span></div>
          <div style={{ paddingBottom: 10 }}>
            {mix.map((m, i) => (
              <div className="hbar" key={m.type}>
                <span className="l ellipsis" title={m.type}>{m.type}</span>
                <span className="track"><i style={{ width: `${(m.total / mixMax) * 100}%`, background: mixColors[i % mixColors.length] }} /></span>
                <b>{fmtShort(m.total)}</b>
              </div>
            ))}
          </div>
        </div>

        <details className="rr-card" open>
          <summary>Portfolio details</summary>
          <div className="kv2"><span className="k"><Ico.status /> Covenants</span><span>{covPass} pass · {covNear} near · {covFail} fail</span></div>
          <div className="kv2"><span className="k"><Ico.doc /> Reviews due</span><span>{reviewsDue || 'none'}</span></div>
          <div className="kv2"><span className="k"><Ico.percent /> Line utilization</span><span>{lineUtil}</span></div>
          <div className="kv2"><span className="k"><Ico.cal /> Next maturity</span><span>{nextMaturity ? fmtDay(nextMaturity) : '—'}</span></div>
          <div className="kv2"><span className="k"><Ico.shield /> DSCR &lt; 1.25x</span><span>{dscrs.filter(d => d < 1.25).length} relationship{dscrs.filter(d => d < 1.25).length === 1 ? '' : 's'}</span></div>
        </details>

        <details className="rr-card">
          <summary>Payments this week <span className="small">{weekPayments.length ? money(weekPayments.reduce((s, p) => s + p.amount, 0)) : 'none'}</span></summary>
          {weekPayments.length === 0 && <p className="small" style={{ padding: '6px 0 12px' }}>No payments due in the next 7 days.</p>}
          {weekPayments.map(p => (
            <div className="kv2" key={p.key}>
              <span className="k">{fmtDay(p.due_date)}</span>
              <a className="cell-link ellipsis" style={{ flex: 1 }} href={`#/app/loans/${p.loan?.id}/Payments`}>{p.loan?.customers?.company ?? '—'}</a>
              <span className="mono" style={{ fontSize: 12.5 }}>{money(p.amount)}</span>
            </div>
          ))}
        </details>

        <details className="rr-card">
          <summary>Covenant tests <span className="small">{covCal.length ? `next ${covCal.length}` : 'none scheduled'}</span></summary>
          {covCal.map(c => (
            <div className="kv2" key={c.id}>
              <span className="k">{fmtDay(c.next_test!)}</span>
              <a className="cell-link ellipsis" style={{ flex: 1 }} href={`#/app/loans/${c.loan_id}/Compliance`}>{c.name}</a>
              <span className={`status ${c.status === 'Fail' ? 's-red' : c.status === 'Near' ? 's-amber' : 's-gray'}`}>{c.status}</span>
            </div>
          ))}
        </details>

        <details className="rr-card">
          <summary>Coming up <span className="small">next 90 days</span></summary>
          {upcoming.length === 0 && <p className="small" style={{ padding: '6px 0 12px' }}>Nothing on the calendar.</p>}
          {upcoming.map((u, i) => (
            <div className="kv2" key={i}>
              <span className="k">{fmtDay(u.on)}</span>
              <a className="cell-link ellipsis" style={{ flex: 1 }} href={`#/app/loans/${u.loan_id}`}>{u.what}</a>
            </div>
          ))}
        </details>
      </aside>
    </div>
  )
}
