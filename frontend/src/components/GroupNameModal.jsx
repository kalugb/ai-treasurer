import { useState } from 'react'
import Modal from './Modal'
import Icon from './Icon'
import { button } from './button'

// Ask for a group name. `existing` = names already used in the team (picking one adds to that group).
// Mounted only while open (`{open && <GroupNameModal ... />}`), so every open starts from `initial`.
// onSubmit(name) may throw; the message is shown in the dialog.
export default function GroupNameModal({ title, initial = '', existing, submitLabel = 'Save group', onSubmit, onClose }) {
	const [name, setName] = useState(initial)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState('')

	const submit = async (event) => {
		event.preventDefault()
		if (!name.trim() || busy) return
		setBusy(true)
		setError('')
		try {
			await onSubmit(name.trim())
		} catch (err) {
			const detail = err?.response?.data?.detail
			setError(typeof detail === 'string' ? detail : 'Could not save the group.')
			setBusy(false)
		}
	}

	return (
		<Modal isOpen onClose={() => !busy && onClose()} title={title} footer={
			<>
				<button className={button.secondary} type="button" onClick={onClose} disabled={busy}>Cancel</button>
				<button className={`${button.primary} disabled:opacity-60`} type="submit" form="group-name-form" disabled={busy || !name.trim()}><Icon name={busy ? 'spinner' : 'check'} size={15} /> {submitLabel}</button>
			</>
		}>
			<form id="group-name-form" onSubmit={submit}>
				<label className="grid gap-1.5 text-xs font-bold text-ink">Group name
					<input className="h-10 rounded-lg border border-line bg-white px-3 text-[13px] font-normal outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} list="receipt-group-names" placeholder="e.g. Trip to KL" autoFocus />
				</label>
				<datalist id="receipt-group-names">{existing.map((item) => <option key={item} value={item} />)}</datalist>
				<p className="mt-2 text-xs leading-5 text-muted">Pick an existing name to add to that group. Each receipt keeps its own amount.</p>
				{error && <p className="mt-2 text-xs font-bold text-red-700" role="alert">{error}</p>}
			</form>
		</Modal>
	)
}
