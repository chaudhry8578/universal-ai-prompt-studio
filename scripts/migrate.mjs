import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const connectionString = process.env.DATABASE_URL || process.env.STORAGE_DATABASE_URL
if (!connectionString) {
  throw new Error('Set DATABASE_URL or STORAGE_DATABASE_URL before running the database migration.')
}

const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url))
const migrations = (await readdir(migrationsDirectory))
  .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name) && name !== '001_auth_and_usage.sql')
  .sort()
const client = new Client({ connectionString })

try {
  await client.connect()
  for (const migrationName of migrations) {
    const migration = await readFile(new URL(`../migrations/${migrationName}`, import.meta.url), 'utf8')
    await client.query(migration)
    console.log(`Database migration ${migrationName} completed.`)
  }
} catch (error) {
  console.error('Database migration failed.', error instanceof Error ? error.message : 'Unknown error')
  process.exitCode = 1
} finally {
  await client.end()
}
