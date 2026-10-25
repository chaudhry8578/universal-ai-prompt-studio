import { Pool } from 'pg'

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

let pool: Pool | undefined

export function getDatabase(): Pool {
  const connectionString = process.env.DATABASE_URL || process.env.STORAGE_DATABASE_URL
  if (!connectionString) {
    throw new ConfigurationError('DATABASE_URL or STORAGE_DATABASE_URL is not configured on the server.')
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
    })
    pool.on('error', (error) => {
      console.error('Unexpected idle PostgreSQL connection error.', error.name)
    })
  }

  return pool
}
