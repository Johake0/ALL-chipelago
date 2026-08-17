import { useState } from 'react'

export default function GiftPanel({ me, players, onGift, busy }) {
  const others = players.filter((p) => p.id !== me.id)
  const [targetId, setTargetId] = useState(others[0]?.id || '')
  const [amount, setAmount] = useState('')

  if (others.length === 0) return null

  const target = players.find((p) => p.id === targetId) || others[0]
  const parsedAmount = Number(amount)
  const validAmount = Number.isInteger(parsedAmount) && parsedAmount > 0
  const canAfford = validAmount && me.coins >= parsedAmount

  async function submit(e) {
    e.preventDefault()
    if (!validAmount) return
    await onGift({ targetUserId: target.id, amount: parsedAmount })
    setAmount('')
  }

  return (
    <div className="bazaar-card">
      <h3>Gift Coins</h3>
      <form onSubmit={submit}>
        <label>Give coins to
          <select value={target.id} onChange={(e) => setTargetId(e.target.value)}>
            {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Amount
          <input
            type="number"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 200"
          />
        </label>
        {amount && (
          <p className={canAfford ? 'cost-ok' : 'cost-bad'}>
            {validAmount
              ? `You have ${me.coins} coins.${!canAfford ? ' (Not enough)' : ''}`
              : 'Enter a whole number greater than 0.'}
          </p>
        )}
        <button type="submit" disabled={busy || !validAmount || !canAfford}>Send Gift</button>
      </form>
    </div>
  )
}
