import { getAuthenticatedUser, isAdmin } from '../../../auth'
import { getDatabase } from '../../../database'
import { handleApiError, type ApiRequest, type ApiResponse, isSameOrigin } from '../../../http'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'PATCH') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }
  try {
    const admin = await getAuthenticatedUser(req)
    if (!isAdmin(admin)) {
      res.status(admin ? 403 : 401).json({ error: admin ? 'Administrator access required.' : 'Authentication required.' })
      return
    }
    const id = req.query?.id
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ error: 'A valid access-code ID is required.' })
      return
    }
    const revoked = await getDatabase().query(
      `UPDATE auth_access_codes SET revoked_at = now()
       WHERE id = $1 AND revoked_at IS NULL AND redeemed_at IS NULL
       RETURNING id, revoked_at`,
      [id],
    )
    if (!revoked.rows[0]) {
      res.status(409).json({ error: 'That access code is not available to revoke. It may already be redeemed or revoked.' })
      return
    }
    res.status(200).json({ code: revoked.rows[0] })
  } catch (error) {
    handleApiError(res, 'admin/access-code', error)
  }
}
