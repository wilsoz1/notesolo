// Shared UI for the model-gateway features: portfolio chat, drafted memos, tiny markdown view.
import { useEffect, useRef, useState } from 'react'
import { API_URL, aiAsk, aiDraft } from './api'
import { Ico } from './Icons'

/** Minimal markdown: ## headings, - bullets, **bold**; everything else is a paragraph. */
export const Md = ({ text }: { text: string }) => (
  <div className="md">
    {text.split('\n').map((line, i) => {
      const bold = (s: string) =>
        s.split(/\*\*(.+?)\*\*/g).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))
      if (line.startsWith('## ')) return <h3 key={i}>{line.slice(3)}</h3>
      if (line.startsWith('# ')) return <h3 key={i}>{line.slice(2)}</h3>
      if (/^\s*[-*] /.test(line)) return <li key={i}>{bold(line.replace(/^\s*[-*] /, ''))}</li>
      if (!line.trim()) return null
      return <p key={i}>{bold(line)}</p>
    })}
  </div>
)

// ——— Portfolio chat: conversational Q&A over the book, always visible ———

type ChatMsg = { role: 'user' | 'assistant'; text: string; rows?: Record<string, unknown>[] }

const cellText = (v: unknown): string => {
  if (v == null) return '—'
  if (Array.isArray(v)) return v.map(cellText).join(' · ')
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return [o.name, o.fico != null ? `FICO ${o.fico}` : null, o.loan_number].filter(Boolean).join(' ') || JSON.stringify(o)
  }
  return v === 'Servicing' ? 'Active' : String(v)
}

const SUGGESTIONS = [
  'loans from 1-5MM with a guarantor FICO below 700',
  'which loans are interest-only?',
  'covenants failing right now',
  'deposits over $200K',
]

export function Chat() {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }) }, [msgs, busy])

  const send = async (text: string) => {
    if (!text.trim() || busy) return
    setQ('')
    setMsgs(m => [...m, { role: 'user', text }])
    setBusy(true)
    const history: { question: string; answer: string }[] = []
    for (let i = 0; i + 1 < msgs.length; i += 1) {
      if (msgs[i].role === 'user' && msgs[i + 1]?.role === 'assistant')
        history.push({ question: msgs[i].text, answer: msgs[i + 1].text })
    }
    const out = await aiAsk(text, history.slice(-4))
    setBusy(false)
    setMsgs(m => [...m, out
      ? { role: 'assistant', text: out.answer, rows: out.rows }
      : { role: 'assistant', text: 'I could not reach the models — is the gateway running? Start it with server/run-local.sh, then try again.' }])
  }

  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <div className="uw-head">
        <span><b>Ask your portfolio</b> <span className="small">open-source models on your own hardware — answers come only from your data</span></span>
        {msgs.length > 0 && <button className="linkish" onClick={() => setMsgs([])}>Clear</button>}
      </div>

      {!API_URL ? (
        <p className="small" style={{ padding: '4px 14px 16px' }}>
          The chat needs your AI gateway. Start it (<span className="mono">server/run-local.sh</span>) and open{' '}
          <span className="mono">notesolo.com/?api=http://localhost:8787</span> once in this browser — the connection is remembered.
        </p>
      ) : (
        <>
          {msgs.length === 0 && !busy && (
            <div className="chat-sugs">
              {SUGGESTIONS.map(s => <button key={s} className="f-chip" onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
          {(msgs.length > 0 || busy) && (
            <div className="chat-msgs" ref={scroller}>
              {msgs.map((m, i) => (
                <div key={i} className={`chat-b ${m.role === 'user' ? 'u' : 'a'}`}>
                  <div>{m.text}</div>
                  {m.rows && m.rows.length > 0 && (
                    <div style={{ overflowX: 'auto', marginTop: 8 }}>
                      <table className="chat-table">
                        <thead><tr>{Object.keys(m.rows[0]).map(k => <th key={k}>{k.replace(/_/g, ' ')}</th>)}</tr></thead>
                        <tbody>
                          {m.rows.slice(0, 8).map((r, j) => (
                            <tr key={j}>{Object.values(r).map((v, c) => <td key={c} className="small">{cellText(v)}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                      {m.rows.length > 8 && <div className="small" style={{ marginTop: 4 }}>…and {m.rows.length - 8} more rows</div>}
                    </div>
                  )}
                </div>
              ))}
              {busy && <div className="chat-b a"><span className="spin" /> Planning the query, checking your book…</div>}
            </div>
          )}
          <form className="askbar" onSubmit={e => { e.preventDefault(); send(q) }}>
            <Ico.search />
            <input
              value={q} onChange={e => setQ(e.target.value)} required
              aria-label="Ask your portfolio"
              placeholder='e.g. "loans from 1-5MM with a guarantor FICO below 700" — follow-ups welcome'
            />
            <button className="btn-dark" disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
          </form>
        </>
      )}
    </div>
  )
}

export function AskBar() {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ answer: string; rows: Record<string, unknown>[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  if (!API_URL) return null

  const ask = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null); setResult(null)
    const out = await aiAsk(q)
    setBusy(false)
    if (!out) { setErr('The model box is not reachable right now — power it on and try again.'); return }
    setResult(out)
  }

  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <form className="askbar" onSubmit={ask}>
        <Ico.search />
        <input
          value={q} onChange={e => setQ(e.target.value)} required
          aria-label="Ask your portfolio"
          placeholder='Ask your portfolio — e.g. "which loans are interest-only?" or "covenants failing right now"'
        />
        <button className="btn-dark" disabled={busy}>{busy ? 'Thinking…' : 'Ask'}</button>
      </form>
      {err && <div className="demo-note" style={{ margin: 12 }}>{err}</div>}
      {result && (
        <div style={{ padding: '4px 14px 14px' }}>
          <p style={{ margin: '8px 0 10px' }}>{result.answer}</p>
          {result.rows.length > 0 && (
            <div className="grid" style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr>{Object.keys(result.rows[0]).map(k => <th key={k}>{k.replace(/_/g, ' ')}</th>)}</tr></thead>
                <tbody>
                  {result.rows.slice(0, 10).map((r, i) => (
                    <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="small">{v == null ? '—' : v === 'Servicing' ? 'Active' : String(v)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function DraftButton({ kind, loanId, dealId, label, onSave }: {
  kind: 'annual_review' | 'brief' | 'credit_memo'; loanId?: string; dealId?: string; label: string
  onSave?: (markdown: string) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  if (!API_URL) return null

  const run = async () => {
    setBusy(true); setSaved(false)
    const out = await aiDraft(kind, loanId, dealId)
    setBusy(false)
    setText(out?.markdown ?? 'The model box is not reachable right now — power it on and try again.')
  }

  return (
    <>
      <button className="btn-light" onClick={run} disabled={busy}><Ico.text /> {busy ? 'Drafting…' : label}</button>
      {text !== null && (
        <div className="draft-overlay" onClick={() => setText(null)}>
          <div className="draft-panel" onClick={e => e.stopPropagation()}>
            <div className="uw-head">
              <span><b>{label}</b> <span className="small">drafted by your models — review before relying on it</span></span>
              <span style={{ display: 'inline-flex', gap: 8 }}>
                <button className="btn-light" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
                {onSave && <button className="btn-light" disabled={saved} onClick={async () => { await onSave(text); setSaved(true) }}>{saved ? 'Saved to notes ✓' : 'Save to notes'}</button>}
                <button className="btn-dark" onClick={() => setText(null)}>Close</button>
              </span>
            </div>
            <div style={{ padding: '4px 18px 18px', overflowY: 'auto' }}><Md text={text} /></div>
          </div>
        </div>
      )}
    </>
  )
}
