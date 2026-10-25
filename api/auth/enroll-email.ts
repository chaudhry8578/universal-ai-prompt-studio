import {
  getDummyPasswordHash,
  isValidPassword,
  normalizeGmail,
  normalizeUsername,
  recordAuthAction,
  verifyPassword,
} from '../../server/auth'
import { createEmailVerificationToken } from '../../server/auth-tokens'
import { getDatabase } from '../../server/database'
import { createActionUrl, sendAuthEmail } from '../../server/email'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../server/http'

const GENERIC_MESSAGE = 'If the existing account details are valid, a verification link will be sent to the Gmail address.'

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
    res.status(202).json({ message: GENERIC_MESSAGE })
    return
  }
  const username = normalizeUsername(req.body.username)
  const email = normalizeGmail(req.body.email)
  const password = req.body.password
  if (!username || !email || !isValidPassword(password)) {
    res.status(202).json({ message: GENERIC_MESSAGE })
    return
  }
  try {
    if (await recordAuthAction(req, 'enroll-email', email.identity) > 5) {
      res.status(429).json({ error: 'Too many verification requests. Please try again later.' })
      return
    }
    const found = await getDatabase().query<{
      id: string
      password_hash: string
      email_verified_at: Date | null
    }>(
      'SELECT id, password_hash, email_verified_at FROM app_users WHERE username = $1',
      [username],
    )
    const passwordMatches = await verifyPassword(password, found.rows[0]?.password_hash ?? await getDummyPasswordHash())
    if (!found.rows[0] || !passwordMatches || found.rows[0].email_verified_at) {
      res.status(202).json({ message: GENERIC_MESSAGE })
      return
    }
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const account = await client.query<{ id: string; email_verified_at: Date | null }>(
        `SELECT id, email_verified_at FROM app_users WHERE id = $1 FOR UPDATE`,
        [found.rows[0].id],
      )
      if (!account.rows[0] || account.rows[0].email_verified_at) {
        await client.query('ROLLBACK')
        res.status(202).json({ message: GENERIC_MESSAGE })
        return
      }
      await client.query(
        `UPDATE app_users SET email = $1, is_active = false
         WHERE id = $3`,
        [email.email, account.rows[0].id],
      )
      await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [account.rows[0].id])
      await client.query(
        `UPDATE password_reset_tokens SET revoked_at = now()
         WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [account.rows[0].id],
      )
      const token = await createEmailVerificationToken(client, account.rows[0].id)
      await sendAuthEmail(
        email.email,
        'Verify your Universal AI Prompt Studio account',
        `Verify your email within 24 hours by opening this link:\n\n${createActionUrl('/', token, 'verify')}\n`,
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        res.status(202).json({ message: GENERIC_MESSAGE })
        return
      }
      throw error
    } finally {
      client.release()
    }
    res.status(202).json({ message: GENERIC_MESSAGE })
  } catch (error) {
    handleApiError(res, 'auth/enroll-email', error)
  }
}
