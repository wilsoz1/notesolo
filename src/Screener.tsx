// The screener takes a whole screening package — as many documents as the banker has.
// Each one is OCR'd, named by content, and spread with a schema for its kind; the
// primary document (business financials or a property OM) drives the underwriting.
import { useRef, useState } from 'react'
import { DealSheet, FIELD_DEFS, SECTIONS, BIZ_FIELD_DEFS, SECTIONS_BIZ, KIND_META, DEFAULT_POLICY, Policy, underwrite, underwriteBiz, Field } from './types'
import { API_URL, STEPS, extractMemo } from './api'
import { loans } from './data'
import { Ico } from './Icons'
import { supabase, Org } from './supabase'
import { toast } from './dialogs'
import { Boundary } from './ErrorBoundary'

type Doc = {
  id: string
  name: string
  status: 'staged' | 'running' | 'done' | 'error'
  step: number
  deal?: DealSheet
  err?: string
  file?: File | null
}

const fmt = (f: Field | undefined, kind?: string) => {
  if (!f || (f.text == null && f.number == null)) return null
  if (f.text) return f.text
  const n = f.number
  if (typeof n !== 'number' || !isFinite(n)) return n == null ? null : String(n)
  if (kind === 'money') return `$${n.toLocaleString()}`
  if (kind === 'pct') return `${(n * 100).toFixed(1)}%`
  return n.toLocaleString()
}

const kindLabel = (deal?: DealSheet) => KIND_META[deal?.kind ?? 'cre_property']?.label ?? 'Document'
const isPrimary = (deal?: DealSheet) => deal?.kind === 'operating_company' || deal?.kind === 'cre_property' || deal?.kind === undefined

// One headline value per document for the package table.
const headline = (deal?: DealSheet) => {
  if (!deal) return null
  const g = (k: string, f?: string) => fmt(deal.fields?.[k], f)
  switch (deal.kind) {
    case 'operating_company': return g('revenue', 'money') && `revenue ${g('revenue', 'money')} · EBITDA ${g('ebitda', 'money') ?? '—'}`
    case 'personal_tax_return': return g('total_income', 'money') && `total income ${g('total_income', 'money')}`
    case 'personal_financial_statement': return g('net_worth', 'money') && `net worth ${g('net_worth', 'money')}`
    case 'bank_statement': return g('average_balance', 'money') && `avg balance ${g('average_balance', 'money')}`
    case 'debt_schedule': return g('total_balance', 'money') && `total debt ${g('total_balance', 'money')}`
    case 'practice_production_report': return g('collections', 'money') && `collections ${g('collections', 'money')}`
    case 'purchase_agreement': return g('purchase_price', 'money') && `price ${g('purchase_price', 'money')}`
    default: return g('purchase_price', 'money') ?? g('loan_amount', 'money') ?? g('summary')
  }
}

export default function Screener({ org }: { org: Org | null }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const busy = docs.some(d => d.status === 'running')

  // Dropping or picking files only STAGES them — nothing runs until the banker
  // says the package is complete. Then documents process one at a time.
  const stageFiles = (files: File[]) => {
    setDocs(ds => [...ds, ...files.map(f => ({ id: crypto.randomUUID(), name: f.name, status: 'staged' as const, step: 0, file: f }))])
  }

  const processOne = async (doc: Doc, sample?: 'om' | 'tax_return') => {
    setDocs(ds => ds.map(d => (d.id === doc.id ? { ...d, status: 'running', step: 0 } : d)))
    try {
      const deal = await extractMemo(doc.file ?? null, step => setDocs(ds => ds.map(d => (d.id === doc.id ? { ...d, step } : d))), sample)
      setDocs(ds => ds.map(d => (d.id === doc.id ? { ...d, status: 'done', deal, file: undefined } : d)))
    } catch (e) {
      setDocs(ds => ds.map(d => (d.id === doc.id ? { ...d, status: 'error', err: (e as Error).message } : d)))
    }
  }

  const startScreening = async () => {
    // Snapshot the staged list up front; more files staged mid-run wait for the next start.
    const staged = docs.filter(d => d.status === 'staged')
    for (const doc of staged) await processOne(doc)
  }

  const runSample = async (sample: 'om' | 'tax_return') => {
    const doc: Doc = {
      id: crypto.randomUUID(), status: 'staged', step: 0, file: null,
      name: sample === 'tax_return' ? 'Desert_Bloom_Dental_1120S_2026.pdf (sample)' : 'Mesa_Ridge_Dental_OM.pdf (sample)',
    }
    setDocs(ds => [...ds, doc])
    await processOne(doc, sample)
  }

  const removeStaged = (id: string) => setDocs(ds => ds.filter(d => !(d.id === id && d.status === 'staged')))

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const files = Array.from(e.dataTransfer.files ?? [])
    if (files.length) stageFiles(files)
  }

  const done = docs.filter(d => d.status === 'done')
  const stagedN = docs.filter(d => d.status === 'staged').length
  const primary = done.find(d => isPrimary(d.deal))

  return (
    <>
      <div className="dbtag"><Ico.doc /> NoteSolo · {API_URL ? `API: ${API_URL}` : 'Demo mode — no extraction API configured'}</div>
      <h1>Screen a lending package</h1>
      <p className="subtitle">
        Drop everything the borrower sent — tax returns (business and personal), financial statements, PFS,
        bank statements, debt schedules, production reports, purchase agreements, offering memos. Each document
        is named by its content and spread accordingly; every value cites its source page.
      </p>

      {docs.length === 0 && (
        <div
          className={`drop ${drag ? 'drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => input.current?.click()}
        >
          <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden
            onChange={e => e.target.files?.length && stageFiles(Array.from(e.target.files))} />
          <div className="drop-icon"><Ico.doc /></div>
          <div className="drop-title">Drop the borrower's documents here</div>
          <div className="drop-sub">PDFs or scans · add the whole package first — nothing runs until you start screening</div>
          <div className="drop-actions">
            <button className="btn-dark" onClick={e => { e.stopPropagation(); input.current?.click() }}>Choose files <Ico.plus /></button>
            <button className="btn-light" onClick={e => { e.stopPropagation(); runSample('om') }}>Sample: property OM</button>
            <button className="btn-light" onClick={e => { e.stopPropagation(); runSample('tax_return') }}>Sample: practice tax return</button>
          </div>
        </div>
      )}

      {docs.length > 0 && (
        <>
          <div
            className={`drop slim ${drag ? 'drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => input.current?.click()}
            role="button" aria-label="Add more documents to the package"
          >
            <Ico.plus /> Drop more documents here — they stage until you start screening
          </div>

          <div className="grid" style={{ marginBottom: 20 }}>
            <div className="uw-head">
              <span><b>Screening package</b> <span className="small">
                {stagedN > 0 ? `${stagedN} staged — add everything, then start` : `${done.length} of ${docs.length} document${docs.length === 1 ? '' : 's'} processed`}
              </span></span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden
                  onChange={e => e.target.files?.length && stageFiles(Array.from(e.target.files))} />
                <button className="btn-light" onClick={() => input.current?.click()} disabled={busy}><Ico.plus /> Add documents</button>
                {stagedN > 0 && (
                  <button className="btn-dark" onClick={startScreening} disabled={busy}>
                    Start screening ({stagedN}) <Ico.chevron />
                  </button>
                )}
                <button className="btn-light" onClick={() => setDocs([])} disabled={busy}>Start over</button>
              </span>
            </div>
            <table><tbody>
              {docs.map(d => (
                <tr key={d.id}>
                  <td className="mono small ellipsis" title={d.name}>{d.name}</td>
                  <td>
                    {d.status === 'staged' && <span className="status s-gray">Staged — not started</span>}
                    {d.status === 'done' && <span className="pill">{kindLabel(d.deal)}</span>}
                    {d.status === 'running' && <span className="small"><span className="spin" /> {STEPS[d.step]}…</span>}
                    {d.status === 'error' && <span className="status s-red"><Ico.x /> {d.err}</span>}
                  </td>
                  <td className="small">{d.status === 'done' ? headline(d.deal) : ''}</td>
                  <td className="num small">
                    {d.status === 'done' && `${d.deal?.source?.pages ?? '—'} pages`}
                    {d.status === 'staged' && <button className="linkish" onClick={() => removeStaged(d.id)}>Remove</button>}
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div>

          {primary?.deal && (
            <Boundary label="Underwriting"><Underwriting deal={primary.deal} policy={policy} setPolicy={setPolicy} /></Boundary>
          )}

          {done.length > 0 && (
            <Boundary label="Package summary"><PackageActions docs={done.map(d => d.deal!)} org={org} policy={policy} /></Boundary>
          )}

          {done.map(d => (
            <Boundary key={d.id} label={d.name}><DocCard name={d.name} deal={d.deal!} /></Boundary>
          ))}
        </>
      )}
    </>
  )
}

// ——— Underwriting panel: driven by the package's primary document ———
function Underwriting({ deal, policy, setPolicy }: { deal: DealSheet; policy: Policy; setPolicy: (p: Policy) => void }) {
  const biz = deal.kind === 'operating_company'
  const metrics = biz ? underwriteBiz(deal.fields, policy) : underwrite(deal.fields, policy)
  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <div className="uw-head">
        <span><b>Underwriting</b> <span className="small">from the {biz ? 'business financials' : 'offering memo'} — recalculates as you change policy</span></span>
        <span className="policy">
          {!biz && <label>Max LTV <input type="number" value={Math.round(policy.maxLtv * 100)} onChange={e => setPolicy({ ...policy, maxLtv: +e.target.value / 100 })} />%</label>}
          <label>Min DSCR <input type="number" step="0.05" value={policy.minDscr} onChange={e => setPolicy({ ...policy, minDscr: +e.target.value })} />x</label>
          {!biz && <label>Min debt yield <input type="number" step="0.5" value={+(policy.minDebtYield * 100).toFixed(1)} onChange={e => setPolicy({ ...policy, minDebtYield: +e.target.value / 100 })} />%</label>}
          {biz && <label>Max Debt/EBITDA <input type="number" step="0.25" value={policy.maxLeverage} onChange={e => setPolicy({ ...policy, maxLeverage: +e.target.value })} />x</label>}
          <label>Rate <input type="number" step="0.125" value={+(policy.rate * 100).toFixed(3)} onChange={e => setPolicy({ ...policy, rate: +e.target.value / 100 })} />%</label>
          <label>Amort <input type="number" value={policy.amortYears} onChange={e => setPolicy({ ...policy, amortYears: +e.target.value })} />yr</label>
        </span>
      </div>
      <div className="metrics">
        {metrics.map(m => (
          <div key={m.label} className={`metric ${m.status}`}>
            <div className="m-label">{m.label}</div>
            <div className="m-value">{m.value}</div>
            {m.test && <div className="m-test">{m.status === 'pass' ? '✓ ' : m.status === 'fail' ? '✕ ' : ''}{m.test}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ——— Create the loan from the whole package ———
function PackageActions({ docs, org, policy }: { docs: DealSheet[]; org: Org | null; policy: Policy }) {
  const [added, setAdded] = useState(false)
  const primary = docs.find(d => isPrimary(d))
  const pfs = docs.find(d => d.kind === 'personal_financial_statement')
  const purchase = docs.find(d => d.kind === 'purchase_agreement')
  if (!primary) return <p className="small" style={{ padding: '0 2px 14px' }}>Add business financials or a property OM to underwrite and create a loan.</p>

  const biz = primary.kind === 'operating_company'
  const metrics = biz ? underwriteBiz(primary.fields, policy) : underwrite(primary.fields, policy)
  const fails = metrics.filter(m => m.status === 'fail').length

  const create = async () => {
    const g = (k: string) => primary.fields[k]
    const pf = (k: string) => pfs?.fields[k]
    const dscrM = metrics.find(m => m.label.startsWith('DSCR'))?.value ?? '—'
    const sponsor = (biz ? g('company_name')?.text : g('sponsor')?.text)?.split(' (')[0] ?? 'New borrower'
    const rate = g('rate_request')?.text?.split(' or ')[0] ?? null
    const term = g('loan_term')?.text?.replace(/-year term \/ /, ' / ').replace(/-year amortization/, '') ?? null
    const ltvS = biz ? '—' : metrics[0].value
    const ltv = ltvS === '—' ? null : parseFloat(ltvS) / 100
    const dscr = dscrM === '—' ? null : parseFloat(dscrM)
    const amount = g('loan_amount')?.number ?? purchase?.fields['purchase_price']?.number ?? 0
    setAdded(true)

    if (org) {
      const { data: cust } = await supabase.from('customers')
        .insert({ org_id: org.id, name: pf('person_name')?.text ?? g('guarantor')?.text?.split(' (')[0] ?? sponsor, company: sponsor })
        .select().single()
      const loanType = biz
        ? (/start|new practice|de novo/i.test(g('loan_purpose')?.text ?? '') ? 'Start-up loan' : 'Expansion loan')
        : 'Owner-Occupied CRE'
      const collateral = biz
        ? (g('collateral_offered')?.text ?? 'Practice assets')
        : `1st DOT — ${g('property_name')?.text ?? 'property'}`
      const { data: newLoan } = await supabase.from('loans').insert({
        org_id: org.id, customer_id: cust?.id ?? null,
        loan_number: `CL-2026-${String(100 + Math.floor(Math.random() * 900))}`,
        type: loanType, stage: 'Underwriting', amount, rate, term,
        ltv, dscr, rm: 'Unassigned', collateral,
      }).select().single()
      if (newLoan) {
        // Guarantor: the PFS is the best source when the package has one.
        const gName = pf('person_name')?.text ?? g('guarantor')?.text?.split(' (')[0]
        if (gName) {
          await supabase.from('guarantors').insert({
            org_id: org.id, loan_id: newLoan.id, name: gName, guarantee_type: 'Unlimited',
            net_worth: pf('net_worth')?.number ?? g('guarantor_net_worth')?.number ?? g('sponsor_net_worth')?.number ?? null,
            liquidity: pf('liquid_assets')?.number ?? g('guarantor_liquidity')?.number ?? g('sponsor_liquidity')?.number ?? null,
            pfs_date: null,
          })
        }
        // Business financials become a draft spread on the new borrower.
        if (biz && cust) {
          const line = (k: string) => g(k)?.number ?? null
          await supabase.from('financial_spreads').insert({
            org_id: org.id, customer_id: cust.id,
            period: g('period_latest')?.text ?? 'Latest FY', statement_type: 'Tax Return', status: 'draft',
            data: {
              revenue: line('revenue'), cogs: line('cogs'), opex: line('operating_expenses'),
              ebitda: line('ebitda'), depreciation: line('depreciation'), interest_expense: line('interest_expense'),
              net_income: line('net_income'), distributions: line('distributions'),
              total_debt: line('total_debt'), tangible_net_worth: line('tangible_net_worth'),
            },
          })
        }
        toast(biz ? 'Loan created — financials spread onto the borrower as a draft' : 'Loan created from the package')
        window.location.hash = `#/app/loans/${newLoan.id}${biz ? '/Spreads' : ''}`
      }
      return
    }

    loans.unshift({
      id: `CL-2026-${String(80 + loans.length).padStart(3, '0')}`, borrower: sponsor,
      type: biz ? 'Expansion loan' : 'Owner-Occupied CRE',
      amount, stage: 'Application', rm: 'Unassigned', riskRating: 0,
      nextAction: `Screened package — ${fails ? `${fails} policy flag${fails > 1 ? 's' : ''}` : 'passes policy'}`,
      rate: rate ?? '—', term: term ?? '—', ltv: ltv === null ? null : ltv * 100, dscr,
      maturity: '—',
      collateral: biz ? (g('collateral_offered')?.text ?? 'Practice assets') : `1st DOT — ${g('property_name')?.text ?? 'property'}`,
    })
    toast('Sign up to save this loan to a portfolio')
    window.location.hash = '#/signup'
  }

  return (
    <div className="viewbar" style={{ marginBottom: 20 }}>
      <div className="summary">
        <span className={`status ${fails ? 's-amber' : 's-green'}`}>{fails ? <Ico.clock /> : <Ico.check />} {fails ? `${fails} policy flag${fails > 1 ? 's' : ''}` : 'Passes policy screen'}</span>
        <span className="small">{docs.length} document{docs.length === 1 ? '' : 's'} in package{pfs ? ' · guarantor PFS attached' : ''}{purchase ? ' · purchase agreement attached' : ''}</span>
      </div>
      <span className="spacer" />
      <button className="btn-dark" onClick={create} disabled={added}>{org ? 'Create loan from package' : 'Add to portfolio'} <Ico.plus /></button>
    </div>
  )
}

// ——— One extracted document, rendered by its kind ———
function DocCard({ name, deal }: { name: string; deal: DealSheet }) {
  const [open, setOpen] = useState(true)
  const kind = deal.kind ?? 'cre_property'
  const sections: { title: string; defs: { key: string; label: string; fmt?: string }[] }[] =
    kind === 'operating_company'
      ? SECTIONS_BIZ.map(s => ({ title: s, defs: BIZ_FIELD_DEFS.filter(d => d.section === s) }))
      : kind === 'cre_property'
        ? SECTIONS.map(s => ({ title: s, defs: FIELD_DEFS.filter(d => d.section === s) }))
        : [{ title: KIND_META[kind]?.label ?? 'Document', defs: KIND_META[kind]?.defs ?? [] }]
  const lowConf = Object.values(deal.fields ?? {}).filter(f => (f?.confidence ?? 1) < 0.9).length

  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <div className="uw-head">
        <span><b>{KIND_META[kind]?.label ?? 'Document'}</b> <span className="small">{name} · {deal.source?.pages ?? '—'} pages · {lowConf} below 90% confidence</span></span>
        <button className="linkish" onClick={() => setOpen(o => !o)}>{open ? 'Collapse' : 'Expand'}</button>
      </div>
      {open && (
        <table>
          <thead><tr>
            <th style={{ width: 280 }}><span className="h"><Ico.text /> Field</span></th>
            <th><span className="h"><Ico.tag /> Extracted value</span></th>
            <th className="num" style={{ width: 120 }}><span className="h"><Ico.percent /> Confidence</span></th>
            <th className="num" style={{ width: 110 }}><span className="h"><Ico.doc /> Page</span></th>
          </tr></thead>
          <tbody>
            {sections.map(sec => <SectionRows key={sec.title} title={sec.title} defs={sec.defs} fields={deal.fields} />)}
          </tbody>
        </table>
      )}
    </div>
  )
}

const SectionRows = ({ title, defs, fields }: { title: string; defs: { key: string; label: string; fmt?: string }[]; fields: Record<string, Field> }) => (
  <>
    <tr className="section"><td colSpan={4}>{title}</td></tr>
    {defs.map(d => {
      const f = fields[d.key]
      const v = fmt(f, d.fmt)
      const conf = f?.confidence ?? 0
      return (
        <tr key={d.key} className={v === null ? 'muted' : ''}>
          <td className="small" style={{ color: 'var(--sub)' }}>{d.label}</td>
          <td>{v ?? <span className="status s-red"><Ico.x /> Not found</span>}</td>
          <td className="num mono">{v === null ? '—' : <span className={`status ${conf >= 0.9 ? 's-green' : conf >= 0.75 ? 's-amber' : 's-red'}`}>{Math.round(conf * 100)}%</span>}</td>
          <td className="num mono src">{f?.page ? `p. ${f.page}` : '—'}</td>
        </tr>
      )
    })}
  </>
)
