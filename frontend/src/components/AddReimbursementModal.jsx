import { useState } from 'react'
import Icon from './Icon'
import { button } from './button'

const field = 'grid gap-1.75 text-xs font-bold text-ink'
const input = 'h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'
const empty = () => ({ receiptName: '', team: '', amount: '', date: new Date().toISOString().slice(0, 10), status: 'pending' })
const OTHER = '__other__'

export default function AddReimbursementModal({ open, onClose, onAdd, teams = [] }) {
    const [form, setForm] = useState(empty)
    const [teamChoice, setTeamChoice] = useState('')

    if (!open) return null

    const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))
    const submit = (event) => {
        event.preventDefault()
        const team = teamChoice === OTHER ? form.team.trim() : teamChoice
        onAdd({ ...form, receiptName: form.receiptName.trim(), team, amount: Number(form.amount) })
        setForm(empty())
        setTeamChoice('')
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
                className="w-[min(100%,480px)] rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="add-reimbursement-title"
            >
                <div className="mb-5 flex items-start justify-between gap-4.5">
                    <div>
                        <h2 id="add-reimbursement-title" className="font-display text-[17px] tracking-[-0.03em]">Add reimbursement record</h2>
                        <p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Record a receipt that is pending or already paid back.</p>
                    </div>
                    <button className="mt-5 inline-flex items-center gap-2 border-0 bg-transparent p-0 text-xs font-bold text-blue" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>

                <form className="grid gap-4.5" onSubmit={submit}>
                    <label className={field}>
                        Receipt
                        <input autoFocus className={input} value={form.receiptName} onChange={set('receiptName')} placeholder="e.g. Team lunch" required />
                    </label>
                    <label className={field}>
                        Team
                        <select className={input} value={teamChoice} onChange={(event) => setTeamChoice(event.target.value)} required>
                            <option value="" disabled>Select a team</option>
                            {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                            <option value={OTHER}>Others</option>
                        </select>
                    </label>
                    {teamChoice === OTHER && (
                        <label className={field}>
                            Custom team
                            <input autoFocus className={input} value={form.team} onChange={set('team')} placeholder="e.g. Marketing" required />
                        </label>
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
                            <option value="pending">Yet to be reimbursed</option>
                            <option value="reimbursed">Reimbursed</option>
                        </select>
                    </label>

                    <div className="flex gap-2">
                        <button className={button.primary} type="submit">
                            <Icon name="plus" size={16} />
                            Add record
                        </button>
                        <button className={button.secondary} type="button" onClick={onClose}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
