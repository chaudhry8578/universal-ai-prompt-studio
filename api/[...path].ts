import type { ApiRequest, ApiResponse } from '../server/http'
import authBootstrap from '../server/api/auth/bootstrap'
import authEnrollEmail from '../server/api/auth/enroll-email'
import authForgotPassword from '../server/api/auth/forgot-password'
import authLogin from '../server/api/auth/login'
import authLogout from '../server/api/auth/logout'
import authMe from '../server/api/auth/me'
import authRegister from '../server/api/auth/register'
import authResendVerification from '../server/api/auth/resend-verification'
import authResetPassword from '../server/api/auth/reset-password'
import authUsage from '../server/api/auth/usage'
import authVerifyEmail from '../server/api/auth/verify-email'
import adminAccessCodes from '../server/api/admin/access-codes'
import adminAccessCode from '../server/api/admin/access-codes/[id]'
import adminUsage from '../server/api/admin/usage'
import adminUsers from '../server/api/admin/users'
import adminUser from '../server/api/admin/users/[id]'
import adminUserResetPassword from '../server/api/admin/users/[id]/reset-password'
import generate from '../server/api/generate'

type RouteHandler = (req: ApiRequest, res: ApiResponse) => Promise<void>

const staticRoutes: Record<string, RouteHandler> = {
  '/api/auth/bootstrap': authBootstrap,
  '/api/auth/enroll-email': authEnrollEmail,
  '/api/auth/forgot-password': authForgotPassword,
  '/api/auth/login': authLogin,
  '/api/auth/logout': authLogout,
  '/api/auth/me': authMe,
  '/api/auth/register': authRegister,
  '/api/auth/resend-verification': authResendVerification,
  '/api/auth/reset-password': authResetPassword,
  '/api/auth/usage': authUsage,
  '/api/auth/verify-email': authVerifyEmail,
  '/api/admin/access-codes': adminAccessCodes,
  '/api/admin/usage': adminUsage,
  '/api/admin/users': adminUsers,
  '/api/generate': generate,
}

function withId(req: ApiRequest, id: string): ApiRequest {
  return { ...req, query: { ...req.query, id } }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'https://vercel.invalid').pathname.replace(/\/+$/, '') || '/'
  const staticRoute = staticRoutes[pathname]
  if (staticRoute) {
    await staticRoute(req, res)
    return
  }

  const userReset = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/)
  const user = pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
  const accessCode = pathname.match(/^\/api\/admin\/access-codes\/([^/]+)$/)
  const dynamicRoute = userReset ? adminUserResetPassword : user ? adminUser : accessCode ? adminAccessCode : undefined
  const id = userReset?.[1] ?? user?.[1] ?? accessCode?.[1]
  if (dynamicRoute && id) {
    let decodedId: string
    try {
      decodedId = decodeURIComponent(id)
    } catch {
      res.status(400).json({ error: 'A valid resource ID is required.' })
      return
    }
    await dynamicRoute(withId(req, decodedId), res)
    return
  }

  res.status(404).json({ error: 'Not found.' })
}
