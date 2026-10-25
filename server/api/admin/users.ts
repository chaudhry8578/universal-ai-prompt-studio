import { getAuthenticatedUser, generateInternalUsername, hashPassword, isAdmin, isValidPassword, normalizeGmail } from '../../auth.js'
import { getDatabase } from '../../database.js'
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
        `SELECT id, email, role, is_active, admin_disabled_at, created_at, last_login_at
         FROM app_users
         ORDER BY created_at ASC`,
      )
      res.status(200).json({ users: users.rows })
      return
    }

    if (!isJsonObject(req.body)) {
      res.status(400).json({ error: 'A Gmail address and password are required.' })
      return
    }
    const email = normalizeGmail(req.body.email)
    const password = req.body.password
    if (!email || !isValidPassword(password)) {
      res.status(400).json({ error: 'Use a valid Gmail address and a 12–128 character password.' })
      return
    }

    const passwordHash = await hashPassword(password)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query<{ id: string; email: string; role: string; is_active: boolean }>(
        `INSERT INTO app_users (username, password_hash, role, is_active, email, email_verified_at)
         VALUES ($1, $2, 'user', true, $3, now())
         RETURNING id, email, role, is_active`,
        [generateInternalUsername(), passwordHash, email.email],
      )
      await client.query('COMMIT')
      res.status(201).json({ user: result.rows[0], message: 'Account created and activated.' })
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
      res.status(409).json({ error: 'An account already exists for this Gmail address.' })
      return
    }
    handleApiError(res, 'admin/users', error)
  }
}
