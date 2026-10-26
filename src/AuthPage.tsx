import { useState } from 'react'
import type { FormEvent } from 'react'
import { readJsonResponse } from './api-response'
import PasswordInput from './PasswordInput'

type AuthView = 'login' | 'forgot' | 'reset' | 'profile' | 'workspace'
type AuthUser = { id: string; email: string | null; role: 'admin' | 'user' }
type Credits = { date: string; limit: number; used: number; remaining: number }

type AuthPageProps = {
  view: AuthView
  selectedGenerator?: string
  error: string
  onLogin: (username: string, password: string) => Promise<void>
  onNavigate: (view: AuthView) => void
  onLogout: () => void
  user?: AuthUser
  credits?: Credits | null
  resetToken?: string
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false
  const user = value as Record<string, unknown>
  return typeof user.id === 'string' && (typeof user.email === 'string' || user.email === null) &&
    (user.role === 'admin' || user.role === 'user')
}

async function postAuth(path: string, body: unknown): Promise<string> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  const payload = await readJsonResponse(response, 'Authentication API')
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : 'The request could not be completed. Please try again.'
    throw new Error(message)
  }
  return typeof payload === 'object' && payload !== null && 'message' in payload && typeof payload.message === 'string'
    ? payload.message
    : 'Request completed.'
}

export default function AuthPage({
  view,
  selectedGenerator,
  error,
  onLogin,
  onNavigate,
  onLogout,
  user,
  credits,
  resetToken = '',
}: AuthPageProps) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')
  const title = view === 'login' ? 'Welcome back'
    : view === 'forgot' ? 'Reset your password'
      : view === 'reset' ? 'Choose a new password'
        : 'Your profile'

  async function submit(event: FormEvent<HTMLFormElement>, action: () => Promise<void>) {
    event.preventDefault()
    await runAction(action)
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true)
    setMessage('')
    setFormError('')
    try {
      await action()
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'The request could not be completed.')
    } finally {
      setBusy(false)
    }
  }

  async function submitForgot() {
    setMessage(await postAuth('/api/auth/forgot-password', { email }))
  }

  async function submitReset() {
    setMessage(await postAuth('/api/auth/reset-password', { token: resetToken, password }))
    setPassword('')
  }

  return (
    <main className="auth-shell">
      <header className="auth-topbar">
        <a className="auth-brand" href="/" aria-label="Universal AI Prompt Studio home">
          <span className="auth-brand-mark" aria-hidden="true">✳</span>
          <span>UNIVERSAL <i>AI PROMPT STUDIO</i></span>
        </a>
        <a className="auth-home-link" href="/">BACK TO HOME <span aria-hidden="true">↗</span></a>
      </header>

      <section className="auth-content" aria-labelledby="auth-title">
        <div className="auth-art" aria-hidden="true">
          <img src="/images/file_00000000c5e08211873d150d4db39bde.png" alt="" />
          <span>MAKE A LITTLE MAGIC</span>
        </div>
        <div className="auth-card">
          <div className="auth-eyebrow"><span /> PRIVATE CREATOR WORKSPACE</div>
          <h1 id="auth-title">{title}</h1>
          <p className="auth-intro">
            {view === 'login'
              ? selectedGenerator ? `Log in to open ${selectedGenerator}.` : 'Log in to continue to your creative studios.'
              : view === 'forgot' ? 'We’ll email a reset link if an active account matches that Gmail address.'
                : view === 'reset' ? 'Password-reset links expire after 30 minutes and can only be used once.'
                  : 'Your account, security, and daily AI generation allowance.'}
          </p>

          {view === 'login' && (
            <form className="auth-form" onSubmit={(event) => void submit(event, () => onLogin(username, password))}>
              <label htmlFor="auth-username">USERNAME OR GMAIL ADDRESS</label>
              <input id="auth-username" name="username" type="text" autoComplete="username" autoCapitalize="none" maxLength={254} required value={username} onChange={(event) => setUsername(event.target.value)} />
              <small>You can also use your registered Gmail address for existing accounts.</small>
              <label htmlFor="auth-password">PASSWORD</label>
              <PasswordInput id="auth-password" name="password" autoComplete="current-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
              {(error || formError) && <p className="auth-message is-error" role="alert">{formError || error}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'LOGGING IN…' : 'LOG IN'} <span aria-hidden="true">↗</span></button>
            </form>
          )}

          {view === 'forgot' && (
            <form className="auth-form" onSubmit={(event) => void submit(event, submitForgot)}>
              <label htmlFor="auth-forgot-email">REGISTERED GMAIL ADDRESS</label>
              <input id="auth-forgot-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(event) => setEmail(event.target.value)} />
              {message && <p className="auth-message" role="status">{message}</p>}
              {formError && <p className="auth-message is-error" role="alert">{formError}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'REQUESTING…' : 'SEND RESET LINK'} <span aria-hidden="true">↗</span></button>
            </form>
          )}

          {view === 'reset' && (
            <form className="auth-form" onSubmit={(event) => void submit(event, submitReset)}>
              <label htmlFor="auth-reset-password">NEW WEBSITE PASSWORD</label>
              <PasswordInput id="auth-reset-password" name="new-password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
              {message && <p className="auth-message" role="status">{message}</p>}
              {formError && <p className="auth-message is-error" role="alert">{formError}</p>}
              <button className="auth-submit" type="submit" disabled={busy || !resetToken}>{busy ? 'UPDATING…' : 'RESET PASSWORD'} <span aria-hidden="true">↗</span></button>
            </form>
          )}

          {view === 'profile' && user && (
            <div className="auth-profile">
              <dl>
                <div><dt>VERIFIED EMAIL</dt><dd>{user.email ?? 'Not provided'}</dd></div>
                <div><dt>ACCOUNT ROLE</dt><dd>{user.role === 'admin' ? 'Administrator' : 'Creator'}</dd></div>
                <div><dt>TODAY’S GPT-5 MINI CREDITS</dt><dd>{credits ? `${credits.remaining} of ${credits.limit} remaining (UTC)` : 'Usage unavailable'}</dd></div>
              </dl>
              {error && <p className="auth-message is-error" role="alert">{error}</p>}
              <button className="auth-submit" type="button" onClick={onLogout}>LOG OUT <span aria-hidden="true">↗</span></button>
            </div>
          )}

          <div className="auth-secondary">
            {view === 'login' ? (
              <>Accounts are created by an administrator.<br />
                <button className="auth-text-link" type="button" onClick={() => { setFormError(''); setMessage(''); onNavigate('forgot') }}>Forgot password?</button></>
            ) : view === 'profile' ? (
              <button className="auth-text-link" type="button" onClick={() => onNavigate('workspace')}>Back to workspace</button>
            ) : (
              <button className="auth-text-link" type="button" onClick={() => { setMessage(''); setFormError(''); onNavigate('login') }}>Back to log in</button>
            )}
          </div>
          <p className="auth-security-note">Sessions use a secure HttpOnly cookie. Password-reset tokens are single-use.</p>
        </div>
      </section>
    </main>
  )
}

export { isAuthUser }
export type { AuthUser, AuthView, Credits }
