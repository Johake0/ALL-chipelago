import { useState } from 'react'

export default function TradePanel({ me, players, onTrade, busy }) {
  const others = players.filter((p) => p.id !== me.id)
  const [partnerId, setPartnerId] = useState(others[0]?.id || '')
  const [myGameId, setMyGameId] = useState('')
  const [theirGameId, setTheirGameId] = useState('')

  if (others.length === 0) return null

  const partner = players.find((p) => p.id === partnerId) || others[0]

  async function submit(e) {
    e.preventDefault()
    if (!myGameId || !theirGameId) return
    await onTrade({ gameId: myGameId, targetUserId: partner.id, targetGameId: theirGameId })
    setMyGameId('')
    setTheirGameId('')
  }

  return (
    <section className="panel">
      <h2>Trade</h2>
      <form onSubmit={submit}>
        <label>Your game to offer
          <select value={myGameId} onChange={(e) => setMyGameId(e.target.value)}>
            <option value="">— pick —</option>
            {me.inventory.map((g) => <option key={g.id} value={g.id}>{g.game}</option>)}
          </select>
        </label>
        <label>Trade with
          <select value={partner.id} onChange={(e) => { setPartnerId(e.target.value); setTheirGameId('') }}>
            {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Their game you want
          <select value={theirGameId} onChange={(e) => setTheirGameId(e.target.value)}>
            <option value="">— pick —</option>
            {partner.inventory.map((g) => <option key={g.id} value={g.id}>{g.game}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !myGameId || !theirGameId}>Execute Trade</button>
      </form>
    </section>
  )
}
