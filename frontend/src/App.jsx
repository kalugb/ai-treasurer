import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Agent from './pages/Agent'
import Settings from './pages/Settings'
import MockPage from './pages/MockPage'
import Organization from './pages/Organization'
import Folders from './pages/Folders'
import TeamManagement from './pages/TeamManagement'
import Reimbursement from './pages/Reimbursement'
import Snapshots from './pages/Snapshots'
import NotFound from './pages/NotFound'
import { dispatchOrgChange } from './hooks/useSelectedOrganization'
import { SyncStatusProvider } from './context/SyncStatusContext'
import SyncStatusPill from './components/SyncStatusPill'
import { AgentRunProvider } from './context/AgentRunProvider'
import AgentStatusPill from './components/AgentStatusPill'
import { ToastProvider } from './context/ToastProvider'
import ToastStack from './components/ToastStack'

export default function App() {
	const [page, setPage] = useState(() => {
		try {
			const saved = sessionStorage.getItem('page') || 'dashboard'
			return saved === 'integration' ? 'settings' : saved // Integration page merged into Settings
		} catch { return 'dashboard' }
	})
	const [sidebar, setSidebar] = useState(15)
	useEffect(() => {
		try { sessionStorage.setItem('page', page) } catch { /* ignore */ }
	}, [page])
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
		dispatchOrgChange(selectedOrganization)
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

	const content = page === 'dashboard'
		? <Dashboard goTo={setPage} />
		: page === 'organization'
			? <Organization selectedId={selectedOrganization?.id ?? null} onSelect={setSelectedOrganization} />
			: page === 'folders'
			? <Folders goTo={setPage} />
				: page === 'teams'
					? <TeamManagement />
					: page === 'reimbursement'
					? <Reimbursement goTo={setPage} />
					: page === 'snapshots'
					? <Snapshots />
					: page === 'agent'
						? <Agent />
						: page === 'settings'
							? <Settings />
							: page === 'not-found'
								? <NotFound goTo={setPage} />
								: <MockPage key={page} type={page} />

	return (
		<ToastProvider>
			<SyncStatusProvider>
				<AgentRunProvider>
					<div className="flex min-h-screen bg-paper" style={{ '--sidebar-width': `${sidebar}%` }}>
						<Sidebar page={page} setPage={setPage} />
						<main className="mx-auto min-w-0 max-w-360 flex-1 px-[clamp(24px,5vw,72px)] py-13 max-[820px]:px-5 max-[820px]:py-8 max-[560px]:px-3.5 max-[560px]:py-7">{content}</main>
					</div>
					<SyncStatusPill />
					<AgentStatusPill />
					<ToastStack />
				</AgentRunProvider>
			</SyncStatusProvider>
		</ToastProvider>
	)
}
