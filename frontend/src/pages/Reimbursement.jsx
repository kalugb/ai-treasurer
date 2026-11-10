import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { teamsAPI } from '../api/teams'
import { reimbursementAPI } from '../api/reimbursement'
import Modal from '../components/Modal'
import AddReimbursementModal from '../components/AddReimbursementModal'
import { button } from '../components/button'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'
import { useToast } from '../context/toast'

const card = 'min-h-37.5 rounded-[14px] border p-5.5 max-[820px]:min-h-auto max-[560px]:p-4'
const th = 'pb-3 pr-3 pl-0 text-left text-[10px] font-bold tracking-[0.06em] uppercase text-muted'
const td = 'border-t border-line py-3.25 pr-3 pl-0 text-muted'
const money = (n) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const EMPTY = { records: [], totals: { reimbursed: 0, notReimbursed: 0, reimbursedCount: 0, notReimbursedCount: 0 } }

export default function Reimbursement({ goTo }) {
	const organization = useSelectedOrganization()
	const { push } = useToast()
	const [data, setData] = useState(EMPTY)
	const [version, setVersion] = useState(0)
	const [editing, setEditing] = useState(null) // null = closed, {} = add, record = edit
	const [selecting, setSelecting] = useState(false)
	const [selectedIds, setSelectedIds] = useState(new Set())
	const [confirming, setConfirming] = useState(false)
	const [teams, setTeams] = useState([])
	const orgId = organization?.id
	const ownerId = organization?.ownerId

	useEffect(() => {
		if (!orgId) return
		teamsAPI.getTeams(orgId, ownerId)
			.then((res) => setTeams(Array.isArray(res) ? res : []))
			.catch(() => setTeams([]))
	}, [orgId, ownerId])

	useEffect(() => {
		if (!orgId) return
		reimbursementAPI.list(orgId, ownerId)
			.then(setData)
			.catch(() => { setData(EMPTY); push('Could not load reimbursements.', 'error') })
	}, [orgId, ownerId, version, push])

	const reload = () => setVersion((v) => v + 1)

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
				<button className={button.primary} type="button" onClick={() => setEditing({})}>
					<Icon name="plus" size={16} /> Add reimbursement
				</button>
			)}
		</header>
	)

	if (!organization) return <>{header}<OrganizationRequiredEmptyState onGoToOrganization={() => goTo('organization')} /></>

	const { records, totals } = data
	const allSelected = records.length > 0 && selectedIds.size === records.length
	const withMissing = records.filter((r) => r.receiptInvolved?.missingReceiptIds?.length > 0)
	const paidWithMissing = withMissing.filter((r) => r.status === 'Reimbursed')

	const toggle = (id) => setSelectedIds((prev) => {
		const next = new Set(prev)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		return next
	})
	const stopSelecting = () => { setSelecting(false); setSelectedIds(new Set()) }
	const confirmDelete = async () => {
		try {
			const { deleted } = await reimbursementAPI.remove(orgId, [...selectedIds], ownerId)
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
	const save = async (payload) => {
		if (editing?.id) await reimbursementAPI.update(editing.id, payload, ownerId)
		else await reimbursementAPI.create({ ...payload, orgId }, ownerId)
		push(editing?.id ? 'Reimbursement updated.' : 'Reimbursement added.', 'success')
		setEditing(null)
		reload()
	}

	return (
		<>
			{header}
			<section className="mb-3.5 grid grid-cols-2 gap-3.5 max-[820px]:grid-cols-1" aria-label="Reimbursement summary">
				<article className={`${card} border-blue bg-blue text-white`}>
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-white/72">Total reimbursed</span>
					<strong className="mb-4 block font-display text-[30px] tracking-tighter">{money(totals.reimbursed)}</strong>
					<span className="flex items-center gap-1.25 text-xs text-white/72"><Icon name="check" size={15} /> {totals.reimbursedCount} records paid out</span>
				</article>
				<article className={`${card} border-line bg-white`}>
					<span className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Yet to be reimbursed</span>
					<strong className="mb-4 block font-display text-[30px] tracking-tighter">{money(totals.notReimbursed)}</strong>
					<span className="flex items-center gap-1.25 text-xs text-muted"><Icon name="receipt" size={15} /> {totals.notReimbursedCount} records not reimbursed</span>
				</article>
			</section>

			{withMissing.length > 0 && (
				<section className="mb-3.5 rounded-[14px] border border-red-200 bg-red-50 p-4.5 text-red-900" role="alert" aria-label="Missing receipts">
					<p className="flex items-center gap-2 text-[13px] font-bold"><Icon name="insight" size={16} /> {withMissing.length} record{withMissing.length === 1 ? '' : 's'} reference{withMissing.length === 1 ? 's' : ''} receipts that no longer exist</p>
					<p className="mt-1.5 text-xs leading-[1.55]">
						A receipt was deleted, or removed from Google Drive by a sync.
						{paidWithMissing.length > 0 && ` ${paidWithMissing.length} of these ${paidWithMissing.length === 1 ? 'is' : 'are'} marked Reimbursed, so the proof of payment is gone.`}
					</p>
					<ul className="mt-2 list-disc pl-5 text-xs leading-[1.55]">
						{withMissing.map((r) => (
							<li key={r.id}><strong>{r.name}</strong> ({r.status}): {r.receiptInvolved.missingReceiptNames.join(', ')}</li>
						))}
					</ul>
				</section>
			)}

			<article className="rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
				<div className="mb-5 flex items-start justify-between gap-4.5 max-[560px]:flex-col">
					<div>
						<h2 className="font-display text-[17px] tracking-[-0.03em]">Reimbursement requests</h2>
						<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Records awaiting or already reimbursed</p>
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
								<th className={th}>Date</th><th className={th}>Name</th><th className={th}>Receipts</th><th className={th}>Team</th><th className={th}>Amount</th><th className={th}>Status</th>
								{!selecting && <th className={th}><span className="sr-only">Actions</span></th>}
							</tr>
						</thead>
						<tbody>
							{records.length ? records.map((r) => (
								<tr key={r.id} className={selecting ? 'cursor-pointer hover:bg-paper' : ''} onClick={selecting ? () => toggle(r.id) : undefined}>
									{selecting && (
										<td className={td}>
											<input type="checkbox" aria-label={`Select ${r.name}`} checked={selectedIds.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} />
										</td>
									)}
									<td className={td}>{r.date}</td>
									<td className={`${td} font-semibold text-ink`}>{r.name}</td>
									<td className={td} title={r.receiptInvolved?.receiptNames?.join(', ')}>
										{r.receiptInvolved?.receiptNames?.length ? `${r.receiptInvolved.receiptNames.length} receipt${r.receiptInvolved.receiptNames.length === 1 ? '' : 's'}` : '—'}
										{r.receiptInvolved?.missingReceiptIds?.length > 0 && (
											<span className="ml-2 inline-flex items-center gap-1 rounded-[20px] bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700" title={`No longer exists: ${r.receiptInvolved.missingReceiptNames.join(', ')}`}>
												<Icon name="insight" size={12} /> {r.receiptInvolved.missingReceiptIds.length} missing
											</span>
										)}
									</td>
									<td className={td}>{r.teamInvolved}</td>
									<td className={`${td} font-semibold text-ink`}>{money(r.amount)}</td>
									<td className={td}>
										{r.status === 'Reimbursed'
											? <span className="inline-flex rounded-[20px] bg-green-soft px-2 py-1.25 text-[10px] font-bold text-green">Reimbursed</span>
											: <span className="inline-flex rounded-[20px] bg-brown-soft px-2 py-1.25 text-[10px] font-bold text-brown">Not reimbursed</span>}
									</td>
									{!selecting && (
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

			{/* mounted only while open, so every open starts from fresh form state */}
			{editing !== null && (
				<AddReimbursementModal
					initial={editing.id ? editing : null}
					teams={teams}
					onClose={() => setEditing(null)}
					onSave={save}
				/>
			)}

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
