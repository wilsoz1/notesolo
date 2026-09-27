// The borrower's portal: no account, no password manager — the capability is the
// unguessable link their lender sent (plus optional passcode), expiring and revocable.
// They see what the bank is waiting for and upload against each request.
// PortalCard below is the banker's side: mint links, make requests, watch them land.
import { useEffect, useRef, useState } from 'react'
import { supabase, Org } from './supabase'
import { confirmDialog, promptDialog, toast } from './dialogs'
import { Ico } from './Icons'

const FN = 'https://ngmpmyuwacwbwtqtinos.supabase.co/functions/v1/portal'

type PortalState = {
  lender: string
  borrower: string
  expires_at: string
  requests: { id: string; title: string; note: string | null; status: string; created_at: string; received_at: string | null; loans: { loan_number: string } | null }[]
}

export default function Portal({ token }: { token: string }) {
  const [state, setState] = useState<PortalState | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [needsPasscode, setNeedsPasscode] = useState(false)
  const [passcode, setPasscode] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileFor = useRef<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = async (pc?: string) => {
    setErr(null)
    try {
      const res = await fetch(`${FN}?token=${token}${pc ? `&passcode=${encodeURIComponent(pc)}` : ''}`)
      const body = await res.json()
      if (!res.ok) {
        setNeedsPasscode(!!body.needs_passcode)
        setErr(body.error ?? 'Something went wrong.')
        return
      }
      setNeedsPasscode(false)
      setState(body)
    } catch {
      setErr('Could not reach the portal — check your connection and try again.')
    }
  }
  useEffect(() => { load() }, [token])

  const upload = async (file: File) => {
    const requestId = fileFor.current
    if (!requestId) return
    setBusyId(requestId); setErr(null)
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await fetch(`${FN}?token=${token}&request_id=${requestId}${passcode ? `&passcode=${encodeURIComponent(passcode)}` : ''}`, { method: 'POST', body })
      const out = await res.json()
      if (!res.ok) setErr(out.error ?? 'Upload failed — try again.')
      else await load(passcode || undefined)
    } catch {
      setErr('Upload failed — check your connection and try again.')
    }
    setBusyId(null)
  }

  if (err && !state && !needsPasscode) {
    return <div className="share-box"><h1>Document portal</h1><p className="subtitle">{err}</p></div>
  }
  if (needsPasscode) {
    return (
      <div className="share-box">
        <h1>Document portal</h1>
        <p className="subtitle">{err ?? 'This portal requires a passcode.'}</p>
        <form onSubmit={e => { e.preventDefault(); load(passcode) }}>
          <input value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Passcode" aria-label="Portal passcode" autoFocus />
          <button className="btn-dark" style={{ marginTop: 10 }}>Open portal</button>
        </form>
      </div>
    )
  }
  if (!state) return <div className="share-box"><h1>Document portal</h1><p className="subtitle">Opening…</p></div>

  const open = state.requests.filter(r => r.status === 'open')
  const done = state.requests.filter(r => r.status !== 'open')

  return (
    <div className="share-box" style={{ maxWidth: 660 }}>
      <input ref={input} type="file" accept="application/pdf,image/*" hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      <h1>{state.borrower}</h1>
      <p className="subtitle">Secure document portal provided by {state.lender}. Uploads go directly to your lender — nothing here is public.</p>
      {err && <div className="demo-note" style={{ marginBottom: 14 }}>{err}</div>}

      <div className="grid" style={{ marginBottom: 18 }}>
        <div className="uw-head"><span><b>Requested documents</b> <span className="small">{open.length ? `${open.length} outstanding` : 'nothing outstanding'}</span></span></div>
        {open.length === 0 && <p className="small" style={{ padding: 16 }}><Ico.check /> You're all caught up — nothing is waiting on you.</p>}
        {open.map(r => (
          <div className="wq-row" key={r.id}>
            <span style={{ flex: 1 }}>
              <b>{r.title}</b>{r.loans?.loan_number && <span className="small"> · loan {r.loans.loan_number}</span>}
              {r.note && <div className="small">{r.note}</div>}
            </span>
            <button className="btn-dark" disabled={busyId === r.id}
              onClick={() => { fileFor.current = r.id; input.current?.click() }}>
              {busyId === r.id ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <div className="grid">
          <div className="uw-head"><span><b>Received</b></span></div>
          {done.map(r => (
            <div className="wq-row" key={r.id}>
              <span style={{ flex: 1 }}>{r.title}</span>
              <span className="status s-green"><Ico.check /> Received{r.received_at ? ` ${new Date(r.received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <p className="small" style={{ marginTop: 14 }}>
        PDF or scanned images, up to 25MB each. This link expires {new Date(state.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} and every visit is logged for your lender.
      </p>
    </div>
  )
}

// ——— Banker side: mint the portal, make requests, watch documents land ———

type PortalRow = { id: string; token: string; passcode: string | null; expires_at: string; revoked: boolean; access_count: number; last_accessed_at: string | null }
type RequestRow = { id: string; title: string; note: string | null; status: string; created_at: string; received_at: string | null; loan_id: string | null; document_id: string | null }

const portalUrl = (token: string) => `${window.location.origin}/#/portal/${token}`
const hex48 = () => Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')

export function PortalCard({ org, customerId, loanId, onChange }: { org: Org; customerId: string; loanId: string; onChange?: () => void }) {
  const [portal, setPortal] = useState<PortalRow | null>(null)
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = async () => {
    const [p, r] = await Promise.all([
      supabase.from('borrower_portals').select('*').eq('customer_id', customerId).eq('revoked', false)
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('doc_requests').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    ])
    setPortal((p.data as PortalRow[])?.[0] ?? null)
    setRequests((r.data as RequestRow[]) ?? [])
    setLoaded(true)
  }
  useEffect(() => { load() }, [customerId])

  const createPortal = async () => {
    const passcode = await promptDialog('Portal passcode (optional)', 'Leave a word the borrower knows, or type none', { initial: 'none', confirmText: 'Create portal' })
    if (passcode === null) return
    const expires = new Date(Date.now() + 30 * 86400000).toISOString()
    const { data, error } = await supabase.from('borrower_portals').insert({
      org_id: org.id, customer_id: customerId, token: hex48(),
      passcode: passcode.trim().toLowerCase() === 'none' || !passcode.trim() ? null : passcode.trim(),
      expires_at: expires,
    }).select().single()
    if (error) { toast(`Could not create portal: ${error.message}`); return }
    navigator.clipboard?.writeText(portalUrl((data as PortalRow).token)).catch(() => {})
    toast('Portal link created and copied — send it to the borrower')
    load()
  }

  const revoke = async () => {
    if (!portal) return
    if (!(await confirmDialog('Close this portal?', 'The borrower’s link stops working immediately. Open requests stay on file.', { danger: true, confirmText: 'Close portal' }))) return
    await supabase.from('borrower_portals').update({ revoked: true }).eq('id', portal.id)
    toast('Portal closed')
    load()
  }

  const addRequest = async () => {
    const title = await promptDialog('Request a document', 'What do you need? (e.g. FY 2026 business tax return)')
    if (!title) return
    const { error } = await supabase.from('doc_requests').insert({
      org_id: org.id, customer_id: customerId, loan_id: loanId, title,
    })
    if (error) { toast(`Could not create request: ${error.message}`); return }
    toast(portal ? 'Request added — it appears in the borrower’s portal' : 'Request added — create a portal link so the borrower can fulfil it')
    load()
  }

  const accept = async (r: RequestRow) => {
    await supabase.from('doc_requests').update({ status: 'accepted' }).eq('id', r.id)
    load(); onChange?.()
  }

  if (!loaded) return null
  const openN = requests.filter(r => r.status === 'open').length

  return (
    <div className="grid" style={{ marginBottom: 20 }}>
      <div className="uw-head">
        <span><b>Borrower portal</b> <span className="small">
          {portal
            ? `link active · ${portal.access_count} visit${portal.access_count === 1 ? '' : 's'} · expires ${new Date(portal.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${portal.passcode ? ' · passcode set' : ''}`
            : 'no active link — the borrower cannot upload yet'}
        </span></span>
        <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn-light" onClick={addRequest}><Ico.plus /> Request a document</button>
          {portal ? (
            <>
              <button className="btn-light" onClick={() => { navigator.clipboard?.writeText(portalUrl(portal.token)).catch(() => {}); toast('Portal link copied') }}>Copy link</button>
              <button className="btn-light" onClick={revoke} aria-label="Close portal"><Ico.x /></button>
            </>
          ) : (
            <button className="btn-dark" onClick={createPortal}>Create portal link</button>
          )}
        </span>
      </div>
      {requests.length === 0 && <p className="small" style={{ padding: '0 14px 14px' }}>No document requests yet. Request what you need; the borrower uploads against it and the file lands here for review.</p>}
      {requests.map(r => (
        <div className="wq-row" key={r.id}>
          <span style={{ flex: 1 }}>{r.title}{r.note && <span className="small"> · {r.note}</span>}</span>
          {r.status === 'open' && <span className="status s-gray">Waiting{openN && !portal ? ' · no link yet' : ''}</span>}
          {r.status === 'received' && (
            <>
              <span className="status s-amber"><Ico.clock /> Received — review</span>
              <button className="btn-light" onClick={() => accept(r)}>Accept</button>
            </>
          )}
          {r.status === 'accepted' && <span className="status s-green"><Ico.check /> Accepted</span>}
        </div>
      ))}
    </div>
  )
}
