'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

type LogEntry = {
  num: string
  status: 'ok' | 'err' | 'stopped'
  note: string
}

type Lead = {
  phone: string
  name: string | null
  source: string | null
  created_at: string
}

const STORAGE_KEY = 'wa_sender_config'
const PASSWORD = 'liav'

// Normalize a phone number to Green API international format (digits only, no leading +).
// Accepts Israeli local format (05XXXXXXXX) and converts it to 9725XXXXXXXX.
function normalizeNumber(raw: string): string {
  let n = raw.replace(/\D/g, '')
  if (!n) return ''
  if (n.startsWith('972')) return n
  if (n.startsWith('0')) return '972' + n.slice(1) // 0559218603 -> 972559218603
  return n
}

function isValidNumber(raw: string): boolean {
  return normalizeNumber(raw).length >= 11
}

function loadConfig() {
  if (typeof window === 'undefined') return { instance: '', token: '', delay: 3 }
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

export default function Home() {
  const saved = typeof window !== 'undefined' ? loadConfig() : {}
  const [instance, setInstance] = useState<string>(saved.instance || '')
  const [token, setToken] = useState<string>(saved.token || '')
  const [numbers, setNumbers] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [delay, setDelay] = useState<number>(saved.delay || 3)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogEntry[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [done, setDone] = useState(false)
  const stopRef = useRef(false)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Password gate — asked on every page load (not remembered).
  const [authed, setAuthed] = useState(false)
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)

  const tryUnlock = (e: React.FormEvent) => {
    e.preventDefault()
    if (pwInput === PASSWORD) {
      setAuthed(true)
      setPwError(false)
    } else {
      setPwError(true)
    }
  }

  // Saved leads (server-side, shared across browsers via the webhook).
  const [leads, setLeads] = useState<Lead[]>([])
  const [leadsLoading, setLeadsLoading] = useState(false)
  const [leadsError, setLeadsError] = useState('')

  const loadLeads = useCallback(async () => {
    setLeadsLoading(true)
    setLeadsError('')
    try {
      const res = await fetch('/api/leads', { cache: 'no-store', headers: { 'x-app-password': PASSWORD } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setLeads(Array.isArray(data.leads) ? data.leads : [])
    } catch (e: unknown) {
      setLeadsError(e instanceof Error ? e.message : 'Failed to load leads')
    } finally {
      setLeadsLoading(false)
    }
  }, [])

  // Load the saved leads once the user unlocks.
  useEffect(() => {
    if (authed) loadLeads()
  }, [authed, loadLeads])

  const removeLead = async (phone: string) => {
    setLeads(prev => prev.filter(l => l.phone !== phone)) // optimistic
    await fetch(`/api/leads?phone=${encodeURIComponent(phone)}`, { method: 'DELETE', headers: { 'x-app-password': PASSWORD } })
  }

  const clearLeads = async () => {
    if (!confirm('Delete all saved leads? This cannot be undone.')) return
    setLeads([])
    await fetch('/api/leads?all=true', { method: 'DELETE', headers: { 'x-app-password': PASSWORD } })
  }

  // Manually add numbers to the saved list (single or bulk).
  const [addInput, setAddInput] = useState('')
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)

  const addLeadsManually = async () => {
    const parts = addInput.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    if (!parts.length) return
    setAdding(true)
    setLeadsError('')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-password': PASSWORD },
        body: JSON.stringify({ numbers: parts, name: parts.length === 1 ? addName : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setAddInput('')
      setAddName('')
      await loadLeads()
    } catch (e: unknown) {
      setLeadsError(e instanceof Error ? e.message : 'Failed to add numbers')
    } finally {
      setAdding(false)
    }
  }

  const loadLeadsIntoRecipients = () => {
    const existing = new Set(
      numbers.split('\n').map(n => normalizeNumber(n)).filter(Boolean)
    )
    const toAdd = leads.map(l => l.phone).filter(p => !existing.has(p))
    if (!toAdd.length) return
    setNumbers(prev => {
      const base = prev.trim()
      return (base ? base + '\n' : '') + toAdd.join('\n')
    })
  }

  const saveConfig = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ instance, token, delay }))
  }

  const addLog = useCallback((entry: LogEntry) => {
    setLog(prev => [...prev, entry])
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  const startSending = async () => {
    if (!instance || !token || !numbers.trim() || !message.trim()) {
      alert('Fill in all fields first.')
      return
    }

    const nums = numbers
      .split('\n')
      .map(n => normalizeNumber(n))
      .filter(n => n.length >= 11)

    if (!nums.length) { alert('No valid numbers found.'); return }

    saveConfig()
    setRunning(true)
    setDone(false)
    stopRef.current = false
    setLog([])
    setProgress({ done: 0, total: nums.length })

    let count = 0
    for (const num of nums) {
      if (stopRef.current) {
        addLog({ num, status: 'stopped', note: 'stopped by user' })
        break
      }

      const chatId = `${num}@c.us`
      let status: LogEntry['status'] = 'ok'
      let note = ''

      try {
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instance, token, chatId, message }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          status = 'err'
          note = data.error || `HTTP ${res.status}`
        } else {
          note = data.idMessage ? `id: ${data.idMessage.slice(-10)}` : 'sent'
        }
      } catch (e: unknown) {
        status = 'err'
        note = e instanceof Error ? e.message : 'Network error'
      }

      count++
      addLog({ num, status, note })
      setProgress({ done: count, total: nums.length })

      if (count < nums.length && !stopRef.current) await sleep(delay * 1000)
    }

    setRunning(false)
    setDone(true)
  }

  const stop = () => { stopRef.current = true }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  // Password gate (after all hooks to satisfy the Rules of Hooks).
  if (!authed) {
    return (
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--green-bg)',
            border: '1px solid rgba(37,211,102,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>🔒</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px' }}>WA Bulk Sender</h1>
        </div>
        <form onSubmit={tryUnlock}>
          <label style={labelStyle}>Password</label>
          <input
            style={{ ...inputStyle, borderColor: pwError ? 'var(--red)' : 'var(--border)' }}
            type="password"
            autoFocus
            placeholder="Enter password"
            value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwError(false) }}
          />
          {pwError && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>Wrong password.</p>
          )}
          <button type="submit" style={{ ...btnStyle(false), marginTop: 16 }}>Unlock →</button>
        </form>
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 560 }}>

      {/* Header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--green-bg)',
            border: '1px solid rgba(37,211,102,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18
          }}>💬</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.3px' }}>WA Bulk Sender</h1>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', paddingLeft: 46 }}>
          Send a WhatsApp message to a list of numbers via Green API
        </p>
      </div>

      {/* Credentials */}
      <section style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Green API credentials</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input
            style={inputStyle}
            placeholder="Instance ID"
            value={instance}
            onChange={e => setInstance(e.target.value)}
          />
          <input
            style={inputStyle}
            type="password"
            placeholder="API Token"
            value={token}
            onChange={e => setToken(e.target.value)}
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          Saved in your browser — won't be visible to others on the same URL.
        </p>
      </section>

      {/* Saved leads */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <label style={labelStyle}>Saved leads</label>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {leadsLoading ? 'loading…' : `${leads.length} saved`}
          </span>
        </div>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          maxHeight: 160,
          overflowY: 'auto',
          padding: leads.length ? '6px 4px' : '14px',
        }}>
          {leadsError ? (
            <p style={{ fontSize: 12, color: 'var(--red)' }}>{leadsError}</p>
          ) : leads.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)' }}>
              {leadsLoading ? 'Loading…' : 'No leads yet — they appear here when your webhook receives them.'}
            </p>
          ) : (
            leads.map(l => (
              <div key={l.phone} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, padding: '5px 8px', borderRadius: 6,
              }}>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text)' }}>
                  {l.name ? <span style={{ color: 'var(--text)' }}>{l.name} · </span> : null}
                  <span style={{ color: 'var(--muted)' }}>{l.phone}</span>
                </span>
                <button
                  onClick={() => removeLead(l.phone)}
                  title="Remove lead"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--muted)', fontSize: 14, lineHeight: 1, padding: '2px 6px',
                  }}
                >✕</button>
              </div>
            ))
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button onClick={loadLeadsIntoRecipients} disabled={!leads.length} style={miniBtnStyle(!leads.length)}>
            Load {leads.length || ''} into recipients ↓
          </button>
          <button onClick={loadLeads} style={miniBtnStyle(false)}>↻ Refresh</button>
          {leads.length > 0 && (
            <button onClick={clearLeads} style={{ ...miniBtnStyle(false), color: 'var(--red)' }}>Clear all</button>
          )}
        </div>

        {/* Manually add numbers (single or bulk) */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea
              style={{ ...inputStyle, flex: 2, height: 64, resize: 'vertical', fontFamily: 'DM Mono, monospace', fontSize: 12, lineHeight: 1.6 }}
              placeholder={'Add number(s) — 0559218603\nOne per line, or comma-separated for bulk'}
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
            />
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Name (optional)"
              value={addName}
              onChange={e => setAddName(e.target.value)}
              title="Used only when adding a single number"
            />
          </div>
          <button
            onClick={addLeadsManually}
            disabled={adding || !addInput.trim()}
            style={{ ...miniBtnStyle(adding || !addInput.trim()), marginTop: 8 }}
          >
            {adding ? 'Adding…' : '+ Add to saved leads'}
          </button>
        </div>
      </section>

      {/* Numbers */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <label style={labelStyle}>Phone numbers</label>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {numbers.split('\n').filter(isValidNumber).length} valid numbers
          </span>
        </div>
        <textarea
          style={{ ...inputStyle, height: 140, resize: 'vertical', fontFamily: 'DM Mono, monospace', fontSize: 12, lineHeight: 1.7 }}
          placeholder={'0559218603\n972521234567\n0541234567\n\nOne number per line. Use 05X... (Israeli) or full country code.'}
          value={numbers}
          onChange={e => setNumbers(e.target.value)}
        />
      </section>

      {/* Message */}
      <section style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Message</label>
        <textarea
          style={{ ...inputStyle, height: 110, resize: 'vertical', lineHeight: 1.6 }}
          placeholder="Write your message here..."
          value={message}
          onChange={e => setMessage(e.target.value)}
        />
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>{message.length} characters</p>
      </section>

      {/* Delay */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <label style={labelStyle}>Delay between messages</label>
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--green)' }}>{delay}s</span>
        </div>
        <input
          type="range" min={1} max={15} step={1} value={delay}
          onChange={e => setDelay(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--green)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          <span>1s (fast)</span>
          <span>15s (safe)</span>
        </div>
      </section>

      {/* Send button */}
      {!running ? (
        <button onClick={startSending} style={btnStyle(false)}>
          Send to {numbers.split('\n').filter(isValidNumber).length || 'all'} numbers →
        </button>
      ) : (
        <button onClick={stop} style={btnStyle(true)}>
          ⏹ Stop sending
        </button>
      )}

      {/* Progress */}
      {(log.length > 0 || running) && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
            <span style={{ color: done && !stopRef.current ? 'var(--green)' : 'var(--muted)' }}>
              {done && !running ? `✓ Done — ${progress.done} sent` : running ? 'Sending...' : ''}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{progress.done} / {progress.total}</span>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: 'var(--green)',
              borderRadius: 2,
              transition: 'width 0.3s ease'
            }} />
          </div>

          {/* Log */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '12px 14px',
            maxHeight: 240,
            overflowY: 'auto',
            fontFamily: 'DM Mono, monospace',
            fontSize: 12,
            lineHeight: 1.9,
          }}>
            {log.map((entry, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline' }}>
                <span style={{
                  color: entry.status === 'ok' ? 'var(--green)' : entry.status === 'err' ? 'var(--red)' : 'var(--muted)',
                  minWidth: 12,
                  fontWeight: 600
                }}>
                  {entry.status === 'ok' ? '✓' : entry.status === 'err' ? '✗' : '—'}
                </span>
                <span style={{ color: 'var(--text)' }}>{entry.num}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>{entry.note}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text)',
  fontSize: 14,
  padding: '10px 12px',
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s',
}

const miniBtnStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: disabled ? 'var(--muted)' : 'var(--text)',
  fontSize: 12,
  fontWeight: 500,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
  fontFamily: 'inherit',
  transition: 'all 0.15s',
})

const btnStyle = (danger: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '12px 20px',
  borderRadius: 'var(--radius)',
  border: `1px solid ${danger ? 'rgba(224,82,82,0.4)' : 'rgba(37,211,102,0.3)'}`,
  background: danger ? 'var(--red-bg)' : 'var(--green-bg)',
  color: danger ? 'var(--red)' : 'var(--green)',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  letterSpacing: '-0.2px',
  transition: 'all 0.15s',
})
