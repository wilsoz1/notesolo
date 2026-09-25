import { useEffect, useState } from 'react'
import Marketing from './Marketing'
import Screener from './Screener'
import Today from './Today'
import Loans from './Loans'
import LoanPage from './LoanPage'
import Search from './Search'
import SharePage from './SharePage'
import { SignIn, Onboarding } from './Auth'
import { useSession } from './useSession'
import { supabase } from './supabase'
import { DialogHost } from './dialogs'
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
  { href: '#/app', key: '', icon: Ico.status, label: 'Today' },
  { href: '#/app/portfolio', key: 'portfolio', icon: Ico.doc, label: 'Portfolio' },
  { href: '#/app/screener', key: 'screener', icon: Ico.search, label: 'Screener' },
]
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

  // Public share room: standalone, no chrome.
  if (section === 'share' && sub) {
    return <div className="pub"><SharePage token={sub} /></div>
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
    : sub === 'portfolio' || sub === 'loans' || sub === 'borrowers' ? <Loans org={app.org} />
    : sub === 'screener' ? <Screener org={app.org} />
    : <Today org={app.org} />

  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <a className="side-logo" href="#/app"><Ico.logo /> <span>NoteSolo</span></a>
        {NAV.map(n => {
          const I = n.icon
          return <a key={n.href} href={n.href} className={activeKey === n.key ? 'on' : ''}><I /> {n.label}</a>
        })}
        <div className="side-foot">
          <div className="small" style={{ color: 'inherit' }}>{app.org?.name}</div>
          <div className="small" style={{ opacity: .7, marginBottom: 8 }}>{app.session?.user.email}</div>
          <button className="side-signout" onClick={() => supabase.auth.signOut().then(() => (window.location.hash = '#/'))}>Sign out</button>
        </div>
      </nav>
      <div className="main">
        <header className="appbar">
          {authed && app.org && <Search />}
        </header>
        <div className="page">
          {app.loading ? <p className="subtitle">Loading…</p> : body}
        </div>
      </div>
      <DialogHost />
    </div>
  )
}
