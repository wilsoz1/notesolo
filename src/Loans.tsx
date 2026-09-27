// Portfolio — the book as a flat list of loan numbers. The loan is the unit of work:
// everything about a borrower (contact, guarantors, cash flow, deposits) is reached
// through the loan's detail page, never a separate section.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, DbLoan, Org, Payment, PaymentType, money, pastDueOf } from './supabase'
import { ModifyButton } from './Modify'
import { ImportBook } from './ImportBook'
import { Ico } from './Icons'

const PAYMENT_TYPES: PaymentType[] = ['P&I', 'I/O', 'Deferred', 'I/O Deferred', 'Construction']
const stageCls: Record<string, string> = {
  Servicing: 's-green', Closing: 's-amber', Approval: 's-amber', Underwriting: 's-blue', Application: 's-gray',
}
// Payment structure is a fact, not an alert — always monochrome.
const payCls: Record<PaymentType, string> = {
  'P&I': 's-gray', 'I/O': 's-gray', Deferred: 's-gray', 'I/O Deferred': 's-gray', Construction: 's-gray',
}
export const fmtDate = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

type Review = 'Covenant' | 'Annual review'
type Filters = {
  pay: Set<PaymentType>
  reviews: Set<Review>
  pastDueOnly: boolean
  inDraw: boolean
}
const EMPTY: Filters = { pay: new Set(), reviews: new Set(), pastDueOnly: false, inDraw: false }

type SortKey = 'loan' | 'borrower' | 'type' | 'stage' | 'payment' | 'pastdue' | 'amount' | 'rate' | 'maturity' | 'drawend' | 'rm'

// "7.10% fixed" → 7.10 · "SOFR + 325" → 3.25 · "Prime + 75" → 0.75 — good enough to order by.
const rateKey = (r: string | null) => {
  const n = parseFloat(r?.match(/[\d.]+/)?.[0] ?? '')
  if (!Number.isFinite(n)) return -1
  return n > 50 ? n / 100 : n
}

export default function Loans({ org }: { org: Org }) {
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [reviewMap, setReviewMap] = useState<Record<string, Review[]>>({})
  const [loading, setLoading] = useState(true)
  const [f, setF] = useState<Filters>(EMPTY)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'loan', dir: 1 })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('loans').select('*, customers(name, company, email, phone)').order('loan_number'),
      supabase.from('loan_payments').select('id, loan_id, due_date, amount, status, paid_date'),
      supabase.from('covenants').select('loan_id'),
      supabase.from('ticklers').select('loan_id, requirement'),
    ]).then(([l, p, cov, tick]) => {
      setLoans((l.data as DbLoan[]) ?? [])
      setPayments((p.data as Payment[]) ?? [])
      // A loan is under covenant review if it has covenants; under annual review if a tickler says so.
      const map: Record<string, Review[]> = {}
      for (const c of (cov.data as { loan_id: string }[]) ?? []) {
        if (!map[c.loan_id]?.includes('Covenant')) map[c.loan_id] = [...(map[c.loan_id] ?? []), 'Covenant']
      }
      for (const t of (tick.data as { loan_id: string; requirement: string }[]) ?? []) {
        if (/annual review/i.test(t.requirement) && !map[t.loan_id]?.includes('Annual review'))
          map[t.loan_id] = [...(map[t.loan_id] ?? []), 'Annual review']
      }
      setReviewMap(map)
      setLoading(false)
    })
  }, [org.id, reloadKey])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!popRef.current?.contains(e.target as Node)) setFiltersOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const rows = useMemo(() => {
    const val = (l: DbLoan): string | number => {
      switch (sort.key) {
        case 'loan': return l.loan_number
        case 'borrower': return l.customers?.company ?? ''
        case 'type': return l.type
        case 'stage': return l.stage === 'Servicing' ? 'Active' : l.stage
        case 'payment': return l.payment_type
        case 'pastdue': return pastDueOf(payments, l.id)?.days ?? -1
        case 'amount': return Number(l.amount)
        case 'rate': return rateKey(l.rate)
        case 'maturity': return l.maturity ?? ''
        case 'drawend': return l.draw_period_end ?? ''
        case 'rm': return l.rm ?? ''
      }
    }
    return loans
      .filter(l => {
        if (f.pay.size && !f.pay.has(l.payment_type)) return false
        if (f.pastDueOnly && !pastDueOf(payments, l.id)) return false
        if (f.inDraw && !(l.draw_period_end && l.draw_period_end >= today)) return false
        if (f.reviews.size && ![...f.reviews].every(r => reviewMap[l.id]?.includes(r))) return false
        return true
      })
      .sort((a, b) => {
        const va = val(a), vb = val(b)
        const cmp = typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true })
        return cmp * sort.dir
      })
  }, [loans, payments, reviewMap, f, sort, today])

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'amount' || key === 'pastdue' ? -1 : 1 }))

  const togglePay = (p: PaymentType) => {
    const pay = new Set(f.pay)
    pay.has(p) ? pay.delete(p) : pay.add(p)
    setF({ ...f, pay })
  }
  const toggleReview = (r: Review) => {
    const reviews = new Set(f.reviews)
    reviews.has(r) ? reviews.delete(r) : reviews.add(r)
    setF({ ...f, reviews })
  }
  const activeCount = f.pay.size + f.reviews.size + (f.pastDueOnly ? 1 : 0) + (f.inDraw ? 1 : 0)
  const pastDueCount = loans.filter(l => pastDueOf(payments, l.id)).length

  const Th = ({ label, k, num }: { label: string; k: SortKey; num?: boolean }) => (
    <th className={num ? 'num' : undefined}
      aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
      onClick={() => toggleSort(k)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      title={`Sort by ${label.toLowerCase()}`}>
      {label}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
    </th>
  )

  if (loading) return <p className="subtitle">Loading portfolio…</p>

  return (
    <>
      <h1>Portfolio</h1>
      <p className="subtitle">
        {rows.length} of {loans.length} loans · {money(rows.reduce((s, l) => s + Number(l.amount), 0))} shown.
        Open a loan for everything on it — borrower, guarantors, cash flow, documents.
      </p>

      <div className="filters">
        <div ref={popRef} style={{ position: 'relative', display: 'inline-block' }}>
          <button className={activeCount ? 'btn-dark' : 'btn-light'} onClick={() => setFiltersOpen(o => !o)}
            aria-expanded={filtersOpen} aria-haspopup="true">
            <Ico.sort /> Filters{activeCount ? ` · ${activeCount}` : ''}
          </button>
          {filtersOpen && (
            <div className="share-pop" style={{ left: 0, right: 'auto', width: 300 }} role="dialog" aria-label="Portfolio filters">
              <b className="small" style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>Payment structure</b>
              {PAYMENT_TYPES.map(p => (
                <label className="share-doc" key={p}>
                  <input type="checkbox" checked={f.pay.has(p)} onChange={() => togglePay(p)} /> {p}
                </label>
              ))}
              <b className="small" style={{ textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginTop: 12 }}>Reviews</b>
              {(['Covenant', 'Annual review'] as Review[]).map(r => (
                <label className="share-doc" key={r}>
                  <input type="checkbox" checked={f.reviews.has(r)} onChange={() => toggleReview(r)} /> {r}
                </label>
              ))}
              <b className="small" style={{ textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginTop: 12 }}>Status</b>
              <label className="share-doc">
                <input type="checkbox" checked={f.pastDueOnly} onChange={() => setF({ ...f, pastDueOnly: !f.pastDueOnly })} /> Past due ({pastDueCount})
              </label>
              <label className="share-doc">
                <input type="checkbox" checked={f.inDraw} onChange={() => setF({ ...f, inDraw: !f.inDraw })} /> In draw period
              </label>
              {activeCount > 0 && (
                <button className="btn-light" style={{ marginTop: 12 }}
                  onClick={() => setF({ pay: new Set(), reviews: new Set(), pastDueOnly: false, inDraw: false })}>
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
        {activeCount > 0 && (
          <span className="small">
            {[...f.pay, ...f.reviews, ...(f.pastDueOnly ? ['Past due'] : []), ...(f.inDraw ? ['In draw period'] : [])].join(' · ')}
          </span>
        )}
        <span className="spacer" />
        <ImportBook org={org} onDone={() => setReloadKey(k => k + 1)} />
      </div>

      <div className="grid">
        <table>
          <thead><tr>
            <Th label="Loan" k="loan" />
            <Th label="Borrower" k="borrower" />
            <Th label="Type" k="type" />
            <Th label="Stage" k="stage" />
            <Th label="Payment" k="payment" />
            <th>Reviews</th>
            <Th label="Past due" k="pastdue" />
            <Th label="Amount" k="amount" num />
            <Th label="Rate" k="rate" />
            <Th label="Maturity" k="maturity" />
            <Th label="Draw period end" k="drawend" />
            <Th label="RM" k="rm" />
            <th></th>
          </tr></thead>
          <tbody>
            {rows.map(l => {
              const pd = pastDueOf(payments, l.id)
              return (
                <tr key={l.id} className="rowlink" onClick={() => (window.location.hash = `#/app/loans/${l.id}`)}>
                  <td className="mono"><a className="cell-link" href={`#/app/loans/${l.id}`}>{l.loan_number}</a></td>
                  <td className="ellipsis" title={l.customers?.company ?? undefined}>
                    {l.customer_id
                      ? <a className="cell-link" href={`#/app/loans/${l.id}/Borrower`} onClick={e => e.stopPropagation()}>{l.customers?.company ?? '—'}</a>
                      : '—'}
                  </td>
                  <td>{l.type}</td>
                  <td><span className={`status ${stageCls[l.stage] ?? 's-gray'}`}>{l.stage === 'Servicing' ? 'Active' : l.stage}</span></td>
                  <td><span className={`status ${payCls[l.payment_type]}`}>{l.payment_type}</span></td>
                  <td>{reviewMap[l.id]?.length
                    ? reviewMap[l.id].map(r => <span key={r} className="pill" style={{ marginRight: 4 }}>{r}</span>)
                    : <span className="small">—</span>}</td>
                  <td>{pd ? <span className="status s-red"><Ico.x /> {pd.days}d · {money(pd.amount)}</span>
                    : payments.some(p => p.loan_id === l.id) ? <span className="status s-green"><Ico.check /> Current</span>
                    : <span className="small">—</span>}</td>
                  <td className="num mono">{money(l.amount)}</td>
                  <td className="mono">{l.rate ?? '—'}</td>
                  <td>{fmtDate(l.maturity)}</td>
                  <td>{fmtDate(l.draw_period_end)}</td>
                  <td>{l.rm ?? '—'}</td>
                  <td onClick={e => e.stopPropagation()}><ModifyButton org={org} loan={l} small /></td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={13} className="small">No loans match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
