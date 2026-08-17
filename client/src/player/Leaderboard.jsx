import { useMemo, useState } from 'react'
import Avatar from './Avatar.jsx'

const COLUMNS = [
  { key: 'totalEarned', label: 'Coins Earned' },
  { key: 'coins', label: 'Balance' },
  { key: 'longestStreak', label: 'Best Streak' },
  { key: 'finished', label: 'Finished' },
  { key: 'released', label: 'Released' },
  { key: 'timesForced', label: 'Times Forced' }
]

export default function Leaderboard({ players }) {
  const [sortKey, setSortKey] = useState('totalEarned')
  const [sortDesc, setSortDesc] = useState(true)

  const rows = useMemo(() => {
    return players
      .map((p) => ({
        id: p.id,
        name: p.name,
        player: p,
        totalEarned: p.totalEarned,
        coins: p.coins,
        longestStreak: p.longestStreak,
        finished: p.completedGames.filter((g) => g.status === 'completed').length,
        released: p.completedGames.filter((g) => g.status === 'released').length,
        timesForced: p.timesForced
      }))
      .sort((a, b) => (sortDesc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]))
  }, [players, sortKey, sortDesc])

  function handleSort(key) {
    if (key === sortKey) {
      setSortDesc((d) => !d)
    } else {
      setSortKey(key)
      setSortDesc(true)
    }
  }

  return (
    <section className="panel leaderboard-panel">
      <h2>Leaderboard</h2>
      <div className="leaderboard-scroll">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th></th>
              <th>Player</th>
              {COLUMNS.map((col) => (
                <th key={col.key} onClick={() => handleSort(col.key)} className={col.key === sortKey ? 'sorted' : ''}>
                  {col.label}{col.key === sortKey ? (sortDesc ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id}>
                <td className="leaderboard-rank">{i + 1}</td>
                <td className="leaderboard-name">
                  <Avatar player={row.player} size={28} />
                  <span>{row.name}</span>
                </td>
                <td>🪙 {row.totalEarned}</td>
                <td>🪙 {row.coins}</td>
                <td>{row.longestStreak}</td>
                <td>{row.finished}</td>
                <td>{row.released}</td>
                <td>{row.timesForced}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
