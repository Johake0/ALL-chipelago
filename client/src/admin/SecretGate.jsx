import { useEffect, useState } from 'react'
import { adminFetch, getAdminSecret, setAdminSecret, clearAdminSecret } from '../api.js'

// Verifies the entered secret against a real admin endpoint rather than just
// storing it blindly — a 403 there means the backend rejected it.
export default function SecretGate({ children }) {
  const [status, setStatus] = useState('checking') // checking | ok | needed
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  async function verify(secret) {
    setAdminSecret(secret)
    try {
      await adminFetch('/api/users')
      setStatus('ok')
      setError('')
    } catch (err) {
      clearAdminSecret()
      setStatus('needed')
      // A blocked CORS response makes fetch() itself throw a TypeError
      // before any status code is readable — that's not a wrong secret,
      // it's the server not recognizing this origin (check ALLOWED_ORIGINS).
      setError(
        err instanceof TypeError
          ? "Couldn't reach the server (not a secret problem — likely a CORS/network issue on the backend)."
          : 'That secret was rejected — check ADMIN_SECRET on the backend.'
      )
    }
  }

  useEffect(() => {
    const existing = getAdminSecret()
    if (existing) verify(existing)
    else setStatus('needed')
  }, [])

  if (status === 'checking') return <p style={{ padding: 40 }}>Checking admin access…</p>
  if (status === 'ok') return children

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); verify(input) }}
      style={{ maxWidth: 340, margin: '80px auto', display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <h2>Admin access</h2>
      <input
        type="password"
        placeholder="ADMIN_SECRET"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoFocus
      />
      <button type="submit">Enter</button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </form>
  )
}
