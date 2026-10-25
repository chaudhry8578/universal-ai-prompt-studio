import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  server: { middlewareMode: true },
})
const { default: handler } = await vite.ssrLoadModule('/api/index.ts')
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
