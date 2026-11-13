import { useEffect, useState } from 'react'
import Icon from './Icon'
import Modal from './Modal'
import AddCashInModal from './AddCashInModal'
import ZoomableImage from './ZoomableImage'
import { button } from './button'
import { cashInAPI } from '../api/cashin'
import { API_BASE_URL } from '../api/client'
import { useToast } from '../context/toast'
import { useSnapshotMode } from '../context/snapshotMode'

const card = 'min-h-37.5 rounded-[14px] border p-5.5 max-[820px]:min-h-auto max-[560px]:p-4'
const th = 'pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted'
const td = 'border-t border-line py-3.25 pr-3 pl-0 text-muted'
const money = (n) => `RM${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const EMPTY = { records: [], total: 0, count: 0 }

export default function CashInSection({ orgId, ownerId }) {
	const { push } = useToast()
	const { readOnly } = useSnapshotMode()
	const [data, setData] = useState(EMPTY)
	const [version, setVersion] = useState(0)
	const [editing, setEditing] = useState(null) // null = closed, {} = add, record = edit
	const [selecting, setSelecting] = useState(false)
	const [selectedIds, setSelectedIds] = useState(new Set())
	const [confirming, setConfirming] = useState(false)
	const [viewing, setViewing] = useState(null) // record whose proof image is open in the in-page viewer

	useEffect(() => {
		if (!viewing) return
		const onKey = (event) => { if (event.key === 'Escape') setViewing(null) }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [viewing])
	useEffect(() => {
		cashInAPI.list(orgId, ownerId)
			.then(setData)
			.catch(() => { setData(EMPTY); push('Could not load cash in records.', 'error') })
	}, [orgId, ownerId, version, push])

	const reload = () => setVersion((v) => v + 1)
	const { records, total, count } = data
	const [search, setSearch] = useState('')
	const [dateOrder, setDateOrder] = useState('desc')
	const q = search.trim().toLowerCase()
	const visible = records
		.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.source ?? '').toLowerCase().includes(q))
		.sort((a, b) => dateOrder === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date))
	const allSelected = visible.length > 0 && visible.every((r) => selectedIds.has(r.id))

	const toggle = (id) => setSelectedIds((prev) => {
		const next = new Set(prev)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		return next
	})
	const stopSelecting = () => { setSelecting(false); setSelectedIds(new Set()) }
	const confirmDelete = async () => {
		try {
			const { deleted } = await cashInAPI.remove(orgId, [...selectedIds], ownerId)
			push(`Deleted ${deleted} record${deleted === 1 ? '' : 's'}.`, 'success')
			stopSelecting()
			reload()
		} catch {
			push('Delete failed.', 'error')
		} finally {
			setConfirming(false)
		}
	}
	// throws on failure so the modal stays open and shows the error
	const save = async (formData) => {
		if (editing?.id) await cashInAPI.update(editing.id, formData, ownerId)
		else {
			formData.append('orgId', orgId)
			await cashInAPI.create(formData, ownerId)
		}
		push(editing?.id ? 'Cash in updated.' : 'Cash in added.', 'success')
		setEditing(null)
		reload()
	}

	return (
		<>
			<section className="mb-3.5 grid grid-cols-1 gap-3.5" aria-label="Cash in summary">
				<article className={`${card} border-green bg-green-soft text-green`}>
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase">Total cash in</span>
					<strong className="mb-4 block font-display text-[30px] tracking-tighter">{money(total)}</strong>
					<span className="flex items-center gap-1.25 text-xs"><Icon name="check" size={15} /> {count} record{count === 1 ? '' : 's'} received</span>
				</article>
			</section>

			<article className="rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
				<div className="mb-5 flex items-start justify-between gap-4.5 max-[560px]:flex-col">
					<div>
						<h2 className="font-display text-[17px] tracking-[-0.03em]">Cash in</h2>
						<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Money received, with its source and proof</p>
					</div>
					{!readOnly && (selecting ? (
						<div className="flex gap-2">
							<button className={button.danger} type="button" disabled={!selectedIds.size} onClick={() => setConfirming(true)}>
								<Icon name="trash" size={16} /> Delete ({selectedIds.size})
							</button>
							<button className={button.secondary} type="button" onClick={stopSelecting}>Cancel</button>
						</div>
					) : (
						<div className="flex gap-2">
							{records.length > 0 && (
								<button className={button.secondary} type="button" onClick={() => setSelecting(true)}>
									<Icon name="trash" size={16} /> Select for deletion
								</button>
							)}
							<button className={button.primary} type="button" onClick={() => setEditing({})}>
								<Icon name="plus" size={16} /> Add cash in
							</button>
						</div>
					))}
				</div>
				<div className="mb-4 flex flex-wrap items-end gap-3">
					<label className="grid gap-1.5 text-xs font-bold text-ink">Search
						<input className="h-9 w-56 rounded-lg border border-line bg-white px-3 text-[12px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" type="search" placeholder="Search by name or source" value={search} onChange={(event) => setSearch(event.target.value)} />
					</label>
					<label className="grid gap-1.5 text-xs font-bold text-ink">Sort by time
						<select className="h-9 rounded-lg border border-line bg-white px-2 text-[12px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={dateOrder} onChange={(event) => setDateOrder(event.target.value)}>
							<option value="desc">Newest first</option>
							<option value="asc">Oldest first</option>
						</select>
					</label>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-xs whitespace-nowrap">
						<thead>
							<tr>
								{selecting && (
									<th className={`${th} w-8`}>
										<input type="checkbox" aria-label="Select all records" checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(visible.map((r) => r.id)))} />
									</th>
								)}
								<th className={th}>Date</th><th className={th}>Name</th><th className={th}>Source</th><th className={th}>Proof</th><th className={th}>Amount</th>
								{!selecting && !readOnly && <th className={th}><span className="sr-only">Actions</span></th>}
							</tr>
						</thead>
						<tbody>
							{visible.length ? visible.map((r) => (
								<tr key={r.id} className={selecting ? 'cursor-pointer hover:bg-paper' : ''} onClick={selecting ? () => toggle(r.id) : undefined}>
									{selecting && (
										<td className={td}>
											<input type="checkbox" aria-label={`Select ${r.name}`} checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} />
										</td>
									)}
									<td className={td}>{r.date}</td>
									<td className={`${td} font-semibold text-ink`}>{r.name}</td>
									<td className={td}>{r.source}</td>
									<td className={td}>
										{r.imageUrl
											? <button className="block rounded-md focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={(e) => { e.stopPropagation(); setViewing(r) }} aria-label={`View proof image for ${r.name}`}>
												<img src={`${API_BASE_URL}${r.imageUrl}`} alt="" loading="lazy" className="size-9 rounded-md border border-line object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
											</button>
											: '—'}
									</td>
									<td className={`${td} font-semibold text-green`}>{money(r.amount)}</td>
									{!selecting && !readOnly && (
										<td className={`${td} text-right`}>
											<button className="border-0 bg-transparent p-0 text-xs font-bold text-blue" type="button" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}>Edit</button>
										</td>
									)}
								</tr>
							)) : (
								<tr>
									<td className="border-t border-line p-0" colSpan="7">
										<div className="grid min-h-48 place-items-center p-8 text-center">
											<div>
												<span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="plus" size={20} /></span>
												<h3 className="mt-4 font-display text-[16px]">{records.length ? 'No matching records' : 'No cash in yet'}</h3>
												<p className="mt-1 text-xs text-muted">{records.length ? 'Try another search.' : 'Add a cash in record to start tracking money received.'}</p>
											</div>
										</div>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</article>

			{/* mounted only while open, so every open starts from fresh form state */}
			{editing !== null && <AddCashInModal initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSave={save} />}

			{viewing && (
				<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-5" role="dialog" aria-modal="true" aria-label={`Proof image for ${viewing.name}`} onMouseDown={(e) => { if (e.target === e.currentTarget) setViewing(null) }}>
					<div className="flex max-h-full w-[min(100%,900px)] flex-col rounded-[14px] bg-white p-4 shadow-xl">
						<div className="mb-3 flex items-center justify-between gap-4">
							<strong className="truncate text-[13px] text-ink">{viewing.name} · {viewing.source}</strong>
							<button className="border-0 bg-transparent p-0 text-xs font-bold text-blue" type="button" autoFocus onClick={() => setViewing(null)}>Close</button>
						</div>
						<ZoomableImage key={viewing.id} src={`${API_BASE_URL}${viewing.imageUrl}`} alt={`Proof of cash in: ${viewing.name}`} className="h-[72vh] w-full rounded-[7px] bg-paper" />
					</div>
				</div>
			)}

			<Modal
				isOpen={confirming}
				onClose={() => setConfirming(false)}
				title="Delete cash in records?"
				footer={<>
					<button className={button.secondary} type="button" onClick={() => setConfirming(false)}>Cancel</button>
					<button className={button.danger} type="button" onClick={confirmDelete}><Icon name="trash" size={16} /> Delete {selectedIds.size}</button>
				</>}
			>
				<p className="text-[13px] leading-[1.55] text-muted">
					{selectedIds.size} record{selectedIds.size === 1 ? '' : 's'} and their proof images will be permanently removed. This cannot be undone.
				</p>
			</Modal>
		</>
	)
}
