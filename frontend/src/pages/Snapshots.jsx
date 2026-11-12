import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import { button } from '../components/button'
import { OrganizationRequiredEmptyState } from '../components/OrganizationContext'
import { snapshotsAPI, errorDetail } from '../api/snapshots'
import { useSelectedOrganization } from '../hooks/useSelectedOrganization'
import { useToast } from '../context/toast'
import { useSnapshotMode } from '../context/snapshotMode'

const money = (n) => `$${(n ?? 0).toFixed(2)}`
const when = (iso) => (iso ? new Date(iso).toLocaleString() : '')
const rowBtn = 'rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold hover:border-blue hover:bg-blue-soft text-blue'

export default function Snapshots({ goTo, onView }) {
	const organization = useSelectedOrganization()
	const { push } = useToast()
	const { readOnly, snapshot: viewing } = useSnapshotMode()
	const [opening, setOpening] = useState(null)
	const view = async (id) => {
		setOpening(id)
		try { await onView(id) } catch (e) { push(errorDetail(e, 'Could not open the snapshot.'), 'error') } finally { setOpening(null) }
	}
	const orgId = organization?.id
	const ownerId = organization?.ownerId
	const [loaded, setLoaded] = useState({ orgId: null, items: [] })  // keyed by org so another org's list is never shown
	const snapshots = loaded.orgId === orgId ? loaded.items : []
	const loading = !!orgId && loaded.orgId !== orgId
	const [creating, setCreating] = useState(false)
	const [name, setName] = useState('')
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')
	const [deleting, setDeleting] = useState(null)

	const load = useCallback(() => {
		if (!orgId) return
		snapshotsAPI.list(orgId, ownerId)
			.then((items) => setLoaded({ orgId, items }))
			.catch((e) => { setLoaded({ orgId, items: [] }); push(errorDetail(e, 'Could not load snapshots.'), 'error') })
	}, [orgId, ownerId, push])

	useEffect(() => { load() }, [load])

	const openCreate = () => { setName(''); setError(''); setCreating(true) }

	const create = async () => {
		setBusy(true); setError('')
		try {
			await snapshotsAPI.create(orgId, name, ownerId)
			setCreating(false)
			push('Snapshot saved', 'success')
			load()
		} catch (e) {
			setError(errorDetail(e, 'Could not create the snapshot.'))
		} finally {
			setBusy(false)
		}
	}

	const confirmDelete = async () => {
		setBusy(true)
		try {
			await snapshotsAPI.remove(deleting.id, orgId, ownerId)
			setDeleting(null)
			push('Snapshot deleted', 'success')
			load()
		} catch (e) {
			push(errorDetail(e, 'Could not delete the snapshot.'), 'error')
		} finally {
			setBusy(false)
		}
	}

	return (
		<>
			<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div>
					<p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Snapshots / Management</p>
					<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Snapshot management.</h1>
					<p className="mt-3 text-[13px] leading-[1.55] text-muted">Save the state of your organization's teams, receipts, reimbursements and cash in, then view the whole app as it was (read-only).</p>
				</div>
				{orgId && !readOnly && <button className={button.primary} onClick={openCreate}><Icon name="plus" size={16} /> Create snapshot</button>}
			</header>

			{!orgId ? <OrganizationRequiredEmptyState onGoToOrganization={() => goTo('organization')} /> : (
				<section className="min-h-90 rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
					<div className="mb-5 flex items-start justify-between gap-4.5">
						<div>
							<h2 className="font-display text-[17px] tracking-[-0.03em]">History</h2>
							<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Snapshots are never taken automatically and cannot be edited.</p>
						</div>
						<span className="rounded-[20px] bg-blue-soft px-2.25 py-1.5 text-[11px] font-bold text-blue">{snapshots.length} snapshots</span>
					</div>

					{loading && snapshots.length === 0 ? (
						<p className="py-10 text-center text-[13px] text-muted">Loading…</p>
					) : snapshots.length === 0 ? (
						<div className="grid justify-items-center px-6 pt-14.5 pb-11.5 text-center">
							<span className="mb-4 grid size-12 place-items-center rounded-[14px] bg-blue-soft text-blue"><Icon name="snapshot" size={22} /></span>
							<h3 className="font-display text-[17px]">No snapshots yet</h3>
							<p className="mb-5 mt-2 max-w-90 text-[13px] leading-normal text-muted">Create a snapshot to save the current state of this organization.</p>
							{!readOnly && <button className={button.primary} onClick={openCreate}><Icon name="plus" size={16} /> Create snapshot</button>}
						</div>
					) : (
						<div className="grid">
							{snapshots.map((s) => (
								<div className="flex flex-wrap items-center gap-3 border-t border-line py-4" key={s.id}>
									<span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="snapshot" size={16} /></span>
									<span className="grid min-w-0 flex-1 gap-1.25">
										<strong className="truncate">{s.name}</strong>
										<small className="text-xs text-muted">{when(s.snapshotTime)}</small>
										<small className="text-[11px] text-muted">{s.teamCount} teams · {s.receiptCount} receipts · {s.recordCount} reimbursements · {money(s.totalAmount)} total · {money(s.reimbursedAmount)} reimbursed · {s.cashInCount ?? 0} cash in ({money(s.cashInAmount)})</small>
									</span>
									<span className="flex items-center gap-2">
										{viewing?.id === s.id
											? <span className="rounded-[20px] bg-blue-soft px-2.25 py-1.25 text-[10px] font-bold text-blue">Viewing</span>
											: <button className={rowBtn} onClick={() => view(s.id)} disabled={opening !== null}>{opening === s.id ? 'Opening…' : 'View'}</button>}
										{!readOnly && <button className="rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold text-brown hover:border-brown hover:bg-brown-soft" onClick={() => setDeleting(s)}>Delete</button>}
									</span>
								</div>
							))}
						</div>
					)}
				</section>
			)}

			<Modal
				isOpen={creating}
				onClose={() => !busy && setCreating(false)}
				title="Create snapshot"
				footer={<>
					<button className={button.quiet} onClick={() => setCreating(false)} disabled={busy}>Cancel</button>
					<button className={button.primary} onClick={create} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save snapshot'}</button>
				</>}
			>
				<p className="mb-4 text-[13px] text-muted">Saves a copy of {organization?.orgName ?? 'this organization'}'s teams, receipts, reimbursements and cash in exactly as they are right now.</p>
				<label className="grid gap-1.75 text-xs font-bold text-ink">Snapshot name
					<input
						className="h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]"
						value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && name.trim() && !busy && create()}
					/>
				</label>
				{error && <p role="alert" className="mt-3 text-[13px] text-red">{error}</p>}
			</Modal>

			<Modal
				isOpen={!!deleting}
				onClose={() => !busy && setDeleting(null)}
				title="Delete snapshot?"
				footer={<>
					<button className={button.quiet} onClick={() => setDeleting(null)} disabled={busy}>Cancel</button>
					<button className={button.danger} onClick={confirmDelete} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
				</>}
			>
				<p className="text-[13px] text-muted">"{deleting?.name}" will be permanently deleted. Your live teams and receipts are not affected.</p>
			</Modal>
		</>
	)
}
