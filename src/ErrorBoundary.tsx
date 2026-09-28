import { Component, ReactNode } from 'react'

// React 18 unmounts the ENTIRE tree on any uncaught render error — the user
// sees a black page while background work keeps running. Never acceptable:
// a bad payload in one card must not hide the rest of the screen. Wrap each
// risky subtree so a crash renders an inline, reportable error instead.
export class Boundary extends Component<{ label: string; children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  componentDidCatch(err: Error) { console.error(`[NoteSolo] ${this.props.label} crashed:`, err) }
  render() {
    if (this.state.err) {
      return (
        <div className="grid" style={{ marginBottom: 20, padding: 14 }}>
          <span className="status s-red">
            {this.props.label} hit a display error — the data is safe, the rest of the page keeps working.
          </span>
          <div className="small mono" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
            {String(this.state.err)}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
