import { createEmailVerificationToken } from '../../auth-tokens.js'
import { hashOpaqueToken, normalizeGmail, recordAuthAction } from '../../auth.js'
import { getDatabase } from '../../database.js'
import { createActionUrl, sendAuthEmail } from '../../email.js'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

const GENERIC_MESSAGE = 'If an account needs verification, a new link will be sent to its Gmail address.'

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
    if (await recordAuthAction(req, 'verify-email', email.identity) > 5) {
      res.status(429).json({ error: 'Too many verification requests. Please try again later.' })
      return
    }
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const user = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM app_users
         WHERE email_identity = $1 AND email_verified_at IS NULL AND admin_disabled_at IS NULL`,
        [email.identity],
      )
      if (user.rows[0]) {
        const token = await createEmailVerificationToken(client, user.rows[0].id)
        try {
          await sendAuthEmail(
            user.rows[0].email,
            'Verify your Universal AI Prompt Studio account',
            `Verify your email within 24 hours by opening this link:\n\n${createActionUrl('/', token, 'verify')}\n`,
          )
        } catch (error) {
          await client.query(
            `UPDATE email_verification_tokens SET revoked_at = now()
             WHERE token_hash = $1 AND used_at IS NULL`,
            [hashOpaqueToken(token)],
          )
          console.error('[auth/resend-verification] Could not deliver verification email.', error instanceof Error ? error.message : 'Unknown error')
        }
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    res.status(202).json({ message: GENERIC_MESSAGE })
  } catch (error) {
    handleApiError(res, 'auth/resend-verification', error)
  }
}
