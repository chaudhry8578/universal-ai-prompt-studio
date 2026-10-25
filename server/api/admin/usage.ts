import { getAuthenticatedUser, isAdmin } from '../../auth.js'
import { getDatabase } from '../../database.js'
import { handleApiError, type ApiRequest, type ApiResponse } from '../../http.js'

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }

  try {
    const actor = await getAuthenticatedUser(req)
    if (!isAdmin(actor)) {
      res.status(actor ? 403 : 401).json({ error: actor ? 'Administrator access required.' : 'Authentication required.' })
      return
    }

    const requestedDate = req.query?.date
    const usageDate = typeof requestedDate === 'string'
      ? requestedDate
      : new Date().toISOString().slice(0, 10)
    if (!isCalendarDate(usageDate)) {
      res.status(400).json({ error: 'The date must use YYYY-MM-DD format.' })
      return
    }

    const result = await getDatabase().query(
      `SELECT users.id, users.username, users.role, users.is_active, users.email_verified_at,
              COALESCE(daily_usage.successful_generations, 0)::integer AS successful_generations
       FROM app_users AS users
       LEFT JOIN daily_usage
         ON daily_usage.user_id = users.id AND daily_usage.usage_date = $1::date
       ORDER BY users.username`,
      [usageDate],
    )
    res.status(200).json({ date: usageDate, users: result.rows })
  } catch (error) {
    handleApiError(res, 'admin/usage', error)
  }
}
