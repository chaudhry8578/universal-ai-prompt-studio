import { createEmailVerificationToken } from '../../auth-tokens.js'
import { hashPassword, hashOpaqueToken, isValidPassword, normalizeGmail, normalizeUsername, recordAuthAction } from '../../auth.js'
import { getDatabase } from '../../database.js'
import { createActionUrl, sendAuthEmail } from '../../email.js'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

const GENERIC_REGISTRATION_MESSAGE = 'If the details are eligible, a verification link will be sent to the Gmail address.'
const INVALID_REGISTRATION_MESSAGE = 'The registration details are invalid, or the access code has expired or already been used.'

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
    res.status(400).json({ error: INVALID_REGISTRATION_MESSAGE })
    return
  }
  const email = normalizeGmail(req.body.email)
  const username = normalizeUsername(req.body.username)
  const password = req.body.password
  const code = typeof req.body.accessCode === 'string' ? req.body.accessCode.trim().toUpperCase() : ''
  if (!email || !username || !isValidPassword(password) || !/^UAS-[A-F0-9]{64}$/.test(code)) {
    res.status(400).json({ error: INVALID_REGISTRATION_MESSAGE })
    return
  }

  try {
    if (await recordAuthAction(req, 'register', email.identity) > 8) {
      res.status(429).json({ error: 'Too many registration attempts. Please try again later.' })
      return
    }
    const [passwordHash, tokenHash] = await Promise.all([hashPassword(password), Promise.resolve(hashOpaqueToken(code))])
    const pool = getDatabase()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const accessCode = await client.query<{ id: string }>(
        `SELECT id FROM auth_access_codes
         WHERE code_hash = $1 AND revoked_at IS NULL AND redeemed_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash],
      )
      if (accessCode.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: INVALID_REGISTRATION_MESSAGE })
        return
      }
      const created = await client.query<{ id: string }>(
        `INSERT INTO app_users (username, password_hash, role, is_active, email)
         VALUES ($1, $2, 'user', false, $3)
         RETURNING id`,
        [username, passwordHash, email.email],
      )
      const userId = created.rows[0].id
      const redeemed = await client.query(
        `UPDATE auth_access_codes
         SET redeemed_at = now(), redeemed_by_user_id = $1
         WHERE id = $2 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
         RETURNING id`,
        [userId, accessCode.rows[0].id],
      )
      if (redeemed.rows.length !== 1) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: INVALID_REGISTRATION_MESSAGE })
        return
      }
      const verificationToken = await createEmailVerificationToken(client, userId)
      await sendAuthEmail(
        email.email,
        'Verify your Universal AI Prompt Studio account',
        `Verify your email within 24 hours by opening this link:\n\n${createActionUrl('/', verificationToken, 'verify')}\n\nIf you did not request this account, you can ignore this email.`,
      )
      await client.query('COMMIT')
      res.status(202).json({ message: GENERIC_REGISTRATION_MESSAGE })
    } catch (error) {
      await client.query('ROLLBACK')
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        res.status(202).json({ message: GENERIC_REGISTRATION_MESSAGE })
        return
      }
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    handleApiError(res, 'auth/register', error)
  }
}
