import { NextRequest, NextResponse } from 'next/server'
import { sql, ensureTable, normalizeNumber, isValidNumber, hasDb } from '../../lib/db'

export const dynamic = 'force-dynamic'

// Open endpoint — allow browser forms on any landing-page domain to post here.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// Pull a value out of a payload trying several common field names.
function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return null
}

async function parseBody(req: NextRequest): Promise<Record<string, unknown>> {
  const ct = req.headers.get('content-type') || ''
  const text = await req.text()
  if (!text) return {}
  if (ct.includes('application/json')) {
    try { return JSON.parse(text) } catch { return {} }
  }
  if (ct.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text))
  }
  // Fallback: try JSON anyway (many tools omit the header).
  try { return JSON.parse(text) } catch { return Object.fromEntries(new URLSearchParams(text)) }
}

export async function POST(req: NextRequest) {
  if (!hasDb) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503, headers: CORS })
  }

  const body = await parseBody(req)
  const rawPhone = pick(body, ['phone', 'phoneNumber', 'phone_number', 'tel', 'telephone', 'mobile', 'number'])
  const name = pick(body, ['name', 'fullName', 'full_name', 'firstName', 'first_name'])

  if (!rawPhone) {
    return NextResponse.json({ error: 'Missing phone field' }, { status: 400, headers: CORS })
  }

  const phone = normalizeNumber(rawPhone)
  if (!isValidNumber(rawPhone)) {
    return NextResponse.json({ error: `Invalid phone: ${rawPhone}` }, { status: 400, headers: CORS })
  }

  try {
    await ensureTable()
    await sql`
      INSERT INTO leads (phone, name, source)
      VALUES (${phone}, ${name}, ${'webhook'})
      ON CONFLICT (phone) DO UPDATE
        SET name = COALESCE(EXCLUDED.name, leads.name)
    `
    return NextResponse.json({ ok: true, phone, name }, { headers: CORS })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500, headers: CORS })
  }
}

// Allow a quick browser check that the endpoint is alive.
export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST { phone, name } here to add a lead.' })
}
