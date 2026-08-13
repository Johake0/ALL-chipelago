import { useEffect, useState } from 'react'
import { adminFetch } from '../api.js'
import GameEditModal from './GameEditModal.jsx'

export default function GamesTable() {
  const [games, setGames] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // a game object, 'new', or null
  const [filter, setFilter] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [g, u] = await Promise.all([adminFetch('/api/games'), adminFetch('/api/users')])
      setGames(g)
      setUsers(u)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(game) {
    if (!confirm(`Delete "${game.name}" permanently? This can't be undone.`)) return
    try {
      await adminFetch(`/api/games/${game._id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      alert(err.message)
    }
  }

  const filtered = games.filter((g) => g.name.toLowerCase().includes(filter.toLowerCase()))

  if (loading) return <p>Loading games…</p>

  return (
    <div>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <input
          placeholder="Filter by name…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, padding: 6 }}
        />
        <button onClick={() => setEditing('new')}>+ Add game</button>
        <button onClick={load}>Refresh</button>
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>{filtered.length} of {games.length} games</p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th><th>Status</th><th>Owner</th><th>Forced by</th><th>Interest for</th>
              <th>Claim</th><th>Released</th><th>Removed</th><th>Coins</th><th>Force cost</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((g) => (
              <tr key={g._id}>
                <td>{g.name}</td>
                <td>{g.status}</td>
                <td>{g.ownerId?.username || '—'}</td>
                <td>{g.forcedByUserId?.username || '—'}</td>
                <td>{g.interestFor?.username || '—'}</td>
                <td>{g.claimMethod || '—'}</td>
                <td>{g.released ? 'yes' : ''}</td>
                <td>{g.removed ? 'yes' : ''}</td>
                <td>{g.coinValue}</td>
                <td>{g.forceReleaseCost}</td>
                <td>
                  <button onClick={() => setEditing(g)}>Edit</button>{' '}
                  <button onClick={() => handleDelete(g)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <GameEditModal
          game={editing === 'new' ? null : editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}
