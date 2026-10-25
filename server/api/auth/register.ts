import { getAuthenticatedUser, isAdmin } from '../../auth.js'
import { type ApiRequest, type ApiResponse, isSameOrigin } from '../../http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (!isSameOrigin(req)) {
    res.status(403).json({ error: 'Cross-origin requests are not allowed.' })
    return
  }
  const actor = await getAuthenticatedUser(req)
  if (!isAdmin(actor)) {
    res.status(actor ? 403 : 401).json({ error: actor ? 'Administrator access required.' : 'Authentication required.' })
    return
  }
  res.status(403).json({ error: 'Use the administrator dashboard to create accounts.' })
}
