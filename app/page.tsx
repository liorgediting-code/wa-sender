'use client'

import { useState, useRef, useCallback } from 'react'

type LogEntry = {
  num: string
  status: 'ok' | 'err' | 'stopped'
  note: string
}

const STORAGE_KEY = 'wa_sender_config'

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
      .map(n => n.trim().replace(/\D/g, ''))
      .filter(n => n.length > 6)

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

      {/* Numbers */}
      <section style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <label style={labelStyle}>Phone numbers</label>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {numbers.split('\n').filter(n => n.trim().replace(/\D/g, '').length > 6).length} valid numbers
          </span>
        </div>
        <textarea
          style={{ ...inputStyle, height: 140, resize: 'vertical', fontFamily: 'DM Mono, monospace', fontSize: 12, lineHeight: 1.7 }}
          placeholder={'972501234567\n972521234567\n972541234567\n\nOne number per line, digits only with country code'}
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
          Send to {numbers.split('\n').filter(n => n.trim().replace(/\D/g, '').length > 6).length || 'all'} numbers →
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
