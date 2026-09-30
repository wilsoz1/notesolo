// The package is the unit, not the document. All deterministic: every number
// is a field the model read (with page + confidence carried into a hover cite)
// or arithmetic on those fields — never a guess.
import { useState } from 'react'
import { DealSheet, Field, IS_LINES, BS_LINES, SpreadLine, Policy } from './types'

export type ScreenDoc = {
  id: string
  name: string
  status: 'staged' | 'running' | 'done' | 'error'
  step: number
  deal?: DealSheet
  err?: string
  file?: File | null
}

const money = (n: number) => `$${Math.round(n).toLocaleString()}`
const num = (f?: Field) => (typeof f?.number === 'number' && isFinite(f.number) ? f.number : null)

const yearOf = (deal: DealSheet, key: string): string => {
  const m = (deal.fields?.[key]?.text ?? deal.source?.filename ?? '').match(/20\d{2}/)
  return m ? m[0] : '—'
}

// EBITDA for one return: the model's line, else built from the pieces it did read.
const ebitdaOf = (deal: DealSheet): { v: number; computed: boolean } | null => {
  const f = (k: string) => num(deal.fields?.[k])
  const stated = f('ebitda')
  if (stated != null) return { v: stated, computed: false }
  const ni = f('net_income')
  if (ni == null) return null
  return { v: ni + (f('interest_expense') ?? 0) + (f('depreciation') ?? 0) + (f('officer_comp') ?? 0), computed: true }
}

const annualDS = (loan: number, rate: number, years: number) => {
  if (!loan || !rate || !years) return 0
  const r = rate / 12, n = years * 12
  return (loan * r / (1 - Math.pow(1 + r, -n))) * 12
}

const emptyField = (f?: Field) => !f || (f.text == null && f.number == null)

// One spread cell: the value, low-confidence marking, and its citation on hover.
function Cell({ f, line, deduct }: { f?: Field; line?: string; deduct?: boolean }) {
  if (emptyField(f)) return <span className="miss">not found</span>
  const n = num(f)
  const v = n != null ? (deduct && n > 0 ? `($${n.toLocaleString()})` : `$${n.toLocaleString()}`) : (f!.text ?? '')
  const conf = Math.round(((f!.confidence ?? 1) as number) * 100)
  return (
    <span className={`cellv${conf < 90 ? ' lowconf' : ''}`}>
      {v}
      <span className="tip">p. {f!.page ?? '—'}{line ? ` · line ${line}` : ''} · read &ldquo;{f!.text ?? f!.number}&rdquo; · {conf}%</span>
    </span>
  )
}

function SpreadSection({ title, sub, lines, cols, reading, open, toggle }: {
  title: string; sub: string; lines: SpreadLine[]
  cols: { year: string; deal: DealSheet }[]; reading: boolean
  open: boolean; toggle: () => void
}) {
  const gridCols = { gridTemplateColumns: `250px repeat(${cols.length + (reading ? 1 : 0)}, minmax(120px, 1fr))` }
  return (
    <>
      <button className="shead" onClick={toggle} aria-expanded={open}>
        <span className="chev">{open ? '▾' : '▸'}</span> {title} <span className="small">{sub} · {open ? 'click to collapse' : 'click to expand'}</span>
      </button>
      {open && lines.map(l => (
        <div key={l.key} className={`srow${l.total ? ' srow-total' : ''}`} style={gridCols}>
          <div className="srow-label">{l.label} {l.line && <span className="srow-line">{l.line}</span>}</div>
          {cols.map(c => (
            <div key={c.year} className="srow-cell">
              {l.computed
                ? (() => {
                    const e = ebitdaOf(c.deal)
                    if (!e) return <span className="miss">— needs income lines</span>
                    return (
                      <span className="cellv">
                        {money(e.v)}
                        <span className="tip">{e.computed ? 'computed: ordinary income + interest + depreciation + officer comp' : 'stated on the return'}</span>
                      </span>
                    )
                  })()
                : <Cell f={c.deal.fields?.[l.key]} line={l.line} deduct={l.deduct} />}
            </div>
          ))}
          {reading && <div className="srow-cell shimmer">———</div>}
        </div>
      ))}
    </>
  )
}

export function PackageView({ docs, policy, setPolicy, amount, setAmount }: {
  docs: ScreenDoc[]; policy: Policy; setPolicy: (p: Policy) => void
  amount: number | null; setAmount: (n: number | null) => void
}) {
  // Collapsed by default — the verdict lives in the metric row and the flags;
  // the full statements are one click away when someone wants the lines.
  const [openIS, setOpenIS] = useState(false)
  const [openBS, setOpenBS] = useState(false)

  const done = docs.filter(d => d.status === 'done' && d.deal)
  const running = docs.some(d => d.status === 'running')
  const deals = done.map(d => d.deal!)

  const bizCols = deals.filter(d => d.kind === 'operating_company')
    .map(deal => ({ year: yearOf(deal, 'period_latest'), deal }))
    .sort((a, b) => a.year.localeCompare(b.year)).slice(-4)
  const perCols = deals.filter(d => d.kind === 'personal_tax_return')
    .map(deal => ({ year: yearOf(deal, 'tax_year'), deal }))
    .sort((a, b) => a.year.localeCompare(b.year)).slice(-4)
  const pfs = deals.find(d => d.kind === 'personal_financial_statement')
  const debtSched = deals.find(d => d.kind === 'debt_schedule')
  const banks = deals.filter(d => d.kind === 'bank_statement')
  const purchase = deals.find(d => d.kind === 'purchase_agreement')

  const latestBiz = bizCols[bizCols.length - 1]?.deal
  const gf = (k: string) => latestBiz?.fields?.[k]

  // ——— Global cash flow, oldest-fact-that-exists rules stated in the UI ———
  // Prefer the newest year whose EBITDA is trustworthy: stated on the return, or
  // built from a COMPLETE set of components. A year with half its income
  // statement unread would understate cash flow — fall back to it only when
  // nothing better exists (and a flag says so).
  const complete = (deal: DealSheet) => {
    const f = (k: string) => !emptyField(deal.fields?.[k])
    return num(deal.fields?.['ebitda']) != null || (f('net_income') && f('interest_expense') && f('depreciation') && f('officer_comp'))
  }
  const cfCol = [...bizCols].reverse().find(c => ebitdaOf(c.deal) != null && complete(c.deal))
    ?? [...bizCols].reverse().find(c => ebitdaOf(c.deal) != null)
  const cfE = cfCol ? ebitdaOf(cfCol.deal) : null
  const cfDist = cfCol ? num(cfCol.deal.fields?.['distributions']) ?? 0 : 0
  const bcf = cfE ? cfE.v - cfDist : null
  const latestPer = perCols[perCols.length - 1]?.deal
  const gIncome = latestPer ? num(latestPer.fields?.['total_income']) : null
  const living = gIncome != null ? Math.round(gIncome * 0.4) : null
  const pDebt = num(pfs?.fields?.['annual_debt_payments']) ?? 0
  const globalCF = bcf != null ? bcf + (gIncome ?? 0) - (living ?? 0) - pDebt : null
  const effAmount = amount ?? num(gf('loan_amount')) ?? num(purchase?.fields?.['purchase_price']) ?? 0
  const existingDS = num(debtSched?.fields?.['total_annual_payment']) ?? 0
  const proposedDS = annualDS(effAmount, policy.rate, policy.amortYears)
  const totalDS = existingDS + proposedDS
  const dscr = globalCF != null && totalDS > 0 ? globalCF / totalDS : null
  const shocked = globalCF != null && effAmount > 0
    ? globalCF / (existingDS + annualDS(effAmount, policy.rate + 0.02, policy.amortYears)) : null
  let breakeven: number | null = null
  if (globalCF != null && dscr != null && dscr >= 1) {
    for (let bps = 25; bps <= 2000; bps += 25) {
      if (globalCF / (existingDS + annualDS(effAmount, policy.rate + bps / 1e4, policy.amortYears)) < 1) { breakeven = bps; break }
    }
  }

  // ——— Flags: what needs a human, computed from the same fields ———
  const flags: string[] = []
  if (latestBiz) {
    const missIS = IS_LINES.filter(l => !l.computed && emptyField(latestBiz.fields?.[l.key])).length
    if (missIS > 0) flags.push(`FY${bizCols[bizCols.length - 1].year} income statement incomplete — ${missIS} lines not read; reopen page 1 of the return`)
  }
  const lowConf = deals.flatMap(d => Object.values(d.fields ?? {})).filter(f => f && !emptyField(f) && (f.confidence ?? 1) < 0.9).length
  if (lowConf > 0) flags.push(`${lowConf} value${lowConf > 1 ? 's' : ''} read below 90% — dotted in the spread; hover to see what the model read`)
  if (cfCol && bizCols.length && cfCol.year !== bizCols[bizCols.length - 1].year)
    flags.push(`Cash flow uses FY${cfCol.year} EBITDA until FY${bizCols[bizCols.length - 1].year} completes`)
  for (const d of docs.filter(x => x.status === 'error')) flags.push(`${d.name}: ${d.err}`)

  const company = gf('company_name')?.text ?? pfs?.fields?.['person_name']?.text ?? null
  const subline = [gf('owners')?.text, gf('industry')?.text, gf('address')?.text].filter(Boolean).join(' · ')

  const missCount = (deal: DealSheet, lines: SpreadLine[]) => lines.filter(l => !l.computed && emptyField(deal.fields?.[l.key])).length

  const spreadGrid = (n: number) => ({ gridTemplateColumns: `250px repeat(${n}, minmax(120px, 1fr))` })

  return (
    <>
      {company && (
        <div className="pv-ident">
          <div>
            <h2 className="pv-name">{company}</h2>
            {subline && <div className="small">{subline}</div>}
          </div>
          <span className="spacer" />
          <span className="small">hover any number for its source</span>
        </div>
      )}

      <div className="pv-cards">
        <div className="pv-card">
          <div className="pv-label">Global DSCR</div>
          <div className="pv-value">{dscr != null ? `${dscr.toFixed(2)}x` : '—'}</div>
          <div className={`pv-note ${dscr != null ? (dscr >= policy.minDscr ? 'ok' : 'bad') : ''}`}>
            {dscr != null ? `${dscr >= policy.minDscr ? '✓' : '✕'} policy ≥ ${policy.minDscr.toFixed(2)}x${shocked != null ? ` · ${shocked.toFixed(2)}x at +200 bps` : ''}` : 'needs business financials'}
          </div>
        </div>
        <div className="pv-card">
          <div className="pv-label">Business cash flow</div>
          <div className="pv-value">{bcf != null ? money(bcf) : '—'}</div>
          <div className="pv-note">{cfCol ? `FY${cfCol.year} · EBITDA − distributions` : 'needs a business return'}</div>
        </div>
        <div className="pv-card">
          <div className="pv-label">Guarantor liquidity</div>
          <div className="pv-value">{num(pfs?.fields?.['liquid_assets']) != null ? money(num(pfs!.fields['liquid_assets'])!) : '—'}</div>
          <div className="pv-note">{pfs ? `PFS ${pfs.fields?.['statement_date']?.text ?? ''}` : 'no PFS in package'}</div>
        </div>
        <div className="pv-card">
          <div className="pv-label">Proposed debt service</div>
          <div className="pv-value">{proposedDS > 0 ? money(proposedDS) : '—'}</div>
          <div className="pv-note">{effAmount > 0 ? `${money(effAmount)} @ ${(policy.rate * 100).toFixed(2)}% / ${policy.amortYears} yr` : 'set a loan amount below'}</div>
        </div>
      </div>

      <div className="pv-cols">
        <div className="pv-main">

          {bizCols.length > 0 && (
            <div className="grid">
              <div className="uw-head">
                <span><b>Business spread</b> <span className="small">every 1120-S line captured — hover a number for page, line and what the model read</span></span>
              </div>
              <div className="srow srow-cols" style={spreadGrid(bizCols.length + (running ? 1 : 0))}>
                <div className="srow-label small">1120-S line</div>
                {bizCols.map(c => {
                  const miss = missCount(c.deal, [...IS_LINES, ...BS_LINES])
                  return (
                    <div key={c.year} className="srow-cell">
                      <b>FY{c.year}</b>{' '}
                      {miss === 0
                        ? <span className="ok">✓</span>
                        : <span className="miss">{miss} missing</span>}
                    </div>
                  )
                })}
                {running && <div className="srow-cell small"><span className="spin" /> reading…</div>}
              </div>
              <SpreadSection title="Income statement" sub={`${IS_LINES.length} lines`} lines={IS_LINES}
                cols={bizCols} reading={running} open={openIS} toggle={() => setOpenIS(o => !o)} />
              <SpreadSection title="Balance sheet" sub={`Schedule L · ${BS_LINES.length} lines`} lines={BS_LINES}
                cols={bizCols} reading={running} open={openBS} toggle={() => setOpenBS(o => !o)} />
              <div className="srow-legend small">
                <span><span className="lowconf">dotted</span> = read below 90% — hover shows the exact text the model read</span>
              </div>
            </div>
          )}

          {(perCols.length > 0 || pfs) && (
            <div className="grid">
              <div className="uw-head">
                <span><b>Personal cash flow{latestPer?.fields?.['taxpayer_name']?.text ? ` — ${latestPer.fields['taxpayer_name'].text}` : pfs?.fields?.['person_name']?.text ? ` — ${pfs.fields['person_name'].text}` : ''}</b> <span className="small">from the 1040s and the PFS</span></span>
              </div>
              {perCols.length > 0 && (
                <>
                  <div className="srow srow-cols" style={spreadGrid(perCols.length + (running ? 1 : 0))}>
                    <div className="srow-label small">1040 line</div>
                    {perCols.map(c => <div key={c.year} className="srow-cell"><b>FY{c.year}</b></div>)}
                    {running && <div className="srow-cell small"><span className="spin" /> reading…</div>}
                  </div>
                  {[{ key: 'total_income', label: 'Total income', total: true }, { key: 'wages', label: 'W-2 wages' }, { key: 'k1_income', label: 'K-1 pass-through' }, { key: 'interest_dividends', label: 'Interest & dividends' }].map(l => (
                    <div key={l.key} className={`srow${l.total ? ' srow-total' : ''}`} style={spreadGrid(perCols.length + (running ? 1 : 0))}>
                      <div className="srow-label">{l.label}</div>
                      {perCols.map(c => <div key={c.year} className="srow-cell"><Cell f={c.deal.fields?.[l.key]} /></div>)}
                      {running && <div className="srow-cell shimmer">———</div>}
                    </div>
                  ))}
                </>
              )}
              {pfs && (
                <div className="pv-pfs small">
                  <span style={{ color: 'var(--sub)' }}>PFS {pfs.fields?.['statement_date']?.text ?? ''}:</span>
                  <span>Net worth <b><Cell f={pfs.fields?.['net_worth']} /></b></span>
                  <span>Liquid <b><Cell f={pfs.fields?.['liquid_assets']} /></b></span>
                  <span>Real estate <b><Cell f={pfs.fields?.['real_estate_value']} /></b></span>
                  <span>Debt payments <b><Cell f={pfs.fields?.['annual_debt_payments']} /></b>/yr</span>
                </div>
              )}
            </div>
          )}

          <div className="grid">
            <div className="uw-head">
              <span><b>Global cash flow</b> <span className="small">computed line by line — never guessed</span></span>
              <span className="policy">
                <label>Loan $<input type="number" step="10000" value={effAmount || ''} placeholder="amount"
                  onChange={e => setAmount(e.target.value === '' ? null : +e.target.value)} style={{ width: 90 }} /></label>
                <label>Rate <input type="number" step="0.125" value={+(policy.rate * 100).toFixed(3)} onChange={e => setPolicy({ ...policy, rate: +e.target.value / 100 })} />%</label>
                <label>Amort <input type="number" value={policy.amortYears} onChange={e => setPolicy({ ...policy, amortYears: +e.target.value })} />yr</label>
                {dscr != null && <span className={`status ${dscr >= policy.minDscr ? 's-green' : 's-red'}`}>DSCR {dscr.toFixed(2)}x {dscr >= policy.minDscr ? '✓' : '✕'}</span>}
              </span>
            </div>
            <div className="pv-wf">
              <div className="wf-row"><span className="small">Business EBITDA {cfCol && <span className="miss chip">FY{cfCol.year}{cfE?.computed ? ' · computed' : ''}</span>}</span><span>{cfE ? money(cfE.v) : '—'}</span></div>
              <div className="wf-row"><span className="small">− Distributions</span><span>{cfCol ? `(${money(cfDist)})` : '—'}</span></div>
              <div className="wf-row wf-sub"><span>Business cash flow</span><span>{bcf != null ? money(bcf) : '—'}</span></div>
              <div className="wf-row"><span className="small">+ Guarantor income {latestPer && `(FY${perCols[perCols.length - 1].year} 1040)`}</span><span>{gIncome != null ? money(gIncome) : '—'}</span></div>
              <div className="wf-row"><span className="small">− Guarantor taxes &amp; living (est. 40%)</span><span>{living != null ? `(${money(living)})` : '—'}</span></div>
              <div className="wf-row"><span className="small">− Personal debt payments (PFS)</span><span>{pDebt ? `(${money(pDebt)})` : '—'}</span></div>
              <div className="wf-row wf-total"><span>Global cash available</span><span>{globalCF != null ? money(globalCF) : '—'}</span></div>
              <div className="wf-row"><span className="small">Debt service — existing {money(existingDS)} + proposed {money(proposedDS)}</span><span>{totalDS ? `(${money(totalDS)})` : '—'}</span></div>
              <div className="wf-foot small">
                {shocked != null && <span>+200 bps → <b className={shocked >= policy.minDscr ? 'ok' : 'bad'}>{shocked.toFixed(2)}x</b></span>}
                {breakeven != null && <span>break-even at <b>+{breakeven} bps</b></span>}
                <span>add-backs and overrides carry into the borrower&rsquo;s cash flow after the loan is created</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pv-rail">
          <div className="grid">
            <div className="uw-head"><span><b>The package</b></span></div>
            <div className="pv-check">
              <div className="pv-checkrow">
                <span>Business returns (1120-S)</span>
                <span className="pv-chips">
                  {bizCols.map(c => <span key={c.year} className="status s-green">FY{c.year.slice(2)} ✓</span>)}
                  {running && <span className="status s-gray">reading</span>}
                  {bizCols.length === 0 && !running && <span className="status s-amber">none yet</span>}
                </span>
              </div>
              <div className="pv-checkrow">
                <span>Personal returns (1040)</span>
                <span className="pv-chips">
                  {perCols.map(c => <span key={c.year} className="status s-green">FY{c.year.slice(2)} ✓</span>)}
                  {perCols.length === 0 && <span className="status s-amber">none yet</span>}
                </span>
              </div>
              <div className="pv-checkrow">
                <span>Personal financial statement</span>
                {pfs ? <span className="status s-green">✓ {pfs.fields?.['statement_date']?.text ?? 'received'}</span> : <span className="status s-amber">missing</span>}
              </div>
              <div className="pv-checkrow">
                <span>Debt schedule</span>
                {debtSched ? <span className="status s-green">✓ {debtSched.fields?.['as_of_date']?.text ?? 'received'}</span> : <span className="status s-amber">missing</span>}
              </div>
              <div className="pv-checkrow">
                <span>Bank statements</span>
                {banks.length > 0 ? <span className="status s-green">✓ {banks.length}</span> : <span className="status s-amber">missing</span>}
              </div>
              <div className="pv-checkrow">
                <span style={{ color: 'var(--sub)' }}>Purchase agreement</span>
                {purchase ? <span className="status s-green">✓</span> : <span className="small">optional</span>}
              </div>
            </div>
          </div>

          {flags.length > 0 && (
            <div className="grid">
              <div className="uw-head"><span><b>Needs a human</b> <span className="miss">{flags.length}</span></span></div>
              <div className="pv-flags">
                {flags.map((f, i) => <div key={i} className="pv-flag"><span className="miss">▲</span><span>{f}</span></div>)}
              </div>
            </div>
          )}

          <div className="pv-note-card small">
            <b style={{ color: 'var(--ink)' }}>Where did the tables go?</b>
            <span>One screen per package. Income statement and balance sheet sections collapse when you don&rsquo;t need the detail, and the full field-by-field extraction for any document is below — collapsed until you open it.</span>
          </div>
        </div>
      </div>
    </>
  )
}

// How many checklist items are missing — the header chip uses it.
export function missingCount(deals: DealSheet[]): number {
  return [
    deals.some(d => d.kind === 'personal_financial_statement'),
    deals.some(d => d.kind === 'debt_schedule'),
    deals.some(d => d.kind === 'bank_statement'),
  ].filter(x => !x).length
}
