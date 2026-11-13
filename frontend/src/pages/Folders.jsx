/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import ReceiptEditor from '../components/ReceiptEditor'
import SetAmountsModal from '../components/SetAmountsModal'
import { button } from '../components/button'
import AddReceiptModal from '../components/AddReceiptModal'
import { teamsAPI } from '../api/teams'
import { receiptsAPI, fetchReceipts, toReceipt, receiptAmountText, isUnset, isExcluded } from '../api/receipts'
import DuplicateReview from '../components/DuplicateReview'
import ReceiptsToolbar from '../components/ReceiptsToolbar'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'
import { useSyncStatus } from '../context/syncStatus'
import { useToast } from '../context/toast'
import { useSnapshotMode } from '../context/snapshotMode'
import { useBulkScan } from '../context/bulkScan'
import Modal from '../components/Modal'

const formatMoney = (amount) => amount == null ? '—' : `${amount < 0 ? '-' : ''}RM${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const readPreference = (key, allowed, fallback) => {
	try {
		const value = localStorage.getItem(key)
		return allowed.includes(value) ? value : fallback
	} catch {
		return fallback
	}
}


function ReceiptPreview({ receipt, teamName, onClose, onPrev, onNext, index, total, onSave, onScan, onReviewDuplicate, onDelete, deleting, readOnly }) {
	if (!receipt) return null
	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div className="flex max-h-[92vh] w-[min(100%,1100px)] flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
				<div className="flex items-start justify-between gap-4 border-b border-line p-5">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">Receipt preview</p><h2 id="receipt-preview-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{receipt.label || receipt.filename}</h2></div>
					<div className="flex items-center gap-3"><span className="text-xs font-bold text-muted">{index + 1} / {total}</span><button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button></div>
				</div>
				<ReceiptEditor
					key={receipt.id}
					receipt={receipt}
					readOnly={readOnly}
					onSave={(patch) => onSave(receipt.googleDriveFileId, patch)}
					onScan={() => onScan(receipt.googleDriveFileId)}
					notice={<DuplicateReview receipt={receipt} teamName={teamName} readOnly={readOnly} onReview={(status) => onReviewDuplicate(receipt.googleDriveFileId, status)} />}
					actions={receipt.source === 'manual' ? <button className={`${button.danger} disabled:opacity-60`} type="button" onClick={onDelete} disabled={deleting}><Icon name="trash" size={15} /> Delete receipt</button> : null}
				>
					<button className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-blue shadow-md transition hover:bg-blue-soft disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label="Previous receipt" onClick={onPrev} disabled={index <= 0}><span className="rotate-180"><Icon name="chevron" size={18} /></span></button>
					<button className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-blue shadow-md transition hover:bg-blue-soft disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label="Next receipt" onClick={onNext} disabled={index >= total - 1}><Icon name="chevron" size={18} /></button>
				</ReceiptEditor>
			</div>
		</div>
	)
}

export default function Folders({ goTo }) {
	const organization = useSelectedOrganization()
	const [teams, setTeams] = useState([])
	const [teamIndex, setTeamIndex] = useState(0)
	const [preview, setPreview] = useState(null)
	const [sourceFilter, setSourceFilter] = useState(() => readPreference('receipts:source', ['all', 'google', 'manual'], 'all'))
	const [dateOrder, setDateOrder] = useState(() => readPreference('receipts:dateOrder', ['desc', 'asc'], 'desc'))
	const [reimbursedFilter, setReimbursedFilter] = useState(() => readPreference('receipts:reimbursed', ['all', 'reimbursed', 'unreimbursed'], 'all'))
	const [search, setSearch] = useState('')
	const [duplicateFilter, setDuplicateFilter] = useState('all') // 'all' | a duplicate status: 'pending' (needs review) | 'confirmed' | 'dismissed'
	useEffect(() => {
		if (!organization?.id) { setTeams([]); return }
		teamsAPI.getTeams(organization.id, organization.ownerId)
			.then((res) => {
				const list = Array.isArray(res) ? res : []
				setTeams(list)
				const savedIndex = list.findIndex((item) => item.id === readPreference('receipts:team', list.map((item) => item.id), ''))
				setTeamIndex(savedIndex > 0 ? savedIndex : 0)
			})
			.catch(() => setTeams([]))
	}, [organization?.id, organization?.ownerId])

	useEffect(() => {
		try {
			localStorage.setItem('receipts:source', sourceFilter)
			localStorage.setItem('receipts:dateOrder', dateOrder)
			localStorage.setItem('receipts:reimbursed', reimbursedFilter)
			const currentTeam = teams[Math.min(teamIndex, teams.length - 1)]
			if (currentTeam?.id) localStorage.setItem('receipts:team', currentTeam.id)
		} catch {
			// storage unavailable; view preferences just won't persist
		}
	}, [sourceFilter, dateOrder, reimbursedFilter, teams, teamIndex])

	const selectedIndex = teams.length ? Math.min(teamIndex, teams.length - 1) : 0
	const team = teams[selectedIndex]
	const [driveReceipts, setDriveReceipts] = useState([])
	const [refreshing, setRefreshing] = useState(false)
	const { push } = useToast()
	const { readOnly } = useSnapshotMode()
	const bulk = useBulkScan()
	const handledBulkRef = useRef(0)
	const [addOpen, setAddOpen] = useState(false)
	const [amountsOpen, setAmountsOpen] = useState(false)
	const [selecting, setSelecting] = useState(false)
	const [selectedIds, setSelectedIds] = useState(() => new Set())
	const [deleteTargets, setDeleteTargets] = useState([])
	const [deleting, setDeleting] = useState(false)
	const { status: syncStatus, teamId: syncTeamId, completedAt, startSync } = useSyncStatus()
	const syncing = syncStatus === 'syncing' && syncTeamId === team?.id

	useEffect(() => {
		if (!team?.id) { setDriveReceipts([]); return }
		let cancelled = false
		fetchReceipts(team.id)
			.then((receipts) => { if (!cancelled) setDriveReceipts(receipts) })
			.catch(() => { if (!cancelled) setDriveReceipts([]) })
		return () => { cancelled = true }
	}, [team?.id])

	// clear any selection when switching teams so it doesn't carry stale ids across teams
	useEffect(() => { setSelecting(false); setSelectedIds(new Set()); setDeleteTargets([]); setAmountsOpen(false) }, [team?.id])

	// when a sync for the currently-viewed team completes, refetch its receipts
	useEffect(() => {
		if (!team?.id || completedAt === 0 || syncTeamId !== team.id || syncStatus !== 'done') return
		let cancelled = false
		fetchReceipts(team.id)
			.then((receipts) => { if (!cancelled) setDriveReceipts(receipts) })
			.catch(() => { /* pill already reported the outcome */ })
		return () => { cancelled = true }
	}, [completedAt, team?.id, syncTeamId, syncStatus])

	const handleSaveReceipt = async (fileId, patch) => {
		const updated = await receiptsAPI.updateReceipt(team.id, fileId, patch)
		const mapped = toReceipt(updated)
		setDriveReceipts((list) => list.map((r) => r.googleDriveFileId === fileId ? mapped : r))
		setPreview((current) => current && current.googleDriveFileId === fileId ? mapped : current)
		push('Receipt details saved.', 'success')
	}

	const handleScanReceipt = (fileId) => receiptsAPI.scan(team.id, fileId, { ownerId: organization?.ownerId })

	// save a human decision on a duplicate; the server answers with the receipt's fresh (derived) duplicate state
	const handleReviewDuplicate = async (fileId, status) => {
		const mapped = toReceipt(await receiptsAPI.reviewDuplicate(team.id, fileId, status))
		setDriveReceipts((list) => list.map((r) => r.googleDriveFileId === fileId ? mapped : r))
		setPreview((current) => current && current.googleDriveFileId === fileId ? mapped : current)
		push(status === 'confirmed' ? 'Marked as a duplicate. It no longer counts in totals.' : status === 'dismissed' ? 'Marked as not a duplicate.' : 'Decision cleared.', 'success')
	}

	// background "fill all with AI" run (BulkScanProvider): apply each saved receipt live, refetch once when it ends
	useEffect(() => {
		const update = bulk.lastUpdate
		if (!update || update.teamId !== team?.id) return
		setDriveReceipts((list) => list.map((r) => r.googleDriveFileId === update.receipt.googleDriveFileId ? update.receipt : r))
	}, [bulk.lastUpdate, team?.id])
	useEffect(() => {
		const { teamId, at } = bulk.completed
		if (!at || at === handledBulkRef.current || teamId !== team?.id) return
		handledBulkRef.current = at
		fetchReceipts(team.id).then(setDriveReceipts).catch(() => {})
	}, [bulk.completed, team?.id])

	const handleUploadReceipt = async (formData) => {
		const created = toReceipt(await receiptsAPI.upload(team.id, formData))
		setDriveReceipts((list) => [created, ...list])
		push('Receipt uploaded.', 'success')
	}

	const exitSelection = () => { setSelecting(false); setSelectedIds(new Set()) }

	const toggleSelected = (id) => setSelectedIds((current) => {
		const next = new Set(current)
		next.has(id) ? next.delete(id) : next.add(id)
		return next
	})

	const handleDeleteSelected = async () => {
		const ids = deleteTargets.map((receipt) => receipt.id)
		if (!ids.length || deleting) return
		setDeleting(true)
		try {
			// the dialog already warned about linked receipts; the server re-checks and refuses without this flag
			await receiptsAPI.remove(team.id, ids, deleteTargets.some((receipt) => receipt.reimbursement))
			const removed = new Set(ids)
			setDriveReceipts((list) => list.filter((r) => !removed.has(r.id)))
			setPreview((current) => current && removed.has(current.id) ? null : current)
			exitSelection()
			setDeleteTargets([])
			push(`Deleted ${ids.length} receipt${ids.length === 1 ? '' : 's'}.`, 'success')
		} catch (err) {
			const detail = err?.response?.data?.detail
			push(typeof detail === 'string' ? detail : 'Delete failed.', 'error')
			if (err?.response?.status === 409) {
				// our view of which receipts are linked was stale: reload it and let the user retry with the real warning
				setDeleteTargets([])
				fetchReceipts(team.id).then(setDriveReceipts).catch(() => {})
			}
		} finally {
			setDeleting(false)
		}
	}

	const handleRefresh = async () => {
		if (!team?.id || refreshing) return
		setRefreshing(true)
		try {
			setDriveReceipts(await fetchReceipts(team.id, true))
			push('Receipts refreshed.', 'success')
		} catch {
			push('Refresh failed.', 'error')
		} finally {
			setRefreshing(false)
		}
	}

	// background SSE sync; the global pill shows progress/result on any page
	const handleSync = () => {
		if (!team?.id) return
		startSync(team.id)
	}

	const allReceipts = [...(team?.receipts ?? []), ...driveReceipts]
	const filteredReceipts = allReceipts
		.filter((receipt) => sourceFilter === 'all' || receipt.source === sourceFilter)
		.filter((receipt) => reimbursedFilter === 'all' || receipt.reimbursed === (reimbursedFilter === 'reimbursed'))
	.filter((receipt) => duplicateFilter === 'all' || receipt.duplicate?.status === duplicateFilter)
		.filter((receipt) => {
			const q = search.trim().toLowerCase()
			return !q || receipt.filename.toLowerCase().includes(q) || (receipt.label ?? '').toLowerCase().includes(q)
		})
		.sort((a, b) => {
			const aDate = a.date === '—' ? '' : a.date
			const bDate = b.date === '—' ? '' : b.date
			if (!aDate || !bDate) return aDate ? -1 : bDate ? 1 : 0
			return dateOrder === 'asc' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate)
		})
	const previewIndex = preview ? filteredReceipts.findIndex((receipt) => receipt.id === preview.id) : -1
	// total spent is the sum of actual receipt amounts, not the stale stored team.used; confirmed duplicates aren't real expenses
	const used = allReceipts.reduce((sum, receipt) => sum + (isExcluded(receipt) ? 0 : receipt.amount ?? 0), 0)
	// negative when spending is over the budget, so the summary shows how far over it is
	const remaining = team ? (team.budget ?? 0) - used : 0
	const overBudget = team && remaining < 0
	const remainingPercent = team?.budget ? (remaining / team.budget) * 100 : 0
	const alert = team && remainingPercent < 10

	useEffect(() => {
		if (!preview && !amountsOpen) return
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => { document.body.style.overflow = previousOverflow }
	}, [preview, amountsOpen])

	const needsGDriveSetup = sourceFilter === 'google' && team && !team.googleDriveFolderId && !readOnly

	const unsetCount = readOnly ? 0 : allReceipts.filter(isUnset).length // 0 hides the button
	const duplicateCount = (status) => allReceipts.filter((r) => r.duplicate?.status === status).length
	const localReceiptCount = readOnly ? 0 : filteredReceipts.filter((r) => r.source === 'manual').length // 0 hides "Select for deletion"
	const selectedReceipts = allReceipts.filter((receipt) => selectedIds.has(receipt.id))

	const handleGDrivePromptAction = () => {
		if (team?.id) {
			sessionStorage.setItem('autoEditTeamId', team.id)
			goTo('teams')
		}
	}

	if (!organization) return <>
		<header className="mb-9"><p className="mb-2.5 text-[11px] font-bold tracking-widest text-muted uppercase">Finance / Receipts management</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Receipts management</h1><p className="mt-3 text-[13px] leading-6 text-muted">Browse receipts by team in one shared workspace.</p></header>
		<OrganizationRequiredEmptyState />
	</>

	return (
		<>
			<header className="mb-12 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div><p className="mb-2.5 text-[11px] font-bold tracking-widest text-muted uppercase">Finance / Receipts management</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Receipts management</h1><p className="mt-3 text-[13px] leading-6 text-muted">Browse receipts by team in one shared workspace.</p></div>
				{team && <label className="grid min-w-47.5 gap-2 text-xs font-bold text-ink">Team<select className="h-10 rounded-lg border border-line bg-white px-3 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={selectedIndex} onChange={(event) => setTeamIndex(Number(event.target.value))}>{teams.map((item, index) => <option key={item.id} value={index}>{item.name}</option>)}</select></label>}
			</header>
			{team ? (
				<>
					<section className={alert ? 'mb-6 rounded-[14px] border border-red-200 bg-red-50 p-5 text-red-900' : 'mb-6 rounded-[14px] border border-line bg-white p-5'}>
						<div className="flex items-end justify-between gap-5 max-[560px]:flex-col max-[560px]:items-start"><div><p className="text-[11px] font-bold tracking-widest uppercase opacity-70">{team.name} · budget summary</p><p className="mt-2 font-display text-[24px] tracking-[-0.04em]">{formatMoney(used)} <span className="font-body text-sm font-normal opacity-70">spent</span></p></div><div className="text-left min-[561px]:text-right"><p className="text-xs opacity-70">Remaining budget</p><p className="mt-1 font-display text-[20px]">{formatMoney(remaining)}</p></div></div>
						{alert && <p className="mt-4 flex items-center gap-2 text-xs font-bold"><Icon name="insight" size={15} /> {overBudget ? `Over budget by ${formatMoney(-remaining)}: spending is above this team’s ${formatMoney(team.budget ?? 0)} budget.` : 'Less than 10% of this team’s budget remains.'}</p>}
					</section>
					<section>
						<ReceiptsToolbar
							count={filteredReceipts.length}
							filters={{ source: sourceFilter, reimbursed: reimbursedFilter, duplicates: duplicateFilter, search, order: dateOrder }}
							onFilter={(key, value) => ({ source: setSourceFilter, reimbursed: setReimbursedFilter, duplicates: setDuplicateFilter, search: setSearch, order: setDateOrder })[key](value)}
							onClear={() => { setSourceFilter('all'); setReimbursedFilter('all'); setDuplicateFilter('all'); setSearch('') }}
							duplicateCounts={{ pending: duplicateCount('pending'), confirmed: duplicateCount('confirmed'), dismissed: duplicateCount('dismissed') }}
							readOnly={readOnly} selecting={selecting} selectedCount={selectedIds.size} deleting={deleting}
							refreshing={refreshing} syncing={syncing} canSync={Boolean(team?.googleDriveFolderId)}
							unsetCount={unsetCount} localCount={localReceiptCount}
							onRefresh={handleRefresh} onSync={handleSync} onFillMissing={() => setAmountsOpen(true)}
							onSelect={() => setSelecting(true)} onDelete={() => setDeleteTargets(selectedReceipts)} onCancelSelect={exitSelection} onAdd={() => setAddOpen(true)}
						/>
						{needsGDriveSetup ? (
							<div className="grid min-h-55 place-items-center rounded-[14px] border border-dashed border-line bg-white p-8 text-center">
								<div className="max-w-md">
									<span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="plug" size={20} /></span>
									<h3 className="mt-4 font-display text-[16px]">Google Drive not connected</h3>
									<p className="mt-2 text-xs text-muted">This team doesn't have a Google Drive folder ID set. Add it in Team Management to browse Drive receipts.</p>
									<button className={button.primary} type="button" onClick={handleGDrivePromptAction} style={{ marginTop: '16px' }}>
										<Icon name="arrow" size={15} /> Set up Google Drive folder
									</button>
								</div>
							</div>
						) : filteredReceipts.length ? <div className="grid grid-cols-2 gap-4 min-[700px]:grid-cols-3 min-[1050px]:grid-cols-5">{filteredReceipts.map((receipt) => {
							const isLocal = receipt.source === 'manual'
							const selectable = selecting && isLocal
							const isSelected = selectedIds.has(receipt.id)
							return <button className={`group min-w-0 text-left focus-visible:outline-[3px] focus-visible:outline-blue-ring ${selecting && !isLocal || isExcluded(receipt) ? 'opacity-50' : ''}`} type="button" key={receipt.id} aria-pressed={selectable ? isSelected : undefined} onClick={() => selectable ? toggleSelected(receipt.id) : setPreview(receipt)}><div className={`relative grid aspect-[1.15] place-items-center overflow-hidden rounded-[14px] border bg-white text-blue shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md ${isSelected ? 'border-blue ring-[3px] ring-blue-ring' : 'border-line group-hover:border-blue'}`}><Icon name="receipt" size={34} />{receipt.thumbnail && <img src={receipt.thumbnail} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} />}{selectable && <span className={`absolute top-2 right-2 grid size-6 place-items-center rounded-md border text-white ${isSelected ? 'border-blue bg-blue' : 'border-line bg-white/80'}`}>{isSelected && <Icon name="check" size={14} />}</span>}{selecting && !isLocal && <span className="absolute bottom-2 left-2 rounded-full bg-[rgb(28_35_36/70%)] px-2 py-0.5 text-[10px] font-bold text-white">Drive</span>}{receipt.reimbursement && <span className={`absolute top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${receipt.reimbursed ? 'bg-green text-white' : 'bg-brown-soft text-brown'}`} title={`In record “${receipt.reimbursement.name}”`}>{receipt.reimbursed ? 'Reimbursed' : 'Pending'}</span>}{receipt.duplicate && receipt.duplicate.status !== 'dismissed' && <span className={`absolute right-2 bottom-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${receipt.duplicate.excluded ? 'bg-red-600 text-white' : 'bg-brown-soft text-brown'}`} title={`Copy of "${receipt.duplicate.of.name}"`}>{receipt.duplicate.excluded ? 'Duplicate (excluded)' : 'Duplicate? Review'}</span>}</div><strong className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ink">{receipt.filename}</strong><span className="mt-1 block truncate text-xs text-muted">{receipt.date} · {receiptAmountText(receipt)}</span></button>
						})}</div> : <div className="grid min-h-55 place-items-center rounded-[14px] border border-dashed border-line bg-white p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="folder" size={20} /></span><h3 className="mt-4 font-display text-[16px]">{allReceipts.length ? 'No matching receipts' : 'No receipts yet'}</h3><p className="mt-1 text-xs text-muted">{allReceipts.length ? 'Try another filter or search.' : `Add the first receipt for ${team.name} to see it here.`}</p></div></div>}
					</section>
				</>
			) : <div className="grid min-h-80 place-items-center rounded-[14px] border border-line bg-white p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-soft text-blue"><Icon name="users" size={24} /></span><h2 className="mt-5 font-display text-[20px] tracking-[-0.03em]">Create a team to manage receipts</h2><p className="mt-2 text-[13px] leading-6 text-muted">Receipts are organized by team. Add your first team in Team Management to get started.</p></div></div>}
			<ReceiptPreview
				receipt={preview}
				onClose={() => setPreview(null)}
				onPrev={() => previewIndex > 0 && setPreview(filteredReceipts[previewIndex - 1])}
				onNext={() => previewIndex < filteredReceipts.length - 1 && setPreview(filteredReceipts[previewIndex + 1])}
				index={previewIndex}
				total={filteredReceipts.length}
				onSave={handleSaveReceipt}
				onScan={handleScanReceipt}
				onReviewDuplicate={handleReviewDuplicate}
				teamName={team?.name}
				onDelete={() => setDeleteTargets([preview])}
				deleting={deleting}
				readOnly={readOnly}
			/>
			{amountsOpen && <SetAmountsModal receipts={allReceipts} onClose={() => setAmountsOpen(false)} onSave={handleSaveReceipt} onScan={handleScanReceipt} running={bulk.running} onFillAll={(list) => bulk.start(team.id, list, { ownerId: organization?.ownerId, orgId: organization?.id })} onCancelRun={bulk.cancel} />}
			<AddReceiptModal open={addOpen} onClose={() => setAddOpen(false)} onUpload={handleUploadReceipt} scanContext={{ ownerId: organization?.ownerId, orgId: organization?.id, teamId: team?.id }} />
			<Modal isOpen={deleteTargets.length > 0} onClose={() => { if (!deleting) setDeleteTargets([]) }} title={`Delete ${deleteTargets.length} receipt${deleteTargets.length === 1 ? '' : 's'}?`} footer={
				<>
					<button className={button.secondary} type="button" onClick={() => setDeleteTargets([])} disabled={deleting}>Cancel</button>
					<button className={`${button.danger} disabled:opacity-60`} type="button" onClick={handleDeleteSelected} disabled={deleting || deleteTargets.length === 0}><Icon name={deleting ? 'spinner' : 'trash'} size={15} /> {deleting ? 'Deleting…' : 'Delete forever'}</button>
				</>
			}>
				<p className="text-[13px] leading-6 text-muted">The following receipts will be permanently removed from your local uploads. This action cannot be reversed.</p>
				{deleteTargets.some((receipt) => receipt.reimbursement) && (
					<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert">
						<strong className="flex items-center gap-1.5"><Icon name="insight" size={14} /> Tracked in reimbursement records</strong>
						<ul className="mt-1.5 list-disc pl-5">
							{deleteTargets.filter((receipt) => receipt.reimbursement).map((receipt) => (
								<li key={receipt.id}>“{receipt.filename}” is in record “{receipt.reimbursement.name}”{receipt.reimbursed ? ' and is marked Reimbursed' : ' (not reimbursed yet)'}.</li>
							))}
						</ul>
						<p className="mt-1.5">The records keep their entries but will show a warning that the receipt no longer exists.</p>
					</div>
				)}
				<ul className="mt-3 max-h-60 overflow-auto rounded-lg border border-line">
					{deleteTargets.map((receipt) => (
						<li key={receipt.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0 text-[13px]">
							<span className="truncate text-ink">{receipt.filename}</span>
							<span className="shrink-0 text-xs text-muted">{receiptAmountText(receipt)}</span>
						</li>
					))}
				</ul>
			</Modal>
		</>
	)
}
