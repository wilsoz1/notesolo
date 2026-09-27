// Reports — the portfolio as one entity. Every borrower's reviewed spreads roll up
// into a combined income statement and balance sheet, cohort cuts, and deterministic
// findings ("operating entities above $1MM reduced receipts 2.2%") — the aggregation
// work no analyst has time to do by hand, computed from real rows, never guessed.
import { useEffect, useMemo, useState } from 'react'
import { supabase, Org, Customer, DbLoan, Spread, SPREAD_LINES, money } from './supabase'
import { Skeleton } from './dialogs'
import { Ico } from './Icons'

const pct = (v: number, digits = 1) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`
const fyYear = (period: string) => period.match(/^FY (\d{4})$/)?.[1] ?? null

type Entity = {
  customer: Customer
  loanId: string | null
  loanType: string | null
  byYear: Record<string, Record<string, number | null>>
  years: string[]
}

export default function Reports({ org }: { org: Org }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null)
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [spreads, setSpreads] = useState<Spread[]>([])
  const [threshold, setThreshold] = useState(1_000_000)

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('*'),
      supabase.from('loans').select('*, customers(company)'),
      supabase.from('financial_spreads').select('*').eq('status', 'reviewed'),
    ]).then(([c, l, s]) => {
      setCustomers((c.data as Customer[]) ?? [])
      setLoans((l.data as DbLoan[]) ?? [])
      setSpreads((s.data as Spread[]) ?? [])
    })
  }, [org.id])

  const model = useMemo(() => {
    if (!customers) return null
    // One entity per borrower: reviewed FY spreads keyed by year (newest reviewed wins a year).
    const entities: Entity[] = customers.map(c => {
      const byYear: Record<string, Record<string, number | null>> = {}
      for (const s of spreads.filter(x => x.customer_id === c.id)) {
        const y = fyYear(s.period)
        if (y) byYear[y] = Object.fromEntries(SPREAD_LINES.map(([k]) => [k, s.data[k] == null ? null : Number(s.data[k])]))
      }
      const custLoans = loans.filter(l => l.customer_id === c.id).sort((a, b) => Number(b.amount) - Number(a.amount))
      return { customer: c, loanId: custLoans[0]?.id ?? null, loanType: custLoans[0]?.type ?? null, byYear, years: Object.keys(byYear).sort() }
    }).filter(e => e.years.length > 0)

    const allYears = [...new Set(entities.flatMap(e => e.years))].sort()
    // Portfolio combined statement: sum each line per year across entities reporting that year.
    const combined: Record<string, Record<string, number>> = {}
    const reporting: Record<string, number> = {}
    for (const y of allYears) {
      combined[y] = {}
      reporting[y] = entities.filter(e => e.byYear[y]).length
      for (const [k] of SPREAD_LINES) {
        combined[y][k] = entities.reduce((s, e) => s + (e.byYear[y]?.[k] ?? 0), 0)
      }
    }

    // YoY on a MATCHED sample: only entities reporting both of the two latest years,
    // so the delta measures performance, not coverage changes.
    const [prevY, lastY] = allYears.slice(-2).length === 2 ? allYears.slice(-2) : [null, null]
    const matched = prevY && lastY ? entities.filter(e => e.byYear[prevY] && e.byYear[lastY]) : []
    const matchedSum = (year: string, k: string) => matched.reduce((s, e) => s + (e.byYear[year]?.[k] ?? 0), 0)
    const yoy = (k: string) => {
      if (!prevY || !lastY) return null
      const a = matchedSum(prevY, k), b = matchedSum(lastY, k)
      return a ? (b - a) / Math.abs(a) : null
    }

    const cohortStats = (list: Entity[]) => {
      const m = prevY && lastY ? list.filter(e => e.byYear[prevY] && e.byYear[lastY]) : []
      const sum = (y: string, k: string) => m.reduce((s, e) => s + (e.byYear[y]?.[k] ?? 0), 0)
      const revPrev = prevY ? sum(prevY, 'revenue') : 0
      const revLast = lastY ? sum(lastY, 'revenue') : 0
      const latestRev = list.reduce((s, e) => s + (e.byYear[e.years[e.years.length - 1]]?.revenue ?? 0), 0)
      return {
        n: list.length, matchedN: m.length, latestRev,
        revYoY: revPrev ? (revLast - revPrev) / Math.abs(revPrev) : null,
        ebitdaYoY: prevY && sum(prevY, 'ebitda') ? (sum(lastY!, 'ebitda') - sum(prevY, 'ebitda')) / Math.abs(sum(prevY, 'ebitda')) : null,
      }
    }
    const latestRevOf = (e: Entity) => e.byYear[e.years[e.years.length - 1]]?.revenue ?? 0
    const above = entities.filter(e => latestRevOf(e) > threshold)
    const below = entities.filter(e => latestRevOf(e) <= threshold)
    const byType = [...new Set(entities.map(e => e.loanType).filter(Boolean))].map(t => ({
      type: t as string, ...cohortStats(entities.filter(e => e.loanType === t)),
    }))

    // Deterministic findings, most material first — every figure traceable to the tables below.
    const findings: string[] = []
    if (prevY && lastY) {
      const r = yoy('revenue')
      if (r !== null) findings.push(`Portfolio receipts ${r >= 0 ? 'grew' : 'fell'} ${pct(Math.abs(r) * Math.sign(r)).replace('+', '')} ${lastY} vs ${prevY} across the ${matched.length} entities reporting both years.`)
      const a = cohortStats(above)
      if (a.revYoY !== null && a.matchedN) findings.push(`Operating entities with revenues above ${money(threshold)} ${a.revYoY >= 0 ? 'increased' : 'reduced'} receipts ${(Math.abs(a.revYoY) * 100).toFixed(1)}% over the portfolio period (${a.matchedN} entit${a.matchedN === 1 ? 'y' : 'ies'}).`)
      const b = cohortStats(below)
      if (b.revYoY !== null && b.matchedN) findings.push(`Entities at or below ${money(threshold)} ${b.revYoY >= 0 ? 'increased' : 'reduced'} receipts ${(Math.abs(b.revYoY) * 100).toFixed(1)}% (${b.matchedN} entit${b.matchedN === 1 ? 'y' : 'ies'}).`)
      for (const e of matched) {
        const mp = e.byYear[prevY], ml = e.byYear[lastY]
        const marginPrev = mp.revenue ? (mp.ebitda ?? 0) / mp.revenue : null
        const marginLast = ml.revenue ? (ml.ebitda ?? 0) / ml.revenue : null
        if (marginPrev !== null && marginLast !== null && marginLast < marginPrev - 0.02)
          findings.push(`${e.customer.company}: EBITDA margin compressed ${((marginPrev - marginLast) * 100).toFixed(1)} pts (${(marginPrev * 100).toFixed(1)}% → ${(marginLast * 100).toFixed(1)}%).`)
        const levPrev = mp.ebitda ? (mp.total_debt ?? 0) / mp.ebitda : null
        const levLast = ml.ebitda ? (ml.total_debt ?? 0) / ml.ebitda : null
        if (levPrev !== null && levLast !== null && levLast > levPrev + 0.5)
          findings.push(`${e.customer.company}: leverage rose to ${levLast.toFixed(1)}x Debt/EBITDA from ${levPrev.toFixed(1)}x.`)
        if (ml.net_income && ml.distributions && ml.distributions > ml.net_income * 0.6)
          findings.push(`${e.customer.company}: distributions took ${((ml.distributions / ml.net_income) * 100).toFixed(0)}% of ${lastY} net income.`)
      }
    }

    return { entities, allYears, combined, reporting, prevY, lastY, matched, yoy, above, below, byType, findings,
             aboveStats: cohortStats(above), belowStats: cohortStats(below) }
  }, [customers, loans, spreads, threshold])

  if (!customers || !model) return <><h1>Reports</h1><Skeleton rows={6} /></>
  const { entities, allYears, combined, reporting, prevY, lastY, yoy, byType, findings, aboveStats, belowStats } = model
  const derived = (y: string) => ({
    margin: combined[y].revenue ? combined[y].ebitda / combined[y].revenue : null,
    leverage: combined[y].ebitda ? combined[y].total_debt / combined[y].ebitda : null,
  })

  return (
    <>
      <h1>Reports</h1>
      <p className="subtitle">
        The whole book as one entity — combined financials, cohort cuts and findings, computed from
        {' '}{entities.length} of {customers.length} borrowers with reviewed fiscal-year spreads. Nothing here is estimated.
      </p>

      {findings.length > 0 && (
        <div className="grid" style={{ marginBottom: 20 }}>
          <div className="uw-head"><span><b>Findings</b> <span className="small">deterministic — every figure ties to the tables below</span></span></div>
          {findings.map((f, i) => (
            <div className="wq-row" key={i}><span className="dot2 info" /><span style={{ flex: 1 }}>{f}</span></div>
          ))}
        </div>
      )}

      <div className="two-col">
        <div className="grid" style={{ marginBottom: 20 }}>
          <div className="uw-head">
            <span><b>Cohorts by revenue</b> <span className="small">matched entities, {prevY && lastY ? `${lastY} vs ${prevY}` : 'one year of data'}</span></span>
            <label className="small">Threshold $<input type="number" value={threshold} step={250000} min={0}
              onChange={e => setThreshold(Number(e.target.value) || 0)}
              style={{ width: 110, marginLeft: 4, font: 'inherit', background: 'var(--card-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 7px' }} /></label>
          </div>
          <table>
            <thead><tr><th>Cohort</th><th className="num">Entities</th><th className="num">Latest revenue</th><th className="num">Receipts YoY</th><th className="num">EBITDA YoY</th></tr></thead>
            <tbody>
              <tr>
                <td>Above {money(threshold)}</td><td className="num">{model.above.length}</td>
                <td className="num mono">{money(aboveStats.latestRev)}</td>
                <td className="num mono">{aboveStats.revYoY === null ? '—' : pct(aboveStats.revYoY)}</td>
                <td className="num mono">{aboveStats.ebitdaYoY === null ? '—' : pct(aboveStats.ebitdaYoY)}</td>
              </tr>
              <tr>
                <td>At or below {money(threshold)}</td><td className="num">{model.below.length}</td>
                <td className="num mono">{money(belowStats.latestRev)}</td>
                <td className="num mono">{belowStats.revYoY === null ? '—' : pct(belowStats.revYoY)}</td>
                <td className="num mono">{belowStats.ebitdaYoY === null ? '—' : pct(belowStats.ebitdaYoY)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid" style={{ marginBottom: 20 }}>
          <div className="uw-head"><span><b>Cohorts by loan type</b> <span className="small">each borrower under its largest loan</span></span></div>
          <table>
            <thead><tr><th>Type</th><th className="num">Entities</th><th className="num">Latest revenue</th><th className="num">Receipts YoY</th></tr></thead>
            <tbody>
              {byType.map(t => (
                <tr key={t.type}>
                  <td>{t.type}</td><td className="num">{t.n}</td>
                  <td className="num mono">{money(t.latestRev)}</td>
                  <td className="num mono">{t.revYoY === null ? '—' : pct(t.revYoY)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid" style={{ marginBottom: 20 }}>
        <div className="uw-head"><span><b>Combined income statement &amp; balance sheet</b> <span className="small">
          {allYears.map(y => `${y}: ${reporting[y]} reporting`).join(' · ')}{prevY && lastY ? ` · YoY on the ${model.matched.length} entities in both years` : ''}
        </span></span></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Line</th>{allYears.map(y => <th key={y} className="num">FY {y}</th>)}{prevY && lastY && <th className="num">YoY (matched)</th>}</tr></thead>
            <tbody>
              {SPREAD_LINES.map(([k, label]) => (
                <tr key={k} style={k === 'ebitda' || k === 'net_income' ? { fontWeight: 600 } : undefined}>
                  <td>{label}</td>
                  {allYears.map(y => <td key={y} className="num mono">{money(combined[y][k])}</td>)}
                  {prevY && lastY && <td className="num mono">{(() => { const d = yoy(k); return d === null ? '—' : pct(d) })()}</td>}
                </tr>
              ))}
              <tr>
                <td className="small">EBITDA margin</td>
                {allYears.map(y => { const d = derived(y); return <td key={y} className="num mono small">{d.margin === null ? '—' : `${(d.margin * 100).toFixed(1)}%`}</td> })}
                {prevY && lastY && <td className="num small">—</td>}
              </tr>
              <tr>
                <td className="small">Debt / EBITDA</td>
                {allYears.map(y => { const d = derived(y); return <td key={y} className="num mono small">{d.leverage === null ? '—' : `${d.leverage.toFixed(2)}x`}</td> })}
                {prevY && lastY && <td className="num small">—</td>}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid">
        <div className="uw-head"><span><b>By entity</b> <span className="small">latest fiscal year, sorted by revenue</span></span></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr>
              <th>Entity</th><th>Latest FY</th><th className="num">Revenue</th><th className="num">Rev YoY</th>
              <th className="num">EBITDA</th><th className="num">Margin</th><th className="num">Total debt</th>
              <th className="num">Debt/EBITDA</th><th className="num">TNW</th>
            </tr></thead>
            <tbody>
              {[...entities].sort((a, b) => (b.byYear[b.years[b.years.length - 1]]?.revenue ?? 0) - (a.byYear[a.years[a.years.length - 1]]?.revenue ?? 0)).map(e => {
                const last = e.years[e.years.length - 1], prev = e.years[e.years.length - 2]
                const L = e.byYear[last], P = prev ? e.byYear[prev] : null
                const revYoY = P?.revenue && L.revenue ? (L.revenue - P.revenue) / Math.abs(P.revenue) : null
                const margin = L.revenue ? (L.ebitda ?? 0) / L.revenue : null
                const lev = L.ebitda ? (L.total_debt ?? 0) / L.ebitda : null
                return (
                  <tr key={e.customer.id}>
                    <td>{e.loanId
                      ? <a className="cell-link" href={`#/app/loans/${e.loanId}/Borrower`}>{e.customer.company ?? e.customer.name}</a>
                      : (e.customer.company ?? e.customer.name)}</td>
                    <td className="mono small">FY {last}</td>
                    <td className="num mono">{L.revenue == null ? '—' : money(L.revenue)}</td>
                    <td className="num mono">{revYoY === null ? '—' : pct(revYoY)}</td>
                    <td className="num mono">{L.ebitda == null ? '—' : money(L.ebitda)}</td>
                    <td className="num mono">{margin === null ? '—' : `${(margin * 100).toFixed(1)}%`}</td>
                    <td className="num mono">{L.total_debt == null ? '—' : money(L.total_debt)}</td>
                    <td className="num mono">{lev === null ? '—' : `${lev.toFixed(2)}x`}</td>
                    <td className="num mono">{L.tangible_net_worth == null ? '—' : money(L.tangible_net_worth)}</td>
                  </tr>
                )
              })}
              {!entities.length && <tr><td colSpan={9} className="small">No reviewed fiscal-year spreads yet — review draft spreads on your loans and this report builds itself.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="small" style={{ padding: '8px 14px' }}>
          <Ico.shield /> Sources: each borrower's newest reviewed spread per fiscal year. Year-over-year figures use only
          entities reporting both years, so coverage changes never masquerade as performance.
        </p>
      </div>
    </>
  )
}
