import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { readJsonResponse } from './api-response'

type AdminUser = {
  id: string
  username: string
  email: string | null
  email_verified_at: string | null
  role: 'admin' | 'user'
  is_active: boolean
  admin_disabled_at: string | null
  created_at: string
  last_login_at: string | null
}
type AccessCode = {
  id: string
  created_at: string
  expires_at: string | null
  never_expires: boolean
  revoked_at: string | null
  redeemed_at: string | null
  redeemed_by_user_id: string | null
}
type UsageUser = { id: string; successful_generations: number }

async function requestJson(path: string, options?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(path, { credentials: 'same-origin', ...options })
  const payload = await readJsonResponse(response, 'Admin API')
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `Admin API returned ${response.status}.`
    throw new Error(message)
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Admin API returned an unexpected response.')
  }
  return payload as Record<string, unknown>
}

function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value)
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({})
  const [newUsername, setNewUsername] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newCode, setNewCode] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<number | null>(30)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const date = new Date().toISOString().slice(0, 10)

  const refresh = useCallback(async () => {
    setError('')
    try {
      const [usersPayload, codesPayload, usagePayload] = await Promise.all([
        requestJson('/api/admin/users'),
        requestJson('/api/admin/access-codes'),
        requestJson(`/api/admin/usage?date=${date}`),
      ])
      if (!isArray<AdminUser>(usersPayload.users) || !isArray<AccessCode>(codesPayload.codes) || !isArray<UsageUser>(usagePayload.users)) {
        throw new Error('Admin API returned incomplete dashboard data.')
      }
      setUsers(usersPayload.users)
      setCodes(codesPayload.codes)
      setUsage(Object.fromEntries(usagePayload.users.map((item) => [item.id, item.successful_generations])))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load administrator data.')
    }
  }, [date])

  useEffect(() => { void refresh() }, [refresh])

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await requestJson('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, email: newEmail, password: newPassword }),
      })
      setNewUsername('')
      setNewEmail('')
      setNewPassword('')
      setMessage('Account created and active. Share the temporary password with the user securely.')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the account.')
    } finally {
      setBusy(false)
    }
  }

  async function createCode() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await requestJson('/api/admin/access-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresInDays }),
      })
      if (typeof result.code !== 'string') throw new Error('The API did not return the one-time access code.')
      setNewCode(result.code)
      setMessage('Copy this code now. The full code will not be shown again.')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create access code.')
    } finally {
      setBusy(false)
    }
  }

  async function revokeCode(id: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await requestJson(`/api/admin/access-codes/${encodeURIComponent(id)}`, { method: 'PATCH' })
      setMessage('Access code revoked.')
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not revoke access code.')
    } finally {
      setBusy(false)
    }
  }

  async function setActive(user: AdminUser, isActive: boolean) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await requestJson(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: isActive }),
      })
      setMessage(`${user.username} account ${isActive ? 'activated' : 'disabled'}.`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update account status.')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>, user: AdminUser) {
    event.preventDefault()
    const password = resetPasswords[user.id] ?? ''
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await requestJson(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      setResetPasswords((current) => ({ ...current, [user.id]: '' }))
      setMessage(`${user.username}’s password was reset and their existing sessions were revoked.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset the password.')
    } finally {
      setBusy(false)
    }
  }

  async function deleteUser(user: AdminUser) {
    if (!window.confirm(`Permanently delete ${user.username} and their account data? This cannot be undone.`)) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await requestJson(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE' })
      setMessage(`${user.username}’s account was deleted.`)
      await refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not delete the account.')
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(newCode)
      setMessage('Access code copied.')
    } catch {
      setError('Could not copy the code. Select and copy it manually.')
    }
  }

  return (
    <section className="admin-dashboard" aria-labelledby="admin-title">
      <div className="admin-heading">
        <div><span className="auth-eyebrow"><span /> ADMINISTRATOR ONLY</span><h1 id="admin-title">Studio administration</h1></div>
        <button className="admin-refresh" type="button" onClick={() => void refresh()} disabled={busy}>REFRESH</button>
      </div>
      {error && <p className="auth-message is-error" role="alert">{error}</p>}
      {message && <p className="auth-message" role="status">{message}</p>}

      <section className="admin-panel" aria-labelledby="codes-title">
        <div className="admin-panel-heading"><div><span>01</span><h2 id="codes-title">Single-use registration codes</h2></div><p>Only the code creator can view a newly generated code.</p></div>
        <div className="admin-code-create">
          <label htmlFor="admin-code-expiry">EXPIRES IN</label>
          <select id="admin-code-expiry" value={expiresInDays ?? 'never'} onChange={(event) => setExpiresInDays(event.target.value === 'never' ? null : Number(event.target.value))}>
            <option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value="never">Never Expires (Forever)</option>
          </select>
          <button className="admin-action" type="button" onClick={() => void createCode()} disabled={busy}>GENERATE CODE</button>
        </div>
        {newCode && <div className="admin-new-code"><code>{newCode}</code><button type="button" onClick={() => void copyCode()}>COPY</button></div>}
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>ISSUED</th><th>EXPIRES</th><th>STATUS</th><th>ACTION</th></tr></thead>
          <tbody>{codes.map((code) => {
            const status = code.redeemed_at ? 'REDEEMED' : code.revoked_at ? 'REVOKED' : !code.never_expires && code.expires_at && new Date(code.expires_at) <= new Date() ? 'EXPIRED' : 'AVAILABLE'
            return <tr key={code.id}><td>{new Date(code.created_at).toLocaleString()}</td><td>{code.never_expires ? 'Never' : code.expires_at ? new Date(code.expires_at).toLocaleString() : 'Unavailable'}</td><td>{status}</td><td>{status === 'AVAILABLE' && <button className="admin-table-action" type="button" onClick={() => void revokeCode(code.id)} disabled={busy}>REVOKE</button>}</td></tr>
          })}</tbody>
        </table></div>
      </section>

      <section className="admin-panel" aria-labelledby="users-title">
        <div className="admin-panel-heading"><div><span>02</span><h2 id="users-title">Accounts &amp; daily GPT-5 Mini usage</h2></div><p>{users.filter((user) => user.is_active).length} of 50 active accounts · UTC date {date}</p></div>
        <form className="admin-user-create" onSubmit={(event) => void createUser(event)}>
          <div>
            <label htmlFor="admin-new-username">USERNAME</label>
            <input id="admin-new-username" name="username" autoComplete="off" autoCapitalize="none" minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,31}" required value={newUsername} onChange={(event) => setNewUsername(event.target.value)} />
          </div>
          <div>
            <label htmlFor="admin-new-email">GMAIL ADDRESS</label>
            <input id="admin-new-email" name="email" type="email" autoComplete="off" autoCapitalize="none" required value={newEmail} onChange={(event) => setNewEmail(event.target.value)} />
          </div>
          <div>
            <label htmlFor="admin-new-password">TEMPORARY PASSWORD</label>
            <input id="admin-new-password" name="new-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </div>
          <button className="admin-action" type="submit" disabled={busy}>CREATE ACCOUNT</button>
        </form>
        <div className="admin-table-wrap"><table className="admin-table">
          <thead><tr><th>USERNAME</th><th>GMAIL / VERIFICATION</th><th>STATUS</th><th>AI CREDITS</th><th>LAST LOGIN</th><th>ACTION</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}>
            <td>{user.username}<small>{user.role}</small></td>
            <td>{user.email ?? 'Email enrollment required'}<small>{user.email_verified_at ? 'Verified' : 'Unverified'}</small></td>
            <td>{user.is_active ? 'ACTIVE' : user.admin_disabled_at ? 'DISABLED' : 'PENDING VERIFICATION'}</td>
            <td>{usage[user.id] ?? 0} / 20</td>
            <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}</td>
            <td>
              {user.role === 'user' && <>
                {user.email_verified_at && <button className="admin-table-action" type="button" onClick={() => void setActive(user, !user.is_active)} disabled={busy}>{user.is_active ? 'DISABLE' : 'ACTIVATE'}</button>}
                <form className="admin-account-actions" onSubmit={(event) => void resetPassword(event, user)}>
                  <input
                    aria-label={`New password for ${user.username}`}
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    placeholder="New password"
                    value={resetPasswords[user.id] ?? ''}
                    onChange={(event) => setResetPasswords((current) => ({ ...current, [user.id]: event.target.value }))}
                  />
                  <button className="admin-table-action" type="submit" disabled={busy}>RESET PASSWORD</button>
                </form>
                <button className="admin-table-action" type="button" onClick={() => void deleteUser(user)} disabled={busy}>DELETE</button>
              </>}
            </td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <p className="admin-footnote">Daily AI credits are shared across GPT-5 Mini-backed UGC, Faceless, and Storyboard requests and reset at 00:00 UTC. AI Drama uses no AI credits.</p>
    </section>
  )
}
