import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { Boundary } from './ErrorBoundary'
import './styles.css'

// A file dropped anywhere OUTSIDE a drop zone must never navigate the tab to the
// file (Chrome then replaces the app with its dark PDF viewer — "the page went
// dark"). Drop zones still work: their own handlers run before these defaults.
window.addEventListener('dragover', e => e.preventDefault())
window.addEventListener('drop', e => e.preventDefault())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary label="NoteSolo"><App /></Boundary>
  </React.StrictMode>,
)
