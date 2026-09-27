// Relationship cash flow — the global-cash-flow Excel model, structured.
// The skeleton (line items + formulas) is fixed in code; the underwriter's judgment
// lives in a scenario: overrides of extracted values, free-form add-backs, guarantor
// inputs, and a proposed facility. Computed rows are derived, never stored, so the
// DSCR math can't be broken — and debt service comes live from the loans table.
import { useEffect, useMemo, useState } from 'react'
import { supabase, DbLoan, Guarantor, Org, Spread, money } from './supabase'
import { monthlyPayment } from './finance'
import { confirmDialog, promptDialog, toast, currentUserName } from './dialogs'
import { Ico } from './Icons'

export type CFAdjustment = { id: string; label: string; amount: number; note?: string; by?: string }
export type CFScenarioData = {
  periods?: Record<string, { overrides?: Record<string, number>; adjustments?: CFAdjustment[] }>
  guarantors?: Record<string, { income?: number | null; personal_debt?: number | null; living?: number | null }>
  proposed?: { label?: string; amount?: number; rate_pct?: number; amort_months?: number } | null
}
export type CFScenario = { id: string; customer_id: string; name: string; is_base: boolean; data: CFScenarioData }

// ——— The engine: one period column, fully derived ———
export type CFColumn = {
  period: string
  ebitda: number | null; ebitdaFiled: number | null; ebitdaOverridden: boolean
  distributions: number | null; distributionsFiled: number | null; distributionsOverridden: boolean
  adjustments: CFAdjustment[]
  businessCF: number | null
  guarantorCF: number
  globalCF: number | null
  existingDS: number
  proposedDS: number
  totalDS: number
  dscr: number | null
  excess: number | null
}

export function computeCashFlow(
  scenario: CFScenarioData, spreads: Spread[], guarantors: Guarantor[], loans: DbLoan[],
): CFColumn[] {
  const reviewed = spreads.filter(s => s.status === 'reviewed')
  const periods = [...new Set(reviewed.map(s => s.period))].sort()
  // Debt service is a fact of the book, not an assumption: live payment obligations.
  const existingDS = loans.reduce((s, l) => s + (l.next_payment_amount ? Number(l.next_payment_amount) * 12 : 0), 0)
  const p = scenario.proposed
  const proposedDS = p?.amount && p?.rate_pct && p?.amort_months
    ? monthlyPayment(p.amount, p.rate_pct, p.amort_months) * 12 : 0
  const guarantorCF = guarantors.reduce((sum, g) => {
    const gi = scenario.guarantors?.[g.id]
    if (!gi || gi.income == null) return sum
    return sum + Number(gi.income) - Number(gi.personal_debt ?? 0) - Number(gi.living ?? 0)
  }, 0)

  return periods.map(period => {
    const spread = reviewed.filter(s => s.period === period).slice(-1)[0]
    const pj = scenario.periods?.[period]
    const val = (key: string) => {
      const filed = spread.data[key] == null ? null : Number(spread.data[key])
      const over = pj?.overrides?.[key]
      return { filed, value: over != null ? Number(over) : filed, overridden: over != null }
    }
    const ebitda = val('ebitda')
    const dist = val('distributions')
    const adjustments = pj?.adjustments ?? []
    const adjTotal = adjustments.reduce((s, a) => s + Number(a.amount), 0)
    const businessCF = ebitda.value == null ? null : ebitda.value - (dist.value ?? 0) + adjTotal
    const globalCF = businessCF == null ? null : businessCF + guarantorCF
    const totalDS = existingDS + proposedDS
    return {
      period,
      ebitda: ebitda.value, ebitdaFiled: ebitda.filed, ebitdaOverridden: ebitda.overridden,
      distributions: dist.value, distributionsFiled: dist.filed, distributionsOverridden: dist.overridden,
      adjustments, businessCF, guarantorCF, globalCF,
      existingDS, proposedDS, totalDS,
      dscr: globalCF != null && totalDS > 0 ? globalCF / totalDS : null,
      excess: globalCF != null && totalDS > 0 ? globalCF - totalDS : null,
    }
  })
}

// ——— Interest-rate sensitivity ———
// Only floating-rate notes reprice when rates move; fixed notes hold until reset.
// A +bps shock adds (floating balance × bps) of annual interest to debt service —
// the standard quick sensitivity, deterministic and explainable.

export const RATE_SHOCKS = [100, 200, 300]
export const isFloating = (rate: string | null) => /sofr|prime|libor|\+/i.test(rate ?? '')

export function dsComposition(loans: DbLoan[]) {
  let fixedDS = 0, floatDS = 0, floatBal = 0, floatN = 0
  for (const l of loans) {
    const ds = l.next_payment_amount ? Number(l.next_payment_amount) * 12 : 0
    if (!ds) continue
    if (isFloating(l.rate)) { floatDS += ds; floatBal += Number(l.current_balance ?? l.amount); floatN++ }
    else fixedDS += ds
  }
  return { fixedDS, floatDS, floatBal, floatN, totalDS: fixedDS + floatDS }
}

export function shockedDscr(globalCF: number | null, comp: ReturnType<typeof dsComposition>, proposedDS: number, bps: number) {
  const ds = comp.totalDS + proposedDS + (comp.floatBal * bps) / 10000
  return { ds, dscr: globalCF != null && ds > 0 ? globalCF / ds : null }
}

/** Largest shock (bps) at which global DSCR still meets `target`; null when nothing floats. */
export function breakevenBps(globalCF: number | null, comp: ReturnType<typeof dsComposition>, proposedDS: number, target: number) {
  if (globalCF == null || !comp.floatBal) return null
  return Math.floor(((globalCF / target - (comp.totalDS + proposedDS)) * 10000) / comp.floatBal)
}

/** Latest-period global DSCR for a base scenario — used by the Today work queue. */
export function latestGlobalDSCR(scenario: CFScenarioData, spreads: Spread[], guarantors: Guarantor[], loans: DbLoan[]) {
  const cols = computeCashFlow(scenario, spreads, guarantors, loans)
  const last = cols[cols.length - 1]
  return last?.dscr != null ? { dscr: last.dscr, period: last.period } : null
}

// ——— The panel ———
const fmt = (n: number | null) => (n == null ? '—' : n < 0 ? `(${money(-n)})` : money(n))
const cell: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
const inputCss: React.CSSProperties = {
  width: 110, textAlign: 'right', font: 'inherit', borderRadius: 6, padding: '3px 6px',
  background: 'var(--card-2)', color: 'var(--ink)', border: '1px solid var(--line)',
}

export function CashFlowPanel({ org, customerId, guarantors, spreads, loans }: {
  org: Org; customerId: string; guarantors: Guarantor[]; spreads: Spread[]; loans: DbLoan[]
}) {
  const [scenarios, setScenarios] = useState<CFScenario[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase.from('cash_flow_scenarios').select('*')
      .eq('customer_id', customerId).order('created_at')
    const rows = (data as CFScenario[]) ?? []
    setScenarios(rows)
    setActiveId(prev => (prev && rows.some(s => s.id === prev) ? prev : (rows.find(s => s.is_base) ?? rows[0])?.id ?? null))
  }
  useEffect(() => { load() }, [customerId])

  const active = scenarios?.find(s => s.id === activeId) ?? null
  const cols = useMemo(
    () => (active ? computeCashFlow(active.data ?? {}, spreads, guarantors, loans) : []),
    [active, spreads, guarantors, loans],
  )

  // Every mutation goes through here: merge into jsonb, persist, keep UI in sync.
  const save = async (next: CFScenarioData) => {
    if (!active) return
    setScenarios(sc => sc?.map(s => (s.id === active.id ? { ...s, data: next } : s)) ?? null)
    const { error } = await supabase.from('cash_flow_scenarios')
      .update({ data: next, updated_at: new Date().toISOString() }).eq('id', active.id)
    if (error) toast(`Save failed: ${error.message}`)
  }

  const addScenario = async () => {
    const name = await promptDialog('New scenario', 'Scenario name (e.g. Stressed, With proposed debt)', {
      body: active ? `Starts as a copy of "${active.name}" — overrides and add-backs carry over.` : undefined,
      confirmText: 'Create',
    })
    if (!name) return
    const user = (await supabase.auth.getUser()).data.user
    // A new scenario starts from the active one — that's how underwriters actually work.
    const { data, error } = await supabase.from('cash_flow_scenarios')
      .insert({ org_id: org.id, customer_id: customerId, name, data: active?.data ?? {}, created_by: user?.id })
      .select().single()
    if (error) { toast(`Could not create scenario: ${error.message}`); return }
    await load()
    setActiveId((data as CFScenario).id)
    toast(`Scenario "${name}" created from ${active ? `"${active.name}"` : 'scratch'}`)
  }

  const deleteScenario = async () => {
    if (!active || active.is_base) return
    if (!(await confirmDialog(`Delete scenario "${active.name}"?`, 'Its overrides and adjustments are removed. The base case is unaffected.', { danger: true, confirmText: 'Delete' }))) return
    await supabase.from('cash_flow_scenarios').delete().eq('id', active.id)
    setActiveId(null)
    load()
  }

  const overrideValue = async (period: string, key: 'ebitda' | 'distributions', filed: number | null, current: number | null) => {
    const raw = await promptDialog(
      `Override ${key === 'ebitda' ? 'EBITDA' : 'distributions'} · ${period}`,
      'Adjusted value',
      { body: `As filed: ${fmt(filed)}. Entering the as-filed value restores it.`, initial: current == null ? '' : String(current), confirmText: 'Apply' },
    )
    if (raw == null || !active) return
    const n = Number(raw.replace(/[$,]/g, ''))
    if (!Number.isFinite(n)) { toast('Not a number'); return }
    const data: CFScenarioData = structuredClone(active.data ?? {})
    const pj = ((data.periods ??= {})[period] ??= {})
    const overrides = (pj.overrides ??= {})
    if (filed != null && n === filed) delete overrides[key]
    else overrides[key] = n
    save(data)
  }

  const addAdjustment = async (period: string) => {
    const label = await promptDialog(`Add-back / adjustment · ${period}`, 'Description (e.g. One-time equipment write-off)')
    if (!label || !active) return
    const raw = await promptDialog(label, 'Amount — negative or (parens) to deduct', { confirmText: 'Next' })
    if (raw == null) return
    const amount = Number(raw.replace(/[$,()\s]/g, ''))
    if (!Number.isFinite(amount) || amount === 0) { toast('Not a number'); return }
    const negative = raw.trim().startsWith('(') || raw.trim().startsWith('-')
    const note = await promptDialog(label, 'Why? (kept for the exam trail)', { confirmText: 'Add' })
    if (note == null) return
    const data: CFScenarioData = structuredClone(active.data ?? {})
    const pj = ((data.periods ??= {})[period] ??= {})
    ;(pj.adjustments ??= []).push({
      id: crypto.randomUUID(), label, amount: negative ? -Math.abs(amount) : Math.abs(amount),
      note, by: await currentUserName(),
    })
    save(data)
  }

  const removeAdjustment = async (period: string, adj: CFAdjustment) => {
    if (!active) return
    if (!(await confirmDialog(`Remove "${adj.label}"?`, `${fmt(adj.amount)} · ${period}${adj.note ? ` — ${adj.note}` : ''}`, { danger: true, confirmText: 'Remove' }))) return
    const data: CFScenarioData = structuredClone(active.data ?? {})
    const pj = data.periods?.[period]
    if (pj?.adjustments) pj.adjustments = pj.adjustments.filter(a => a.id !== adj.id)
    save(data)
  }

  const setGuarantorField = (gid: string, field: 'income' | 'personal_debt' | 'living', raw: string) => {
    if (!active) return
    const data: CFScenarioData = structuredClone(active.data ?? {})
    const gi = ((data.guarantors ??= {})[gid] ??= {})
    const n = raw.trim() === '' ? null : Number(raw.replace(/[$,]/g, ''))
    if (n !== null && !Number.isFinite(n)) return
    gi[field] = n
    save(data)
  }

  const setProposed = (field: 'amount' | 'rate_pct' | 'amort_months', raw: string) => {
    if (!active) return
    const data: CFScenarioData = structuredClone(active.data ?? {})
    const p = (data.proposed ??= {})
    const n = raw.trim() === '' ? undefined : Number(raw.replace(/[$,%]/g, ''))
    if (n !== undefined && !Number.isFinite(n)) return
    p[field] = n
    save(data)
  }

  if (scenarios === null) return null
  const first = cols[0]

  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <div className="uw-head">
        <span><b>Cash flow</b> <span className="small">global — business + guarantors vs. live debt service</span></span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {scenarios.map(s => (
            <button key={s.id} className={`f-chip ${s.id === activeId ? 'on' : ''}`} onClick={() => setActiveId(s.id)}>{s.name}</button>
          ))}
          <button className="btn-light" onClick={addScenario} title="New scenario, copied from the active one"><Ico.plus /> Scenario</button>
          {active && !active.is_base && <button className="btn-light" onClick={deleteScenario} aria-label={`Delete scenario ${active.name}`}><Ico.x /></button>}
        </span>
      </div>

      {!active || !cols.length ? (
        <p className="small" style={{ padding: 14 }}>
          {!active
            ? 'No scenarios yet — create one to start the cash flow.'
            : 'No reviewed spreads yet. Upload a tax return on one of their loans and review the draft spread; the cash flow builds itself from there.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          {/* Keyed by scenario: the uncontrolled inputs must remount when switching. */}
          <table key={active.id}>
            <thead><tr>
              <th>Line</th>
              {cols.map(c => <th key={c.period} style={cell}>{c.period}</th>)}
              <th />
            </tr></thead>
            <tbody>
              <tr>
                <td>EBITDA <span className="small">from reviewed spread</span></td>
                {cols.map(c => (
                  <td key={c.period} style={cell}>
                    <button className="linkish" onClick={() => overrideValue(c.period, 'ebitda', c.ebitdaFiled, c.ebitda)}
                      title={c.ebitdaOverridden ? `Overridden — as filed: ${fmt(c.ebitdaFiled)}. Click to change.` : 'Click to override'}>
                      {fmt(c.ebitda)}{c.ebitdaOverridden && ' *'}
                    </button>
                  </td>
                ))}
                <td />
              </tr>
              <tr>
                <td>Less: distributions</td>
                {cols.map(c => (
                  <td key={c.period} style={cell}>
                    <button className="linkish" onClick={() => overrideValue(c.period, 'distributions', c.distributionsFiled, c.distributions)}
                      title={c.distributionsOverridden ? `Overridden — as filed: ${fmt(c.distributionsFiled)}. Click to change.` : 'Click to override'}>
                      {fmt(c.distributions == null ? null : -c.distributions)}{c.distributionsOverridden && ' *'}
                    </button>
                  </td>
                ))}
                <td />
              </tr>

              {/* Free-form judgment: unlimited named add-backs per period. */}
              {[...new Set(cols.flatMap(c => c.adjustments.map(a => a.id)))].map(id => {
                const any = cols.flatMap(c => c.adjustments).find(a => a.id === id)!
                return (
                  <tr key={id}>
                    <td className="small" title={`${any.note ?? ''}${any.by ? ` — ${any.by}` : ''}`}>
                      ↳ {any.label}{any.note && ' †'}
                    </td>
                    {cols.map(c => {
                      const a = c.adjustments.find(x => x.id === id)
                      return (
                        <td key={c.period} style={cell}>
                          {a ? (
                            <button className="linkish" onClick={() => removeAdjustment(c.period, a)} title="Click to remove this adjustment">
                              {fmt(a.amount)}
                            </button>
                          ) : <span className="small">—</span>}
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                )
              })}
              <tr>
                <td className="small" colSpan={cols.length + 2}>
                  {cols.map(c => (
                    <button key={c.period} className="linkish small" style={{ marginRight: 12 }} onClick={() => addAdjustment(c.period)}>
                      <Ico.plus /> Add-back · {c.period}
                    </button>
                  ))}
                </td>
              </tr>

              <tr style={{ fontWeight: 600 }}>
                <td>Business cash flow</td>
                {cols.map(c => <td key={c.period} style={cell}>{fmt(c.businessCF)}</td>)}
                <td />
              </tr>

              {guarantors.map(g => {
                const gi = active.data?.guarantors?.[g.id] ?? {}
                return (
                  <tr key={g.id}>
                    <td className="small">{g.name} <span title="Guarantor cash flow: income − personal debt − living allowance">(guarantor)</span></td>
                    <td colSpan={cols.length} style={{ textAlign: 'right' }}>
                      <span className="small">income </span>
                      <input style={inputCss} aria-label={`${g.name} annual income`} defaultValue={gi.income ?? ''}
                        onBlur={e => setGuarantorField(g.id, 'income', e.target.value)} />
                      <span className="small"> − debt </span>
                      <input style={inputCss} aria-label={`${g.name} personal debt service`} defaultValue={gi.personal_debt ?? ''}
                        onBlur={e => setGuarantorField(g.id, 'personal_debt', e.target.value)} />
                      <span className="small"> − living </span>
                      <input style={inputCss} aria-label={`${g.name} living allowance`} defaultValue={gi.living ?? ''}
                        onBlur={e => setGuarantorField(g.id, 'living', e.target.value)} />
                    </td>
                    <td style={cell}>{gi.income != null ? fmt(Number(gi.income) - Number(gi.personal_debt ?? 0) - Number(gi.living ?? 0)) : <span className="small">—</span>}</td>
                  </tr>
                )
              })}

              <tr style={{ fontWeight: 600 }}>
                <td>Global cash flow</td>
                {cols.map(c => <td key={c.period} style={cell}>{fmt(c.globalCF)}</td>)}
                <td />
              </tr>

              <tr>
                <td>Existing debt service <span className="small">live · {loans.filter(l => l.next_payment_amount).length} loans</span></td>
                {cols.map(c => <td key={c.period} style={cell}>{fmt(-c.existingDS)}</td>)}
                <td />
              </tr>
              <tr>
                <td className="small">
                  Proposed debt · $<input style={{ ...inputCss, width: 100 }} aria-label="Proposed loan amount" defaultValue={active.data?.proposed?.amount ?? ''}
                    onBlur={e => setProposed('amount', e.target.value)} placeholder="amount" />
                  {' at '}<input style={{ ...inputCss, width: 56 }} aria-label="Proposed rate percent" defaultValue={active.data?.proposed?.rate_pct ?? ''}
                    onBlur={e => setProposed('rate_pct', e.target.value)} placeholder="%" />%
                  {' / '}<input style={{ ...inputCss, width: 56 }} aria-label="Proposed amortization months" defaultValue={active.data?.proposed?.amort_months ?? ''}
                    onBlur={e => setProposed('amort_months', e.target.value)} placeholder="mo" />mo
                </td>
                {cols.map(c => <td key={c.period} style={cell}>{c.proposedDS ? fmt(-c.proposedDS) : <span className="small">—</span>}</td>)}
                <td />
              </tr>

              <tr style={{ fontWeight: 700 }}>
                <td>Global DSCR</td>
                {cols.map(c => (
                  <td key={c.period} style={cell}>
                    {c.dscr == null ? '—' : (
                      <span className={`status ${c.dscr >= 1.25 ? 's-green' : c.dscr >= 1.1 ? 's-amber' : 's-red'}`}>
                        {c.dscr.toFixed(2)}x
                      </span>
                    )}
                  </td>
                ))}
                <td />
              </tr>
              <tr>
                <td>Excess cash flow</td>
                {cols.map(c => <td key={c.period} style={cell}>{fmt(c.excess)}</td>)}
                <td />
              </tr>
            </tbody>
          </table>
          {first && (
            <p className="small" style={{ padding: '8px 14px' }}>
              * overridden from as-filed (hover for the filed value) · † has a note (hover) ·
              debt service recomputes from live loan payments{first.proposedDS ? ' + the proposed facility' : ''} — nothing here is stored, only your judgment is.
            </p>
          )}

          {/* Rate sensitivity on the ACTIVE scenario's latest-period cash flow: only
              floating notes reprice; fixed notes hold until their reset date. */}
          {(() => {
            const last = cols[cols.length - 1]
            if (!last || last.globalCF == null) return null
            const comp = dsComposition(loans)
            if (!comp.totalDS && !last.proposedDS) return null
            const be125 = breakevenBps(last.globalCF, comp, last.proposedDS, 1.25)
            return (
              <div style={{ borderTop: '1px solid var(--line)', padding: '12px 14px 14px' }}>
                <div className="small" style={{ textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600, marginBottom: 8 }}>
                  Rate sensitivity · {last.period} cash flow
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                  {[0, ...RATE_SHOCKS].map(bps => {
                    const s = shockedDscr(last.globalCF, comp, last.proposedDS, bps)
                    return (
                      <span key={bps} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                        <span className="small mono">{bps === 0 ? 'today' : `+${bps}bp`}</span>
                        {s.dscr == null ? <span className="small">—</span> : (
                          <span className={`status ${s.dscr >= 1.25 ? 's-green' : s.dscr >= 1 ? 's-amber' : 's-red'}`}>{s.dscr.toFixed(2)}x</span>
                        )}
                      </span>
                    )
                  })}
                </div>
                <p className="small" style={{ margin: '8px 0 0' }}>
                  {comp.floatN
                    ? <>{money(comp.floatBal)} floats across {comp.floatN} note{comp.floatN === 1 ? '' : 's'}; fixed notes hold until reset. {be125 !== null && (be125 >= 0
                        ? <>Holds ≥ 1.25x up to <b>+{be125}bp</b>.</>
                        : <>Already below 1.25x before any shock.</>)}</>
                    : 'Every note is fixed-rate — debt service is immune to rate moves until reset dates.'}
                </p>
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
