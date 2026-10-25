import { hashOpaqueToken, recordAuthAction } from '../../auth.js'
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
  const token = isJsonObject(req.body) && typeof req.body.token === 'string' ? req.body.token : ''
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    res.status(400).json({ error: 'This verification link is invalid or has expired.' })
    return
  }

  try {
    const tokenHash = hashOpaqueToken(token)
    if (await recordAuthAction(req, 'verify-email', tokenHash) > 12) {
      res.status(429).json({ error: 'Too many verification attempts. Please request a new link later.' })
      return
    }
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const found = await client.query<{ user_id: string }>(
        `SELECT user_id FROM email_verification_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash],
      )
      if (!found.rows[0]) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: 'This verification link is invalid or has expired.' })
        return
      }
      const user = await client.query<{ is_active: boolean; admin_disabled_at: Date | null }>(
        `UPDATE app_users
         SET email_verified_at = COALESCE(email_verified_at, now()),
             is_active = CASE WHEN admin_disabled_at IS NULL THEN true ELSE false END
         WHERE id = $1 AND email IS NOT NULL
         RETURNING is_active, admin_disabled_at`,
        [found.rows[0].user_id],
      )
      if (!user.rows[0]) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: 'This verification link is invalid or has expired.' })
        return
      }
      await client.query(
        'UPDATE email_verification_tokens SET used_at = now() WHERE token_hash = $1',
        [tokenHash],
      )
      await client.query(
        `UPDATE email_verification_tokens
         SET revoked_at = now()
         WHERE user_id = $1 AND token_hash <> $2 AND used_at IS NULL AND revoked_at IS NULL`,
        [found.rows[0].user_id, tokenHash],
      )
      await client.query('COMMIT')
      res.status(200).json({
        message: user.rows[0].is_active
          ? 'Email verified. Your account is active and ready to use.'
          : 'Email verified. An administrator must activate this account before login.',
      })
    } catch (error) {
      await client.query('ROLLBACK')
      if (typeof error === 'object' && error !== null && 'constraint' in error && error.constraint === 'active_user_limit') {
        res.status(409).json({ error: 'The active account limit has been reached. Ask an administrator to make room, then verify again.' })
        return
      }
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    handleApiError(res, 'auth/verify-email', error)
  }
}
