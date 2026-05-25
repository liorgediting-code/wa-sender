import { NextRequest, NextResponse } from 'next/server'
import { sql, ensureTable, hasDb, normalizeNumber, isValidNumber } from '../../lib/db'

export const dynamic = 'force-dynamic'

// Same password as the UI gate. The UI sends it as a header so the lead list
// (names + phones) isn't readable by anyone who guesses the API URL.
const APP_PASSWORD = process.env.APP_PASSWORD || 'liav'

function authed(req: NextRequest): boolean {
  return req.headers.get('x-app-password') === APP_PASSWORD
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDb) return NextResponse.json({ leads: [], error: 'Database not configured' }, { status: 503 })
  try {
    await ensureTable()
    const rows = await sql`
      SELECT phone, name, source, created_at
      FROM leads
      ORDER BY created_at DESC
    `
    return NextResponse.json({ leads: rows })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ leads: [], error: message }, { status: 500 })
  }
}

// Manually add leads — single { phone, name } or bulk { numbers: [...] }.
export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDb) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const rawList: string[] = Array.isArray(body.numbers)
    ? body.numbers.map(String)
    : body.phone != null ? [String(body.phone)] : []
  // A name is only attached when a single number is added.
  const name: string | null =
    rawList.length === 1 && typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : null

  // Normalize, validate, de-duplicate.
  const phones = Array.from(
    new Set(rawList.map(normalizeNumber).filter(p => isValidNumber(p)))
  )

  if (!phones.length) {
    return NextResponse.json({ error: 'No valid numbers provided', added: 0 }, { status: 400 })
  }

  try {
    await ensureTable()
    for (const phone of phones) {
      await sql`
        INSERT INTO leads (phone, name, source)
        VALUES (${phone}, ${name}, ${'manual'})
        ON CONFLICT (phone) DO UPDATE
          SET name = COALESCE(EXCLUDED.name, leads.name)
      `
    }
    return NextResponse.json({ ok: true, added: phones.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDb) return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  const { searchParams } = new URL(req.url)
  const phone = searchParams.get('phone')
  const all = searchParams.get('all')
  try {
    await ensureTable()
    if (all === 'true') {
      await sql`DELETE FROM leads`
    } else if (phone) {
      await sql`DELETE FROM leads WHERE phone = ${phone}`
    } else {
      return NextResponse.json({ error: 'Specify ?phone= or ?all=true' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
