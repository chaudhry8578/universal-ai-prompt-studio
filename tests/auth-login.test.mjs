import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  plugins: [{
    name: 'legacy-login-test-dependencies',
    enforce: 'pre',
    resolveId(source, importer) {
      if (importer?.endsWith('/server/api/auth/login.ts')) {
        if (source === '../../auth.js') return '\0legacy-login-test-auth'
        if (source === '../../database.js') return '\0legacy-login-test-database'
      }
      return undefined
    },
    load(id) {
      if (id === '\0legacy-login-test-auth') {
        return `
          import { normalizeGmail, normalizeUsername, isValidPassword, verifyPassword } from '/server/auth.ts'
          export { normalizeGmail, normalizeUsername, isValidPassword, verifyPassword }
          export const INVALID_LOGIN_MESSAGE = 'Invalid Account. Please message the Admin.'
          export async function recordLoginAttempt() { return 1 }
          export async function clearLoginAttempts() {}
          export async function getDummyPasswordHash() { return 'unused-dummy-hash' }
          export function setSessionCookie(res, token) { res.setHeader('Set-Cookie', token) }
          export async function createSession(client, user) {
            await client.query('INSERT INTO auth_sessions (user_id) VALUES ($1)', [user.id])
            return 'legacy-test-session'
          }
        `
      }
      if (id === '\0legacy-login-test-database') {
        return 'export function getDatabase() { return globalThis.__legacyLoginTestDatabase }'
      }
      return undefined
    },
  }],
  server: { middlewareMode: true },
})
const { default: loginHandler } = await vite.ssrLoadModule('/server/api/auth/login.ts')
const { hashPassword } = await vite.ssrLoadModule('/server/auth.ts')
const { isAuthUser } = await vite.ssrLoadModule('/src/AuthPage.tsx')
after(() => vite.close())

function createResponse() {
  const result = { headers: {}, statusCode: 200, body: undefined }
  return {
    result,
    status(code) {
      result.statusCode = code
      return this
    },
    json(value) {
      result.body = value
    },
    setHeader(name, value) {
      result.headers[name.toLowerCase()] = value
    },
  }
}

test('existing username accounts without email can log in with their unchanged password', async () => {
  const password = 'legacy-account-password'
  const passwordHash = await hashPassword(password)
  const account = {
    id: 'legacy-user-id',
    username: 'legacy_creator',
    email: null,
    password_hash: passwordHash,
    role: 'user',
    is_active: true,
  }
  const queries = []
  const client = {
    async query(sql, values = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim()
      queries.push({ sql: normalizedSql, values })
      if (normalizedSql.startsWith('SELECT password_hash, is_active FROM app_users')) {
        return { rows: [{ password_hash: account.password_hash, is_active: account.is_active }] }
      }
      return { rows: [] }
    },
    release() {},
  }
  const pool = {
    async query(sql, values = []) {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim()
      queries.push({ sql: normalizedSql, values })
      if (normalizedSql.startsWith('SELECT id, email, password_hash, role FROM app_users')) {
        return { rows: [{ ...account }] }
      }
      return { rows: [] }
    },
    async connect() {
      return client
    },
  }
  globalThis.__legacyLoginTestDatabase = pool
  const res = createResponse()

  try {
    await loginHandler({
      method: 'POST',
      headers: { host: 'studio.example', origin: 'https://studio.example' },
      body: { username: account.username, password },
    }, res)
  } finally {
    delete globalThis.__legacyLoginTestDatabase
  }

  assert.equal(res.result.statusCode, 200)
  assert.deepEqual(res.result.body, {
    user: { id: account.id, email: null, role: account.role },
  })
  assert.equal(res.result.headers['set-cookie'], 'legacy-test-session')
  assert.equal(account.password_hash, passwordHash)
  assert.deepEqual(
    queries.find(({ sql }) => sql.startsWith('SELECT id, email, password_hash, role FROM app_users')).values,
    [account.username, null],
  )
  assert.equal(queries.some(({ sql }) => sql.includes('UPDATE app_users SET password_hash')), false)
  assert.equal(isAuthUser({ id: account.id, email: null, role: 'user' }), true)
})
