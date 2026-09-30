// Import an existing book from a CSV export — the first thing a real bank asks for.
// Headers are matched by name (loan number, borrower, amount, rate, maturity…),
// rows are previewed before anything writes, and borrowers dedupe by company name.
import { useRef, useState } from 'react'
import { supabase, Org, PaymentType, money } from './supabase'
import { toast } from './dialogs'
import { Ico } from './Icons'

// Simple CSV parser handling quoted fields and commas inside quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') inQ = false
      else cell += ch
    } else if (ch === '"') inQ = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(c => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some(c => c.trim() !== '')) rows.push(row)
  return rows
}

// Column synonyms → our fields. Matching is case/space/punctuation-insensitive.
const COLS: Record<string, string[]> = {
  loan_number: ['loannumber', 'loanno', 'loanid', 'loan', 'notenumber', 'accountnumber', 'account'],
  company: ['borrower', 'company', 'borrowername', 'customer', 'entity', 'name'],
  contact: ['contact', 'contactname', 'primarycontact'],
  email: ['email', 'contactemail', 'borroweremail'],
  type: ['type', 'loantype', 'producttype', 'product'],
  amount: ['amount', 'commitment', 'originalamount', 'loanamount', 'originalbalance'],
  current_balance: ['currentbalance', 'balance', 'outstandingbalance', 'principalbalance', 'outstanding'],
  rate: ['rate', 'interestrate', 'noterate'],
  maturity: ['maturity', 'maturitydate', 'matdate'],
  origination_date: ['originationdate', 'notedate', 'fundeddate', 'origdate', 'opened'],
  payment_type: ['paymenttype', 'paymentstructure', 'pmttype'],
  next_payment_amount: ['nextpaymentamount', 'paymentamount', 'monthlypayment', 'pipayment'],
  next_payment_date: ['nextpaymentdate', 'nextduedate', 'duedate'],
  draw_period_end: ['drawperiodend', 'drawend', 'drawexpiration'],
  rm: ['rm', 'officer', 'loanofficer', 'relationshipmanager'],
  collateral: ['collateral', 'collateraldescription', 'security'],
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const num = (s: string) => {
  const n = Number(s.replace(/[$,()\s]/g, ''))
  return Number.isFinite(n) && s.trim() !== '' ? (s.includes('(') ? -n : n) : null
}
const dateOf = (s: string) => {
  if (!s.trim()) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const PAY_TYPES: PaymentType[] = ['P&I', 'I/O', 'Deferred', 'I/O Deferred', 'Construction']
const payTypeOf = (s: string): PaymentType => {
  const n = norm(s)
  if (n.includes('construction')) return 'Construction'
  if (n.includes('io') && n.includes('def')) return 'I/O Deferred'
  if (n === 'io' || n.includes('interestonly')) return 'I/O'
  if (n.includes('def')) return 'Deferred'
  return 'P&I'
}
const loanTypeOf = (s: string) => {
  const n = norm(s)
  if (n.includes('start')) return 'Start-up loan'
  if (n.includes('expan') || n.includes('equip') || n.includes('construct') || n.includes('acqui')) return 'Expansion loan'
  return 'Owner-Occupied CRE'
}

type Parsed = { headers: string[]; map: Record<string, number>; rows: string[][] }

export function ImportBook({ org, onDone }: { org: Org; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const ingest = (text: string) => {
    const all = parseCsv(text)
    if (all.length < 2) { toast('Need a header row plus at least one loan'); return }
    const headers = all[0]
    const map: Record<string, number> = {}
    headers.forEach((h, i) => {
      const n = norm(h)
      for (const [field, alts] of Object.entries(COLS)) {
        if (map[field] === undefined && (alts.includes(n) || n === field.replace(/_/g, ''))) map[field] = i
      }
    })
    if (map.loan_number === undefined && map.company === undefined) {
      toast('Could not find a loan number or borrower column — check the header row')
      return
    }
    setParsed({ headers, map, rows: all.slice(1) })
  }

  const runImport = async () => {
    if (!parsed) return
    setBusy(true)
    const { map, rows } = parsed
    const cell = (r: string[], f: string) => (map[f] === undefined ? '' : (r[map[f]] ?? ''))

    // Borrowers dedupe by company name — one customer per entity, however many loans.
    const { data: existing } = await supabase.from('customers').select('id, company').eq('org_id', org.id)
    const byCompany = new Map((existing ?? []).map(c => [norm(c.company ?? ''), c.id as string]))
    let created = 0, skippedNoName = 0
    for (const r of rows) {
      const company = cell(r, 'company').trim() || `Imported borrower`
      let customerId = byCompany.get(norm(company))
      if (!customerId) {
        const { data: cust, error } = await supabase.from('customers').insert({
          org_id: org.id, name: cell(r, 'contact').trim() || company,
          company, email: cell(r, 'email').trim() || null,
        }).select().single()
        if (error || !cust) { skippedNoName++; continue }
        customerId = cust.id as string
        byCompany.set(norm(company), customerId)
      }
      const loanNumber = cell(r, 'loan_number').trim() || `IMP-${String(1000 + created)}`
      const { error: loanErr } = await supabase.from('loans').insert({
        org_id: org.id, customer_id: customerId, loan_number: loanNumber,
        type: loanTypeOf(cell(r, 'type')), stage: 'Servicing',
        amount: num(cell(r, 'amount')) ?? num(cell(r, 'current_balance')) ?? 0,
        current_balance: num(cell(r, 'current_balance')),
        rate: cell(r, 'rate').trim() || null,
        maturity: dateOf(cell(r, 'maturity')),
        origination_date: dateOf(cell(r, 'origination_date')),
        payment_type: payTypeOf(cell(r, 'payment_type')),
        next_payment_amount: num(cell(r, 'next_payment_amount')),
        next_payment_date: dateOf(cell(r, 'next_payment_date')),
        draw_period_end: dateOf(cell(r, 'draw_period_end')),
        rm: cell(r, 'rm').trim() || null,
        collateral: cell(r, 'collateral').trim() || null,
      })
      if (!loanErr) created++
    }
    setBusy(false)
    setOpen(false); setParsed(null)
    toast(`Imported ${created} loan${created === 1 ? '' : 's'}${skippedNoName ? ` · ${skippedNoName} row${skippedNoName === 1 ? '' : 's'} skipped` : ''}`)
    onDone()
  }

  const mapped = parsed ? Object.keys(parsed.map) : []
  const preview = parsed?.rows.slice(0, 5) ?? []

  return (
    <>
      <button className="btn-light" onClick={() => setOpen(true)}><Ico.plus /> Import book</button>
      {open && (
        <div className="dlg-overlay" onClick={() => { setOpen(false); setParsed(null) }}>
          <div className="dlg" onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: '94vw' }}>
            <b>Import an existing book</b>
            <p className="small" style={{ margin: '4px 0 10px' }}>
              A CSV export from your core or a spreadsheet — one row per loan, headers in the first row.
              Recognized columns: loan number, borrower, type, amount, balance, rate, maturity, origination,
              payment type/amount/date, draw period end, RM, collateral, contact, email.
            </p>
            {!parsed ? (
              <>
                <input ref={input} type="file" accept=".csv,text/csv" hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(ingest) }} />
                <button className="btn-dark" onClick={() => input.current?.click()}>Choose CSV file</button>
                <p className="small" style={{ margin: '12px 0 4px' }}>…or paste rows:</p>
                <textarea rows={6} placeholder={'Loan Number,Borrower,Amount,Rate,Maturity\nCL-1001,Sonrisa Holdings PC,1250000,7.25% fixed,2032-06-01'}
                  style={{ width: '100%', font: '12px ui-monospace, monospace', background: 'var(--card-2)', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 8, padding: 10 }}
                  onBlur={e => e.target.value.trim() && ingest(e.target.value)} />
              </>
            ) : (
              <>
                <p className="small" style={{ margin: '0 0 8px' }}>
                  <Ico.check /> {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} · matched columns: {mapped.map(f => f.replace(/_/g, ' ')).join(', ')}
                </p>
                <div style={{ overflowX: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <table style={{ minWidth: 0 }}>
                    <thead><tr>{['Loan', 'Borrower', 'Type', 'Amount', 'Rate', 'Maturity'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {preview.map((r, i) => {
                        const cell = (f: string) => (parsed.map[f] === undefined ? '—' : (r[parsed.map[f]] ?? '—'))
                        const amt = num(cell('amount'))
                        return (
                          <tr key={i}>
                            <td className="mono small">{cell('loan_number')}</td>
                            <td className="small">{cell('company')}</td>
                            <td className="small">{loanTypeOf(cell('type'))}</td>
                            <td className="num mono small">{amt === null ? '—' : money(amt)}</td>
                            <td className="small">{cell('rate')}</td>
                            <td className="small">{cell('maturity')}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {parsed.rows.length > 5 && <p className="small" style={{ margin: '6px 0 0' }}>…and {parsed.rows.length - 5} more.</p>}
              </>
            )}
            <div className="dlg-actions">
              <button className="btn-light" onClick={() => { setOpen(false); setParsed(null) }}>Cancel</button>
              {parsed && <button className="btn-light" onClick={() => setParsed(null)}>Different file</button>}
              {parsed && <button className="btn-dark" disabled={busy} onClick={runImport}>{busy ? 'Importing…' : `Import ${parsed.rows.length} loan${parsed.rows.length === 1 ? '' : 's'}`}</button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
