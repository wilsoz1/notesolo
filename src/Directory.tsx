// The relationship directories: Businesses, Guarantors, Deposits — each a real
// page over the same book, linking back to loans (the loan number is the address).
import { useEffect, useState } from 'react'
import { supabase, Org, DbLoan, Guarantor, Deposit, money, daysLate } from './supabase'
import { fmtDate } from './Loans'
import { Skeleton } from './dialogs'

type Cust = { id: string; name: string | null; company: string | null; email: string | null; phone: string | null }

export function Businesses({ org }: { org: Org }) {
  const [loans, setLoans] = useState<DbLoan[]>([])
  const [customers, setCustomers] = useState<Cust[] | null>(null)
  const [deposits, setDeposits] = useState<{ customer_id: string | null; balance: number }[]>([])
  const [guarantors, setGuarantors] = useState<(Guarantor & { loans: { customer_id: string | null } | null })[]>([])

  useEffect(() => {
    Promise.all([
      supabase.from('customers').select('id, name, company, email, phone').order('company'),
      supabase.from('loans').select('*'),
      supabase.from('deposits').select('customer_id, balance'),
      supabase.from('guarantors').select('*, loans(customer_id)'),
    ]).then(([c, l, d, g]) => {
      setCustomers((c.data as Cust[]) ?? [])
      setLoans((l.data as DbLoan[]) ?? [])
      setDeposits((d.data as { customer_id: string | null; balance: number }[]) ?? [])
      setGuarantors((g.data as (Guarantor & { loans: { customer_id: string | null } | null })[]) ?? [])
    })
  }, [org.id])

  if (!customers) return <><h1>Businesses</h1><Skeleton rows={5} /></>

  const rows = customers.map(c => {
    const cl = loans.filter(l => l.customer_id === c.id)
    const biggest = [...cl].sort((a, b) => Number(b.amount) - Number(a.amount))[0]
    return {
      c,
      loans: cl.length,
      committed: cl.reduce((s, l) => s + Number(l.amount), 0),
      deposits: deposits.filter(d => d.customer_id === c.id).reduce((s, d) => s + Number(d.balance), 0),
      guarantors: new Set(guarantors.filter(g => g.loans?.customer_id === c.id).map(g => g.name)).size,
      href: biggest ? `#/app/loans/${biggest.id}/Borrower` : null,
    }
  }).sort((a, b) => b.committed - a.committed)

  return (
    <>
      <h1>Businesses</h1>
      <p className="subtitle">{rows.length} borrower relationship{rows.length === 1 ? '' : 's'} · {money(rows.reduce((s, r) => s + r.committed, 0))} committed · open one for contact, guarantors, cash flow and documents.</p>
      <div className="grid">
        <table>
          <thead><tr><th>Business</th><th>Contact</th><th className="num">Loans</th><th className="num">Committed</th><th className="num">Deposits</th><th className="num">Guarantors</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.c.id} className="rowlink" onClick={() => r.href && (window.location.hash = r.href.slice(1))}>
                <td>{r.href ? <a className="cell-link" href={r.href}>{r.c.company ?? r.c.name}</a> : (r.c.company ?? r.c.name)}</td>
                <td className="small">{r.c.name ?? '—'}{r.c.email ? ` · ${r.c.email}` : ''}</td>
                <td className="num mono">{r.loans}</td>
                <td className="num mono">{money(r.committed)}</td>
                <td className="num mono">{r.deposits ? money(r.deposits) : '—'}</td>
                <td className="num mono">{r.guarantors || '—'}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="small">No borrowers yet — screen a package or import a book.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function Guarantors({ org }: { org: Org }) {
  const [rows, setRows] = useState<(Guarantor & { loans: { id: string; loan_number: string; customers: { company: string | null } | null } | null })[] | null>(null)

  useEffect(() => {
    supabase.from('guarantors').select('*, loans(id, loan_number, customers(company))').order('name')
      .then(({ data }) => setRows((data as typeof rows) ?? []))
  }, [org.id])

  if (!rows) return <><h1>Guarantors</h1><Skeleton rows={5} /></>

  // One row per person, their guarantees collected.
  const people = new Map<string, { g: (typeof rows)[number]; loans: { id: string; loan_number: string; company: string | null }[] }>()
  for (const g of rows) {
    const cur = people.get(g.name)
    const loan = g.loans ? { id: g.loans.id, loan_number: g.loans.loan_number, company: g.loans.customers?.company ?? null } : null
    if (cur) { if (loan) cur.loans.push(loan) }
    else people.set(g.name, { g, loans: loan ? [loan] : [] })
  }
  const list = [...people.values()].sort((a, b) => Number(b.g.net_worth ?? 0) - Number(a.g.net_worth ?? 0))
  const stale = list.filter(p => p.g.pfs_date && daysLate(p.g.pfs_date) > 365).length

  return (
    <>
      <h1>Guarantors</h1>
      <p className="subtitle">{list.length} guarantor{list.length === 1 ? '' : 's'} across the book{stale ? ` · ${stale} with a PFS over a year old` : ' · PFS files current'}.</p>
      <div className="grid">
        <table>
          <thead><tr><th>Name</th><th>Guarantees</th><th>Latest PFS</th><th className="num">Net worth</th><th className="num">Liquidity</th></tr></thead>
          <tbody>
            {list.map(({ g, loans }) => (
              <tr key={g.name}>
                <td><b>{g.name}</b></td>
                <td className="small">
                  {loans.map((l, i) => (
                    <span key={l.id}>{i > 0 && ' · '}<a className="cell-link" href={`#/app/loans/${l.id}/Structure`}>{l.loan_number}</a>{l.company ? ` (${l.company})` : ''}</span>
                  ))}
                  {!loans.length && '—'}
                </td>
                <td>{fmtDate(g.pfs_date)}{g.pfs_date && daysLate(g.pfs_date) > 365 && <span className="status s-amber" style={{ marginLeft: 6 }}>Stale</span>}</td>
                <td className="num mono">{g.net_worth ? money(Number(g.net_worth)) : '—'}</td>
                <td className="num mono">{g.liquidity ? money(Number(g.liquidity)) : '—'}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={5} className="small">No guarantors recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}

export function Deposits({ org }: { org: Org }) {
  const [rows, setRows] = useState<(Deposit & { customers: { company: string | null } | null })[] | null>(null)

  useEffect(() => {
    supabase.from('deposits').select('*, customers(company)').order('balance', { ascending: false })
      .then(({ data }) => setRows((data as typeof rows) ?? []))
  }, [org.id])

  if (!rows) return <><h1>Deposits</h1><Skeleton rows={5} /></>
  const total = rows.reduce((s, d) => s + Number(d.balance), 0)

  return (
    <>
      <h1>Deposits</h1>
      <p className="subtitle">{rows.length} account{rows.length === 1 ? '' : 's'} · {money(total)} on deposit across lending relationships.</p>
      <div className="grid">
        <table>
          <thead><tr><th>Account</th><th>Type</th><th>Business</th><th>Opened</th><th className="num">Balance</th></tr></thead>
          <tbody>
            {rows.map(d => (
              <tr key={d.id}>
                <td><b>{d.account_name}</b></td>
                <td><span className="pill">{d.type.replace('_', ' ')}</span></td>
                <td className="small">{d.customers?.company ?? '—'}</td>
                <td className="small">{fmtDate(d.opened)}</td>
                <td className="num mono">{money(Number(d.balance))}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="small">No deposit accounts on file.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  )
}
