import { getAuthenticatedUser, isAdmin } from '../../../server/auth'
import { getDatabase } from '../../../server/database'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../../server/http'

function isActiveAccountLimitError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'constraint' in error &&
    (error as { constraint?: unknown }).constraint === 'active_user_limit'
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
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
    if (req.method === 'PATCH') {
      const body = req.body
      if (!isJsonObject(body) || typeof body.is_active !== 'boolean') {
        res.status(400).json({ error: 'Set is_active to true or false.' })
        return
      }

      const pool = getDatabase()
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const existing = await client.query<{ email_verified_at: Date | null }>(
          `SELECT email_verified_at FROM app_users WHERE id = $1 AND role = 'user' FOR UPDATE`,
          [userId],
        )
        if (existing.rows.length === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({ error: 'User account not found.' })
          return
        }
        if (body.is_active && !existing.rows[0].email_verified_at) {
          await client.query('ROLLBACK')
          res.status(409).json({ error: 'Verify the user’s email before activating the account.' })
          return
        }
        const updated = await client.query<{ id: string; username: string; role: string; is_active: boolean }>(
          `UPDATE app_users
           SET is_active = $1,
               admin_disabled_at = CASE WHEN $1 THEN NULL ELSE now() END
           WHERE id = $2 AND role = 'user'
           RETURNING id, username, role, is_active`,
          [body.is_active, userId],
        )
        if (updated.rows.length === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({ error: 'User account not found.' })
          return
        }
        if (!updated.rows[0].is_active) {
          await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [userId])
          await client.query(
            `UPDATE password_reset_tokens SET revoked_at = now()
             WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
            [userId],
          )
        }
        await client.query('COMMIT')
        res.status(200).json({ user: updated.rows[0] })
      } catch (error) {
        await client.query('ROLLBACK')
        if (isActiveAccountLimitError(error)) {
          res.status(409).json({ error: 'The maximum of 50 active user accounts has been reached.' })
          return
        }
        throw error
      } finally {
        client.release()
      }
      return
    }

    const deleted = await getDatabase().query(
      `DELETE FROM app_users
       WHERE id = $1 AND role = 'user'
       RETURNING id`,
      [userId],
    )
    if (deleted.rows.length === 0) {
      res.status(404).json({ error: 'User account not found.' })
      return
    }
    res.status(200).json({ message: 'User account deleted.' })
  } catch (error) {
    handleApiError(res, 'admin/user', error)
  }
}
