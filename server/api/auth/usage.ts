import { getAuthenticatedUser } from '../../auth.js'
import { getDatabase } from '../../database.js'
import { handleApiError, type ApiRequest, type ApiResponse } from '../../http.js'

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
    const result = await getDatabase().query<{ successful_generations: number; usage_date: string }>(
      `SELECT COALESCE(
         (SELECT successful_generations FROM daily_usage
          WHERE user_id = $1 AND usage_date = (now() AT TIME ZONE 'UTC')::date),
         0
       )::integer AS successful_generations,
       to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS usage_date`,
      [user.id],
    )
    const used = result.rows[0].successful_generations
    res.status(200).json({
      date: result.rows[0].usage_date,
      limit: 20,
      used,
      remaining: Math.max(0, 20 - used),
    })
  } catch (error) {
    handleApiError(res, 'auth/usage', error)
  }
}
