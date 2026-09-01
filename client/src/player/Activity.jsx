import { useEffect, useState } from 'react'
import { getActivity } from './playerApi.js'

const POLL_MS = 15000

const ICONS = {
  spin: '🎡',
  interest: '⭐',
  finish: '🏆',
  release: '🏳️',
  force: '⚔️',
  trade: '🔁',
  reroll: '🎲',
  auction: '🔨'
}

function describe(event) {
  switch (event.type) {
    case 'spin': return `${event.actor} won ${event.game} from the wheel.`
    case 'interest': return `${event.actor} claimed ${event.game} as a free pick.`
    case 'finish': return `${event.actor} finished ${event.game} (+🪙 ${event.breakdown ? event.breakdown.total : event.coinValue}).`
    case 'release': return `${event.actor} released ${event.game} (-🪙 ${event.coinCost}).`
    case 'force': return `${event.actor} forced ${event.game} onto ${event.target} (-🪙 ${event.coinCost}).`
    case 'trade': return `${event.actor} and ${event.target} traded ${event.game} for ${event.targetGame}.`
    case 'reroll': return `${event.actor} rerolled ${event.game} back into the pool (-🪙 ${event.coinCost}).`
    case 'auction': return `${event.actor} won ${event.game} in the Session auction (-🪙 ${event.coinCost}).`
    default: return ''
  }
}

// Hover-only detail for a finish event — the full coin-math breakdown lives
// here instead of in describe() so the feed line itself stays scannable.
function detailFor(event) {
  if (event.type !== 'finish' || !event.breakdown) return undefined
  const b = event.breakdown
  const parts = [`${b.base} (Base)`]
  if (b.streakBonus > 0) parts.push(`${b.streakBonus} (Streak)`)
  let core = parts.join(' + ')
  if (b.bonusApplied) core = `(${core}) × 1.5 (Bonus Game)`
  if (b.milestoneBonus > 0) core += ` + ${b.milestoneBonus} (${b.streak} Game Streak)`
  return `Coins gained: ${core} = 🪙${b.total}`
}

export default function Activity() {
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Same rationale as useGameState.js's tick(): a backgrounded tab
      // shouldn't keep polling — this was the leading cause found for a
      // real bandwidth spike (a PC left on with the site open overnight).
      if (document.visibilityState === 'hidden') return
      try {
        const data = await getActivity()
        if (!cancelled) {
          setEvents(data.events)
          setError('')
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') load()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return (
    <section className="panel activity-panel">
      <h2>Activity Feed</h2>
      {error && <p className="cost-bad">{error}</p>}
      {events.length === 0 && !error && <p className="empty">Nothing's happened yet.</p>}
      {events.map((e) => (
        <div className="hold-row activity-row" key={`${e.type}-${e.at}-${e.game}`} title={detailFor(e)}>
          <span>{ICONS[e.type] || '•'} {describe(e)}</span>
        </div>
      ))}
    </section>
  )
}
