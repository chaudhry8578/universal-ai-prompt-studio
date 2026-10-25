import { useState } from 'react'
import type { FormEvent } from 'react'
import { readJsonResponse } from './api-response'

export async function requestAdminBootstrap(token: string): Promise<string> {
  const response = await fetch('/api/auth/bootstrap', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
  })
  const payload = await readJsonResponse(response, 'Admin activation API')
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'The request could not be completed. Please try again.'
    throw new Error(message)
  }
  if (response.status !== 201) {
    throw new Error(`Admin activation returned an unexpected status (${response.status}).`)
  }
  return typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
    ? payload.message
    : 'Administrator account created.'
}

export default function AdminBootstrapPage() {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [activated, setActivated] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token.trim() || busy || activated) return

    setBusy(true)
    setMessage('')
    setError('')
    try {
      setMessage(await requestAdminBootstrap(token.trim()))
      setActivated(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The request could not be completed. Please try again.')
    } finally {
      setToken('')
      setBusy(false)
    }
  }

  return (
    <main className="app-shell admin-bootstrap-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Return to Universal AI Prompt Studio">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>UNIVERSAL AI<span className="brand-light"> / PROMPT STUDIO</span></span>
        </a>
      </header>
      <section className="admin-bootstrap-card" aria-labelledby="admin-bootstrap-title">
        <div className="eyebrow"><span className="eyebrow-line" /> ONE-TIME SETUP</div>
        <h1 id="admin-bootstrap-title">Activate the first Admin</h1>
        <p>
          Enter the bootstrap token from your private deployment settings. It is sent only to this
          site&apos;s activation endpoint and cleared from the field after the request.
        </p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="admin-bootstrap-token">BOOTSTRAP TOKEN</label>
          <input
            id="admin-bootstrap-token"
            type="password"
            autoComplete="new-password"
            autoCapitalize="none"
            spellCheck={false}
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={busy || activated}
            required
          />
          <button type="submit" disabled={!token.trim() || busy || activated}>
            {busy ? 'ACTIVATING…' : activated ? 'ADMIN ACTIVATED' : 'ACTIVATE ADMIN'}
          </button>
        </form>
        <p className="admin-bootstrap-note">
          This sends a bodyless, same-origin request. The token is not placed in a URL, saved in
          browser storage, or included in a request body.
        </p>
        {message && <p className="admin-bootstrap-message" role="status">{message}</p>}
        {error && <p className="admin-bootstrap-error" role="alert">{error}</p>}
        {activated && <a className="admin-bootstrap-home" href="/">Continue to the studio</a>}
      </section>
    </main>
  )
}
