import { hashOpaqueToken, hashPassword, isValidPassword, recordAuthAction } from '../../auth.js'
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
  const password = isJsonObject(req.body) ? req.body.password : undefined
  if (!/^[A-Za-z0-9_-]{43}$/.test(token) || !isValidPassword(password)) {
    res.status(400).json({ error: 'The reset link is invalid or expired, or the password does not meet the 12–128 character requirement.' })
    return
  }

  try {
    const tokenHash = hashOpaqueToken(token)
    if (await recordAuthAction(req, 'reset-password', tokenHash) > 10) {
      res.status(429).json({ error: 'Too many reset attempts. Please try again later.' })
      return
    }
    const passwordHash = await hashPassword(password)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const reset = await client.query<{ user_id: string }>(
        `SELECT user_id FROM password_reset_tokens
         WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash],
      )
      if (!reset.rows[0]) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: 'The reset link is invalid or expired.' })
        return
      }
      const update = await client.query(
        `UPDATE app_users SET password_hash = $1 WHERE id = $2 RETURNING id`,
        [passwordHash, reset.rows[0].user_id],
      )
      if (update.rows.length !== 1) {
        await client.query('ROLLBACK')
        res.status(400).json({ error: 'The reset link is invalid or expired.' })
        return
      }
      await client.query(
        `UPDATE password_reset_tokens
         SET used_at = now()
         WHERE token_hash = $1`,
        [tokenHash],
      )
      await client.query(
        `UPDATE password_reset_tokens
         SET revoked_at = now()
         WHERE user_id = $1 AND token_hash <> $2 AND used_at IS NULL AND revoked_at IS NULL`,
        [reset.rows[0].user_id, tokenHash],
      )
      await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [reset.rows[0].user_id])
      await client.query('COMMIT')
      res.status(200).json({ message: 'Password updated. Log in with your new password.' })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    handleApiError(res, 'auth/reset-password', error)
  }
}
