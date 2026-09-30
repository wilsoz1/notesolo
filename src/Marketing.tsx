// The front door — dark, layered, product-forward. Every mockup on this page is drawn
// from the real product (work queue, spreads, covenants, delinquency outreach).
import './marketing.css'
import { Ico } from './Icons'

const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5v6a4 4 0 004 4h11M14 10l5 5-5 5" />
  </svg>
)

const Spark = ({ color, points, w = 250, h = 64 }: { color: string; points: string; w?: number; h?: number }) => (
  <svg width="100%" viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden="true" style={{ display: 'block' }}>
    <polyline points={points} stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" fill="none" />
  </svg>
)

export default function Marketing({ authed }: { authed: boolean }) {
  const appHref = authed ? '#/app' : '#/signup'
  return (
    <div className="mk">
      <nav className="mk-nav">
        <a className="mk-logo" href="#/"><Ico.logo /> NoteSolo</a>
        <div className="mk-nav-links">
          <a href="#mk-monitoring">Monitoring</a>
          <a href="#mk-features">Features</a>
          <a href="#mk-automation">Automation</a>
          <a href="#/screener">Screener demo</a>
        </div>
        {authed ? (
          <a className="mk-btn-solid" href="#/app">Open the app</a>
        ) : (
          <>
            <a className="mk-btn-ghost" href="#/signin">Log in</a>
            <a className="mk-btn-solid" href="#/signup">Sign up</a>
          </>
        )}
      </nav>

      <div className="mk-frame">
        {/* Hero */}
        <section className="mk-hero">
          <span className="mk-badge">AI portfolio management for commercial lenders</span>
          <h1>Stop Chasing,<br />Start Knowing</h1>
          <p className="mk-sub">From uploaded tax return to tested covenant, your book watches itself — and tells you what needs you.</p>
          <div className="mk-hero-ctas">
            <a className="mk-link" href={appHref}>{authed ? 'Open your dashboard' : 'Start free'} <Arrow /></a>
            <a className="mk-btn-ghost" href="#/screener">Explore the demo</a>
          </div>

          <div className="mk-collage">
            <div className="mk-mock mk-activity" aria-label="Borrower activity example">
              <div className="who">
                <span className="mk-avatar">CO</span>
                <span><b>Cascade Orthodontics</b><span>praman@cascadeortho.com</span></span>
              </div>
              <div className="mk-ev">
                <b>Tax return uploaded</b>
                <span>Sep 11, 2:41 pm</span>
                <div className="mk-tags"><span className="mk-tag">1120-S · FY 2026</span><span className="mk-tag">auto-routed</span></div>
              </div>
              <div className="mk-ev">
                <b>Spread filled</b>
                <span>Sep 11, 2:41 pm</span>
                <div className="mk-tags"><span className="mk-tag">10 line items</span><span className="mk-tag">ties ✓</span></div>
              </div>
              <div className="mk-ev hot">
                <b>Covenant retested</b>
                <span>Sep 11, 2:42 pm</span>
                <div className="mk-tags"><span className="mk-tag">FCC 1.18x vs 1.20x</span></div>
              </div>
            </div>

            <div className="mk-stack" aria-label="Work queue example">
              <div className="mk-row">
                <span className="ic red"><Ico.x /></span>
                <span><b>Cascade Orthodontics — CL-2026-066</b><span className="meta">payment of $17,850 missed</span></span>
                <span className="mk-pill red"><span className="dot" /> 13 days past due</span>
              </div>
              <div className="mk-row">
                <span className="ic amber"><Ico.clock /></span>
                <span><b>Riverbend Partners LLC — annual review</b><span className="meta">production report 12 days late</span></span>
                <span className="mk-pill amber"><span className="dot" /> reporting past due</span>
              </div>
              <div className="mk-row">
                <span className="ic purple"><Ico.doc /></span>
                <span><b>Harbor Point Logistics — T-12 Jun 2026</b><span className="meta">extracted 41s ago</span></span>
                <span className="mk-pill purple"><span className="dot" /> spread ready</span>
              </div>
            </div>

            <div className="mk-mock mk-code" aria-label="Extraction output example">
              <span className="k">POST</span> <span className="f">/api/spread</span>{'\n'}
              {'{'}<br />
              &nbsp;&nbsp;<span className="f">"period"</span>: <span className="s">"FY 2026"</span>,<br />
              &nbsp;&nbsp;<span className="f">"revenue"</span>: <span className="n">6050000</span>,<br />
              &nbsp;&nbsp;<span className="f">"ebitda"</span>: <span className="n">780000</span>,<br />
              &nbsp;&nbsp;<span className="f">"total_debt"</span>: <span className="n">2240000</span>,<br />
              &nbsp;&nbsp;<span className="f">"confidence"</span>: <span className="n">0.92</span>,<br />
              &nbsp;&nbsp;<span className="f">"checks"</span>: <span className="s">"arithmetic ✓"</span><br />
              {'}'}
            </div>
          </div>

          <div className="mk-chips">
            <span><Ico.shield /> Bank-grade row-level security</span>
            <span><Ico.doc /> Complete audit trail</span>
            <span><Ico.sliders /> Your models, your GPU</span>
          </div>
        </section>

        {/* Stat band */}
        <div className="mk-stats" aria-label="Product numbers">
          <div><b>0</b><span>fields re-keyed, memo to core</span></div>
          <div><b>38</b><span>fields read from every memo</span></div>
          <div><b>10</b><span>line items per self-filled spread</span></div>
          <div><b>Daily</b><span>covenant &amp; delinquency runs</span></div>
        </div>

        {/* Monitoring collage */}
        <section className="mk-section" id="mk-monitoring">
          <h2>Every borrower tells a story</h2>
          <p>Real-time monitoring that turns documents into decisions — across start-up, expansion and owner-occupied CRE loans.</p>
          <a className="mk-link" href="#/screener">Explore the live demo <Arrow /></a>
        </section>
        <div className="mk-analytics">
          <div className="mk-panel-card" style={{ width: 300 }}>
            <h4>Outstanding exposure <i>Last 12 months</i></h4>
            <div className="mk-big">$11,860,000</div>
            <div className="mk-delta">▲ 4.2% vs. prior quarter</div>
            <div style={{ marginTop: 14 }}>
              <Spark color="var(--mk-blue)" points="0,52 28,48 56,50 84,40 112,42 140,33 168,36 196,24 224,26 250,14" />
            </div>
          </div>
          <div className="mk-panel-card" style={{ width: 210 }}>
            <h4>Covenants <i>this quarter</i></h4>
            <div className="mk-gauge">
              <svg width="130" height="130" viewBox="0 0 130 130" aria-hidden="true">
                <circle cx="65" cy="65" r="56" stroke="rgba(255,255,255,.08)" strokeWidth="10" fill="none" />
                <circle cx="65" cy="65" r="56" stroke="var(--mk-green)" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray="352" strokeDashoffset="44" />
              </svg>
              <div className="mid"><span><b>24</b><span>tested · 21 pass</span></span></div>
            </div>
            <div className="mk-bar-row"><span className="swatch" style={{ background: 'var(--mk-amber)' }} /> Near threshold <span className="val">2</span></div>
            <div className="mk-bar-row"><span className="swatch" style={{ background: 'var(--mk-red)' }} /> Failing <span className="val">1</span></div>
          </div>
          <div className="mk-panel-card" style={{ width: 280 }}>
            <h4>Portfolio mix <i>by commitment</i></h4>
            {[
              ['Owner-occupied CRE', 'var(--mk-blue)', 44, '$10.9M'],
              ['Expansion loans', 'var(--mk-purple)', 38, '$9.5M'],
              ['Start-up loans', 'var(--mk-green)', 18, '$4.4M'],
            ].map(([label, color, pct, val]) => (
              <div className="mk-bar-row" key={label as string}>
                <span className="swatch" style={{ background: color as string }} />
                <span style={{ width: 128 }}>{label}</span>
                <span className="track"><i style={{ width: `${pct}%`, background: color as string }} /></span>
                <span className="val">{val}</span>
              </div>
            ))}
          </div>
          <div className="mk-panel-card" style={{ width: 300 }}>
            <h4>Past-due dollars <i>rules firing daily</i></h4>
            <div className="mk-big" style={{ color: 'var(--mk-pink)' }}>$17,850</div>
            <div className="mk-delta" style={{ color: 'var(--mk-sub)' }}>1 loan · final notice sent automatically</div>
            <div style={{ marginTop: 14 }}>
              <Spark color="var(--mk-pink)" points="0,20 28,26 56,22 84,34 112,30 140,40 168,34 196,46 224,40 250,52" />
            </div>
          </div>
        </div>

        {/* Feature grid */}
        <section className="mk-section" id="mk-features" style={{ paddingTop: 40 }}>
          <h2>The busywork, gone</h2>
          <p>Four things your analysts do by hand today — running on their own tomorrow.</p>
        </section>
        <div className="mk-grid2">
          <div className="mk-cell">
            <h3>Self-filling spreads</h3>
            <p>Upload a tax return; a populated spread column appears — extracted by open models, verified by arithmetic, waiting only for approval.</p>
            <div className="mk-mini">
              <table>
                <thead><tr><th>Line item</th><th style={{ textAlign: 'right' }}>FY 2025</th><th style={{ textAlign: 'right' }}>FY 2026 · new</th></tr></thead>
                <tbody>
                  <tr><td>Revenue</td><td className="num">$5,640,000</td><td className="num hl">$6,050,000</td></tr>
                  <tr><td>EBITDA</td><td className="num">$690,000</td><td className="num hl">$780,000</td></tr>
                  <tr><td>Total debt</td><td className="num">$2,110,000</td><td className="num hl">$2,240,000</td></tr>
                  <tr><td>Tangible net worth</td><td className="num">$1,290,000</td><td className="num hl">$1,410,000</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="mk-cell">
            <h3>Covenants that test themselves</h3>
            <p>Every new reviewed spread retests DSCR, fixed-charge and leverage covenants — pass, near, or fail, with the source period cited.</p>
            <div className="mk-mini">
              <table>
                <tbody>
                  <tr><td>Minimum DSCR ≥ 1.25x</td><td className="num">1.74x</td><td style={{ textAlign: 'right' }}><span className="mk-pill green"><span className="dot" /> Pass</span></td></tr>
                  <tr><td>Fixed-charge ≥ 1.20x</td><td className="num">1.18x</td><td style={{ textAlign: 'right' }}><span className="mk-pill amber"><span className="dot" /> Near</span></td></tr>
                  <tr><td>Working capital ≥ $400K</td><td className="num">$355K</td><td style={{ textAlign: 'right' }}><span className="mk-pill red"><span className="dot" /> Fail</span></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="mk-cell">
            <h3>Delinquency outreach on rules</h3>
            <p>A payment goes unpaid, your rules fire — email at 5 days, text at 10 — every attempt logged, exam-ready.</p>
            <div className="mk-mini">
              <table>
                <tbody>
                  <tr><td><b style={{ color: 'var(--mk-ink)' }}>5+ days past due</b></td><td><span className="mk-pill blue">email</span></td><td style={{ textAlign: 'right' }}><span className="mk-pill green"><span className="dot" /> enabled</span></td></tr>
                  <tr><td><b style={{ color: 'var(--mk-ink)' }}>10+ days past due</b></td><td><span className="mk-pill blue">email + sms</span></td><td style={{ textAlign: 'right' }}><span className="mk-pill green"><span className="dot" /> enabled</span></td></tr>
                </tbody>
              </table>
            </div>
            <div className="mk-sms">
              FINAL NOTICE: CL-2026-066 payment 13 days past due. Call us today. — First National
              <span>auto · sms · logged 9:31 am</span>
            </div>
          </div>
          <div className="mk-cell">
            <h3>One work queue</h3>
            <p>Open the app to a single, severity-sorted list of everything that needs a human — with the fix one click away.</p>
            <div className="mk-mini">
              <table>
                <tbody>
                  <tr><td><span className="mk-pill red">past due</span></td><td>$17,850 · 13 days on CL-2026-066</td><td style={{ textAlign: 'right', color: 'var(--mk-blue)', fontWeight: 600 }}>Open loan</td></tr>
                  <tr><td><span className="mk-pill amber">covenant</span></td><td>FCC 1.18x vs 1.20x · Bluestem Pediatric</td><td style={{ textAlign: 'right', color: 'var(--mk-blue)', fontWeight: 600 }}>Review</td></tr>
                  <tr><td><span className="mk-pill purple">spread</span></td><td>FY 2026 draft · Cascade Orthodontics</td><td style={{ textAlign: 'right', color: 'var(--mk-blue)', fontWeight: 600 }}>Approve</td></tr>
                  <tr><td><span className="mk-pill blue">tickler</span></td><td>PFS renewal · Saguaro Manufacturing</td><td style={{ textAlign: 'right', color: 'var(--mk-blue)', fontWeight: 600 }}>Request</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Automation / rule editor */}
        <div className="mk-split" id="mk-automation">
          <div>
            <h2>Every reminder,<br />unmistakably yours</h2>
            <a className="mk-link" href={appHref}>Explore automation <Arrow /></a>
          </div>
          <div className="right">
            <p>Templates, thresholds and escalation paths are yours to define — the system just never forgets to follow them.</p>
          </div>
        </div>
        <div className="mk-modal" aria-label="Rule editor example">
          <h4>New delinquency rule</h4>
          <div className="mk-field"><label>Trigger</label><div className="box">Payment 15+ days past due</div></div>
          <div className="mk-field"><label>Channel</label><div className="box">Email + text</div></div>
          <div className="mk-field"><label>Message</label><div className="box">Hi {'{{name}}'}, the {'{{due_date}}'} payment of {'{{amount}}'} on {'{{loan_number}}'} is {'{{days_late}}'} days past due…</div></div>
          <div className="mk-modal-foot">
            <span className="mk-btn-ghost">Cancel</span>
            <span className="mk-btn-solid">Save rule</span>
          </div>
        </div>

        {/* Trio */}
        <div className="mk-trio">
          <div>
            <h4><Ico.link /> Secure share rooms</h4>
            <p>Send a loan's documents to a participant bank with one protected, expiring link — every open logged.</p>
          </div>
          <div>
            <h4><Ico.sliders /> Open-source AI</h4>
            <p>Extraction runs on models you host. No per-token bills, no data leaving your infrastructure.</p>
          </div>
          <div>
            <h4><Ico.building /> Team workspaces</h4>
            <p>Your whole credit team in one book, isolated by row-level security. Teammates join with an invite code.</p>
          </div>
        </div>

        {/* CTA */}
        <section className="mk-cta">
          <h2>Put your book on autopilot</h2>
          <a className="mk-btn-solid" href={appHref} style={{ padding: '12px 24px', fontSize: 15 }}>
            {authed ? 'Open your dashboard' : 'Create your workspace'}
          </a>
          <p style={{ color: 'var(--mk-faint)', fontSize: 13, marginTop: 14 }}>Free during early access · no card required · keep your LOS and core</p>
        </section>

        <footer className="mk-foot">
          <span className="mk-logo" style={{ fontSize: 15 }}><Ico.logo /> NoteSolo</span>
          <span>Early-access preview · demo portfolio data is fictional · not credit advice</span>
        </footer>
      </div>
    </div>
  )
}
