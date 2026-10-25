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
        `SELECT id, created_at,
                CASE WHEN expires_at = 'infinity'::timestamptz THEN NULL ELSE expires_at END AS expires_at,
                expires_at = 'infinity'::timestamptz AS never_expires,
                revoked_at, redeemed_at, redeemed_by_user_id
         FROM auth_access_codes ORDER BY created_at DESC LIMIT 200`,
      )
      res.status(200).json({ codes: codes.rows })
      return
    }
    if (req.body !== undefined && (!isJsonObject(req.body) ||
      (req.body.expiresInDays !== undefined &&
        req.body.expiresInDays !== null &&
        (typeof req.body.expiresInDays !== 'number' || ![1, 7, 30, 90].includes(req.body.expiresInDays))))) {
      res.status(400).json({ error: 'expiresInDays must be 1, 7, 30, 90, or null for no expiration.' })
      return
    }
    const expiresInDays = isJsonObject(req.body) && (typeof req.body.expiresInDays === 'number' || req.body.expiresInDays === null)
      ? req.body.expiresInDays
      : 30
    const code = `UAS-${randomBytes(32).toString('hex').toUpperCase()}`
    const created = await getDatabase().query<{ id: string; expires_at: Date | null; never_expires: boolean }>(
      `INSERT INTO auth_access_codes (code_hash, created_by, expires_at)
       VALUES ($1, $2, CASE WHEN $3::integer IS NULL THEN 'infinity'::timestamptz
                            ELSE now() + ($3::integer * interval '1 day') END)
       RETURNING id,
                 CASE WHEN expires_at = 'infinity'::timestamptz THEN NULL ELSE expires_at END AS expires_at,
                 expires_at = 'infinity'::timestamptz AS never_expires`,
      [hashOpaqueToken(code), admin.id, expiresInDays],
    )
    res.status(201).json({ code, ...created.rows[0] })
  } catch (error) {
    handleApiError(res, 'admin/access-codes', error)
  }
}
