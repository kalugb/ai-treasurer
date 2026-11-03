/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import AddReceiptModal from '../components/AddReceiptModal'
import { teamsAPI } from '../api/teams'
import { API_BASE_URL } from '../api/client'
import { receiptsAPI } from '../api/receipts'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'
import { useSyncStatus } from '../context/syncStatus'
import Toast from '../components/Toast'
import Modal from '../components/Modal'

const formatMoney = (amount) => amount == null ? '—' : `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const readPreference = (key, allowed, fallback) => {
	try {
		const value = localStorage.getItem(key)
		return allowed.includes(value) ? value : fallback
	} catch {
		return fallback
	}
}

// backend returns persisted receipts; map to the shape the UI renders
const toReceipt = (r) => ({
	id: r.googleDriveFileId,
	googleDriveFileId: r.googleDriveFileId,
	filename: r.receiptName,
	label: r.label ?? null,
	description: r.description ?? null,
	date: r.date || '—',
	amount: r.receiptAmount ?? 0,
	category: 'Google Drive',
	source: r.source === 'local_upload' ? 'manual' : 'google',
	thumbnail: r.thumbnail ? `${API_BASE_URL}${r.thumbnail}` : null,
})

const fetchReceipts = (teamId, refresh = false) => receiptsAPI.getReceipts(teamId, refresh).then((list) => (Array.isArray(list) ? list.map(toReceipt) : []))

function ReceiptPreview({ receipt, onClose, onPrev, onNext, index, total, onSave }) {
	const [loadedSrc, setLoadedSrc] = useState(null)
	const [errorSrc, setErrorSrc] = useState(null)
	const [amount, setAmount] = useState('')
	const [label, setLabel] = useState('')
	const [description, setDescription] = useState('')
	const [saving, setSaving] = useState(false)
	const [saveError, setSaveError] = useState(null)
	const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 })
	const [dragging, setDragging] = useState(false)
	const dragRef = useRef(null)

	useEffect(() => {
		setAmount(receipt?.amount == null ? '' : String(receipt.amount))
		setLabel(receipt?.label ?? '')
		setDescription(receipt?.description ?? '')
		setSaveError(null)
		setZoom({ scale: 1, tx: 0, ty: 0 })
		dragRef.current = null
		setDragging(false)
		// reset the form only when switching to a different receipt, not on every field refresh
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [receipt?.id])

	// wheel zooms toward the cursor; translate is adjusted so the point under the cursor stays put. clamped 1x–5x
	const handleWheel = (event) => {
		event.preventDefault()
		const rect = event.currentTarget.getBoundingClientRect()
		const cx = event.clientX - rect.left - rect.width / 2
		const cy = event.clientY - rect.top - rect.height / 2
		setZoom((current) => {
			const scale = Math.min(5, Math.max(1, current.scale - event.deltaY * 0.0015))
			if (scale <= 1) return { scale: 1, tx: 0, ty: 0 }
			const ratio = scale / current.scale
			return { scale, tx: cx - (cx - current.tx) * ratio, ty: cy - (cy - current.ty) * ratio }
		})
	}

	const handlePointerDown = (event) => {
		if (zoom.scale <= 1) return
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = { x: event.clientX, y: event.clientY, tx: zoom.tx, ty: zoom.ty }
		setDragging(true)
	}
	const handlePointerMove = (event) => {
		if (!dragRef.current) return
		setZoom((current) => ({ ...current, tx: dragRef.current.tx + (event.clientX - dragRef.current.x), ty: dragRef.current.ty + (event.clientY - dragRef.current.y) }))
	}
	const handlePointerUp = () => { dragRef.current = null; setDragging(false) }

	if (!receipt) return null
	const previewSrc = receipt.thumbnail ? `${receipt.thumbnail}?size=640` : null
	const imageError = Boolean(previewSrc) && errorSrc === previewSrc
	const imageLoading = Boolean(previewSrc) && !imageError && loadedSrc !== previewSrc

	const handleSave = async (event) => {
		event.preventDefault()
		if (saving) return
		const trimmed = amount.trim()
		const parsedAmount = trimmed === '' ? null : Number(trimmed)
		if (parsedAmount != null && (Number.isNaN(parsedAmount) || parsedAmount < 0)) {
			setSaveError('Enter a valid non-negative amount.')
			return
		}
		setSaving(true)
		setSaveError(null)
		try {
			await onSave(receipt.googleDriveFileId, {
				receiptAmount: parsedAmount,
				label: label.trim() || null,
				description: description.trim() || null,
			})
		} catch {
			setSaveError('Could not save. Try again.')
		} finally {
			setSaving(false)
		}
	}
	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div className="flex max-h-[92vh] w-[min(100%,1100px)] flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
				<div className="flex items-start justify-between gap-4 border-b border-line p-5">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">Receipt preview</p><h2 id="receipt-preview-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{receipt.label || receipt.filename}</h2></div>
					<div className="flex items-center gap-3">{imageLoading && <Icon name="spinner" size={14} />}<span className="text-xs font-bold text-muted">{index + 1} / {total}</span><button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button></div>
				</div>
				<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden min-[760px]:grid-cols-[1.3fr_1fr]">
					<div className="relative grid min-h-[40vh] place-items-center overflow-hidden border-b border-line bg-paper text-blue min-[760px]:min-h-0 min-[760px]:border-r min-[760px]:border-b-0" onWheel={previewSrc && !imageError ? handleWheel : undefined}>
						{imageLoading ? <Icon name="spinner" size={32} /> : <Icon name="receipt" size={48} />}
						{previewSrc && !imageError && <img src={previewSrc} alt="" decoding="async" draggable={false} className={`absolute inset-0 h-full w-full touch-none object-contain transition-opacity ${imageLoading ? 'opacity-40' : 'opacity-100'}`} style={{ transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`, cursor: zoom.scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onLoad={() => setLoadedSrc(previewSrc)} onError={() => setErrorSrc(previewSrc)} />}
						{zoom.scale > 1 && <span className="absolute bottom-3 left-3 rounded-full bg-[rgb(28_35_36/70%)] px-2.5 py-1 text-[11px] font-bold text-white">{zoom.scale.toFixed(1)}×</span>}
						<button className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-blue shadow-md transition hover:bg-blue-soft disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label="Previous receipt" onClick={onPrev} disabled={index <= 0}><span className="rotate-180"><Icon name="chevron" size={18} /></span></button>
						<button className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-blue shadow-md transition hover:bg-blue-soft disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label="Next receipt" onClick={onNext} disabled={index >= total - 1}><Icon name="chevron" size={18} /></button>
					</div>
					<div className="min-h-0 overflow-y-auto p-5">
						<div className="grid grid-cols-3 gap-4 text-[13px]"><div><span className="block text-xs text-muted">Date</span><strong className="mt-1 block">{receipt.date}</strong></div><div><span className="block text-xs text-muted">Category</span><strong className="mt-1 block">{receipt.category}</strong></div><div><span className="block text-xs text-muted">Filename</span><strong className="mt-1 block truncate" title={receipt.filename}>{receipt.filename}</strong></div></div>
						<form className="mt-5 border-t border-line pt-4" onSubmit={handleSave}>
							<p className="mb-3 text-[11px] font-bold tracking-widest text-muted uppercase">Edit details</p>
							<label className="grid gap-1.5 text-xs font-bold text-ink">Amount<input className="h-10 rounded-lg border border-line bg-white px-3 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
							<label className="mt-3 grid gap-1.5 text-xs font-bold text-ink">Label (optional)<input className="h-10 rounded-lg border border-line bg-white px-3 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" type="text" placeholder="e.g. Team lunch" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
							<label className="mt-3 grid gap-1.5 text-xs font-bold text-ink">Notes (optional)<textarea className="min-h-24 rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" placeholder="Personal notes about this receipt" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
							{saveError && <p className="mt-2 text-xs font-bold text-red-700">{saveError}</p>}
							<div className="mt-4 flex justify-end"><button className={`${button.primary} disabled:opacity-60`} type="submit" disabled={saving}><Icon name={saving ? 'spinner' : 'check'} size={15} /> {saving ? 'Saving…' : 'Save details'}</button></div>
						</form>
					</div>
				</div>
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
			const currentTeam = teams[Math.min(teamIndex, teams.length - 1)]
			if (currentTeam?.id) localStorage.setItem('receipts:team', currentTeam.id)
		} catch {
			// storage unavailable; view preferences just won't persist
		}
	}, [sourceFilter, dateOrder, teams, teamIndex])

	const selectedIndex = teams.length ? Math.min(teamIndex, teams.length - 1) : 0
	const team = teams[selectedIndex]
	const [driveReceipts, setDriveReceipts] = useState([])
	const [refreshing, setRefreshing] = useState(false)
	const [toast, setToast] = useState(null)
	const [addOpen, setAddOpen] = useState(false)
	const [selecting, setSelecting] = useState(false)
	const [selectedIds, setSelectedIds] = useState(() => new Set())
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
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
	useEffect(() => { setSelecting(false); setSelectedIds(new Set()); setConfirmDeleteOpen(false) }, [team?.id])

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
		setToast({ message: 'Receipt details saved.', type: 'success' })
	}

	const handleUploadReceipt = async (formData) => {
		const created = toReceipt(await receiptsAPI.upload(team.id, formData))
		setDriveReceipts((list) => [created, ...list])
		setToast({ message: 'Receipt uploaded.', type: 'success' })
	}

	const exitSelection = () => { setSelecting(false); setSelectedIds(new Set()) }

	const toggleSelected = (id) => setSelectedIds((current) => {
		const next = new Set(current)
		next.has(id) ? next.delete(id) : next.add(id)
		return next
	})

	const handleDeleteSelected = async () => {
		const ids = [...selectedIds]
		if (!ids.length || deleting) return
		setDeleting(true)
		try {
			await receiptsAPI.remove(team.id, ids)
			const removed = new Set(ids)
			setDriveReceipts((list) => list.filter((r) => !removed.has(r.id)))
			setPreview((current) => current && removed.has(current.id) ? null : current)
			exitSelection()
			setConfirmDeleteOpen(false)
			setToast({ message: `Deleted ${ids.length} receipt${ids.length === 1 ? '' : 's'}.`, type: 'success' })
		} catch {
			setToast({ message: 'Delete failed.', type: 'error' })
		} finally {
			setDeleting(false)
		}
	}

	const handleRefresh = async () => {
		if (!team?.id || refreshing) return
		setRefreshing(true)
		try {
			setDriveReceipts(await fetchReceipts(team.id, true))
			setToast({ message: 'Receipts refreshed.', type: 'success' })
		} catch {
			setToast({ message: 'Refresh failed.', type: 'error' })
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
		.sort((a, b) => {
			const aDate = a.date === '—' ? '' : a.date
			const bDate = b.date === '—' ? '' : b.date
			if (!aDate || !bDate) return aDate ? -1 : bDate ? 1 : 0
			return dateOrder === 'asc' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate)
		})
	const previewIndex = preview ? filteredReceipts.findIndex((receipt) => receipt.id === preview.id) : -1
	// total spent is the sum of actual receipt amounts, not the stale stored team.used
	const used = allReceipts.reduce((sum, receipt) => sum + (receipt.amount ?? 0), 0)
	const remaining = team ? Math.max(0, (team.budget ?? 0) - used) : 0
	const remainingPercent = team?.budget ? (remaining / team.budget) * 100 : 0
	const alert = team && remainingPercent < 10

	useEffect(() => {
		if (!preview) return
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => { document.body.style.overflow = previousOverflow }
	}, [preview])

	const needsGDriveSetup = sourceFilter === 'google' && team && !team.googleDriveFolderId

	const localReceiptCount = filteredReceipts.filter((r) => r.source === 'manual').length
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
						{alert && <p className="mt-4 flex items-center gap-2 text-xs font-bold"><Icon name="insight" size={15} /> Less than 10% of this team’s budget remains.</p>}
					</section>
					<section>
						<div className="mb-4 flex items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-[18px] tracking-[-0.03em]">Team receipts</h2></div><div className="mt-2 flex flex-wrap items-end gap-4"><fieldset className="w-fit max-w-full"><legend className="text-xs font-bold text-ink">Source</legend><div className="mt-1.5 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-line bg-white p-1"><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'all' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>All</button><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'google' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'google'} onClick={() => setSourceFilter('google')}>Google Drive</button><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'manual' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'manual'} onClick={() => setSourceFilter('manual')}>Local upload</button></div></fieldset><label className="grid gap-1.5 text-xs font-bold text-ink">Sort by date<select className="h-9 rounded-lg border border-line bg-white px-2 text-[12px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={dateOrder} onChange={(event) => setDateOrder(event.target.value)}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label>{selecting ? <><button className={`${button.danger} disabled:opacity-60`} type="button" onClick={() => setConfirmDeleteOpen(true)} disabled={selectedIds.size === 0}><Icon name="trash" size={15} /> Delete{selectedIds.size ? ` (${selectedIds.size})` : ''}</button><button className={button.secondary} type="button" onClick={exitSelection} disabled={deleting}>Cancel</button></> : localReceiptCount > 0 && <button className={button.secondary} type="button" onClick={() => setSelecting(true)} title="Select local-upload receipts to delete"><Icon name="check" size={15} /> Select for deletion</button>}</div><p className="mt-2 text-xs text-muted">{filteredReceipts.length} {filteredReceipts.length === 1 ? 'receipt' : 'receipts'}</p></div><div className="flex flex-wrap items-center gap-2">{team && <button className={`${button.secondary} disabled:opacity-60`} type="button" onClick={handleRefresh} disabled={refreshing} title="Re-read from the database (picks up external edits)"><Icon name={refreshing ? 'spinner' : 'sync'} size={15} /> {refreshing ? 'Refreshing…' : 'Refresh'}</button>}{team?.googleDriveFolderId && sourceFilter !== 'manual' && <button className={`${button.secondary} disabled:opacity-60`} type="button" onClick={handleSync} disabled={syncing}><Icon name={syncing ? 'spinner' : 'sync'} size={15} /> {syncing ? 'Syncing…' : 'Sync Google Drive'}</button>}{!selecting && <button className={button.secondary} type="button" onClick={() => setAddOpen(true)}><Icon name="plus" size={15} /> Add receipt</button>}</div></div>
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
							return <button className={`group min-w-0 text-left focus-visible:outline-[3px] focus-visible:outline-blue-ring ${selecting && !isLocal ? 'opacity-50' : ''}`} type="button" key={receipt.id} aria-pressed={selectable ? isSelected : undefined} onClick={() => selectable ? toggleSelected(receipt.id) : setPreview(receipt)}><div className={`relative grid aspect-[1.15] place-items-center overflow-hidden rounded-[14px] border bg-white text-blue shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md ${isSelected ? 'border-blue ring-[3px] ring-blue-ring' : 'border-line group-hover:border-blue'}`}><Icon name="receipt" size={34} />{receipt.thumbnail && <img src={receipt.thumbnail} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} />}{selectable && <span className={`absolute top-2 right-2 grid size-6 place-items-center rounded-md border text-white ${isSelected ? 'border-blue bg-blue' : 'border-line bg-white/80'}`}>{isSelected && <Icon name="check" size={14} />}</span>}{selecting && !isLocal && <span className="absolute bottom-2 left-2 rounded-full bg-[rgb(28_35_36/70%)] px-2 py-0.5 text-[10px] font-bold text-white">Drive</span>}</div><strong className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ink">{receipt.filename}</strong><span className="mt-1 block truncate text-xs text-muted">{receipt.date} · {formatMoney(receipt.amount)}</span></button>
						})}</div> : <div className="grid min-h-55 place-items-center rounded-[14px] border border-dashed border-line bg-white p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="folder" size={20} /></span><h3 className="mt-4 font-display text-[16px]">{allReceipts.length ? 'No matching receipts' : 'No receipts yet'}</h3><p className="mt-1 text-xs text-muted">{allReceipts.length ? 'Try another source filter.' : `Add the first receipt for ${team.name} to see it here.`}</p></div></div>}
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
			/>
			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
			<AddReceiptModal open={addOpen} onClose={() => setAddOpen(false)} onUpload={handleUploadReceipt} />
			<Modal isOpen={confirmDeleteOpen} onClose={() => { if (!deleting) setConfirmDeleteOpen(false) }} title={`Delete ${selectedIds.size} receipt${selectedIds.size === 1 ? '' : 's'}?`} footer={
				<>
					<button className={button.secondary} type="button" onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>Cancel</button>
					<button className={`${button.danger} disabled:opacity-60`} type="button" onClick={handleDeleteSelected} disabled={deleting || selectedIds.size === 0}><Icon name={deleting ? 'spinner' : 'trash'} size={15} /> {deleting ? 'Deleting…' : 'Delete forever'}</button>
				</>
			}>
				<p className="text-[13px] leading-6 text-muted">The following receipts will be permanently removed from your local uploads. This action cannot be reversed.</p>
				<ul className="mt-3 max-h-60 overflow-auto rounded-lg border border-line">
					{selectedReceipts.map((receipt) => (
						<li key={receipt.id} className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 last:border-b-0 text-[13px]">
							<span className="truncate text-ink">{receipt.filename}</span>
							<span className="shrink-0 text-xs text-muted">{formatMoney(receipt.amount)}</span>
						</li>
					))}
				</ul>
			</Modal>
		</>
	)
}