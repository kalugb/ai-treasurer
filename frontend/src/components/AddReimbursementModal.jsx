import { useState } from 'react'
import Icon from './Icon'
import { button } from './button'
import ReceiptPickerModal from './ReceiptPickerModal'

const field = 'grid gap-1.75 text-xs font-bold text-ink'
const input = 'h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'
const OTHER = '__other__'

const fromRecord = (r) => ({
    name: r?.name ?? '',
    team: r && !r.teamInvolvedId ? r.teamInvolved : '',
    amount: r ? String(r.amount) : '',
    date: r?.date ?? new Date().toISOString().slice(0, 10),
    status: r?.status ?? 'Not reimbursed',
    receiptNames: r?.receiptInvolved?.receiptNames ?? [],
})

const errorText = (err) => {
    const detail = err?.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map((d) => d.msg).join('; ')
    return 'Could not save the record.'
}

export default function AddReimbursementModal({ initial, onClose, onSave, teams = [] }) {
    const [form, setForm] = useState(() => fromRecord(initial))
    const [teamChoice, setTeamChoice] = useState(initial ? (initial.teamInvolvedId ?? OTHER) : '')
    const [picking, setPicking] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const realTeam = teamChoice && teamChoice !== OTHER

    const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))
    const pickTeam = (event) => {
        setTeamChoice(event.target.value)
        setForm((f) => ({ ...f, receiptNames: [] }))
    }
    const applyPicked = (receiptNames, picked) => {
        const total = picked.reduce((s, r) => s + (r.amount ?? 0), 0)
        // prefill only empty fields; never overwrite what the user typed
        setForm((f) => ({
            ...f,
            receiptNames,
            name: f.name || receiptNames[0] || '',
            amount: f.amount || (total ? String(Math.round(total * 100) / 100) : ''),
        }))
        setPicking(false)
    }
    const removeReceipt = (name) => setForm((f) => ({ ...f, receiptNames: f.receiptNames.filter((n) => n !== name) }))
    const submit = async (event) => {
        event.preventDefault()
        setSaving(true)
        setError('')
        try {
            await onSave({
                name: form.name.trim(),
                date: form.date,
                amount: Number(form.amount),
                status: form.status,
                teamInvolvedId: realTeam ? teamChoice : null,
                teamInvolved: realTeam ? null : form.team.trim(),
                receiptInvolved: realTeam && form.receiptNames.length ? { receiptNames: form.receiptNames } : null,
            })
        } catch (err) {
            setError(errorText(err))
            setSaving(false)
        }
    }

    return (
        <div
            className="fixed inset-0 z-10 grid place-items-center bg-[rgb(28_35_36/35%)] p-5"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose()
            }}
        >
            <div
                className="max-h-full w-[min(100%,560px)] overflow-y-auto rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-reimbursement-title"
            >
                <div className="mb-5 flex items-start justify-between gap-4.5">
                    <div>
                        <h2 id="add-reimbursement-title" className="font-display text-[17px] tracking-[-0.03em]">{initial ? 'Edit reimbursement record' : 'Add reimbursement record'}</h2>
                        <p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Record a receipt that is not yet or already paid back.</p>
                    </div>
                    <button className="mt-5 inline-flex items-center gap-2 border-0 bg-transparent p-0 text-xs font-bold text-blue" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>

                <form className="grid gap-4.5" onSubmit={submit}>
                    <label className={field}>
                        Name
                        <input autoFocus className={input} value={form.name} onChange={set('name')} placeholder="e.g. Team lunch" maxLength={200} required />
                    </label>
                    <label className={field}>
                        Team
                        <select className={input} value={teamChoice} onChange={pickTeam} required>
                            <option value="" disabled>Select a team</option>
                            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            <option value={OTHER}>Others</option>
                        </select>
                    </label>
                    {teamChoice === OTHER && (
                        <label className={field}>
                            Custom team
                            <input className={input} value={form.team} onChange={set('team')} placeholder="e.g. Marketing" maxLength={200} required />
                        </label>
                    )}
                    {realTeam && (
                        <div className={field}>
                            <span>Receipts involved</span>
                            {form.receiptNames.length > 0 && (
                                <ul className="flex flex-wrap gap-1.5" aria-label="Selected receipts">
                                    {form.receiptNames.map((n) => (
                                        <li key={n} className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-soft py-1 pr-1 pl-2.5 text-[11px] font-bold text-blue">
                                            <span className="truncate">{n}</span>
                                            <button className="grid size-4.5 place-items-center rounded-full hover:bg-white" type="button" aria-label={`Remove ${n}`} onClick={() => removeReceipt(n)}>×</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <button className={`${button.secondary} w-fit`} type="button" onClick={() => setPicking(true)}>
                                <Icon name="receipt" size={16} /> {form.receiptNames.length ? `Change receipts (${form.receiptNames.length})` : 'Choose receipts'}
                            </button>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
                        <label className={field}>
                            Amount
                            <input className={input} type="number" min="0" step="0.01" value={form.amount} onChange={set('amount')} placeholder="0.00" required />
                        </label>
                        <label className={field}>
                            Date
                            <input className={input} type="date" value={form.date} onChange={set('date')} required />
                        </label>
                    </div>
                    <label className={field}>
                        Status
                        <select className={input} value={form.status} onChange={set('status')}>
                            <option value="Not reimbursed">Not reimbursed</option>
                            <option value="Reimbursed">Reimbursed</option>
                        </select>
                    </label>

                    {error && <p className="text-xs font-semibold text-red-600" role="alert">{error}</p>}

                    <div className="flex gap-2">
                        <button className={button.primary} type="submit" disabled={saving}>
                            <Icon name={initial ? 'check' : 'plus'} size={16} />
                            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add record'}
                        </button>
                        <button className={button.secondary} type="button" onClick={onClose}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
            {picking && (
                <ReceiptPickerModal teamId={teamChoice} selectedNames={form.receiptNames} onClose={() => setPicking(false)} onConfirm={applyPicked} />
            )}
        </div>
    )
}
