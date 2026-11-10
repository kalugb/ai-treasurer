import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { teamsAPI } from '../api/teams'
import Modal from '../components/Modal'
import AddReimbursementModal from '../components/AddReimbursementModal'
import { button } from '../components/button'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'

// shortcut: records live in component state only (lost on reload), replace with a reimbursement API when the backend exists.
const card = 'min-h-37.5 rounded-[14px] border p-5.5 max-[820px]:min-h-auto max-[560px]:p-4'
const th = 'pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted'
const td = 'border-t border-line py-3.25 pr-3 pl-0 text-muted'
const money = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function Reimbursement({ goTo }) {
	const organization = useSelectedOrganization()
	const [records, setRecords] = useState([])
	const [adding, setAdding] = useState(false)
	const [selecting, setSelecting] = useState(false)
	const [selectedIds, setSelectedIds] = useState(new Set())
	const [confirming, setConfirming] = useState(false)
	const [teams, setTeams] = useState([])

	useEffect(() => {
		if (!organization?.id) return
		teamsAPI.getTeams(organization.id, organization.ownerId)
			.then((res) => setTeams(Array.isArray(res) ? res : []))
			.catch(() => setTeams([]))
	}, [organization?.id, organization?.ownerId])

	const header = (
		<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
			<div>
				<p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Finance / Reimbursement</p>
				<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Reimbursement</h1>
				<p className="mt-3 text-[13px] leading-[1.55] text-muted">
					{organization ? `Reimbursement status for ${organization.orgName ?? organization.name}.` : 'Reimbursement totals appear after you choose an organization.'}
				</p>
			</div>
			{organization && !selecting && (
				<button className={button.primary} type="button" onClick={() => setAdding(true)}>
					<Icon name="plus" size={16} /> Add reimbursement
				</button>
			)}
		</header>
	)

	if (!organization) return <>{header}<OrganizationRequiredEmptyState onGoToOrganization={() => goTo('organization')} /></>

	const paid = records.filter((r) => r.status === 'reimbursed')
	const pending = records.filter((r) => r.status !== 'reimbursed')
	const sum = (list) => list.reduce((s, r) => s + r.amount, 0)
	const allSelected = records.length > 0 && selectedIds.size === records.length

	const toggle = (id) => setSelectedIds((prev) => {
		const next = new Set(prev)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		return next
	})
	const stopSelecting = () => { setSelecting(false); setSelectedIds(new Set()) }
	const confirmDelete = () => {
		setRecords((list) => list.filter((r) => !selectedIds.has(r.id)))
		setConfirming(false)
		stopSelecting()
	}

	return (
		<>
			{header}
			<section className="mb-3.5 grid grid-cols-2 gap-3.5 max-[820px]:grid-cols-1" aria-label="Reimbursement summary">
				<article className={`${card} border-blue bg-blue text-white`}>
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-white/72">Total reimbursed</span>
					<strong className="mb-4 block font-display text-[30px] tracking-tighter">{money(sum(paid))}</strong>
					<span className="flex items-center gap-1.25 text-xs text-white/72"><Icon name="check" size={15} /> {paid.length} receipts paid out</span>
				</article>
				<article className={`${card} border-line bg-white`}>
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Yet to be reimbursed</span>
					<strong className="mb-4 block font-display text-[30px] tracking-tighter">{money(sum(pending))}</strong>
					<span className="flex items-center gap-1.25 text-xs text-muted"><Icon name="receipt" size={15} /> {pending.length} receipts pending</span>
				</article>
			</section>

			<article className="rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
				<div className="mb-5 flex items-start justify-between gap-4.5 max-[560px]:flex-col">
					<div>
						<h2 className="font-display text-[17px] tracking-[-0.03em]">Reimbursement requests</h2>
						<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Receipts awaiting or already reimbursed</p>
					</div>
					{selecting ? (
						<div className="flex gap-2">
							<button className={button.danger} type="button" disabled={!selectedIds.size} onClick={() => setConfirming(true)}>
								<Icon name="trash" size={16} /> Delete ({selectedIds.size})
							</button>
							<button className={button.secondary} type="button" onClick={stopSelecting}>Cancel</button>
						</div>
					) : records.length > 0 && (
						<button className={button.secondary} type="button" onClick={() => setSelecting(true)}>
							<Icon name="trash" size={16} /> Select for deletion
						</button>
					)}
				</div>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse text-xs whitespace-nowrap">
						<thead>
							<tr>
								{selecting && (
									<th className={`${th} w-8`}>
										<input type="checkbox" aria-label="Select all records" checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(records.map((r) => r.id)))} />
									</th>
								)}
								<th className={th}>Date</th><th className={th}>Receipt</th><th className={th}>Team</th><th className={th}>Amount</th><th className={th}>Status</th>
							</tr>
						</thead>
						<tbody>
							{records.length ? records.map((r) => (
								<tr key={r.id} className={selecting ? 'cursor-pointer hover:bg-paper' : ''} onClick={selecting ? () => toggle(r.id) : undefined}>
									{selecting && (
										<td className={td}>
											<input type="checkbox" aria-label={`Select ${r.receiptName}`} checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} />
										</td>
									)}
									<td className={td}>{r.date}</td>
									<td className={`${td} font-semibold text-ink`}>{r.receiptName}</td>
									<td className={td}>{r.team}</td>
									<td className={`${td} font-semibold text-ink`}>{money(r.amount)}</td>
									<td className={td}>
										{r.status === 'reimbursed'
											? <span className="inline-flex rounded-[20px] bg-green-soft px-2 py-1.25 text-[10px] font-bold text-green">Reimbursed</span>
											: <span className="inline-flex rounded-[20px] bg-brown-soft px-2 py-1.25 text-[10px] font-bold text-brown">Pending</span>}
									</td>
								</tr>
							)) : (
								<tr>
									<td className="border-t border-line p-0" colSpan="5">
										<div className="grid min-h-48 place-items-center p-8 text-center">
											<div>
												<span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="sync" size={20} /></span>
												<h3 className="mt-4 font-display text-[16px]">No reimbursements yet</h3>
												<p className="mt-1 text-xs text-muted">Add a reimbursement record to start tracking.</p>
											</div>
										</div>
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</article>

			<AddReimbursementModal
				open={adding}
				teams={teams}
				onClose={() => setAdding(false)}
				onAdd={(record) => {
					setRecords((list) => [{ ...record, id: crypto.randomUUID() }, ...list])
					setAdding(false)
				}}
			/>

			<Modal
				isOpen={confirming}
				onClose={() => setConfirming(false)}
				title="Delete reimbursement records?"
				footer={<>
					<button className={button.secondary} type="button" onClick={() => setConfirming(false)}>Cancel</button>
					<button className={button.danger} type="button" onClick={confirmDelete}><Icon name="trash" size={16} /> Delete {selectedIds.size}</button>
				</>}
			>
				<p className="text-[13px] leading-[1.55] text-muted">
					{selectedIds.size} record{selectedIds.size === 1 ? '' : 's'} will be permanently removed. This cannot be undone.
				</p>
			</Modal>
		</>
	)
}
