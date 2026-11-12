import { useState } from 'react'
import Icon from './Icon'
import Modal from './Modal'
import ReceiptEditor from './ReceiptEditor'
import { button } from './button'
import { isUnset } from '../api/receipts'

// Steps through the receipts that had no amount when the modal opened (mount it only while open).
// Everything is optional: Skip, or Save with a blank amount, just moves on; the receipt stays unset.
// onSave(fileId, patch) must throw on failure. onFillAll(receipts) starts the background AI run
// (the modal closes, the run lives in BulkScanProvider); onCancelRun() stops it.
export default function SetAmountsModal({ receipts, onClose, onSave, onScan, running, onFillAll, onCancelRun }) {
	const [ids] = useState(() => receipts.filter(isUnset).map((r) => r.id))
	const [pos, setPos] = useState(0)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const queue = ids.map((id) => receipts.find((r) => r.id === id)).filter(Boolean) // a receipt removed by a sync drops out
	const current = queue[pos]
	const remaining = queue.slice(pos).filter(isUnset).length
	const stillUnset = queue.filter(isUnset).length
	const unsetNow = receipts.filter(isUnset)
	const next = () => setPos((p) => p + 1)

	const save = async (patch) => {
		// nothing filled in: same as Skip, and avoids an empty PATCH
		if (patch.receiptAmount == null && !patch.label && !patch.description) { next(); return }
		await onSave(current.googleDriveFileId, patch)
		next()
	}

	const startFillAll = () => {
		setConfirmOpen(false)
		onFillAll(unsetNow)
		onClose()
	}

	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div className="flex max-h-[92vh] w-[min(100%,1100px)] flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="set-amounts-title">
				<div className="flex items-start justify-between gap-4 border-b border-line p-5">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">Set missing amounts</p><h2 id="set-amounts-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{current ? (current.label || current.filename) : 'All done'}</h2></div>
					<div className="flex flex-col items-end gap-2">
						<div className="flex items-center gap-3"><span className="text-xs font-bold text-muted">{current ? `${remaining} remaining` : ''}</span><button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button></div>
						{running
							? <button className={button.danger} type="button" onClick={onCancelRun}><Icon name="close" size={15} /> Cancel AI run</button>
							: unsetNow.length > 0 && <button className={button.secondary} type="button" onClick={() => setConfirmOpen(true)} title="Scan every receipt without an amount with AI, in the background"><Icon name="receipt" size={15} /> Fill all with AI</button>}
					</div>
				</div>
				{current ? (
					<ReceiptEditor key={current.id} receipt={current} onSave={save} onScan={() => onScan(current.googleDriveFileId)} submitLabel="Save & next" actions={<button className={button.secondary} type="button" onClick={next}>Skip</button>} />
				) : (
					<div className="grid min-h-60 place-items-center p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="check" size={20} /></span><p className="mt-4 text-[13px] text-muted">{queue.length - stillUnset} of {queue.length} set{stillUnset ? `, ${stillUnset} still without an amount` : ''}.</p><button className={`${button.primary} mt-4`} type="button" onClick={onClose}>Close</button></div></div>
				)}
			</div>
			<Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={`Fill ${unsetNow.length} receipt${unsetNow.length === 1 ? '' : 's'} with AI?`} footer={
				<>
					<button className={button.secondary} type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
					<button className={button.primary} type="button" onClick={startFillAll}><Icon name="receipt" size={15} /> Start AI fill</button>
				</>
			}>
				<p className="text-[13px] leading-6 text-muted">The AI will read each receipt one at a time in the background and save the amount, label and notes it finds, only into empty fields. You can keep using the app and cancel at any time.</p>
				<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800" role="alert">
					<strong className="flex items-center gap-1.5"><Icon name="insight" size={14} /> The AI is not 100% accurate</strong>
					<p className="mt-1">Amounts and names can be misread, especially on blurry or vague receipts. Results are saved automatically, so a human must review them afterwards.</p>
				</div>
				<p className="mt-3 text-xs leading-5 text-muted"><strong className="text-ink">Do not reload or close this page while it runs.</strong> That interrupts the run; receipts already saved stay saved, the rest stay unset.</p>
			</Modal>
		</div>
	)
}
