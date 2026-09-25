import { DealSheet } from './types'
import { SAMPLE_DEAL, SAMPLE_BIZ_DEAL } from './sample'
import { supabase, SPREAD_DOC_TYPES } from './supabase'

// Extraction API base URL: ?api=https://host → persisted to localStorage → VITE_API_URL → none (demo mode).
const fromQuery = new URLSearchParams(window.location.search).get('api')
if (fromQuery) localStorage.setItem('notesolo.api', fromQuery.replace(/\/$/, ''))
export const API_URL: string | null =
  localStorage.getItem('notesolo.api') || (import.meta.env.VITE_API_URL as string | undefined) || null

export const STEPS = ['Rendering pages', 'OCR — Unlimited-OCR', 'Extracting deal fields', 'Underwriting']

// ——— Model-gateway helpers (open-source stack on your GPU box; no-ops when the box is off) ———

const gw = async (path: string, body: unknown): Promise<Record<string, unknown> | null> => {
  if (!API_URL) return null
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) return null
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

export async function gatewayHealth(): Promise<'off' | 'mock' | 'up' | 'down'> {
  if (!API_URL) return 'off'
  try {
    const d = await (await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(4000) })).json()
    if (d.mock) return 'mock'
    return d.models?.ocr === 'up' && d.models?.llm === 'up' ? 'up' : 'down'
  } catch {
    return 'off'
  }
}

export const aiSpread = (documentId: string) => gw('/api/spread', { document_id: documentId })
export const aiClassify = (documentId: string) => gw('/api/classify', { document_id: documentId })
export const aiAsk = (question: string) => gw('/api/ask', { question }) as Promise<{ answer: string; rows: Record<string, unknown>[] } | null>
export const aiDraft = (kind: 'annual_review' | 'brief' | 'credit_memo', loanId?: string, dealId?: string) =>
  gw('/api/draft', { kind, loan_id: loanId ?? null, deal_id: dealId ?? null }) as Promise<{ markdown: string } | null>

/** After any upload: classify by content, then spread financial statements. Fire-and-forget. */
export async function aiProcessDocument(documentId: string, docType: string, hasCustomer: boolean) {
  if (!API_URL) return
  let type = docType
  const cls = await aiClassify(documentId)
  if (cls?.doc_type) { type = cls.doc_type as string; hasCustomer = hasCustomer || !!cls.matched }
  if (hasCustomer && SPREAD_DOC_TYPES.includes(type)) await aiSpread(documentId)
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Runs the pipeline; `onStep` is called as each stage begins (0-based).
 *  `sample` replays a bundled deal (works with or without an API configured). */
export async function extractMemo(file: File | null, onStep: (i: number) => void, sample?: 'om' | 'tax_return'): Promise<DealSheet> {
  if (!API_URL || !file || sample) {
    // Demo mode — replay a bundled sample with realistic pacing.
    const deal = sample === 'tax_return' ? SAMPLE_BIZ_DEAL : SAMPLE_DEAL
    for (let i = 0; i < STEPS.length; i++) { onStep(i); await wait(i === 1 ? 1800 : 900) }
    return { ...deal, source: { ...deal.source, filename: file?.name ?? deal.source.filename } }
  }
  onStep(0)
  const body = new FormData()
  body.append('file', file)
  const ticker = setTimeout(() => onStep(1), 1500)
  const ticker2 = setTimeout(() => onStep(2), 15000)
  try {
    const res = await fetch(`${API_URL}/api/extract`, { method: 'POST', body })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    onStep(3)
    return (await res.json()) as DealSheet
  } finally {
    clearTimeout(ticker); clearTimeout(ticker2)
  }
}
