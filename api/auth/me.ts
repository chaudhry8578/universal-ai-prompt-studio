import { getAuthenticatedUser } from '../../server/auth'
import { handleApiError, type ApiRequest, type ApiResponse } from '../../server/http'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' })
      return
    }
    res.status(200).json({ user })
  } catch (error) {
    handleApiError(res, 'auth/me', error)
  }
}
