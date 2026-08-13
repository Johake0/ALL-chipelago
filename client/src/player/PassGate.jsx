import { useEffect, useState } from 'react'
import { publicFetch, getPlayerSecret, setPlayerSecret, clearPlayerSecret } from '../api.js'

// Same pattern as the admin tool's SecretGate — verifies against a real
// endpoint rather than trusting localStorage blindly, so a stale/rejected
// passphrase falls back to asking again instead of showing a broken page.
export default function PassGate({ children }) {
  const [status, setStatus] = useState('checking') // checking | ok | needed
  const [input, setInput] = useState('')
  const [error, setError] = useState('')

  async function verify(secret) {
    setPlayerSecret(secret)
    try {
      await publicFetch('/api/state')
      setStatus('ok')
      setError('')
    } catch (err) {
      clearPlayerSecret()
      setStatus('needed')
      // A blocked CORS response makes fetch() itself throw a TypeError
      // before any status code is readable — that's not a wrong password,
      // it's the server not recognizing this origin (check ALLOWED_ORIGINS).
      setError(
        err instanceof TypeError
          ? "Couldn't reach the server (not a passphrase problem — likely a CORS/network issue on the backend)."
          : 'Wrong passphrase.'
      )
    }
  }

  useEffect(() => {
    const existing = getPlayerSecret()
    if (existing) verify(existing)
    else setStatus('needed')
  }, [])

  if (status === 'checking') return <p style={{ padding: 40, textAlign: 'center' }}>Checking…</p>
  if (status === 'ok') return children

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); verify(input) }}
      style={{ maxWidth: 320, margin: '120px auto', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' }}
    >
      <h2>Archipelago Randomizer</h2>
      <input
        type="password"
        placeholder="Passphrase"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoFocus
      />
      <button type="submit">Enter</button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </form>
  )
}
