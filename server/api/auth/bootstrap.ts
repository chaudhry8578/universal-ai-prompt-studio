import { hashPassword, getBootstrapToken, matchesSecret, normalizeGmail, normalizeUsername, isValidPassword } from '../../auth.js'
import { getDatabase, ConfigurationError } from '../../database.js'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

function isActiveAccountLimitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'constraint' in error &&
    (error as { constraint?: unknown }).constraint === 'active_user_limit'
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }

  const bootstrapToken = process.env.ADMIN_BOOTSTRAP_TOKEN
  const username = normalizeUsername(process.env.BOOTSTRAP_ADMIN_USERNAME)
  const email = normalizeGmail(process.env.BOOTSTRAP_ADMIN_EMAIL)
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  if (!bootstrapToken || bootstrapToken.length < 32 || !username || !email || !isValidPassword(password)) {
    const error = new ConfigurationError('Configure ADMIN_BOOTSTRAP_TOKEN, BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD as server-side environment variables.')
    handleApiError(res, 'auth/bootstrap', error)
    return
  }
  if (!matchesSecret(getBootstrapToken(req), bootstrapToken)) {
    res.status(403).json({ error: 'Bootstrap authorization failed.' })
    return
  }
  if (req.body !== undefined && (!isJsonObject(req.body) || Object.keys(req.body).length > 0)) {
    res.status(400).json({ error: 'This bootstrap endpoint does not accept a request body.' })
    return
  }

  try {
    const pool = getDatabase()
    const passwordHash = await hashPassword(password)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const state = await client.query<{ completed_at: Date | null }>(
        'SELECT completed_at FROM app_bootstrap WHERE singleton = true FOR UPDATE',
      )
      if (state.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(503).json({ error: 'The database migration has not been applied.' })
        return
      }
      if (state.rows[0].completed_at) {
        await client.query('ROLLBACK')
        res.status(409).json({ error: 'Administrator bootstrap has already been completed.' })
        return
      }

      await client.query(
        `INSERT INTO app_users (username, password_hash, role, is_active, email, email_verified_at)
         VALUES ($1, $2, 'admin', true, $3, now())`,
        [username, passwordHash, email.email],
      )
      await client.query(
        'UPDATE app_bootstrap SET completed_at = now() WHERE singleton = true',
      )
      await client.query('COMMIT')
      res.status(201).json({ message: 'Administrator account created. Remove the bootstrap environment variables now.' })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    if (isActiveAccountLimitError(error)) {
      res.status(409).json({ error: 'The maximum of 50 active accounts has been reached. Deactivate an account before bootstrapping the administrator.' })
      return
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      res.status(409).json({ error: 'An account already uses the configured bootstrap username or Gmail address.' })
      return
    }
    handleApiError(res, 'auth/bootstrap', error)
  }
}
