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
    case 'finish': return `${event.actor} finished ${event.game} (+🪙 ${event.coinValue}).`
    case 'release': return `${event.actor} released ${event.game} (-🪙 ${event.coinCost}).`
    case 'force': return `${event.actor} forced ${event.game} onto ${event.target} (-🪙 ${event.coinCost}).`
    case 'trade': return `${event.actor} and ${event.target} traded ${event.game} for ${event.targetGame}.`
    case 'reroll': return `${event.actor} rerolled ${event.game} back into the pool (-🪙 ${event.coinCost}).`
    case 'auction': return `${event.actor} won ${event.game} in the Session auction (-🪙 ${event.coinCost}).`
    default: return ''
  }
}

export default function Activity() {
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
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

    load()
    const id = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <section className="panel activity-panel">
      <h2>Activity Feed</h2>
      {error && <p className="cost-bad">{error}</p>}
      {events.length === 0 && !error && <p className="empty">Nothing's happened yet.</p>}
      {events.map((e) => (
        <div className="hold-row activity-row" key={`${e.type}-${e.at}-${e.game}`}>
          <span>{ICONS[e.type] || '•'} {describe(e)}</span>
        </div>
      ))}
    </section>
  )
}
