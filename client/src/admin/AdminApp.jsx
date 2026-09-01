import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import SecretGate from './SecretGate.jsx'
import GamesTable from './GamesTable.jsx'
import UsersTable from './UsersTable.jsx'
import DangerZone from './DangerZone.jsx'
import NewPlaythroughWizard from './NewPlaythroughWizard.jsx'
import { clearAdminSecret } from '../api.js'

const tabStyle = ({ isActive }) => ({
  padding: '8px 16px',
  color: isActive ? 'var(--text)' : 'var(--text-dim)',
  borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
  textDecoration: 'none',
})

function Shell() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 20px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20 }}>Archipelago Admin</h1>
        <button onClick={() => { clearAdminSecret(); location.reload() }}>Log out</button>
      </div>
      <nav style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--panel-border)', marginBottom: 20 }}>
        <NavLink to="/admin/games" style={tabStyle}>Games</NavLink>
        <NavLink to="/admin/users" style={tabStyle}>Users</NavLink>
        <NavLink to="/admin/playthrough" style={tabStyle}>New Playthrough</NavLink>
        <NavLink to="/admin/danger" style={tabStyle}>Danger Zone</NavLink>
      </nav>
      <Routes>
        <Route index element={<Navigate to="/admin/games" replace />} />
        <Route path="games" element={<GamesTable />} />
        <Route path="users" element={<UsersTable />} />
        <Route path="playthrough" element={<NewPlaythroughWizard />} />
        <Route path="danger" element={<DangerZone />} />
      </Routes>
    </div>
  )
}

export default function AdminApp() {
  return (
    <SecretGate>
      <Shell />
    </SecretGate>
  )
}
