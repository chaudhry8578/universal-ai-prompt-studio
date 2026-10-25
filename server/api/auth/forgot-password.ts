import { createPasswordResetToken } from '../../auth-tokens.js'
import { hashOpaqueToken, normalizeGmail, recordAuthAction } from '../../auth.js'
import { getDatabase } from '../../database.js'
import { createActionUrl, sendAuthEmail } from '../../email.js'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

const GENERIC_MESSAGE = 'If an active verified account matches that Gmail address, a password-reset link will be sent.'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }
  const email = isJsonObject(req.body) ? normalizeGmail(req.body.email) : undefined
  if (!email) {
    res.status(202).json({ message: GENERIC_MESSAGE })
    return
  }

  try {
    if (await recordAuthAction(req, 'forgot-password', email.identity) > 5) {
      res.status(429).json({ error: 'Too many recovery requests. Please try again later.' })
      return
    }
    const client = await getDatabase().connect()
    let delivery: { email: string; token: string } | undefined
    try {
      await client.query('BEGIN')
      const user = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM app_users
         WHERE email_identity = $1 AND email_verified_at IS NOT NULL AND is_active = true`,
        [email.identity],
      )
      if (user.rows[0]) {
        const token = await createPasswordResetToken(client, user.rows[0].id)
        delivery = { email: user.rows[0].email, token }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    if (delivery) {
      try {
        await sendAuthEmail(
          delivery.email,
          'Reset your Universal AI Prompt Studio password',
          `Reset your password within 30 minutes by opening this link:\n\n${createActionUrl('/', delivery.token, 'reset')}\n\nIf you did not request this reset, you can ignore this email. Your current password remains unchanged.`,
        )
      } catch (error) {
        await getDatabase().query(
          `UPDATE password_reset_tokens SET revoked_at = now()
           WHERE token_hash = $1 AND used_at IS NULL`,
          [hashOpaqueToken(delivery.token)],
        )
        console.error('[auth/forgot-password] Could not deliver reset email.', error instanceof Error ? error.message : 'Unknown error')
      }
    }
    res.status(202).json({ message: GENERIC_MESSAGE })
  } catch (error) {
    handleApiError(res, 'auth/forgot-password', error)
  }
}
