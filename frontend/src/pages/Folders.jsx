/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { teamsAPI } from '../api/teams'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'

const formatMoney = (amount) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ReceiptPreview({ receipt, onClose }) {
	if (!receipt) return null
	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div className="w-[min(100%,500px)] rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
				<div className="mb-5 flex items-start justify-between gap-4">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">Receipt preview</p><h2 id="receipt-preview-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{receipt.merchant}</h2></div>
					<button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button>
				</div>
				<div className="grid min-h-47.5 place-items-center rounded-xl border border-line bg-paper text-blue"><Icon name="receipt" size={48} /></div>
				<div className="mt-5 grid grid-cols-2 gap-4 text-[13px]"><div><span className="block text-xs text-muted">Filename</span><strong className="mt-1 block truncate">{receipt.filename}</strong></div><div><span className="block text-xs text-muted">Amount</span><strong className="mt-1 block">{formatMoney(receipt.amount)}</strong></div><div><span className="block text-xs text-muted">Date</span><strong className="mt-1 block">{receipt.date}</strong></div><div><span className="block text-xs text-muted">Category</span><strong className="mt-1 block">{receipt.category}</strong></div></div>
			</div>
		</div>
	)
}

export default function Folders({ organization, onGoToOrganization }) {
	const [teams, setTeams] = useState([])
	const [teamIndex, setTeamIndex] = useState(0)
	const [preview, setPreview] = useState(null)
	const [sourceFilter, setSourceFilter] = useState('all')
	// ponytail: mock google drive source, local only until backend is ready
	const [driveName, setDriveName] = useState("")
	const [driveId, setDriveId] = useState("")
	const [editingDrive, setEditingDrive] = useState(false)
	const [draftName, setDraftName] = useState("")
	const [draftId, setDraftId] = useState("")

	useEffect(() => {
		if (!organization?.id) { setTeams([]); return }
		teamsAPI.getTeams(organization.id, organization.ownerId).then((res) => setTeams(Array.isArray(res) ? res : [])).catch(() => setTeams([]))
	}, [organization?.id, organization?.ownerId])

	const selectedIndex = teams.length ? Math.min(teamIndex, teams.length - 1) : 0
	const team = teams[selectedIndex]
	const filteredReceipts = (team?.receipts ?? []).filter((receipt) => sourceFilter === 'all' || receipt.source === sourceFilter) ?? []
	const remaining = team ? Math.max(0, (team.budget ?? 0) - (team.used ?? 0)) : 0
	const remainingPercent = team?.budget ? (remaining / team.budget) * 100 : 0
	const alert = team && remainingPercent < 10

	useEffect(() => {
		if (!team) return
		// mock defaults per team — no backend yet
		setDriveName(`${team.name} receipts`)
		setDriveId(`1AbCdEfG_mock_${String(team.id).slice(0, 8)}`)
		setEditingDrive(false)
	}, [team?.id])

	if (!organization) return <>
		<header className="mb-9"><p className="mb-2.5 text-[11px] font-bold tracking-widest text-muted uppercase">Finance / Receipts management</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Receipts management</h1><p className="mt-3 text-[13px] leading-6 text-muted">Browse receipts by team in one shared workspace.</p></header>
		<OrganizationRequiredEmptyState onGoToOrganization={onGoToOrganization} />
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
						<div className="mb-4 flex items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><h2 className="font-display text-[18px] tracking-[-0.03em]">Team receipts</h2>{editingDrive ? (
										<div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue bg-white p-2 shadow-sm">
											<label className="grid gap-1 text-[11px] font-bold text-muted">Folder name<input className="h-8 w-36 rounded-md border border-line bg-paper px-2 text-[13px] font-normal text-ink outline-none focus:border-blue" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="My Drive Folder" /></label>
											<label className="grid gap-1 text-[11px] font-bold text-muted">Folder ID<input className="h-8 w-44 rounded-md border border-line bg-paper px-2 font-mono text-[12px] font-normal text-ink outline-none focus:border-blue" value={draftId} onChange={(e) => setDraftId(e.target.value)} placeholder="1AbCdEfG..." /></label>
											<button className={button.primary + " min-h-8 px-3 text-xs"} type="button" onClick={() => { setDriveName(draftName.trim() || driveName); setDriveId(draftId.trim() || driveId); setEditingDrive(false) }}>Save</button>
											<button className={button.secondary + " min-h-8 px-3 text-xs"} type="button" onClick={() => setEditingDrive(false)}>Cancel</button>
										</div>
									) : (
										<button type="button" onClick={() => { setDraftName(driveName); setDraftId(driveId); setEditingDrive(true) }} className="group flex max-w-full items-center gap-2 rounded-lg border border-dashed border-blue/30 bg-blue-soft/40 px-3 py-1.5 text-left transition hover:border-blue hover:bg-blue-soft focus-visible:outline-[3px] focus-visible:outline-blue-ring" aria-label="Edit Google Drive folder" title="Click to edit Google Drive folder">
											<span className="grid size-6 shrink-0 place-items-center rounded-md bg-white text-blue"><Icon name="folder" size={14} /></span>
											<span className="grid text-left leading-tight">
												<span className="flex items-center gap-1.5 text-xs font-bold text-blue"><Icon name="edit" size={12} /> Google Drive</span>
												<span className="truncate text-[12px] text-ink"><span className="font-semibold">{driveName || "No folder"}</span><span className="mx-1 text-muted">·</span><span className="font-mono text-[11px] text-muted">{driveId ? `${driveId.slice(0, 18)}${driveId.length > 18 ? "…" : ""}` : "no id"}</span></span>
											</span>
											<span className="hidden text-[11px] font-bold text-blue underline underline-offset-2 group-hover:inline md:inline">Click to edit</span>
										</button>
									)}</div><fieldset className="mt-2 w-fit max-w-full"><legend className="text-xs font-bold text-ink">Source</legend><div className="mt-1.5 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-line bg-white p-1"><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'all' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>All</button><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'google' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'google'} onClick={() => setSourceFilter('google')}>Google Drive</button><button className={`min-h-8 rounded-md px-2.5 text-xs font-bold transition ${sourceFilter === 'manual' ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`} type="button" aria-pressed={sourceFilter === 'manual'} onClick={() => setSourceFilter('manual')}>Local upload</button></div></fieldset><p className="mt-2 text-xs text-muted">{filteredReceipts.length} {filteredReceipts.length === 1 ? 'receipt' : 'receipts'}</p></div><button className={button.secondary} type="button"><Icon name="plus" size={15} /> Add receipt</button></div>
						{filteredReceipts.length ? <div className="grid grid-cols-2 gap-4 min-[700px]:grid-cols-3 min-[1050px]:grid-cols-5">{filteredReceipts.map((receipt) => <button className="group min-w-0 text-left focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" key={receipt.id} onClick={() => setPreview(receipt)}><div className="grid aspect-[1.15] place-items-center rounded-[14px] border border-line bg-white text-blue shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-blue group-hover:shadow-md"><Icon name="receipt" size={34} /></div><strong className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ink">{receipt.filename}</strong><span className="mt-1 block truncate text-xs text-muted">{receipt.date} · {formatMoney(receipt.amount)}</span></button>)}</div> : <div className="grid min-h-55 place-items-center rounded-[14px] border border-dashed border-line bg-white p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="folder" size={20} /></span><h3 className="mt-4 font-display text-[16px]">{(team?.receipts ?? []).length ? 'No matching receipts' : 'No receipts yet'}</h3><p className="mt-1 text-xs text-muted">{(team?.receipts ?? []).length ? 'Try another source filter.' : `Add the first receipt for ${team.name} to see it here.`}</p></div></div>}
					</section>
				</>
			) : <div className="grid min-h-80 place-items-center rounded-[14px] border border-line bg-white p-8 text-center"><div className="max-w-md"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-soft text-blue"><Icon name="users" size={24} /></span><h2 className="mt-5 font-display text-[20px] tracking-[-0.03em]">Create a team to manage receipts</h2><p className="mt-2 text-[13px] leading-6 text-muted">Receipts are organized by team. Add your first team in Team Management to get started.</p></div></div>}
			<ReceiptPreview receipt={preview} onClose={() => setPreview(null)} />
		</>
	)
}
