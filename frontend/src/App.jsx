import { useEffect, useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Agent from './pages/Agent'
import Settings from './pages/Settings'
import MockPage from './pages/MockPage'
import Organization from './pages/Organization'
import Folders from './pages/Folders'
import TeamManagement from './pages/TeamManagement'
import CashFlow from './pages/CashFlow'
import Snapshots from './pages/Snapshots'
import AIHistory from './pages/AIHistory'
import SnapshotBanner from './components/SnapshotBanner'
import { useSnapshotMode } from './context/snapshotMode'
import NotFound from './pages/NotFound'
import { dispatchOrgChange } from './hooks/useSelectedOrganization'
import { SyncStatusProvider } from './context/SyncStatusContext'
import SyncStatusPill from './components/SyncStatusPill'
import { AgentRunProvider } from './context/AgentRunProvider'
import AgentStatusPill from './components/AgentStatusPill'
import { ToastProvider } from './context/ToastProvider'
import { BulkScanProvider } from './context/BulkScanProvider'
import ToastStack from './components/ToastStack'
import BulkReviewModal from './components/BulkReviewModal'

export default function App() {
	const [page, setPage] = useState(() => {
		try {
			const saved = sessionStorage.getItem('page') || 'dashboard'
			return saved === 'integration' ? 'settings' : saved // Integration page merged into Settings
		} catch { return 'dashboard' }
	})
	const [sidebar, setSidebar] = useState(15)
	const snapshotMode = useSnapshotMode()
	// entering/leaving a snapshot remounts every page (see the keyed wrapper in <main>), so each one refetches: saved data in, live data out
	const viewSnapshot = async (id) => { await snapshotMode.enter(id); setPage('teams') }
	const exitSnapshot = () => { snapshotMode.exit(); setPage('snapshots') }
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
					? <CashFlow goTo={setPage} />
				: page === 'snapshots' || page === 'snapshot-view'
					? <Snapshots goTo={setPage} onView={viewSnapshot} />
					: page === 'agent'
						? <Agent />
						: page === 'ai-history'
							? <AIHistory goTo={setPage} />
						: page === 'settings'
							? <Settings />
							: page === 'not-found'
								? <NotFound goTo={setPage} />
								: <MockPage key={page} type={page} />

	return (
		<ToastProvider>
			<BulkScanProvider>
			<SyncStatusProvider>
				<AgentRunProvider>
					<div className="flex min-h-screen bg-paper" style={{ '--sidebar-width': `${sidebar}%` }}>
						<Sidebar page={page} setPage={setPage} />
						<main className="mx-auto min-w-0 max-w-360 flex-1 px-[clamp(24px,5vw,72px)] py-13 max-[820px]:px-5 max-[820px]:py-8 max-[560px]:px-3.5 max-[560px]:py-7">
							{snapshotMode.readOnly && <SnapshotBanner snapshot={snapshotMode.snapshot} onExit={exitSnapshot} />}
							{snapshotMode.status === 'loading'
								? <p className="py-10 text-center text-[13px] text-muted">Loading snapshot…</p>
								: <div key={snapshotMode.snapshot?.id ?? 'live'}>{content}</div>}
						</main>
					</div>
					<SyncStatusPill />
					<AgentStatusPill />
					<BulkReviewModal />
					<ToastStack />
				</AgentRunProvider>
			</SyncStatusProvider>
			</BulkScanProvider>
		</ToastProvider>
	)
}
