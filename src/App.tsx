import { useEffect, useState } from 'react'
import Marketing from './Marketing'
import Screener from './Screener'
import Dashboard from './Dashboard'
import Loans from './Loans'
import LoanPage from './LoanPage'
import Reports from './Reports'
import Search from './Search'
import SharePage from './SharePage'
import Portal from './Portal'
import { SignIn, Onboarding } from './Auth'
import { useSession } from './useSession'
import { supabase } from './supabase'
import { DialogHost } from './dialogs'
import { ChatBubble } from './Ai'
import { Ico } from './Icons'

const useHash = () => {
  const [hash, setHash] = useState(window.location.hash || '#/')
  useEffect(() => {
    const fn = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash
}

const NAV = [
  { href: '#/app', key: '', icon: Ico.status, label: 'Home' },
  { href: '#/app/portfolio', key: 'portfolio', icon: Ico.doc, label: 'Loans' },
  { href: '#/app/pipeline', key: 'pipeline', icon: Ico.filter, label: 'Pipeline' },
  { href: '#/app/borrowers', key: 'borrowers', icon: Ico.building, label: 'Businesses' },
  { href: '#/app/guarantors', key: 'guarantors', icon: Ico.person, label: 'Guarantors' },
  { href: '#/app/deposits', key: 'deposits', icon: Ico.dollar, label: 'Deposits' },
  { href: '#/app/screener', key: 'screener', icon: Ico.search, label: 'Screener' },
  { href: '#/app/reports', key: 'reports', icon: Ico.percent, label: 'Reports' },
]
// Saved portfolio views and book segments (wired to the portfolio; filters come next).
const SAVED_VIEWS = [
  { label: 'Covenants & Annual Reviews', dot: '#4f63f5' },
  { label: 'Late Pays', dot: '#d33030' },
  { label: 'Upcoming Maturities', dot: '#b45309' },
  { label: 'Construction', dot: '#7c5cd6' },
  { label: 'Modifications', dot: '#0d8a99' },
  { label: 'Watchlist', dot: '#e07b39' },
]
const SEGMENTS = ['C&I', 'CRE — Investor', 'CRE — Owner-Occupied', 'SBA', 'Multifamily', 'Participations']
const TICKLERS = ['Personal financial statement', 'Personal tax return', 'Business tax return', 'Quarterly income statement']
// Detail routes highlight their parent section.
const PARENT: Record<string, string> = { loans: 'portfolio' }

export default function App() {
  const hash = useHash()
  const app = useSession()
  const route = hash.replace(/^#\//, '')
  const parts = route.split('/').map(decodeURIComponent)
  const [section, sub, subId, sub2] = parts
  const authed = !!app.session

  useEffect(() => {
    if (!app.loading && section === 'app' && !authed) window.location.hash = '#/signin'
  }, [app.loading, section, authed])

  // Public share room and borrower portal: standalone, no chrome.
  if (section === 'share' && sub) {
    return <div className="pub"><SharePage token={sub} /></div>
  }
  if (section === 'portal' && sub) {
    return <div className="pub"><Portal token={sub} /></div>
  }

  // Marketing page carries its own (dark) chrome.
  if (section === '') {
    return <><Marketing authed={authed} /><DialogHost /></>
  }

  // ——— Public site (auth / demo screener) ———
  if (section !== 'app') {
    return (
      <div className="pub">
        <header className="topbar">
          <a className="brand" href="#/" aria-label="NoteSolo home" style={{ color: 'inherit' }}><Ico.logo /></a>
          <nav className="navlinks">
            <a href="#/screener" className={section === 'screener' ? 'on' : ''}>Try the screener</a>
          </nav>
          <span className="spacer" />
          {authed ? (
            <a className="btn-dark" href="#/app" style={{ textDecoration: 'none' }}>Open the app <Ico.chevron /></a>
          ) : (
            <>
              <a className="btn-light" href="#/signin" style={{ textDecoration: 'none' }}>Sign in</a>
              <a className="btn-dark" href="#/signup" style={{ textDecoration: 'none' }}>Start free</a>
            </>
          )}
        </header>
        <div className="page">
          {section === 'signin' && <SignIn mode="signin" />}
          {section === 'signup' && <SignIn mode="signup" />}
          {section === 'screener' && <Screener org={null} />}
        </div>
        <DialogHost />
      </div>
    )
  }

  // ——— The app: sidebar shell ———
  const activeKey = PARENT[sub] ?? sub ?? ''
  const body =
    app.loading ? null
    : !authed ? null
    : !app.org ? <Onboarding app={app} />
    : sub === 'loans' && subId ? <LoanPage org={app.org} loanId={subId} initialTab={sub2} />
    : sub === 'pipeline' ? <Loans org={app.org} pipeline />
    : sub === 'portfolio' || sub === 'loans' || sub === 'borrowers' || sub === 'guarantors' || sub === 'deposits' ? <Loans org={app.org} />
    : sub === 'reports' ? <Reports org={app.org} />
    : sub === 'screener' ? <Screener org={app.org} />
    : <Dashboard org={app.org} />

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <a className="side-logo" href="#/app"><Ico.logo /> <span>NoteSolo</span></a>
        {authed && app.org && <Search />}
        {NAV.map(n => {
          const I = n.icon
          return <a key={n.href} href={n.href} className={activeKey === n.key ? 'on' : ''}><I /> {n.label}</a>
        })}
        <div className="side-group">Saved views <span className="plus">+</span></div>
        {SAVED_VIEWS.map(v => (
          <a key={v.label} href="#/app/portfolio"><span className="sv-dot" style={{ background: v.dot }} /> {v.label}</a>
        ))}
        <div className="side-group">Ticklers <span className="plus">+</span></div>
        {TICKLERS.map(t => (
          <a key={t} href="#/app/portfolio"><Ico.cal /> {t}</a>
        ))}
        <div className="side-group">Segments <span className="plus">+</span></div>
        {SEGMENTS.map(sg => (
          <a key={sg} href="#/app/portfolio"><Ico.tag /> {sg}</a>
        ))}
        <div className="side-foot">
          <div className="small" style={{ color: 'inherit' }}>{app.org?.name}</div>
          <div className="small" style={{ opacity: .7, marginBottom: 8 }}>{app.session?.user.email}</div>
          <button className="side-signout" onClick={() => supabase.auth.signOut().then(() => (window.location.hash = '#/'))}>Sign out</button>
        </div>
      </nav>
      <div className="main">
        <div className="page">
          {app.loading ? <p className="subtitle">Loading…</p> : body}
        </div>
      </div>
      {authed && app.org && <ChatBubble />}
      <DialogHost />
    </div>
  )
}
