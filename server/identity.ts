import { createHash, randomBytes } from 'node:crypto'

export function normalizeGmail(value: unknown): { email: string; identity: string } | undefined {
  if (typeof value !== 'string') return undefined
  const email = value.trim().toLowerCase()
  if (
    email.length > 254 ||
    !/^[a-z0-9][a-z0-9.+]{0,62}@gmail\.com$/.test(email) ||
    email.slice(0, email.indexOf('@')).includes('..') ||
    email.slice(0, email.indexOf('@')).endsWith('.')
  ) return undefined
  const local = email.slice(0, email.indexOf('@'))
  const identityLocal = (local.split('+', 1)[0] ?? '').replace(/\./g, '')
  if (!identityLocal) return undefined
  return { email, identity: `${identityLocal}@gmail.com` }
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}
