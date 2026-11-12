import { useState } from 'react'
import Icon from './Icon'
import ReceiptEditor from './ReceiptEditor'
import { button } from './button'
import { isUnset } from '../api/receipts'

// Steps through the receipts that had no amount when the modal opened (mount it only while open).
// Everything is optional: Skip, or Save with a blank amount, just moves on; the receipt stays unset.
// onSave(fileId, patch) must throw on failure.
export default function SetAmountsModal({ receipts, onClose, onSave }) {
	const [ids] = useState(() => receipts.filter(isUnset).map((r) => r.id))
	const [pos, setPos] = useState(0)
	const queue = ids.map((id) => receipts.find((r) => r.id === id)).filter(Boolean) // a receipt removed by a sync drops out
	const current = queue[pos]
	const remaining = queue.slice(pos).filter(isUnset).length
	const stillUnset = queue.filter(isUnset).length
	const next = () => setPos((p) => p + 1)

	const save = async (patch) => {
		// nothing filled in: same as Skip, and avoids an empty PATCH
		if (patch.receiptAmount == null && !patch.label && !patch.description) { next(); return }
		await onSave(current.googleDriveFileId, patch)
		next()
	}

	return (
		<div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<div className="flex max-h-[92vh] w-[min(100%,1100px)] flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="set-amounts-title">
				<div className="flex items-start justify-between gap-4 border-b border-line p-5">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">Set missing amounts</p><h2 id="set-amounts-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{current ? (current.label || current.filename) : 'All done'}</h2></div>
					<div className="flex items-center gap-3"><span className="text-xs font-bold text-muted">{current ? `${remaining} remaining` : ''}</span><button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button></div>
				</div>
				{current ? (
					<ReceiptEditor key={current.id} receipt={current} onSave={save} submitLabel="Save & next" actions={<button className={button.secondary} type="button" onClick={next}>Skip</button>} />
				) : (
					<div className="grid min-h-60 place-items-center p-8 text-center"><div><span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="check" size={20} /></span><p className="mt-4 text-[13px] text-muted">{queue.length - stillUnset} of {queue.length} set{stillUnset ? `, ${stillUnset} still without an amount` : ''}.</p><button className={`${button.primary} mt-4`} type="button" onClick={onClose}>Close</button></div></div>
				)}
			</div>
		</div>
	)
}
