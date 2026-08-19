import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'

const users = ['Alex Morgan', 'Jamie Lee', 'Sam Rivera', 'Priya Shah', 'Taylor Kim']
const roles = ['Lead', 'Co-Lead', 'Member']
const field = 'grid gap-2 text-xs font-bold text-ink'
const input = 'h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'

function Modal({ title, description, onClose, children, labelledBy }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const focusable = dialog?.querySelectorAll('button, input, select, textarea')
    focusable?.[0]?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36_/_38%)] p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className="max-h-[90vh] w-[min(100%,620px)] overflow-y-auto rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36_/_18%)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
      >
        <div className="mb-6 flex items-start justify-between gap-5">
          <div>
            <h2 id={labelledBy} className="font-display text-[20px] tracking-[-0.03em]">{title}</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-muted">{description}</p>
          </div>
          <button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function MemberRow({ member, index, onChange, onRemove, canRemove }) {
  const isCustomRole = !roles.includes(member.role)
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg border border-line bg-paper p-3 max-[560px]:grid-cols-1">
      <label className={field}>
        Member
        <select className={input} value={member.name} onChange={(event) => onChange(index, 'name', event.target.value)}>
          <option value="">Select a user</option>
          {users.map((user) => <option key={user} value={user}>{user}</option>)}
        </select>
      </label>
      <label className={field}>
        Role
        <select className={input} value={isCustomRole ? 'Custom' : member.role} onChange={(event) => onChange(index, 'role', event.target.value === 'Custom' ? '' : event.target.value)}>
          {roles.map((role) => <option key={role} value={role}>{role}</option>)}
          <option value="Custom">Custom role</option>
        </select>
      </label>
      <button className="grid size-10 place-items-center rounded-lg border border-line text-muted hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 max-[560px]:absolute max-[560px]:right-8" type="button" aria-label={`Remove member ${index + 1}`} onClick={() => onRemove(index)} disabled={!canRemove}>
        <Icon name="close" size={16} />
      </button>
      {isCustomRole && (
        <label className={`grid gap-2 text-xs font-bold text-ink max-[560px]:col-span-1 ${member.role ? 'col-span-2' : 'col-span-2'}`}>
          Custom role
          <input className={input} value={member.role} onChange={(event) => onChange(index, 'role', event.target.value)} placeholder="e.g. Advisor" />
        </label>
      )}
    </div>
  )
}

function TeamModal({ team, teams, onClose, onSave }) {
  const editing = Boolean(team)
  const [name, setName] = useState(team?.name || '')
  const [budget, setBudget] = useState(team?.budget ?? '')
  const [members, setMembers] = useState(team?.members?.length ? team.members : [{ name: '', role: 'Member' }])
  const [errors, setErrors] = useState({})

  const updateMember = (index, key, value) => {
    setMembers((current) => current.map((member, memberIndex) => memberIndex === index ? { ...member, [key]: value } : member))
  }

  const submit = (event) => {
    event.preventDefault()
    const nextErrors = {}
    const trimmedName = name.trim()
    if (!trimmedName) nextErrors.name = 'Team name is required.'
    if (teams.some((item) => item.id !== team?.id && item.name.toLowerCase() === trimmedName.toLowerCase())) nextErrors.name = 'A team with this name already exists.'
    if (budget === '' || Number(budget) < 0) nextErrors.budget = 'Enter a budget of zero or more.'
    if (!members.length || members.some((member) => !member.name || !member.role.trim())) nextErrors.members = 'Choose a user and role for every member.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    onSave({ id: team?.id, name: trimmedName, budget: Number(budget), used: team?.used || 0, members })
  }

  return (
    <Modal
      title={editing ? 'Edit team' : 'Add team'}
      description={editing ? 'Update the budget and people assigned to this team.' : 'Set a budget and add at least one team member.'}
      labelledBy="team-form-title"
      onClose={onClose}
    >
      <form className="grid gap-5" onSubmit={submit} noValidate>
        <label className={field}>
          Team name
          <input className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Marketing" aria-invalid={Boolean(errors.name)} />
          {errors.name && <span className="font-normal text-red-600">{errors.name}</span>}
        </label>
        <label className={field}>
          Team budget set
          <div className="relative">
            <span className="absolute inset-y-0 left-3 grid place-items-center text-muted">$</span>
            <input className={`${input} pl-7`} type="number" min="0" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.budget)} />
          </div>
          {errors.budget && <span className="font-normal text-red-600">{errors.budget}</span>}
        </label>
        <fieldset className="grid gap-3">
          <legend className="text-xs font-bold text-ink">Team members</legend>
          <div className="grid gap-2">
            {members.map((member, index) => (
              <MemberRow key={index} member={member} index={index} onChange={updateMember} onRemove={(memberIndex) => setMembers((current) => current.filter((_, itemIndex) => itemIndex !== memberIndex))} canRemove={members.length > 1} />
            ))}
          </div>
          {errors.members && <span className="text-xs font-normal text-red-600">{errors.members}</span>}
          <button className={button.secondary} type="button" onClick={() => setMembers((current) => [...current, { name: '', role: 'Member' }])}>
            <Icon name="plus" size={15} /> Add member
          </button>
        </fieldset>
        <div className="flex gap-2 border-t border-line pt-5">
          <button className={button.primary} type="submit">{editing ? 'Save changes' : 'Add team'}</button>
          <button className={button.secondary} type="button" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteModal({ team, onClose, onDelete }) {
  const [confirmation, setConfirmation] = useState('')
  const matches = confirmation === team.name
  return (
    <Modal title={`Delete ${team.name}?`} description="This action cannot be undone. All team settings will be permanently removed." labelledBy="delete-team-title" onClose={onClose}>
      <div className="grid gap-5">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] leading-6 text-red-800">
          Deleting this team is irreversible. Type the exact team name below to confirm.
        </div>
        <label className={field}>
          Team name
          <input className={input} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={team.name} />
        </label>
        <div className="flex justify-end gap-2 border-t border-line pt-5">
          <button className={button.secondary} type="button" onClick={onClose}>Cancel</button>
          <button className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-red-600 px-4 text-[13px] font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={!matches} onClick={() => onDelete(team.id)}>Delete team</button>
        </div>
      </div>
    </Modal>
  )
}

function usagePercent(team) {
  return team.budget > 0 ? Math.round((team.used / team.budget) * 100) : 0
}

export default function TeamManagement({ teams, setTeams }) {
  const [editingTeam, setEditingTeam] = useState(null)
  const [deleteTeam, setDeleteTeam] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const saveTeam = (nextTeam) => {
    setTeams((current) => nextTeam.id ? current.map((team) => team.id === nextTeam.id ? { ...team, ...nextTeam } : team) : [...current, { ...nextTeam, id: crypto.randomUUID(), receipts: [] }])
    setShowForm(false)
    setEditingTeam(null)
  }

  const removeTeam = (id) => {
    setTeams((current) => current.filter((team) => team.id !== id))
    setDeleteTeam(null)
  }

  return (
    <>
      <header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div>
          <p className="mb-2.5 text-[11px] font-bold tracking-[0.1em] text-muted uppercase">Finance / Team management</p>
          <h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">Team management</h1>
          <p className="mt-3 text-[13px] leading-6 text-muted">Keep budgets, ownership, and team roles in one place.</p>
        </div>
        <button className={button.primary} type="button" onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> Add team</button>
      </header>
      <section className="grid gap-3">
        {teams.map((team) => {
          const percentage = usagePercent(team)
          return (
            <article className="rounded-[14px] border border-line bg-white p-5" key={team.id}>
              <div className="flex items-start justify-between gap-4 max-[700px]:flex-col">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="users" size={19} /></span>
                  <div className="min-w-0"><h2 className="font-display text-[18px] tracking-[-0.03em] text-ink">{team.name}</h2><p className="mt-1 text-xs text-muted">{team.members.length} {team.members.length === 1 ? 'member' : 'members'}</p></div>
                </div>
                <div className="flex gap-2">
                  <button className={button.secondary} type="button" onClick={() => { setEditingTeam(team); setShowForm(true) }}>Edit</button>
                  <button className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-red-200 px-[15px] text-[13px] font-bold text-red-600 transition hover:bg-red-50 focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={() => setDeleteTeam(team)}>Delete</button>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-[1.2fr_1fr] gap-6 border-t border-line pt-5 max-[700px]:grid-cols-1">
                <div>
                  <div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Budget used</p><p className="mt-1 font-display text-[18px] text-ink">${team.used.toLocaleString()} <span className="font-body text-xs text-muted">/ ${team.budget.toLocaleString()}</span></p></div><strong className={percentage >= 90 ? 'text-red-600' : 'text-blue'}>{percentage}%</strong></div>
                  <div className="h-2 overflow-hidden rounded-full bg-blue-soft"><div className={percentage >= 90 ? 'h-full rounded-full bg-red-500' : 'h-full rounded-full bg-blue'} style={{ width: `${Math.min(100, percentage)}%` }} /></div>
                </div>
                <div><p className="mb-2 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Team members</p><div className="flex flex-wrap gap-2">{team.members.map((member) => <span className="rounded-full bg-paper px-3 py-1.5 text-xs text-ink" key={`${member.name}-${member.role}`}>{member.name} <span className="text-muted">· {member.role}</span></span>)}</div></div>
              </div>
            </article>
          )
        })}
      </section>
      {(showForm || editingTeam) && <TeamModal team={editingTeam} teams={teams} onClose={() => { setShowForm(false); setEditingTeam(null) }} onSave={saveTeam} />}
      {deleteTeam && <DeleteModal team={deleteTeam} onClose={() => setDeleteTeam(null)} onDelete={removeTeam} />}
    </>
  )
}
