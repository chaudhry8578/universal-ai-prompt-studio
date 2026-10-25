import { getAuthenticatedUser, hashPassword, isAdmin, isValidPassword, normalizeGmail, normalizeUsername } from '../../auth.js'
import { createEmailVerificationToken } from '../../auth-tokens.js'
import { getDatabase } from '../../database.js'
import { createActionUrl, sendAuthEmail } from '../../email.js'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

function isActiveAccountLimitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'constraint' in error &&
    (error as { constraint?: unknown }).constraint === 'active_user_limit'
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (req.method === 'POST' && !isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }

  try {
    const actor = await getAuthenticatedUser(req)
    if (!isAdmin(actor)) {
      res.status(actor ? 403 : 401).json({ error: actor ? 'Administrator access required.' : 'Authentication required.' })
      return
    }

    const pool = getDatabase()
    if (req.method === 'GET') {
      const users = await pool.query(
        `SELECT id, username, email, email_verified_at, role, is_active, admin_disabled_at, created_at, last_login_at
         FROM app_users
         ORDER BY created_at ASC`,
      )
      res.status(200).json({ users: users.rows })
      return
    }

    if (!isJsonObject(req.body)) {
      res.status(400).json({ error: 'A username and password are required.' })
      return
    }
    const username = normalizeUsername(req.body.username)
    const email = normalizeGmail(req.body.email)
    const password = req.body.password
    if (!username || !email || !isValidPassword(password)) {
      res.status(400).json({ error: 'Use a 3–32 character username, a Gmail address, and a 12–128 character password.' })
      return
    }

    const passwordHash = await hashPassword(password)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string; username: string; email: string; role: string; is_active: boolean }>(
        `INSERT INTO app_users (username, password_hash, role, is_active, email)
         VALUES ($1, $2, 'user', false, $3)
         RETURNING id, username, email, role, is_active`,
        [username, passwordHash, email.email],
      )
      const verificationToken = await createEmailVerificationToken(client, result.rows[0].id)
      await sendAuthEmail(
        email.email,
        'Verify your Universal AI Prompt Studio account',
        `An administrator created an account for you. Verify your email within 24 hours:\n\n${createActionUrl('/', verificationToken, 'verify')}\n`,
      )
      await client.query('COMMIT')
      res.status(201).json({ user: result.rows[0], message: 'Account created. The user must verify their email before the account is activated.' })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    if (isActiveAccountLimitError(error)) {
      res.status(409).json({ error: 'The maximum of 50 active user accounts has been reached.' })
      return
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      res.status(409).json({ error: 'That username is already in use.' })
      return
    }
    handleApiError(res, 'admin/users', error)
  }
}
