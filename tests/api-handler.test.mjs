import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  server: { middlewareMode: true },
})
const { default: handler } = await vite.ssrLoadModule('/api/index.ts')
const { handleApiError } = await vite.ssrLoadModule('/server/http.ts')
const { requestAdminBootstrap, isAdminBootstrapLocation } = await vite.ssrLoadModule('/src/AdminBootstrapPage.tsx')
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
      result.headers['content-type'] = 'application/json; charset=utf-8'
    },
    setHeader(name, value) {
      result.headers[name.toLowerCase()] = value
    },
  }
}

test('Vercel handler dispatches rewritten API paths through the shared router', async () => {
  const res = createResponse()

  await handler(
    { method: 'GET', url: '/api?_apiPath=auth/login', headers: { host: 'studio.example' } },
    res,
  )

  assert.equal(res.result.statusCode, 405)
  assert.equal(res.result.body.error, 'Method not allowed.')
  assert.match(res.result.headers['content-type'], /^application\/json/)
})

test('account creation requires authentication and retired registration APIs are disabled', async () => {
  const requests = [
    { path: 'admin/users', method: 'POST', body: { email: 'newuser@gmail.com', password: 'test-password-value' }, status: 401, error: 'Authentication required.' },
    { path: 'admin/access-codes', method: 'POST', body: { expiresInDays: null }, status: 410, error: 'This registration flow is no longer available. Contact an administrator.' },
    { path: 'admin/access-codes', method: 'GET', status: 410, error: 'This registration flow is no longer available. Contact an administrator.' },
    { path: 'admin/access-codes/00000000-0000-4000-8000-000000000000', method: 'PATCH', status: 410, error: 'This registration flow is no longer available. Contact an administrator.' },
    { path: 'auth/register', method: 'POST', body: { email: 'newuser@gmail.com', password: 'test-password-value', accessCode: 'UAS-test' }, status: 410, error: 'This registration flow is no longer available. Contact an administrator.' },
    { path: 'auth/enroll-email', method: 'POST', status: 410, error: 'This registration flow is no longer available. Contact an administrator.' },
    { path: 'auth/verify-email', method: 'POST', status: 410, error: 'This registration flow is no longer available. Contact an administrator.' },
    { path: 'auth/resend-verification', method: 'POST', status: 410, error: 'This registration flow is no longer available. Contact an administrator.' },
  ]
  for (const request of requests) {
    const res = createResponse()
    await handler(
      {
        method: request.method,
        url: `/api?_apiPath=${request.path}`,
        headers: { host: 'studio.example', origin: 'https://studio.example', 'content-type': 'application/json' },
        body: request.body,
      },
      res,
    )
    assert.equal(res.result.statusCode, request.status, request.path)
    assert.equal(res.result.body.error, request.error, request.path)
  }
})

test('bootstrap accepts a bodyless POST format while preserving bearer and body checks', async () => {
  const config = {
    ADMIN_BOOTSTRAP_TOKEN: 'test-bootstrap-token-with-at-least-32-chars',
    BOOTSTRAP_ADMIN_EMAIL: 'admin@gmail.com',
    BOOTSTRAP_ADMIN_PASSWORD: 'test-bootstrap-password',
  }
  const envKeys = [...Object.keys(config), 'DATABASE_URL', 'STORAGE_DATABASE_URL']
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, config)
  delete process.env.DATABASE_URL
  delete process.env.STORAGE_DATABASE_URL

  try {
    const bodyless = createResponse()
    await handler(
      {
        method: 'POST',
        url: '/api?_apiPath=auth/bootstrap',
        headers: {
          host: 'studio.example',
          origin: 'https://studio.example',
          authorization: `Bearer ${config.ADMIN_BOOTSTRAP_TOKEN}`,
        },
      },
      bodyless,
    )
    assert.equal(bodyless.result.statusCode, 503)
    assert.notEqual(bodyless.result.statusCode, 415)

    const unauthorized = createResponse()
    await handler(
      {
        method: 'POST',
        url: '/api?_apiPath=auth/bootstrap',
        headers: {
          host: 'studio.example',
          origin: 'https://studio.example',
          authorization: 'Bearer invalid-token',
        },
      },
      unauthorized,
    )

    assert.equal(unauthorized.result.statusCode, 403)
    assert.deepEqual(unauthorized.result.body, { error: 'Bootstrap authorization failed.' })

    const crossOrigin = createResponse()
    await handler(
      {
        method: 'POST',
        url: '/api?_apiPath=auth/bootstrap',
        headers: {
          host: 'studio.example',
          origin: 'https://attacker.example',
          authorization: `Bearer ${config.ADMIN_BOOTSTRAP_TOKEN}`,
        },
      },
      crossOrigin,
    )

    assert.equal(crossOrigin.result.statusCode, 403)
    assert.deepEqual(crossOrigin.result.body, { error: 'Cross-origin requests are not allowed.' })

    const bodyfulForm = createResponse()
    await handler(
      {
        method: 'POST',
        url: '/api?_apiPath=auth/bootstrap',
        headers: {
          host: 'studio.example',
          origin: 'https://studio.example',
          authorization: `Bearer ${config.ADMIN_BOOTSTRAP_TOKEN}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'unexpected=value',
      },
      bodyfulForm,
    )

    assert.equal(bodyfulForm.result.statusCode, 400)
    assert.deepEqual(bodyfulForm.result.body, { error: 'This bootstrap endpoint does not accept a request body.' })
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('Admin activation sends only the Bearer header without a request body or Content-Type', async () => {
  const originalFetch = globalThis.fetch
  let recorded
  globalThis.fetch = async (url, options) => {
    recorded = { url, options }
    return new Response(JSON.stringify({ message: 'Administrator account created.' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    assert.equal(await requestAdminBootstrap('test-token'), 'Administrator account created.')
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(recorded.url, '/api/auth/bootstrap')
  assert.equal(recorded.options.method, 'POST')
  assert.equal(recorded.options.headers.Authorization, 'Bearer test-token')
  assert.equal('body' in recorded.options, false)
  assert.equal('Content-Type' in recorded.options.headers, false)
  assert.equal(recorded.options.credentials, 'same-origin')
  assert.equal(recorded.options.redirect, 'error')
})

test('Admin activation does not expose a platform response body for HTTP 415', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('unsupported content type private detail', { status: 415 })
  try {
    await assert.rejects(
      requestAdminBootstrap('test-token'),
      /Admin activation API returned a non-JSON response \(415\)\./,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('bootstrap identifies missing or invalid configuration without exposing values', async () => {
  const config = {
    ADMIN_BOOTSTRAP_TOKEN: 'test-bootstrap-token-with-at-least-32-chars',
    BOOTSTRAP_ADMIN_EMAIL: 'not-a-gmail-address',
    BOOTSTRAP_ADMIN_PASSWORD: 'test-bootstrap-password',
  }
  const envKeys = Object.keys(config)
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]))
  const makeRequest = async () => {
    const res = createResponse()
    await handler(
      {
        method: 'POST',
        url: '/api?_apiPath=auth/bootstrap',
        headers: { host: 'studio.example', origin: 'https://studio.example' },
      },
      res,
    )
    return res.result
  }

  try {
    for (const key of envKeys) delete process.env[key]
    const missing = await makeRequest()
    assert.equal(missing.statusCode, 503)
    assert.deepEqual(missing.body, {
      error: 'Missing server-side environment variables: ADMIN_BOOTSTRAP_TOKEN, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD.',
    })

    Object.assign(process.env, config)
    const invalidEmail = await makeRequest()
    assert.equal(invalidEmail.statusCode, 503)
    assert.deepEqual(invalidEmail.body, {
      error: 'BOOTSTRAP_ADMIN_EMAIL must be a valid Gmail address.',
    })
    assert.doesNotMatch(JSON.stringify(invalidEmail.body), /not-a-gmail-address/)
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test('Vercel rewrites both Admin activation URLs to the SPA entry point', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  const activationRewrites = config.rewrites.filter((rewrite) =>
    rewrite.source === '/admin/activate' || rewrite.source === '/admin/activate.html',
  )

  assert.deepEqual(activationRewrites, [
    { source: '/admin/activate', destination: '/index.html?admin-activate=1' },
    { source: '/admin/activate.html', destination: '/index.html?admin-activate=1' },
  ])
  assert.ok(config.rewrites.findIndex((rewrite) => rewrite.source === '/api/:path*') > 1)
})

test('Admin activation page recognizes both path URLs without changing the homepage route', () => {
  assert.equal(isAdminBootstrapLocation('/admin/activate', ''), true)
  assert.equal(isAdminBootstrapLocation('/admin/activate.html', ''), true)
  assert.equal(isAdminBootstrapLocation('/', '?admin-activate=1'), true)
  assert.equal(isAdminBootstrapLocation('/', ''), false)
})

test('Vercel handler returns JSON for unexpected routing failures without echoing details', async () => {
  const res = createResponse()

  await handler(
    { method: 'GET', url: 'http://[secret-value]', headers: { host: 'studio.example' } },
    res,
  )

  assert.equal(res.result.statusCode, 500)
  assert.deepEqual(res.result.body, { error: 'The request could not be completed. Please try again.' })
  assert.match(res.result.headers['content-type'], /^application\/json/)
  assert.doesNotMatch(JSON.stringify(res.result.body), /secret-value/)
})

test('API error logging does not expose raw error details', () => {
  const res = createResponse()
  const originalError = console.error
  const logged = []
  console.error = (...args) => logged.push(args)

  try {
    handleApiError(res, 'auth/bootstrap', new Error('sensitive database detail'))
  } finally {
    console.error = originalError
  }

  assert.deepEqual(logged, [['[auth/bootstrap] Request failed.']])
  assert.equal(res.result.statusCode, 500)
  assert.deepEqual(res.result.body, { error: 'The request could not be completed. Please try again.' })
})

test('API reports incomplete database migrations without exposing database details', () => {
  const res = createResponse()
  const originalError = console.error
  const logged = []
  console.error = (...args) => logged.push(args)

  try {
    handleApiError(res, 'admin/access-codes', Object.assign(new Error('private relation details'), { code: '42P01' }))
  } finally {
    console.error = originalError
  }

  assert.equal(res.result.statusCode, 503)
  assert.deepEqual(res.result.body, {
    error: 'Database schema is incomplete. Apply the latest database migrations and try again.',
  })
  assert.deepEqual(logged, [['[admin/access-codes] Request failed (SQLSTATE 42P01).']])
  assert.doesNotMatch(JSON.stringify(res.result.body), /private relation details|42P01/)
})
