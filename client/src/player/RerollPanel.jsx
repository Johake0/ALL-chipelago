import { useState } from 'react'

export default function RerollPanel({ me, onReroll, freeRerolls, busy }) {
  const [gameId, setGameId] = useState('')

  if (me.inventory.length === 0) return null

  const cost = me.nextRerollCost ?? 0
  const canAfford = me.coins >= cost
  const freeRemaining = Math.max(0, freeRerolls - me.rerollsUsed)

  async function submit(e) {
    e.preventDefault()
    if (!gameId) return
    await onReroll(gameId)
    setGameId('')
  }

  return (
    <div className="bazaar-card">
      <h3>Reroll</h3>
      <form onSubmit={submit}>
        <label>Game to put back in the pool
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="">— pick —</option>
            {me.inventory.map((g) => <option key={g.id} value={g.id}>{g.game}</option>)}
          </select>
        </label>
        <p className={canAfford ? 'cost-ok' : 'cost-bad'}>
          {freeRemaining}/{freeRerolls} free rerolls remaining. Your current reroll costs {cost} coins. ({me.rerollsUsed} used so far)
        </p>
        <button type="submit" disabled={busy || !gameId || !canAfford} className="danger-btn">Reroll It</button>
      </form>
    </div>
  )
}
