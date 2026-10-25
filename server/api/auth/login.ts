import {
  clearLoginAttempts,
  createSession,
  getDummyPasswordHash,
  isValidPassword,
  normalizeGmail,
  recordLoginAttempt,
  setSessionCookie,
  verifyPassword,
  INVALID_LOGIN_MESSAGE,
} from '../../auth.js'
import { getDatabase } from '../../database.js'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }
  if (!isJsonObject(req.body)) {
    res.status(400).json({ error: 'A username and password are required.' })
    return
  }

  const email = normalizeGmail(req.body.email)
  const password = req.body.password
  if (!email || !isValidPassword(password)) {
    res.status(401).json({ error: INVALID_LOGIN_MESSAGE })
    return
  }

  try {
    const attempts = await recordLoginAttempt(req)
    if (attempts > 10) {
      res.status(429).json({ error: 'Too many login attempts. Please try again later.' })
      return
    }

    const pool = getDatabase()
    const result = await pool.query<{
      id: string
      username: string
      email: string
      password_hash: string
      role: 'admin' | 'user'
    }>(
      `SELECT id, username, email, password_hash, role
       FROM app_users
       WHERE email_identity = $1 AND is_active = true AND email_verified_at IS NOT NULL`,
      [email.identity],
    )
    const account = result.rows[0]
    const passwordHash = account?.password_hash ?? await getDummyPasswordHash()
    const passwordMatches = await verifyPassword(password, passwordHash)
    if (!account || !passwordMatches) {
      res.status(401).json({ error: INVALID_LOGIN_MESSAGE })
      return
    }

    const client = await pool.connect()
    let token: string
    try {
      await client.query('BEGIN')
      const currentAccount = await client.query<{
        password_hash: string
        is_active: boolean
        email_verified_at: Date | null
      }>(
        'SELECT password_hash, is_active, email_verified_at FROM app_users WHERE id = $1 FOR UPDATE',
        [account.id],
      )
      if (
        currentAccount.rows.length === 0 ||
        !currentAccount.rows[0].is_active ||
        !currentAccount.rows[0].email_verified_at ||
        currentAccount.rows[0].password_hash !== account.password_hash
      ) {
        await client.query('ROLLBACK')
        res.status(401).json({ error: INVALID_LOGIN_MESSAGE })
        return
      }
      await client.query('UPDATE app_users SET last_login_at = now() WHERE id = $1', [account.id])
      token = await createSession(client, account)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    await clearLoginAttempts(req)
    setSessionCookie(res, token)
    res.status(200).json({
      user: { id: account.id, username: account.username, email: account.email, role: account.role },
    })
  } catch (error) {
    handleApiError(res, 'auth/login', error)
  }
}
