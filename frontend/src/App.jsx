import { useEffect, useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Agent from './pages/Agent'
import Settings from './pages/Settings'
import Integration from './pages/Integration'
import MockPage from './pages/MockPage'
import Organization from './pages/Organization'
import Folders from './pages/Folders'

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [sidebar, setSidebar] = useState(15)
  useEffect(() => {
    const move = (event) => {
      if (!window.__resizing) return
      setSidebar(Math.min(50, Math.max(10, (event.clientX / window.innerWidth) * 100)))
    }
    const up = () => { window.__resizing = false }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])

  const content = page === 'dashboard'
    ? <Dashboard goTo={setPage} />
    : page === 'organization'
      ? <Organization />
    : page === 'folders'
      ? <Folders />
    : page === 'agent'
      ? <Agent />
    : page === 'settings'
      ? <Settings />
      : page === 'integration'
        ? <Integration />
        : <MockPage key={page} type={page} />

  return (
    <div className="app-shell" style={{ '--sidebar-width': `${sidebar}%` }}>
      <Sidebar page={page} setPage={setPage} />
      <main className="main-content">{content}</main>
    </div>
  )
}
