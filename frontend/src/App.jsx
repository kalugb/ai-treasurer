import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Agent from './pages/Agent'
import Settings from './pages/Settings'
import Integration from './pages/Integration'
import MockPage from './pages/MockPage'
import Organization from './pages/Organization'
import Folders from './pages/Folders'
import TeamManagement from './pages/TeamManagement'
import NotFound from './pages/NotFound'

export default function App() {
	const [page, setPage] = useState('dashboard')
	const [sidebar, setSidebar] = useState(15)
	const [selectedOrganization, setSelectedOrganization] = useState(() => {
		try {
			const raw = sessionStorage.getItem('selectedOrganization')
			return raw ? JSON.parse(raw) : null
		} catch {
			return null
		}
	})
	useEffect(() => {
		try {
			if (selectedOrganization) sessionStorage.setItem('selectedOrganization', JSON.stringify(selectedOrganization))
			else sessionStorage.removeItem('selectedOrganization')
		} catch { /* ignore */ }
	}, [selectedOrganization])
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

	const goToOrganization = () => setPage('organization')

	const content = page === 'dashboard'
		? <Dashboard goTo={setPage} organization={selectedOrganization} onGoToOrganization={goToOrganization} />
		: page === 'organization'
			? <Organization selectedId={selectedOrganization?.id ?? null} onSelect={setSelectedOrganization} />
			: page === 'folders'
			? <Folders organization={selectedOrganization} onGoToOrganization={goToOrganization} />
				: page === 'teams'
					? <TeamManagement organization={selectedOrganization} onGoToOrganization={goToOrganization} />
					: page === 'agent'
						? <Agent />
						: page === 'settings'
							? <Settings />
							: page === 'integration'
								? <Integration />
								: page === 'not-found'
									? <NotFound goTo={setPage} />
									: <MockPage key={page} type={page} />

	return (
		<div className="flex min-h-screen bg-paper" style={{ '--sidebar-width': `${sidebar}%` }}>
			<Sidebar page={page} setPage={setPage} />
			<main className="mx-auto min-w-0 max-w-360 flex-1 px-[clamp(24px,5vw,72px)] py-13 max-[820px]:px-5 max-[820px]:py-8 max-[560px]:px-3.5 max-[560px]:py-7">{content}</main>
		</div>
	)
}
