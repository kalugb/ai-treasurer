import { useEffect, useState } from 'react'
import Icon from './Icon'
import { button } from './button'
import { fetchReceipts } from '../api/receipts'

const formatMoney = (amount) => `$${(amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pill = (active) => `min-h-8 rounded-md px-2.5 text-xs font-bold transition ${active ? 'bg-blue text-white' : 'text-muted hover:bg-blue-soft hover:text-blue'}`
const SOURCES = [['all', 'All'], ['google', 'Google Drive'], ['manual', 'Local upload']]

// Multi-select receipt grid for one team (same filters/tiles as Receipts management).
// Returns receipt NAMES only; names that no longer exist in the team are kept as-is.
export default function ReceiptPickerModal({ teamId, selectedNames = [], onClose, onConfirm }) {
	const [receipts, setReceipts] = useState(null) // null = loading
	const [failed, setFailed] = useState(false)
	const [picked, setPicked] = useState(() => new Set(selectedNames))
	const [sourceFilter, setSourceFilter] = useState('all')
	const [dateOrder, setDateOrder] = useState('desc')

	useEffect(() => {
		fetchReceipts(teamId)
			.then(setReceipts)
			.catch(() => { setReceipts([]); setFailed(true) })
	}, [teamId])

	const list = receipts ?? []
	const visible = list
		.filter((r) => sourceFilter === 'all' || r.source === sourceFilter)
		.sort((a, b) => {
			const aDate = a.date === '—' ? '' : a.date
			const bDate = b.date === '—' ? '' : b.date
			if (!aDate || !bDate) return aDate ? -1 : bDate ? 1 : 0
			return dateOrder === 'asc' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate)
		})
	const toggle = (name) => setPicked((prev) => {
		const next = new Set(prev)
		if (next.has(name)) next.delete(name)
		else next.add(name)
		return next
	})
	const confirm = () => onConfirm([...picked], list.filter((r) => picked.has(r.filename)))

	return (
		<div
			className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/35%)] p-5"
			role="presentation"
			onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
		>
			<div className="flex max-h-[88vh] w-[min(100%,960px)] flex-col rounded-[14px] border border-line bg-white shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="receipt-picker-title">
				<div className="flex items-start justify-between gap-4 border-b border-line p-5">
					<div>
						<h2 id="receipt-picker-title" className="font-display text-[17px] tracking-[-0.03em]">Select receipts involved</h2>
						<div className="mt-2 flex flex-wrap items-end gap-4">
							<fieldset className="w-fit max-w-full">
								<legend className="text-xs font-bold text-ink">Source</legend>
								<div className="mt-1.5 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
									{SOURCES.map(([value, label]) => (
										<button key={value} className={pill(sourceFilter === value)} type="button" aria-pressed={sourceFilter === value} onClick={() => setSourceFilter(value)}>{label}</button>
									))}
								</div>
							</fieldset>
							<label className="grid gap-1.5 text-xs font-bold text-ink">
								Sort by date
								<select className="h-9 rounded-lg border border-line bg-white px-2 text-[12px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={dateOrder} onChange={(event) => setDateOrder(event.target.value)}>
									<option value="desc">Newest first</option>
									<option value="asc">Oldest first</option>
								</select>
							</label>
						</div>
												<div className="mt-2 flex items-center gap-3 text-xs">
							<span className="text-muted">{visible.length} {visible.length === 1 ? 'receipt' : 'receipts'} · {picked.size} selected</span>
							{visible.length > 0 && (
								<button
									className="font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring"
									type="button"
									onClick={() => setPicked((prev) => {
										const next = new Set(prev)
										const allVisible = visible.every((r) => next.has(r.filename))
										for (const r of visible) {
											if (allVisible) next.delete(r.filename)
											else next.add(r.filename)
										}
										return next
									})}
								>
									{visible.every((r) => picked.has(r.filename)) ? 'Clear selection' : 'Select all'}
								</button>
							)}
						</div>
					</div>
					<button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button>
				</div>

				<div className="min-h-55 flex-1 overflow-y-auto p-5">
					{receipts === null ? (
						<div className="grid min-h-55 place-items-center text-blue"><Icon name="spinner" size={28} /></div>
					) : visible.length ? (
						<div className="grid grid-cols-2 gap-4 min-[700px]:grid-cols-3 min-[900px]:grid-cols-4">
							{visible.map((receipt) => {
								const isSelected = picked.has(receipt.filename)
								return (
									<button className="group min-w-0 text-left focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" key={receipt.id} aria-pressed={isSelected} aria-label={`${receipt.filename}, ${formatMoney(receipt.amount)}`} onClick={() => toggle(receipt.filename)}>
										<div className={`relative grid aspect-[1.15] place-items-center overflow-hidden rounded-[14px] border bg-white text-blue shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md ${isSelected ? 'border-blue ring-[3px] ring-blue-ring' : 'border-line group-hover:border-blue'}`}>
											<Icon name="receipt" size={34} />
											{receipt.thumbnail && <img src={receipt.thumbnail} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none' }} />}
											<span className={`absolute top-2 right-2 grid size-6 place-items-center rounded-md border text-white ${isSelected ? 'border-blue bg-blue' : 'border-line bg-white/80'}`}>{isSelected && <Icon name="check" size={14} />}</span>
										</div>
										<strong className="mt-3 block overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ink">{receipt.filename}</strong>
										<span className="mt-1 block truncate text-xs text-muted">{receipt.date} · {formatMoney(receipt.amount)}</span>
									</button>
								)
							})}
						</div>
					) : (
						<div className="grid min-h-55 place-items-center rounded-[14px] border border-dashed border-line p-8 text-center">
							<div>
								<span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="folder" size={20} /></span>
								<h3 className="mt-4 font-display text-[16px]">{failed ? 'Could not load receipts' : list.length ? 'No matching receipts' : 'No receipts for this team'}</h3>
								<p className="mt-1 text-xs text-muted">{failed ? 'Close and try again.' : list.length ? 'Try another source filter.' : 'Add receipts in Receipts management first.'}</p>
							</div>
						</div>
					)}
				</div>

				<div className="flex justify-end gap-2 border-t border-line p-4">
					<button className={button.secondary} type="button" onClick={onClose}>Cancel</button>
					<button className={button.primary} type="button" onClick={confirm}><Icon name="check" size={16} /> Use {picked.size} receipt{picked.size === 1 ? '' : 's'}</button>
				</div>
			</div>
		</div>
	)
}
