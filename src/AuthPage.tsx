import { useState } from 'react'
import type { FormEvent } from 'react'

type AuthView = 'login' | 'register' | 'forgot' | 'reset' | 'enroll' | 'verify' | 'profile' | 'workspace'
type AuthUser = { id: string; username: string; email: string; role: 'admin' | 'user' }
type Credits = { date: string; limit: number; used: number; remaining: number }

type AuthPageProps = {
  view: AuthView
  selectedGenerator?: string
  error: string
  onLogin: (email: string, password: string) => Promise<void>
  onNavigate: (view: AuthView) => void
  onLogout: () => void
  user?: AuthUser
  credits?: Credits | null
  resetToken?: string
  verifyToken?: string
  verificationMessage?: string
}

function isAuthUser(value: unknown): value is AuthUser {
  if (typeof value !== 'object' || value === null) return false
  const user = value as Record<string, unknown>
  return typeof user.id === 'string' && typeof user.username === 'string' &&
    typeof user.email === 'string' && (user.role === 'admin' || user.role === 'user')
}

async function postAuth(path: string, body: unknown): Promise<string> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error(`The authentication service returned an invalid response (${response.status}).`)
  }
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
  verifyToken = '',
  verificationMessage,
}: AuthPageProps) {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(verificationMessage ?? '')
  const [formError, setFormError] = useState('')
  const title = view === 'login' ? 'Welcome back'
    : view === 'register' ? 'Create your account'
      : view === 'forgot' ? 'Reset your password'
        : view === 'reset' ? 'Choose a new password'
          : view === 'enroll' ? 'Verify your existing account'
            : view === 'verify' ? 'Confirm your email'
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

  async function submitRegister() {
    setMessage(await postAuth('/api/auth/register', { email, username, password, accessCode }))
  }

  async function submitForgot() {
    setMessage(await postAuth('/api/auth/forgot-password', { email }))
  }

  async function resendVerification() {
    setMessage(await postAuth('/api/auth/resend-verification', { email }))
  }

  async function submitReset() {
    setMessage(await postAuth('/api/auth/reset-password', { token: resetToken, password }))
    setPassword('')
  }

  async function submitEnroll() {
    setMessage(await postAuth('/api/auth/enroll-email', { email, username, password }))
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
              : view === 'register' ? 'Use a Gmail address, choose your username and password, and enter an administrator-issued access code.'
                : view === 'forgot' ? 'We’ll email a reset link if an active verified account matches that Gmail address.'
                  : view === 'reset' ? 'Password-reset links expire after 30 minutes and can only be used once.'
                    : view === 'enroll' ? 'Verify ownership of your existing username and password, then confirm your Gmail address.'
                    : view === 'verify' ? 'Confirm the request to activate your verified email address. This link can only be used once.'
                    : 'Your account, security, and daily AI generation allowance.'}
          </p>

          {view === 'login' && (
            <form className="auth-form" onSubmit={(event) => void submit(event, () => onLogin(email, password))}>
              <label htmlFor="auth-email">GMAIL ADDRESS</label>
              <input id="auth-email" name="email" type="email" autoComplete="username" autoCapitalize="none" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="auth-password">PASSWORD</label>
              <input id="auth-password" name="password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
              {(error || formError) && <p className="auth-message is-error" role="alert">{formError || error}</p>}
              {verificationMessage && <p className="auth-message" role="status">{verificationMessage}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'LOGGING IN…' : 'LOG IN'} <span aria-hidden="true">↗</span></button>
              <button className="auth-text-link auth-forgot-link" type="button" onClick={() => { setFormError(''); setMessage(''); onNavigate('forgot') }}>Forgot password?</button>
            </form>
          )}

          {view === 'register' && (
            <form className="auth-form" onSubmit={(event) => void submit(event, submitRegister)}>
              <label htmlFor="auth-register-email">GMAIL ADDRESS</label>
              <input id="auth-register-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="auth-register-username">USERNAME</label>
              <input id="auth-register-username" name="username" autoComplete="username" autoCapitalize="none" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" required value={username} onChange={(event) => setUsername(event.target.value)} />
              <label htmlFor="auth-register-password">WEBSITE PASSWORD</label>
              <input id="auth-register-password" name="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
              <label htmlFor="auth-access-code">ADMIN-ISSUED ACCESS CODE</label>
              <input id="auth-access-code" name="accessCode" autoComplete="off" pattern="UAS-[A-Fa-f0-9]{64}" required value={accessCode} onChange={(event) => setAccessCode(event.target.value)} />
              {message && <p className="auth-message" role="status">{message}</p>}
              {formError && <p className="auth-message is-error" role="alert">{formError}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'SENDING…' : 'CREATE ACCOUNT'} <span aria-hidden="true">↗</span></button>
              {message && <button className="auth-text-link" type="button" disabled={busy} onClick={() => void runAction(resendVerification)}>Resend verification email</button>}
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
              <input id="auth-reset-password" name="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
              {message && <p className="auth-message" role="status">{message}</p>}
              {formError && <p className="auth-message is-error" role="alert">{formError}</p>}
              <button className="auth-submit" type="submit" disabled={busy || !resetToken}>{busy ? 'UPDATING…' : 'RESET PASSWORD'} <span aria-hidden="true">↗</span></button>
            </form>
          )}

          {view === 'verify' && (
            <form className="auth-form" onSubmit={(event) => void submit(event, async () => {
              setMessage(await postAuth('/api/auth/verify-email', { token: verifyToken }))
            })}>
              {message && <p className="auth-message" role="status">{message}</p>}
              {formError && <p className="auth-message is-error" role="alert">{formError}</p>}
              <button className="auth-submit" type="submit" disabled={busy || !verifyToken}>{busy ? 'VERIFYING…' : 'VERIFY EMAIL'} <span aria-hidden="true">↗</span></button>
            </form>
          )}

          {view === 'enroll' && (
            <form className="auth-form" onSubmit={(event) => void submit(event, submitEnroll)}>
              <label htmlFor="auth-enroll-username">EXISTING USERNAME</label>
              <input id="auth-enroll-username" name="username" autoComplete="username" autoCapitalize="none" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" required value={username} onChange={(event) => setUsername(event.target.value)} />
              <label htmlFor="auth-enroll-email">GMAIL ADDRESS</label>
              <input id="auth-enroll-email" name="email" type="email" autoComplete="email" autoCapitalize="none" required value={email} onChange={(event) => setEmail(event.target.value)} />
              <label htmlFor="auth-enroll-password">EXISTING PASSWORD</label>
              <input id="auth-enroll-password" name="current-password" type="password" autoComplete="current-password" minLength={12} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
              {message && <p className="auth-message" role="status">{message}</p>}
              {formError && <p className="auth-message is-error" role="alert">{formError}</p>}
              <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'SENDING…' : 'SEND VERIFICATION LINK'} <span aria-hidden="true">↗</span></button>
            </form>
          )}

          {view === 'profile' && user && (
            <div className="auth-profile">
              <dl>
                <div><dt>USERNAME</dt><dd>{user.username}</dd></div>
                <div><dt>VERIFIED EMAIL</dt><dd>{user.email}</dd></div>
                <div><dt>ACCOUNT ROLE</dt><dd>{user.role === 'admin' ? 'Administrator' : 'Creator'}</dd></div>
                <div><dt>TODAY’S GPT-5 MINI CREDITS</dt><dd>{credits ? `${credits.remaining} of ${credits.limit} remaining (UTC)` : 'Usage unavailable'}</dd></div>
              </dl>
              {error && <p className="auth-message is-error" role="alert">{error}</p>}
              <button className="auth-submit" type="button" onClick={onLogout}>LOG OUT <span aria-hidden="true">↗</span></button>
            </div>
          )}

          <div className="auth-secondary">
            {view === 'login' ? (
              <>Need an account? <button className="auth-text-link" type="button" onClick={() => { setMessage(''); setFormError(''); onNavigate('register') }}>Register with an access code</button><br />
                <button className="auth-text-link" type="button" onClick={() => { setMessage(''); setFormError(''); onNavigate('enroll') }}>Verify an existing account</button></>
            ) : view === 'profile' ? (
              <button className="auth-text-link" type="button" onClick={() => onNavigate('workspace')}>Back to workspace</button>
            ) : (
              <button className="auth-text-link" type="button" onClick={() => { setMessage(''); setFormError(''); onNavigate('login') }}>Back to log in</button>
            )}
          </div>
          <p className="auth-security-note">Sessions use a secure HttpOnly cookie. Reset and verification tokens are single-use.</p>
        </div>
      </section>
    </main>
  )
}

export { isAuthUser }
export type { AuthUser, AuthView, Credits }
