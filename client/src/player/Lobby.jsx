import { useEffect, useRef, useState } from 'react'

// How long a "Mark Finished" click stays armed before it silently resets,
// so a delayed second click (e.g. after stepping away) can't accidentally
// finish a game.
const CONFIRM_TIMEOUT_MS = 5000

export default function Lobby({ lobby, me, onComplete, onReturn, busy }) {
  const [confirmingId, setConfirmingId] = useState('')
  const timeoutRef = useRef(null)

  useEffect(() => () => clearTimeout(timeoutRef.current), [])

  function handleFinishClick(item) {
    if (confirmingId === item.id) {
      clearTimeout(timeoutRef.current)
      setConfirmingId('')
      onComplete(item.id)
      return
    }
    setConfirmingId(item.id)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setConfirmingId(''), CONFIRM_TIMEOUT_MS)
  }

  function handleReturnClick(item) {
    clearTimeout(timeoutRef.current)
    setConfirmingId('')
    onReturn(item.id)
  }

  return (
    <section className="panel lobby-panel">
      <h2>Lobby</h2>
      <p className="lobby-hint">2-4 players can each drop one game in here to play together. Mark finished when done at it will be added to your trophy case.</p>
      {lobby.length === 0 && <p className="empty">Nobody's in the lobby right now. Add a game from your hold to start a session.</p>}
      {lobby.map((item) => {
        const mine = item.ownerId === me.id
        const confirming = confirmingId === item.id
        return (
          <div className="hold-row lobby-row" key={item.id}>
            <span>🎮 {item.game} <span className="lobby-owner">— {mine ? 'you' : item.ownerName}</span></span>
            {mine && (
              <div className="lobby-actions">
                <button
                  type="button"
                  className={confirming ? 'danger-btn' : ''}
                  onClick={() => handleFinishClick(item)}
                  disabled={busy}
                >
                  {confirming ? 'Confirm Finish?' : 'Mark Finished'}
                </button>
                <button type="button" className="ghost-btn" onClick={() => handleReturnClick(item)} disabled={busy}>
                  Return to Hold
                </button>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
