import { useEffect, useState } from 'react'
import Icon from './Icon'
import ZoomableImage from './ZoomableImage'
import { button } from './button'
import { pdfFirstPageToImageUrl } from '../api/pdfPreview'
import { agentAPI } from '../api/agent'

const field = 'grid gap-1.75 text-xs font-bold text-ink'
const input = 'h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'

// scanContext = { ownerId, orgId, teamId }: lets the server log the AI scan in the AI history
export default function AddReceiptModal({ open, onClose, onUpload, scanContext }) {
	const [file, setFile] = useState(null)
	const [receiptName, setReceiptName] = useState('')
	const [receiptAmount, setReceiptAmount] = useState('')
	const [description, setDescription] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState(null)
	const [previewUrl, setPreviewUrl] = useState(null)
	const [renderingPreview, setRenderingPreview] = useState(false)
	const [scanning, setScanning] = useState(false)
	const [scanNote, setScanNote] = useState(null)

	// revoke the object URL on unmount so the last preview doesn't leak
	useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

	if (!open) return null

	const reset = () => {
		setFile(null)
		if (previewUrl) URL.revokeObjectURL(previewUrl)
		setPreviewUrl(null)
		setRenderingPreview(false)
		setReceiptName('')
		setReceiptAmount('')
		setDescription('')
		setError(null)
		setScanNote(null)
	}

	// AI scan: fills only the fields the user hasn't typed yet, so it never overwrites their input
	const scan = async () => {
		if (!file || scanning) return
		setScanning(true)
		setError(null)
		setScanNote(null)
		try {
			const res = await agentAPI.scanReceipt(file, scanContext)
			let filled = 0
			if (res.receiptName && !receiptName.trim()) { setReceiptName(res.receiptName); filled++ }
			if (res.receiptAmount != null && receiptAmount === '') { setReceiptAmount(String(res.receiptAmount)); filled++ }
			if (res.description && !description.trim()) { setDescription(res.description); filled++ }
			setScanNote(filled ? `AI filled ${filled} field${filled === 1 ? '' : 's'}. Please review before saving.` : "AI found nothing new to fill in.")
		} catch (e) {
			setError(e?.response?.data?.detail || 'Could not scan this receipt.')
		} finally {
			setScanning(false)
		}
	}

	// build the preview: images use an object URL directly; PDFs are rasterized to a PNG so they
	// flow through the same <img> zoom/pan path (mirrors the backend's pdfium render for Drive PDFs).
	const pickFile = async (next) => {
		if (previewUrl) URL.revokeObjectURL(previewUrl)  // revoke the previous preview before replacing it
		setPreviewUrl(null)
		setFile(next)
		setError(null)
		setScanNote(null)
		if (!next) { setRenderingPreview(false); return }
		if (next.type === 'application/pdf') {
			setRenderingPreview(true)
			try {
				setPreviewUrl(await pdfFirstPageToImageUrl(next))
			} catch (err) {
				console.error('PDF preview render failed:', err)
				setError('Could not render a preview of this PDF. You can still upload it.')
			} finally {
				setRenderingPreview(false)
			}
		} else if (next.type.startsWith('image/')) {
			setPreviewUrl(URL.createObjectURL(next))
		}  // Excel: no image preview, the placeholder shows the file name
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
				className="w-[min(100%,860px)] rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]"
				role="dialog"
				aria-modal="true"
				aria-labelledby="add-receipt-title"
			>
				<div className="mb-5 flex items-start justify-between gap-4.5">
					<div>
						<h2 id="add-receipt-title" className="font-display text-[17px] tracking-[-0.03em]">Add receipt</h2>
						<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Upload an image, PDF or Excel receipt and its details, or let AI fill them in.</p>
					</div>
					<button className="mt-5 inline-flex items-center gap-2 border-0 bg-transparent p-0 text-xs font-bold text-blue" type="button" onClick={close}>Close</button>
				</div>

				<form className="grid grid-cols-1 gap-6 min-[720px]:grid-cols-[1.2fr_1fr]" onSubmit={submit}>
					<div className="flex flex-col gap-4.5">
						<label className={field}>
							Receipt file
							<input
								className="text-[13px] font-normal text-ink file:mr-3 file:rounded-[7px] file:border-0 file:bg-blue-soft file:px-3 file:py-2 file:text-xs file:font-bold file:text-blue"
								type="file"
								accept="image/*,application/pdf,.xlsx,.xls"
								onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
								required
							/>
						</label>

						<div className="flex flex-wrap items-center gap-3">
							<button className={`${button.secondary} disabled:opacity-60`} type="button" onClick={scan} disabled={!file || scanning}>
								<Icon name={scanning ? 'spinner' : 'receipt'} size={16} />
								{scanning ? 'Scanning…' : 'Scan with AI'}
							</button>
							{scanNote && <p className="text-xs text-muted">{scanNote}</p>}
						</div>

						{previewUrl ? (
							<ZoomableImage key={previewUrl} src={previewUrl} alt={`Preview of ${file.name}`} className="min-h-70 flex-1 rounded-[7px] border border-line bg-paper min-[720px]:min-h-100" />
						) : (
							<div className="grid min-h-70 flex-1 place-items-center rounded-[7px] border border-dashed border-line bg-paper text-center text-muted min-[720px]:min-h-100">
								{renderingPreview
									? <div><Icon name="spinner" size={32} /><p className="mt-3 text-xs">Rendering preview…</p></div>
									: <div><Icon name="receipt" size={40} /><p className="mt-3 text-xs">{file ? `No preview for ${file.name}` : 'Choose a file to preview it here'}</p></div>}
							</div>
						)}
					</div>

					<div className="flex flex-col gap-4.5">
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
							<textarea className="min-h-24 flex-1 rounded-[7px] border border-line bg-paper px-3 py-2 text-[13px] font-normal text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Notes about this receipt" />
						</label>

						{error && <p className="text-xs font-bold text-red-700">{error}</p>}

						<div className="mt-auto flex gap-2">
							<button className={`${button.primary} disabled:opacity-60`} type="submit" disabled={saving}>
								<Icon name={saving ? 'spinner' : 'plus'} size={16} />
								{saving ? 'Uploading…' : 'Add receipt'}
							</button>
							<button className={button.secondary} type="button" onClick={close}>Cancel</button>
						</div>
					</div>
				</form>
			</div>
		</div>
	)
}
