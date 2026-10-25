import assert from 'node:assert/strict'
import test from 'node:test'
import { createOpaqueToken, hashOpaqueToken, normalizeGmail } from '../server/identity.ts'
import { isSameOrigin } from '../server/http.ts'

test('Gmail addresses are normalized and dot/plus aliases share one identity', () => {
  const first = normalizeGmail('First.Last+studio@gmail.com')
  const second = normalizeGmail('firstlast@gmail.com')
  assert.deepEqual(first, { email: 'first.last+studio@gmail.com', identity: 'firstlast@gmail.com' })
  assert.equal(first.identity, second.identity)
})

test('non-Gmail and malformed Gmail addresses are rejected', () => {
  for (const email of ['person@example.com', 'person@googlemail.com', '.person@gmail.com', 'per..son@gmail.com', 'person.@gmail.com', '']) {
    assert.equal(normalizeGmail(email), undefined, email)
  }
  assert.equal(normalizeGmail(null), undefined)
})

test('opaque tokens have 256 bits of URL-safe randomness and are one-way hashed', () => {
  const first = createOpaqueToken()
  const second = createOpaqueToken()
  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first, second)
  assert.match(hashOpaqueToken(first), /^[a-f0-9]{64}$/)
  assert.notEqual(hashOpaqueToken(first), first)
})

test('state-changing browser requests require a matching Origin and host', () => {
  assert.equal(isSameOrigin({ headers: { origin: 'https://studio.example', host: 'studio.example' } }), true)
  assert.equal(isSameOrigin({ headers: { origin: 'https://attacker.example', host: 'studio.example' } }), false)
  assert.equal(isSameOrigin({ headers: { host: 'studio.example' } }), false)
})
