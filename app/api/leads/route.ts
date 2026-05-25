import { NextRequest, NextResponse } from 'next/server'
import { sql, ensureTable, hasDb } from '../../lib/db'

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
