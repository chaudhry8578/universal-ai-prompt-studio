import type { PoolClient } from 'pg'
import { createOpaqueToken, hashOpaqueToken } from './auth.js'

export async function createEmailVerificationToken(client: PoolClient, userId: string): Promise<string> {
  await client.query(
    `UPDATE email_verification_tokens
     SET revoked_at = now()
     WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
    [userId],
  )
  const token = createOpaqueToken()
  await client.query(
    `INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '24 hours')`,
    [hashOpaqueToken(token), userId],
  )
  return token
}

export async function createPasswordResetToken(client: PoolClient, userId: string): Promise<string> {
  await client.query(
    `UPDATE password_reset_tokens
     SET revoked_at = now()
     WHERE user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
    [userId],
  )
  const token = createOpaqueToken()
  await client.query(
    `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '30 minutes')`,
    [hashOpaqueToken(token), userId],
  )
  return token
}
