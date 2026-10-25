import type { ApiRequest, ApiResponse } from './http'
import authBootstrap from './api/auth/bootstrap'
import authEnrollEmail from './api/auth/enroll-email'
import authForgotPassword from './api/auth/forgot-password'
import authLogin from './api/auth/login'
import authLogout from './api/auth/logout'
import authMe from './api/auth/me'
import authRegister from './api/auth/register'
import authResendVerification from './api/auth/resend-verification'
import authResetPassword from './api/auth/reset-password'
import authUsage from './api/auth/usage'
import authVerifyEmail from './api/auth/verify-email'
import adminAccessCodes from './api/admin/access-codes'
import adminAccessCode from './api/admin/access-codes/[id]'
import adminUsage from './api/admin/usage'
import adminUsers from './api/admin/users'
import adminUser from './api/admin/users/[id]'
import adminUserResetPassword from './api/admin/users/[id]/reset-password'
import generate from './api/generate'

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

export default async function routeApiRequest(req: ApiRequest, res: ApiResponse): Promise<void> {
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
