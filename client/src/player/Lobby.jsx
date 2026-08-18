import { useEffect, useRef, useState } from 'react'

// How long a "Mark Finished" click stays armed before it silently resets,
// so a delayed second click (e.g. after stepping away) can't accidentally
// finish a game.
const CONFIRM_TIMEOUT_MS = 5000

export default function Lobby({ lobby, me, onComplete, onReturn, onRelease, busy }) {
  const [confirmingId, setConfirmingId] = useState('')
  const [releaseTarget, setReleaseTarget] = useState(null)
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

  function confirmRelease() {
    if (!releaseTarget) return
    onRelease(releaseTarget.id)
    setReleaseTarget(null)
  }

  return (
    <section className="panel lobby-panel">
      <h2>Lobby</h2>
      <p className="lobby-hint">2-4 players can each drop one game in here to play together. Mark finished when done at it will be added to your trophy case.</p>
      {lobby.length === 0 && <p className="empty">Nobody's in the lobby right now. Add a game from your hold to start a session.</p>}
      {lobby.map((item) => {
        const mine = item.ownerId === me.id
        const confirming = confirmingId === item.id
        const isBonus = mine && item.id === me.bonusGameId
        return (
          <div className={`hold-row lobby-row${isBonus ? ' bonus-row' : ''}`} key={item.id}>
            <span>🎮 {item.game}{isBonus && <span className="bonus-tag" title="Bonus game — pays 1.5x if finished">⭐</span>}{item.auctionWon && <span className="auction-tag" title="Won in this session's Auction">🔨</span>} <span className="lobby-owner">— {mine ? 'you' : item.ownerName}</span></span>
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
                <button type="button" className="ghost-btn danger-text" onClick={() => setReleaseTarget(item)} disabled={busy}>
                  Release
                </button>
              </div>
            )}
          </div>
        )
      })}

      {releaseTarget && (
        <div className="modal-overlay" onClick={() => setReleaseTarget(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3>Release {releaseTarget.game}?</h3>
            <p>
              This costs <strong>{releaseTarget.forceReleaseCost} coins</strong> and earns nothing —
              and it will reset your current streak{me.streak > 0 ? ` (currently ${me.streak})` : ''} back to 0.
              This can't be undone. Are you <em>really</em> sure?
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost-btn" onClick={() => setReleaseTarget(null)}>Cancel, keep playing</button>
              <button type="button" className="danger-btn" onClick={confirmRelease} disabled={busy}>Yes, release it</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
