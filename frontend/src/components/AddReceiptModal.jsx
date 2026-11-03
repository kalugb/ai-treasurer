import { useState } from 'react'
import Icon from './Icon'
import { button } from './button'

const field = 'grid gap-1.75 text-xs font-bold text-ink'
const input = 'h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'

export default function AddReceiptModal({ open, onClose, onUpload }) {
	const [file, setFile] = useState(null)
	const [receiptName, setReceiptName] = useState('')
	const [receiptAmount, setReceiptAmount] = useState('')
	const [description, setDescription] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState(null)

	if (!open) return null

	const reset = () => {
		setFile(null)
		setReceiptName('')
		setReceiptAmount('')
		setDescription('')
		setError(null)
	}

	const close = () => { reset(); onClose() }

	const submit = async (event) => {
		event.preventDefault()
		if (saving) return
		if (!file) { setError('Choose a receipt file to upload.'); return }
		const amount = Number(receiptAmount)
		if (Number.isNaN(amount) || amount < 0) { setError('Enter a valid non-negative amount.'); return }

		const formData = new FormData()
		formData.append('file', file)
		formData.append('receiptName', receiptName.trim())
		formData.append('receiptAmount', String(amount))
		if (description.trim()) formData.append('description', description.trim())

		setSaving(true)
		setError(null)
		try {
			await onUpload(formData)
			reset()
			onClose()
		} catch {
			setError('Upload failed. Check the file type and try again.')
		} finally {
			setSaving(false)
		}
	}

	return (
		<div
			className="fixed inset-0 z-10 grid place-items-center bg-[rgb(28_35_36/35%)] p-5"
			role="presentation"
			onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}
		>
			<div
				className="w-[min(100%,480px)] rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]"
				role="dialog"
				aria-modal="true"
				aria-labelledby="add-receipt-title"
			>
				<div className="mb-5 flex items-start justify-between gap-4.5">
					<div>
						<h2 id="add-receipt-title" className="font-display text-[17px] tracking-[-0.03em]">Add receipt</h2>
						<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Upload an image or PDF receipt and its details.</p>
					</div>
					<button className="mt-5 inline-flex items-center gap-2 border-0 bg-transparent p-0 text-xs font-bold text-blue" type="button" onClick={close}>Close</button>
				</div>

				<form className="grid gap-4.5" onSubmit={submit}>
					<label className={field}>
						Receipt file
						<input
							className="text-[13px] font-normal text-ink file:mr-3 file:rounded-[7px] file:border-0 file:bg-blue-soft file:px-3 file:py-2 file:text-xs file:font-bold file:text-blue"
							type="file"
							accept="image/*,application/pdf"
							onChange={(event) => setFile(event.target.files?.[0] ?? null)}
							required
						/>
					</label>

					<label className={field}>
						Receipt name
						<input autoFocus className={input} value={receiptName} onChange={(event) => setReceiptName(event.target.value)} placeholder="e.g. Office supplies" required />
					</label>

					<label className={field}>
						Amount
						<input className={input} type="number" min="0" step="0.01" inputMode="decimal" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} placeholder="0.00" required />
					</label>

					<label className={field}>
						Description (optional)
						<textarea className="min-h-20 rounded-[7px] border border-line bg-paper px-3 py-2 text-[13px] font-normal text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Notes about this receipt" />
					</label>

					{error && <p className="text-xs font-bold text-red-700">{error}</p>}

					<div className="flex gap-2">
						<button className={`${button.primary} disabled:opacity-60`} type="submit" disabled={saving}>
							<Icon name={saving ? 'spinner' : 'plus'} size={16} />
							{saving ? 'Uploading…' : 'Add receipt'}
						</button>
						<button className={button.secondary} type="button" onClick={close}>Cancel</button>
					</div>
				</form>
			</div>
		</div>
	)
}
