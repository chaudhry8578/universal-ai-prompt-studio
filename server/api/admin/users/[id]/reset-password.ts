import { getAuthenticatedUser, hashPassword, isAdmin, isValidPassword } from '../../../../auth.js'
import { getDatabase } from '../../../../database.js'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../../../http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }
  if (!isJsonObject(req.body) || !isValidPassword(req.body.password)) {
    res.status(400).json({ error: 'Provide a new password with 12–128 characters.' })
    return
  }

  try {
    const actor = await getAuthenticatedUser(req)
    if (!isAdmin(actor)) {
      res.status(actor ? 403 : 401).json({ error: actor ? 'Administrator access required.' : 'Authentication required.' })
      return
    }

    const userId = req.query?.id
    if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      res.status(400).json({ error: 'A valid user ID is required.' })
      return
    }

    const passwordHash = await hashPassword(req.body.password)
    const client = await getDatabase().connect()
    try {
      await client.query('BEGIN')
      const updated = await client.query(
        `UPDATE app_users
         SET password_hash = $1
         WHERE id = $2 AND role = 'user'
         RETURNING id`,
        [passwordHash, userId],
      )
      if (updated.rows.length === 0) {
        await client.query('ROLLBACK')
        res.status(404).json({ error: 'User account not found.' })
        return
      }
      await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId])
      await client.query(
        `UPDATE password_reset_tokens SET revoked_at = now()
         WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
        [userId],
      )
      await client.query('COMMIT')
      res.status(200).json({ message: 'Password reset and existing sessions revoked.' })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    handleApiError(res, 'admin/user-reset-password', error)
  }
}
