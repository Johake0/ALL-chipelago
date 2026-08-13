import { Routes, Route } from 'react-router-dom'
import PlayerApp from './player/PlayerApp.jsx'
import AdminApp from './admin/AdminApp.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PlayerApp />} />
      <Route path="/admin/*" element={<AdminApp />} />
    </Routes>
  )
}
