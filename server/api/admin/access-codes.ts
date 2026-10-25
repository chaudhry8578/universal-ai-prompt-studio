import { randomBytes } from 'node:crypto'
import { getAuthenticatedUser, hashOpaqueToken, isAdmin } from '../../auth.js'
import { getDatabase } from '../../database.js'
import { handleApiError, isJsonObject, type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (req.method === 'POST' && !isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }
  try {
    const admin = await getAuthenticatedUser(req)
    if (!isAdmin(admin)) {
      res.status(admin ? 403 : 401).json({ error: admin ? 'Administrator access required.' : 'Authentication required.' })
      return
    }
    if (req.method === 'GET') {
      const codes = await getDatabase().query(
        `SELECT id, created_at, expires_at, revoked_at, redeemed_at, redeemed_by_user_id
         FROM auth_access_codes ORDER BY created_at DESC LIMIT 200`,
      )
      res.status(200).json({ codes: codes.rows })
      return
    }
    if (req.body !== undefined && (!isJsonObject(req.body) ||
      (req.body.expiresInDays !== undefined &&
        (typeof req.body.expiresInDays !== 'number' || !Number.isInteger(req.body.expiresInDays) || req.body.expiresInDays < 1 || req.body.expiresInDays > 90)))) {
      res.status(400).json({ error: 'expiresInDays must be a whole number from 1 to 90.' })
      return
    }
    const expiresInDays = isJsonObject(req.body) && typeof req.body.expiresInDays === 'number'
      ? req.body.expiresInDays
      : 30
    const code = `UAS-${randomBytes(32).toString('hex').toUpperCase()}`
    const created = await getDatabase().query<{ id: string; expires_at: Date }>(
      `INSERT INTO auth_access_codes (code_hash, created_by, expires_at)
       VALUES ($1, $2, now() + ($3 * interval '1 day'))
       RETURNING id, expires_at`,
      [hashOpaqueToken(code), admin.id, expiresInDays],
    )
    res.status(201).json({ code, ...created.rows[0] })
  } catch (error) {
    handleApiError(res, 'admin/access-codes', error)
  }
}
