import { createHash } from 'node:crypto'
import { clearSessionCookie } from '../../auth.js'
import { getDatabase } from '../../database.js'
import { getCookie, handleApiError, type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }

  try {
    const token = getCookie(req, '__Host-uas_session')
    if (token && token.length <= 128) {
      const tokenHash = createHash('sha256').update(token).digest('hex')
      await getDatabase().query('DELETE FROM auth_sessions WHERE token_hash = $1', [tokenHash])
    }
    clearSessionCookie(res)
    res.status(200).json({ message: 'Logged out.' })
  } catch (error) {
    handleApiError(res, 'auth/logout', error)
  }
}
