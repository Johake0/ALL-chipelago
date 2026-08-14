import { useState } from 'react'

export default function ReleasePanel({ me, onRelease, busy }) {
  const options = [...me.inventory, ...(me.forceSlot ? [me.forceSlot] : [])]
  const [gameId, setGameId] = useState('')

  if (options.length === 0) return null

  const selectedGame = options.find((g) => g.id === gameId)
  const cost = selectedGame?.forceReleaseCost ?? 0
  const canAfford = me.coins >= cost

  async function submit(e) {
    e.preventDefault()
    if (!gameId) return
    await onRelease(gameId)
    setGameId('')
  }

  return (
    <div className="bazaar-card">
      <h3>Release</h3>
      <form onSubmit={submit}>
        <label>Game to release
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="">— pick —</option>
            {options.map((g) => (
              <option key={g.id} value={g.id}>{g.game} ({g.forceReleaseCost} coins)</option>
            ))}
          </select>
        </label>
        {selectedGame && (
          <p className={canAfford ? 'cost-ok' : 'cost-bad'}>
            Costs {cost} coins and resets your streak, no coins earned — you have {me.coins} coins.{!canAfford ? ' (You do not have enough coins)' : ''}
          </p>
        )}
        <button type="submit" disabled={busy || !gameId || !canAfford} className="danger-btn">Release It</button>
      </form>
    </div>
  )
}
