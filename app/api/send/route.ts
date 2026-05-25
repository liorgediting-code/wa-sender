import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { instance, token, chatId, message } = await req.json()

    if (!instance || !token || !chatId || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const url = `https://api.green-api.com/waInstance${instance}/sendMessage/${token}`

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, message }),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json({ error: data.error || `Green API error ${res.status}` }, { status: res.status })
    }

    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
