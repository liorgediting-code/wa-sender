import postgres from 'postgres'

// Read the connection string from whichever env var the Vercel storage
// integration created (Neon, Supabase, etc. use different names).
const connectionString =
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  ''

if (!connectionString) {
  // Surfaced clearly in the API routes instead of a cryptic connect error.
  console.warn('No Postgres connection string found in env (POSTGRES_URL / DATABASE_URL).')
}

// Reuse a single client across hot invocations on the serverless function.
const globalForSql = globalThis as unknown as { sql?: ReturnType<typeof postgres> }

export const sql =
  globalForSql.sql ||
  postgres(connectionString, { ssl: 'require', max: 1 })

if (process.env.NODE_ENV !== 'production') globalForSql.sql = sql

export const hasDb = Boolean(connectionString)

let tableReady = false

// Create the leads table on first use — avoids a separate migration step.
export async function ensureTable() {
  if (tableReady) return
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id          BIGSERIAL PRIMARY KEY,
      phone       TEXT UNIQUE NOT NULL,
      name        TEXT,
      source      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  tableReady = true
}

// Normalize a phone to Green API international format (digits only, no '+').
// Accepts Israeli local format (05XXXXXXXX) -> 9725XXXXXXXX.
export function normalizeNumber(raw: string): string {
  const n = String(raw || '').replace(/\D/g, '')
  if (!n) return ''
  if (n.startsWith('972')) return n
  if (n.startsWith('0')) return '972' + n.slice(1)
  return n
}

export function isValidNumber(raw: string): boolean {
  return normalizeNumber(raw).length >= 11
}
