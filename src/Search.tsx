// Global search: borrowers and loans in one box, from anywhere in the app.
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import { Ico } from './Icons'

type Hit = { kind: 'Loan' | 'Customer'; label: string; sub: string; href: string }

export default function Search() {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus() }
      if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', key) }
  }, [])

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const like = `%${q.trim()}%`
      const [loans, customers] = await Promise.all([
        supabase.from('loans').select('id, loan_number, type, customers(company)').or(`loan_number.ilike.${like},type.ilike.${like}`).limit(5),
        supabase.from('customers').select('id, name, company, email').or(`name.ilike.${like},company.ilike.${like},email.ilike.${like}`).limit(5),
      ])
      const custLoans = customers.data?.length
        ? await supabase.from('loans').select('id, loan_number, type, customer_id, customers(company)').in('customer_id', customers.data.map(c => c.id)).order('amount', { ascending: false }).limit(5)
        : { data: [] }
      const loanHits = [...(loans.data ?? []), ...(custLoans.data ?? [])]
      const seen = new Set<string>()
      setHits([
        ...loanHits.filter(l => !seen.has(l.id) && seen.add(l.id)).map(l => ({
          kind: 'Loan' as const, label: l.loan_number, sub: `${(l as { customers?: { company?: string } }).customers?.company ?? ''} · ${l.type}`, href: `#/app/loans/${l.id}`,
        })),
        // A customer hit lands on their largest loan's Borrower tab — the loan
        // number is the address for everything.
        ...(customers.data ?? []).flatMap(c => {
          const l = (custLoans.data ?? []).find(x => (x as { customer_id?: string }).customer_id === c.id)
          return l ? [{ kind: 'Customer' as const, label: c.company ?? c.name, sub: c.name, href: `#/app/loans/${l.id}/Borrower` }] : []
        }),
      ].slice(0, 9))
      setOpen(true)
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="gsearch" ref={box}>
      <Ico.search />
      <input ref={input} aria-label="Search borrowers and loans" placeholder="Search…  ⌘K" value={q}
        onChange={e => setQ(e.target.value)} onFocus={() => q.length >= 2 && setOpen(true)} />
      {open && hits.length > 0 && (
        <div className="gsearch-pop">
          {hits.map((h, i) => (
            <a key={i} href={h.href} onClick={() => { setOpen(false); setQ('') }}>
              <span className="pill">{h.kind}</span>
              <span className="ellipsis" style={{ flex: 1 }}>{h.label}</span>
              <span className="small ellipsis">{h.sub}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
