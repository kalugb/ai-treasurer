import { useState } from 'react'
import Icon from './Icon'
import ZoomableImage from './ZoomableImage'
import { button } from './button'

// Image (zoom/pan) on the left, receipt details + Amount/Label/Notes form on the right.
// Shared by the receipt preview and the "set missing amounts" modal.
// onSave(patch) must throw on failure; the error is shown under the form.
// The form is seeded from the receipt once: callers must pass key={receipt.id} to reset it for another receipt.
export default function ReceiptEditor({ receipt, readOnly, onSave, onScan, actions, notice, submitLabel = 'Save details', readOnlyLabel = 'Details (snapshot, read-only)', children }) {
	const [loadedSrc, setLoadedSrc] = useState(null)
	const [errorSrc, setErrorSrc] = useState(null)
	const [amount, setAmount] = useState(() => receipt.amount ? String(receipt.amount) : '') // blank for 0 so an unset amount doesn't look typed
	const [label, setLabel] = useState(receipt.label ?? '')
	const [description, setDescription] = useState(receipt.description ?? '')
	const [saving, setSaving] = useState(false)
	const [saveError, setSaveError] = useState(null)
	const [scanning, setScanning] = useState(false)
	const [scanNote, setScanNote] = useState(null)

	// the snapshot thumbnail URL already carries a query string
	const previewSrc = receipt.thumbnail ? `${receipt.thumbnail}${receipt.thumbnail.includes('?') ? '&' : '?'}size=640` : null
	const imageError = Boolean(previewSrc) && errorSrc === previewSrc
	const imageLoading = Boolean(previewSrc) && !imageError && loadedSrc !== previewSrc

	// AI scan (the server reads the original file): fills only empty fields, never overwrites typed input.
	// The scan's name goes to Label; the amount stays untouched on a locked (reimbursed) receipt.
	const scan = async () => {
		if (scanning) return
		setScanning(true)
		setSaveError(null)
		setScanNote(null)
		try {
			const found = await onScan()
			let filled = 0
			if (found.receiptName && !label.trim()) { setLabel(found.receiptName); filled++ }
			if (found.receiptAmount != null && !receipt.reimbursed && amount.trim() === '') { setAmount(String(found.receiptAmount)); filled++ }
			if (found.description && !description.trim()) { setDescription(found.description); filled++ }
			setScanNote(filled ? `AI filled ${filled} field${filled === 1 ? '' : 's'}. Review, then save.` : 'AI found nothing new to fill in.')
		} catch (e) {
			setSaveError(e?.response?.data?.detail || 'Could not scan this receipt.')
		} finally {
			setScanning(false)
		}
	}

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
			await onSave({
				// a reimbursed receipt's amount is locked (the server enforces it too)
				...(receipt.reimbursed ? {} : { receiptAmount: parsedAmount }),
				label: label.trim() || null,
				description: description.trim() || null,
			})
		} catch (err) {
			const detail = err?.response?.data?.detail
			setSaveError(typeof detail === 'string' ? detail : 'Could not save. Try again.')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden min-[760px]:grid-cols-[1.3fr_1fr]">
			<ZoomableImage key={receipt.id} src={previewSrc && !imageError ? previewSrc : null} alt="" decoding="async" className="min-h-[40vh] border-b border-line bg-paper text-blue min-[760px]:min-h-0 min-[760px]:border-r min-[760px]:border-b-0" imgClassName={`transition-opacity ${imageLoading ? 'opacity-40' : 'opacity-100'}`} fallback={imageLoading ? <Icon name="spinner" size={32} /> : <Icon name="receipt" size={48} />} onLoad={() => setLoadedSrc(previewSrc)} onError={() => setErrorSrc(previewSrc)}>
				{children}
			</ZoomableImage>
			<div className="min-h-0 overflow-y-auto p-5">
				<div className="grid grid-cols-3 gap-4 text-[13px]"><div><span className="block text-xs text-muted">Date</span><strong className="mt-1 block">{receipt.date}</strong></div><div><span className="block text-xs text-muted">Category</span><strong className="mt-1 block">{receipt.category}</strong></div><div><span className="block text-xs text-muted">Filename</span><strong className="mt-1 block truncate" title={receipt.filename}>{receipt.filename}</strong></div></div>
				<p className={`mt-3 rounded-lg px-3 py-2 text-xs font-bold ${receipt.reimbursed ? 'bg-green-soft text-green' : receipt.reimbursement ? 'bg-brown-soft text-brown' : 'bg-paper text-muted'}`}>{receipt.reimbursed ? `Reimbursed · record “${receipt.reimbursement.name}”` : receipt.reimbursement ? `Not reimbursed yet · pending in record “${receipt.reimbursement.name}”` : 'Not reimbursed · not in any reimbursement record'}</p>
				{notice}
				<form className="mt-5 border-t border-line pt-4" onSubmit={handleSave}>
					<p className="mb-3 text-[11px] font-bold tracking-widest text-muted uppercase">{readOnly ? readOnlyLabel : 'Edit details'}</p>
					<fieldset disabled={readOnly} className="contents">
					<div className="mb-3 flex flex-wrap items-center gap-3"><button className={`${button.secondary} disabled:opacity-60`} type="button" onClick={scan} disabled={scanning || saving}><Icon name={scanning ? 'spinner' : 'receipt'} size={16} /> {scanning ? 'Scanning…' : 'Scan with AI'}</button>{scanNote && <p className="text-xs text-muted">{scanNote}</p>}</div>
					<label className="grid gap-1.5 text-xs font-bold text-ink">Amount<input className="h-10 rounded-lg border border-line bg-white px-3 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)] disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted" type="number" min="0" step="0.01" inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={receipt.reimbursed} aria-describedby={receipt.reimbursed ? 'amount-locked' : undefined} />{receipt.reimbursed && <span id="amount-locked" className="text-[11px] font-semibold text-muted">Locked: this receipt is reimbursed in record “{receipt.reimbursement.name}”. Set the record to Not reimbursed to change it.</span>}</label>
					<label className="mt-3 grid gap-1.5 text-xs font-bold text-ink">Label (optional)<input className="h-10 rounded-lg border border-line bg-white px-3 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" type="text" placeholder="e.g. Team lunch" value={label} onChange={(event) => setLabel(event.target.value)} /></label>
					<label className="mt-3 grid gap-1.5 text-xs font-bold text-ink">Notes (optional)<textarea className="min-h-24 rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" placeholder="Personal notes about this receipt" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
					{saveError && <p className="mt-2 text-xs font-bold text-red-700">{saveError}</p>}
					</fieldset>
					{!readOnly && <div className="mt-4 flex items-center justify-between gap-3">{actions ?? <span />}<button className={`${button.primary} disabled:opacity-60`} type="submit" disabled={saving}><Icon name={saving ? 'spinner' : 'check'} size={15} /> {saving ? 'Saving…' : submitLabel}</button></div>}
				</form>
			</div>
		</div>
	)
}
