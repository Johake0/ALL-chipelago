import { useState } from 'react'
import { adminFetch } from '../api.js'

export default function DangerZone() {
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function handleReset() {
    setBusy(true)
    setMessage('')
    try {
      await adminFetch('/api/reset', { method: 'POST' })
      setMessage('Everything has been reset.')
      setConfirmText('')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
    }
  }

  const canReset = confirmText === 'RESET'

  return (
    <div style={{ border: '1px solid var(--danger)', background: 'var(--danger-bg)', borderRadius: 10, padding: 20, maxWidth: 480 }}>
      <h2 style={{ color: 'var(--danger)', marginTop: 0 }}>Reset all progress</h2>
      <p>Wipes every game back to available, clears ownership, completions, and trade history. This cannot be undone.</p>
      <p>Type <code>RESET</code> to confirm:</p>
      <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
      <button onClick={handleReset} disabled={!canReset || busy} style={{ background: 'var(--danger)' }}>
        {busy ? 'Resetting…' : 'Reset everything'}
      </button>
      {message && <p>{message}</p>}
    </div>
  )
}
