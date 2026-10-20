/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { teamsAPI } from '../api/teams'
import { API_BASE_URL, request } from '../api/client'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'
import Toast from '../components/Toast'

const formatMoney = (amount) => amount == null ? '—' : `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const readPreference = (key, allowed, fallback) => {
	try {
		const value = localStorage.getItem(key)
		return allowed.includes(value) ? value : fallback
	} catch {
		return fallback
	}
}

const SYNC_TIMEOUT_MS = 15000

const fetchDriveReceipts = (teamId, refresh = false) =>
	request(`/api/google-drive/teams/${teamId}/receipts`, {
		...(refresh ? { params: { refresh: true } } : {}),
		timeout: SYNC_TIMEOUT_MS,
	})
		.then((files) => files
			.filter((file) => file.mimeType !== 'application/vnd.google-apps.folder')
			.map((file) => ({
				id: file.id,
				filename: file.name,
				date: file.modifiedTime ? file.modifiedTime.slice(0, 10) : '—',
				amount: null,
				category: 'Google Drive',
				source: 'google',
				thumbnail: file.thumbnailLink ? `${API_BASE_URL}/api/google-drive/teams/${teamId}/receipts/${file.id}/thumbnail` : null,
			})))

function ReceiptPreview({ receipt, onClose, onPrev, onNext, index, total }) {
	const [loadedSrc, setLoadedSrc] = useState(null)
	const [errorSrc, setErrorSrc] = useState(null)

	if (!receipt) return null
	const previewSrc = receipt.thumbnail ? `${receipt.thumbnail}?size=640` : null
	const imageError = Boolean(previewSrc) && errorSrc === previewSrc
	const imageLoading = Boolean(previewSrc) && !imageError && loadedSrc !== previewSrc
	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div className="max-h-[92vh] w-[min(100%,900px)] overflow-y-auto rounded-[14px] border border-line bg-white p-5 shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
				<div className="mb-4 flex items-start justify-between gap-4">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">Receipt preview</p><h2 id="receipt-preview-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{receipt.merchant}</h2></div>
					<div className="flex items-center gap-3">{imageLoading && <Icon name="spinner" size={14} />}<span className="text-xs font-bold text-muted">{index + 1} / {total}</span><button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button></div>
				</div>
				<div className="relative grid h-[min(70vh,640px)] place-items-center overflow-hidden rounded-xl border border-line bg-paper text-blue">
					{imageLoading ? <Icon name="spinner" size={32} /> : <Icon name="receipt" size={48} />}
					{previewSrc && !imageError && <img src={previewSrc} alt="" decoding="async" className={`absolute inset-0 h-full w-full object-contain transition-opacity ${imageLoading ? 'opacity-40' : 'opacity-100'}`} onLoad={() => setLoadedSrc(previewSrc)} onError={() => setErrorSrc(previewSrc)} />}
					<button className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-blue shadow-md transition hover:bg-blue-soft disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label="Previous receipt" onClick={onPrev} disabled={index <= 0}><span className="rotate-180"><Icon name="chevron" size={18} /></span></button>
					<button className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-blue shadow-md transition hover:bg-blue-soft disabled:cursor-not-allowed disabled:opacity-40" type="button" aria-label="Next receipt" onClick={onNext} disabled={index >= total - 1}><Icon name="chevron" size={18} /></button>
				</div>
				<div className="mt-4 grid grid-cols-2 gap-4 text-[13px] min-[560px]:grid-cols-4"><div><span className="block text-xs text-muted">Filename</span><strong className="mt-1 block truncate">{receipt.filename}</strong></div><div><span className="block text-xs text-muted">Amount</span><strong className="mt-1 block">{formatMoney(receipt.amount)}</strong></div><div><span className="block text-xs text-muted">Date</span><strong className="mt-1 block">{receipt.date}</strong></div><div><span className="block text-xs text-muted">Category</span><strong className="mt-1 block">{receipt.category}</strong></div></div>
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
		teamsAPI.getTeams(organization.id, organization.ownerId).then((res) => setTeams(Array.isArray(res) ? res : [])).catch(() => setTeams([]))
	}, [organization?.id, organization?.ownerId])

	useEffect(() => {
		try {
			localStorage.setItem('receipts:source', sourceFilter)
			localStorage.setItem('receipts:dateOrder', dateOrder)
		} catch {
			// storage unavailable; view preferences just won't persist
		}
	}, [sourceFilter, dateOrder])

	const selectedIndex = teams.length ? Math.min(teamIndex, teams.length - 1) : 0
	const team = teams[selectedIndex]
	const [driveReceipts, setDriveReceipts] = useState([])
	const [syncing, setSyncing] = useState(false)
	const [toast, setToast] = useState(null)

	useEffect(() => {
		if (!team?.id || !team.googleDriveFolderId) { setDriveReceipts([]); return }
		let cancelled = false
		fetchDriveReceipts(team.id)
			.then((receipts) => { if (!cancelled) setDriveReceipts(receipts) })
			.catch(() => { if (!cancelled) setDriveReceipts([]) })
		return () => { cancelled = true }
	}, [team?.id, team?.googleDriveFolderId])

	const handleSync = async () => {
		if (!team?.id || syncing) return
		setSyncing(true)
		try {
			setDriveReceipts(await fetchDriveReceipts(team.id, true))
			setToast({ message: 'Google Drive synced.', type: 'success' })
		} catch (error) {
			const timedOut = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT'
			setToast({
				message: timedOut
					? `Sync timed out after ${SYNC_TIMEOUT_MS / 1000}s. Try again.`
					: 'Sync failed. Check the Google Drive connection.',
				type: 'error',
			})
		} finally {
			setSyncing(false)
		}
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
	const remaining = team ? Math.max(0, (team.budget ?? 0) - (team.used ?? 0)) : 0
	const remainingPercent = team?.budget ? (remaining / team.budget) * 100 : 0
	const alert = team && remainingPercent < 10

	useEffect(() => {
		if (!preview) return
		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = 'hidden'
		return () => { document.body.style.overflow = previousOverflow }
	}, [preview])

	const needsGDriveSetup = sourceFilter === 'google' && team && !team.googleDriveFolderId

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
						<div className="flex items-end justify-between gap-5 max-[560px]:flex-col max-[560px]:items-start"><div><p className="text-[11px] font-bold tracking-widest uppercase opacity-70">{team.name} · budget summary</p><p className="mt-2 font-display text-[24px] tracking-[-0.04em]">{formatMoney(team.used)} <span className="font-body text-sm font-normal opacity-70">spent</span></p></div><div className="text-left min-[561px]:text-right"><p className="text-xs opacity-70">Remaining budget</p><p className="mt-1 font-display text-[20px]">{formatMoney(remaining)}</p></div></div>
						{alert && <p className="mt-4 flex items-center gap-2 text-xs font-bold"><Icon name="insight" size={15} /> Less than 10% of this team’s budget remains.</p>}
					</section>
					<section>
						<div className="mb-4 flex items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-[18px] tracking-[-0.03em]">Team receipts</h2></div><div className="mt-2 flex flex-wrap items-end gap-4"><fieldset className="w-fit max-w-full"><legend className="text-xs font-bold text-ink">Source</legend><div className="mt-1.5 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-line bg-white p-1"><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'all' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>All</button><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'google' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'google'} onClick={() => setSourceFilter('google')}>Google Drive</button><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'manual' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'manual'} onClick={() => setSourceFilter('manual')}>Local upload</button></div></fieldset><label className="grid gap-1.5 text-xs font-bold text-ink">Sort by date<select className="h-9 rounded-lg border border-line bg-white px-2 text-[12px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={dateOrder} onChange={(event) => setDateOrder(event.target.value)}><option value="desc">Newest first</option><option value="asc">Oldest first</option></select></label></div><p className="mt-2 text-xs text-muted">{filteredReceipts.length} {filteredReceipts.length === 1 ? 'receipt' : 'receipts'}</p></div><div className="flex flex-wrap items-center gap-2">{team?.googleDriveFolderId && sourceFilter !== 'manual' && <button className={`${button.secondary} disabled:opacity-60`} type="button" onClick={handleSync} disabled={syncing}><Icon name={syncing ? 'spinner' : 'sync'} size={15} /> {syncing ? 'Syncing…' : 'Sync Google Drive'}</button>}<button className={button.secondary} type="button"><Icon name="plus" size={15} /> Add receipt</button></div></div>
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
						) : filteredReceipts.length ? <div className="grid grid-cols-2 gap-4 min-[700px]:grid-cols-3 min-[1050px]:grid-cols-5">{filteredReceipts.map((receipt) => <button className="group min-w-0 text-left focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" key={receipt.id} onClick={() => setPreview(receipt)}><div className="relative grid aspect-[1.15] place-items-center overflow-hidden rounded-[14px] border border-line bg-white text-blue shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-blue group-hover:shadow-md"><Icon name="receipt" size={34} />{receipt.thumbnail && <img src={receipt.thumbnail} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} />}</div><strong className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ink">{receipt.filename}</strong><span className="mt-1 block truncate text-xs text-muted">{receipt.date} · {formatMoney(receipt.amount)}</span></button>)}</div> : <div className="grid min-h-55 place-items-center rounded-[14px] border border-dashed border-line bg-white p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="folder" size={20} /></span><h3 className="mt-4 font-display text-[16px]">{allReceipts.length ? 'No matching receipts' : 'No receipts yet'}</h3><p className="mt-1 text-xs text-muted">{allReceipts.length ? 'Try another source filter.' : `Add the first receipt for ${team.name} to see it here.`}</p></div></div>}
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
			/>
			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</>
	)
}