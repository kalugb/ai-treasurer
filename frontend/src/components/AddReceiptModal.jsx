import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { button } from './button'
import { pdfFirstPageToImageUrl } from '../api/pdfPreview'

const field = 'grid gap-1.75 text-xs font-bold text-ink'
const input = 'h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'

export default function AddReceiptModal({ open, onClose, onUpload }) {
	const [file, setFile] = useState(null)
	const [receiptName, setReceiptName] = useState('')
	const [receiptAmount, setReceiptAmount] = useState('')
	const [description, setDescription] = useState('')
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState(null)
	const [previewUrl, setPreviewUrl] = useState(null)
	const [renderingPreview, setRenderingPreview] = useState(false)
	const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 })
	const [dragging, setDragging] = useState(false)
	const dragRef = useRef(null)

	// revoke the object URL on unmount so the last preview doesn't leak
	useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

	if (!open) return null

	const resetZoom = () => { setZoom({ scale: 1, tx: 0, ty: 0 }); dragRef.current = null; setDragging(false) }

	// wheel zooms toward the cursor; translate is adjusted so the point under the cursor stays put. clamped 1x–5x
	const handleWheel = (event) => {
		event.preventDefault()
		const rect = event.currentTarget.getBoundingClientRect()
		const cx = event.clientX - rect.left - rect.width / 2
		const cy = event.clientY - rect.top - rect.height / 2
		setZoom((current) => {
			const scale = Math.min(5, Math.max(1, current.scale - event.deltaY * 0.0015))
			if (scale <= 1) return { scale: 1, tx: 0, ty: 0 }
			const ratio = scale / current.scale
			return { scale, tx: cx - (cx - current.tx) * ratio, ty: cy - (cy - current.ty) * ratio }
		})
	}
	const handlePointerDown = (event) => {
		if (zoom.scale <= 1) return
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = { x: event.clientX, y: event.clientY, tx: zoom.tx, ty: zoom.ty }
		setDragging(true)
	}
	const handlePointerMove = (event) => {
		if (!dragRef.current) return
		setZoom((current) => ({ ...current, tx: dragRef.current.tx + (event.clientX - dragRef.current.x), ty: dragRef.current.ty + (event.clientY - dragRef.current.y) }))
	}
	const handlePointerUp = () => { dragRef.current = null; setDragging(false) }

	const reset = () => {
		setFile(null)
		if (previewUrl) URL.revokeObjectURL(previewUrl)
		setPreviewUrl(null)
		setRenderingPreview(false)
		resetZoom()
		setReceiptName('')
		setReceiptAmount('')
		setDescription('')
		setError(null)
	}

	// build the preview: images use an object URL directly; PDFs are rasterized to a PNG so they
	// flow through the same <img> zoom/pan path (mirrors the backend's pdfium render for Drive PDFs).
	const pickFile = async (next) => {
		if (previewUrl) URL.revokeObjectURL(previewUrl)  // revoke the previous preview before replacing it
		setPreviewUrl(null)
		setFile(next)
		resetZoom()
		setError(null)
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
		} else {
			setPreviewUrl(URL.createObjectURL(next))
		}
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
						<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Upload an image or PDF receipt and its details.</p>
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
								accept="image/*,application/pdf"
								onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
								required
							/>
						</label>

						{previewUrl ? (
							<div className="relative grid min-h-70 flex-1 place-items-center overflow-hidden rounded-[7px] border border-line bg-paper min-[720px]:min-h-100" onWheel={handleWheel}>
								<img
									src={previewUrl}
									alt={`Preview of ${file.name}`}
									draggable={false}
									className="absolute inset-0 h-full w-full touch-none object-contain"
									style={{ transform: `translate(${zoom.tx}px, ${zoom.ty}px) scale(${zoom.scale})`, cursor: zoom.scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in' }}
									onPointerDown={handlePointerDown}
									onPointerMove={handlePointerMove}
									onPointerUp={handlePointerUp}
									onPointerCancel={handlePointerUp}
								/>
								{zoom.scale > 1 && <span className="absolute bottom-2 left-2 rounded-full bg-[rgb(28_35_36/70%)] px-2.5 py-1 text-[11px] font-bold text-white">{zoom.scale.toFixed(1)}×</span>}
							</div>
						) : (
							<div className="grid min-h-70 flex-1 place-items-center rounded-[7px] border border-dashed border-line bg-paper text-center text-muted min-[720px]:min-h-100">
								{renderingPreview
									? <div><Icon name="spinner" size={32} /><p className="mt-3 text-xs">Rendering preview…</p></div>
									: <div><Icon name="receipt" size={40} /><p className="mt-3 text-xs">Choose a file to preview it here</p></div>}
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
