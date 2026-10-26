import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const vite = await createServer({
  appType: 'custom',
  configFile: false,
  server: { middlewareMode: true },
})
const { createOpaqueToken, hashOpaqueToken, normalizeGmail } = await vite.ssrLoadModule('/server/identity.ts')
const { generateInternalUsername, hashPassword, normalizeUsername, verifyPassword } = await vite.ssrLoadModule('/server/auth.ts')
const { isSameOrigin } = await vite.ssrLoadModule('/server/http.ts')
after(() => vite.close())

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

test('usernames are case-insensitive and match the database username format', () => {
  assert.equal(normalizeUsername('Creator_01'), 'creator_01')
  for (const username of ['ab', '-creator', 'creator.name', 'creator name', 'a'.repeat(33), null]) {
    assert.equal(normalizeUsername(username), undefined, String(username))
  }
})

test('opaque tokens have 256 bits of URL-safe randomness and are one-way hashed', () => {
  const first = createOpaqueToken()
  const second = createOpaqueToken()
  assert.match(first, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(first, second)
  assert.match(hashOpaqueToken(first), /^[a-f0-9]{64}$/)
  assert.notEqual(hashOpaqueToken(first), first)
})

test('internally generated usernames are database-compatible and passwords are only stored as scrypt hashes', async () => {
  const firstUsername = generateInternalUsername()
  const secondUsername = generateInternalUsername()
  assert.match(firstUsername, /^acct_[a-f0-9]{26}$/)
  assert.notEqual(firstUsername, secondUsername)

  const password = 'example-password-value'
  const passwordHash = await hashPassword(password)
  assert.match(passwordHash, /^scrypt\$16384\$8\$1\$/)
  assert.notEqual(passwordHash, password)
  assert.equal(await verifyPassword(password, passwordHash), true)
  assert.equal(await verifyPassword('incorrect-password-value', passwordHash), false)
})

test('state-changing browser requests require a matching Origin and host', () => {
  assert.equal(isSameOrigin({ headers: { origin: 'https://studio.example', host: 'studio.example' } }), true)
  assert.equal(isSameOrigin({ headers: { origin: 'https://attacker.example', host: 'studio.example' } }), false)
  assert.equal(isSameOrigin({ headers: { host: 'studio.example' } }), false)
})
