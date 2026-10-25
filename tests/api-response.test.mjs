import assert from 'node:assert/strict'
import test from 'node:test'
import { readJsonResponse } from '../src/api-response.ts'

test('API response reader parses JSON responses', async () => {
  const response = Response.json({ user: { id: 'user-1' } })
  assert.deepEqual(await readJsonResponse(response, 'Login API'), { user: { id: 'user-1' } })
})

test('API response reader reports platform text responses with their HTTP status', async () => {
  const response = new Response('The page could not be found', {
    status: 404,
    headers: { 'content-type': 'text/plain' },
  })
  await assert.rejects(
    readJsonResponse(response, 'Login API'),
    { message: 'Login API returned a non-JSON response (404).' },
  )
})
