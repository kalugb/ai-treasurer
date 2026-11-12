import { useEffect, useState } from 'react'
import Icon from './Icon'
import ZoomableImage from './ZoomableImage'
import { button } from './button'
import { API_BASE_URL } from '../api/client'

const field = 'grid gap-1.75 text-xs font-bold text-ink'
const input = 'h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'
const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

const errorText = (err) => {
	const detail = err?.response?.data?.detail
	if (typeof detail === 'string') return detail
	if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ')
	return 'Could not save the record.'
}

// Add + edit (`initial`). onSave(formData) must throw on failure so the modal stays open and shows the error.
export default function AddCashInModal({ initial, onClose, onSave }) {
	const [form, setForm] = useState(() => ({
		name: initial?.name ?? '',
		source: initial?.source ?? '',
		amount: initial ? String(initial.amount) : '',
		date: initial?.date ?? new Date().toISOString().slice(0, 10),
	}))
	const [file, setFile] = useState(null)
	const [previewUrl, setPreviewUrl] = useState(null)
	const [removeImage, setRemoveImage] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')

	// revoke the object URL on unmount so the last preview doesn't leak
	useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

	const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))
	const pickFile = (event) => {
		const next = event.target.files?.[0] ?? null
		setError('')
		if (next && next.size > MAX_BYTES) {
			setError('The proof image is larger than 10 MB.')
			event.target.value = ''
			return
		}
		setFile(next)
		setPreviewUrl(next ? URL.createObjectURL(next) : null)
		if (next) setRemoveImage(false)
	}
	const existingUrl = initial?.imageUrl && !removeImage && !file ? `${API_BASE_URL}${initial.imageUrl}` : null
	const shownUrl = previewUrl ?? existingUrl

	const submit = async (event) => {
		event.preventDefault()
		const amount = Number(form.amount)
		if (Number.isNaN(amount) || amount < 0) { setError('Enter a valid non-negative amount.'); return }
		const data = new FormData()
		data.append('name', form.name.trim())
		data.append('source', form.source.trim())
		data.append('amount', String(amount))
		data.append('date', form.date)
		if (file) data.append('file', file)
		if (initial && removeImage && !file) data.append('removeImage', 'true')
		setSaving(true)
		setError('')
		try {
			await onSave(data)
		} catch (err) {
			setError(errorText(err))
			setSaving(false)
		}
	}

	return (
		<div
			className="fixed inset-0 z-10 grid place-items-center bg-[rgb(28_35_36/35%)] p-5"
			role="presentation"
			onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
		>
			<div
				className="max-h-full w-[min(100%,560px)] overflow-y-auto rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]"
				role="dialog"
				aria-modal="true"
				aria-labelledby="add-cashin-title"
			>
				<div className="mb-5 flex items-start justify-between gap-4.5">
					<div>
						<h2 id="add-cashin-title" className="font-display text-[17px] tracking-[-0.03em]">{initial ? 'Edit cash in record' : 'Add cash in'}</h2>
						<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Record money received, with an optional image as proof.</p>
					</div>
					<button className="mt-5 inline-flex items-center gap-2 border-0 bg-transparent p-0 text-xs font-bold text-blue" type="button" onClick={onClose}>Close</button>
				</div>

				<form className="grid gap-4.5" onSubmit={submit}>
					<label className={field}>
						Name
						<input autoFocus className={input} value={form.name} onChange={set('name')} placeholder="e.g. Alumni donation" maxLength={200} required />
					</label>
					<label className={field}>
						Source
						<input className={input} value={form.source} onChange={set('source')} placeholder="e.g. Alumni association" maxLength={200} required />
					</label>
					<div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
						<label className={field}>
							Amount
							<input className={input} type="number" min="0" step="0.01" inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
						</label>
						<label className={field}>
							Date
							<input className={input} type="date" value={form.date} onChange={set('date')} required />
						</label>
					</div>

					<div className={field}>
						<label htmlFor="cashin-proof">Proof image (optional)</label>
						<input
							id="cashin-proof"
							className="text-[13px] font-normal text-ink file:mr-3 file:rounded-[7px] file:border-0 file:bg-blue-soft file:px-3 file:py-2 file:text-xs file:font-bold file:text-blue"
							type="file"
							accept={ACCEPT}
							onChange={pickFile}
						/>
						<p className="font-normal text-[11px] leading-[1.5] text-muted">PNG, JPEG, WebP or GIF, up to 10 MB. Stored privately.</p>
						{shownUrl && (
							<div className="grid gap-2">
								<ZoomableImage key={shownUrl} src={shownUrl} alt="Proof of cash in" className="h-64 w-full rounded-[7px] border border-line bg-paper" />
								{initial?.hasImage && !file && (
									<button className="w-fit border-0 bg-transparent p-0 text-xs font-bold text-red-600" type="button" onClick={() => setRemoveImage(true)}>Remove image</button>
								)}
							</div>
						)}
						{removeImage && !file && (
							<p className="text-xs font-normal text-muted">The image will be removed when you save. <button className="border-0 bg-transparent p-0 font-bold text-blue" type="button" onClick={() => setRemoveImage(false)}>Undo</button></p>
						)}
					</div>

					{error && <p className="text-xs font-semibold text-red-600" role="alert">{error}</p>}

					<div className="flex gap-2">
						<button className={button.primary} type="submit" disabled={saving}>
							<Icon name={initial ? 'check' : 'plus'} size={16} />
							{saving ? 'Saving…' : initial ? 'Save changes' : 'Add cash in'}
						</button>
						<button className={button.secondary} type="button" onClick={onClose}>Cancel</button>
					</div>
				</form>
			</div>
		</div>
	)
}
