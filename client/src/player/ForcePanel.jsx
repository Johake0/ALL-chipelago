import { useState } from 'react'

export default function ForcePanel({ me, players, onForce, busy }) {
  const others = players.filter((p) => p.id !== me.id)
  const [targetId, setTargetId] = useState(others[0]?.id || '')
  const [gameId, setGameId] = useState('')

  if (others.length === 0) return null

  const target = players.find((p) => p.id === targetId) || others[0]
  const selectedGame = me.inventory.find((g) => g.id === gameId)
  const cost = selectedGame?.forceReleaseCost ?? 0
  const canAfford = me.coins >= cost

  async function submit(e) {
    e.preventDefault()
    if (!gameId) return
    await onForce({ gameId, targetUserId: target.id })
    setGameId('')
  }

  return (
    <section className="panel">
      <h2>Force</h2>
      <form onSubmit={submit}>
        <label>Game from your hold
          <select value={gameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="">— pick —</option>
            {me.inventory.map((g) => (
              <option key={g.id} value={g.id}>{g.game} ({g.forceReleaseCost} coins)</option>
            ))}
          </select>
        </label>
        <label>Force onto
          <select value={target.id} onChange={(e) => setTargetId(e.target.value)}>
            {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {selectedGame && (
          <p className={canAfford ? 'cost-ok' : 'cost-bad'}>
            Costs {cost} coins — you have {me.coins}{!canAfford ? ' (not enough)' : ''}.
          </p>
        )}
        <button type="submit" disabled={busy || !gameId || !canAfford} className="danger-btn">Force It</button>
      </form>
    </section>
  )
}
