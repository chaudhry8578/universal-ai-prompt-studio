import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import type { Pool } from 'pg'
import { getDatabase } from './database.js'
import type { ApiRequest, ApiResponse, AuthenticatedUser } from './http.js'
import { getCookie, getHeader } from './http.js'
import { createOpaqueToken, hashOpaqueToken, normalizeGmail } from './identity.js'

export { createOpaqueToken, hashOpaqueToken, normalizeGmail }

const SESSION_COOKIE = '__Host-uas_session'
const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60
const PASSWORD_KEY_LENGTH = 64
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, PASSWORD_KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) {
        reject(error)
        return
      }
      resolve(key)
    })
  })
}

export const INVALID_LOGIN_MESSAGE = 'Invalid Account. Please message the Admin.'

export function normalizeUsername(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/.test(value)) return undefined
  return value.toLowerCase()
}

export function generateInternalUsername(): string {
  return `acct_${randomBytes(13).toString('hex')}`
}

export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derivedKey = await derivePasswordKey(password, salt)
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const match = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/.exec(encodedHash)
  if (!match) return false

  const [, nValue, rValue, pValue, saltValue, keyValue] = match
  const N = Number(nValue)
  const r = Number(rValue)
  const p = Number(pValue)
  const salt = Buffer.from(saltValue, 'base64url')
  const expectedKey = Buffer.from(keyValue, 'base64url')
  if (
    !Number.isSafeInteger(N) || N !== SCRYPT_OPTIONS.N ||
    !Number.isSafeInteger(r) || r !== SCRYPT_OPTIONS.r ||
    !Number.isSafeInteger(p) || p !== SCRYPT_OPTIONS.p ||
    salt.length !== 16 || expectedKey.length !== PASSWORD_KEY_LENGTH
  ) {
    return false
  }

  const actualKey = await derivePasswordKey(password, salt)
  return timingSafeEqual(actualKey, expectedKey)
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) {
    const error = new Error('AUTH_SECRET must be configured as a random server-side value of at least 32 characters.')
    error.name = 'ConfigurationError'
    throw error
  }
  return secret
}

function getClientAddress(req: ApiRequest): string {
  const forwarded = getHeader(req, 'x-forwarded-for')
  const realIp = getHeader(req, 'x-real-ip')
  const address = realIp ?? forwarded?.split(',')[0]?.trim() ?? 'unknown'
  return address.slice(0, 128)
}

function getRateLimitHash(req: ApiRequest): string {
  return createHmac('sha256', getAuthSecret()).update(getClientAddress(req)).digest('hex')
}

export async function recordLoginAttempt(req: ApiRequest): Promise<number> {
  const pool = getDatabase()
  const result = await pool.query<{ attempts: number }>(
    `INSERT INTO login_rate_limits (identifier_hash, window_started_at, attempts)
     VALUES ($1, now(), 1)
     ON CONFLICT (identifier_hash) DO UPDATE
     SET attempts = CASE
           WHEN login_rate_limits.window_started_at <= now() - interval '15 minutes' THEN 1
           ELSE login_rate_limits.attempts + 1
         END,
         window_started_at = CASE
           WHEN login_rate_limits.window_started_at <= now() - interval '15 minutes' THEN now()
           ELSE login_rate_limits.window_started_at
         END
     RETURNING attempts`,
    [getRateLimitHash(req)],
  )
  if (result.rows[0].attempts === 1) {
    await pool.query(
      `DELETE FROM login_rate_limits
       WHERE window_started_at < now() - interval '24 hours'`,
    )
  }
  return result.rows[0].attempts
}

export async function clearLoginAttempts(req: ApiRequest): Promise<void> {
  await getDatabase().query('DELETE FROM login_rate_limits WHERE identifier_hash = $1', [getRateLimitHash(req)])
}

export type AuthAction = 'register' | 'verify-email' | 'forgot-password' | 'reset-password' | 'enroll-email'

export async function recordAuthAction(
  req: ApiRequest,
  action: AuthAction,
  subject: string,
): Promise<number> {
  const identifierHash = createHmac('sha256', getAuthSecret())
    .update(`${action}\0${getClientAddress(req)}\0${subject.toLowerCase()}`)
    .digest('hex')
  const result = await getDatabase().query<{ attempts: number }>(
    `INSERT INTO auth_action_rate_limits (action, subject_hash, window_started_at, attempts)
     VALUES ($1, $2, now(), 1)
     ON CONFLICT (action, subject_hash) DO UPDATE
     SET attempts = CASE
           WHEN auth_action_rate_limits.window_started_at <= now() - interval '15 minutes' THEN 1
           ELSE auth_action_rate_limits.attempts + 1
         END,
         window_started_at = CASE
           WHEN auth_action_rate_limits.window_started_at <= now() - interval '15 minutes' THEN now()
           ELSE auth_action_rate_limits.window_started_at
         END
     RETURNING attempts`,
    [action, identifierHash],
  )
  if (result.rows[0].attempts === 1) {
    await getDatabase().query(
      `DELETE FROM auth_action_rate_limits
       WHERE window_started_at < now() - interval '24 hours'`,
    )
  }
  return result.rows[0].attempts
}

export function setSessionCookie(res: ApiResponse, token: string): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_LIFETIME_SECONDS}`,
  )
}

export function clearSessionCookie(res: ApiResponse): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  )
}

export async function createSession(
  pool: Pick<Pool, 'query'>,
  user: Pick<AuthenticatedUser, 'id'>,
): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  await pool.query(
    `INSERT INTO auth_sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '7 days')`,
    [tokenHash, user.id],
  )
  return token
}

export async function getAuthenticatedUser(req: ApiRequest): Promise<AuthenticatedUser | undefined> {
  const token = getCookie(req, SESSION_COOKIE)
  if (!token || token.length > 128) return undefined

  const tokenHash = createHash('sha256').update(token).digest('hex')
  const result = await getDatabase().query<AuthenticatedUser>(
    `SELECT users.id, users.role, users.email
     FROM auth_sessions
     JOIN app_users AS users ON users.id = auth_sessions.user_id
     WHERE auth_sessions.token_hash = $1
       AND auth_sessions.expires_at > now()
       AND users.is_active = true`,
    [tokenHash],
  )
  return result.rows[0]
}

let dummyHashPromise: Promise<string> | undefined

export function getDummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString('base64url'))
  return dummyHashPromise
}

export function isAdmin(user: AuthenticatedUser | undefined): user is AuthenticatedUser & { role: 'admin' } {
  return user?.role === 'admin'
}

export function getBootstrapToken(req: ApiRequest): string | undefined {
  const authorization = getHeader(req, 'authorization')
  const match = authorization && /^Bearer\s+(.+)$/i.exec(authorization)
  return match?.[1]
}

export function matchesSecret(provided: string | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const providedBytes = Buffer.from(provided)
  const expectedBytes = Buffer.from(expected)
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes)
}
