/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { teamsAPI } from '../api/teams'
import { OrganizationContext, OrganizationRequiredEmptyState } from '../components/OrganizationContext'

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
			className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5"
			role="presentation"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose()
			}}
		>
			<div
				ref={dialogRef}
				className="max-h-[90vh] w-[min(100%,620px)] overflow-y-auto rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]"
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

function TeamModal({ team, teams, onClose, onSave, serverError }) {
	const editing = Boolean(team)
	const [name, setName] = useState(team?.name || '')
	const [budget, setBudget] = useState(team?.budget ?? '')
	const [members, setMembers] = useState(team?.members?.length ? team.members : [])
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
		if (budget !== '' && budget !== null && Number(budget) < 0) nextErrors.budget = 'Enter a budget of zero or more.'
		if (members.length && members.some((member) => !member.name || !member.role.trim())) nextErrors.members = 'Choose a user and role for every member.'
		setErrors(nextErrors)
		if (Object.keys(nextErrors).length) return
		onSave({ id: team?.id, name: trimmedName, budget: budget === '' ? 0 : Number(budget), members })
	}

	return (
		<Modal
			title={editing ? 'Edit team' : 'Add team'}
			description={editing ? 'Update the budget and people assigned to this team. Budget and members are optional.' : 'Set a budget and add members if needed — both optional.'}
			labelledBy="team-form-title"
			onClose={onClose}
		>
			<form className="grid gap-5" onSubmit={submit} noValidate>
				<label className={field}>
					Team name
					<input className={input} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Marketing" aria-invalid={Boolean(errors.name)} />
					{errors.name && <span className="font-normal text-red-600">{errors.name}</span>}
					{serverError && <span className="font-normal text-red-600">{serverError}</span>}
				</label>
				<label className={field}>
					Team budget set
					<span className="text-[11px] font-normal text-muted">Optional</span>
					<div className="relative">
						<span className="absolute inset-y-0 left-3 grid place-items-center text-muted">$</span>
						<input className={`${input} pl-7`} type="number" min="0" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="0.00" aria-invalid={Boolean(errors.budget)} />
					</div>
					{errors.budget && <span className="font-normal text-red-600">{errors.budget}</span>}
				</label>
				<fieldset className="grid gap-3">
					<legend className="text-xs font-bold text-ink">Team members <span className="font-normal text-muted">Optional</span></legend>
					<div className="grid gap-2">
						{members.map((member, index) => (
							<MemberRow key={index} member={member} index={index} onChange={updateMember} onRemove={(memberIndex) => setMembers((current) => current.filter((_, itemIndex) => itemIndex !== memberIndex))} canRemove />
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
					<button className="inline-flex min-h-10.5 items-center justify-center rounded-lg bg-red-600 px-4 text-[13px] font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={!matches} onClick={() => onDelete(team.id)}>Delete team</button>
				</div>
			</div>
		</Modal>
	)
}

function usagePercent(team) {
	return team.budget > 0 ? Math.round((team.used / team.budget) * 100) : 0
}

export default function TeamManagement({ organization, onGoToOrganization }) {
	const [teams, setTeams] = useState([])
	const [editingTeam, setEditingTeam] = useState(null)
	const [deleteTeam, setDeleteTeam] = useState(null)
	const [showForm, setShowForm] = useState(false)
	const [loading, setLoading] = useState(false)
	const [serverError, setServerError] = useState(null)
	const [toast, setToast] = useState(null)

	useEffect(() => {
		if (!organization?.id) return
		setLoading(true)
		teamsAPI.getTeams(organization.id, organization.ownerId)
			.then((res) => setTeams(Array.isArray(res) ? res : []))
			.catch((e) => {
				if (e?.response?.status === 403) setToast({ type: 'error', message: 'Not authorized for this organization.' })
				else if (e?.response?.status !== 404) console.error(e)
			})
			.finally(() => setLoading(false))
	}, [organization?.id, organization?.ownerId])

	useEffect(() => {
		if (!organization?.id) setTeams([])
	}, [organization?.id])

	useEffect(() => {
		if (!toast) return undefined
		const t = setTimeout(() => setToast(null), 4000)
		return () => clearTimeout(t)
	}, [toast])

	const onSaveTeam = async (team) => {
		const { id, ...input } = team
		const payload = id ? input : { ...input, orgId: organization.id, ownerId: organization.ownerId }
		try {
			const saved = id ? await teamsAPI.updateTeam(id, payload, organization.id, organization.ownerId) : await teamsAPI.createTeam(payload)
			setTeams((current) => id ? current.map((item) => item.id === id ? saved : item) : [...current, saved])
			setServerError(null)
			return true
		} catch (e) {
				const detail = e?.response?.data?.detail || 'Failed to save team.'
			if (e?.response?.status === 409) throw new Error(detail, { cause: e })
			setToast({ type: 'error', message: detail })
			throw new Error(detail, { cause: e })
		}
	}

	const onDeleteTeam = async (id) => {
		await teamsAPI.deleteTeam(id, organization.id, organization.ownerId)
		setTeams((current) => current.filter((team) => team.id !== id))
	}

	const saveTeam = async (nextTeam) => {
		try {
			await onSaveTeam(nextTeam)
			setShowForm(false)
			setEditingTeam(null)
			setServerError(null)
		} catch (e) {
			if (e?.message?.includes('already exists')) setServerError(e.message)
			else if (e?.response?.status === 409) setServerError(e.response.data.detail)
		}
	}

	const removeTeam = async (id) => {
		try {
			await onDeleteTeam(id)
			setDeleteTeam(null)
		} catch (e) {
			setToast({ type: 'error', message: e?.response?.data?.detail || 'Failed to delete team.' })
		}
	}
	if (!organization) return <>
		<header className="mb-9"><p className="mb-2.5 text-[11px] font-bold tracking-widest text-muted uppercase">Finance / Team management</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Team management</h1><p className="mt-3 text-[13px] leading-6 text-muted">Keep budgets, ownership, and team roles in one place.</p></header>
		<OrganizationRequiredEmptyState onGoToOrganization={onGoToOrganization} />
	</>

	return (
		<>
			{toast && <div className="fixed top-5 left-1/2 z-30 flex w-[min(100%-2.5rem,520px)] -translate-x-1/2 items-start gap-3 rounded-xl border bg-white p-4 shadow-lg" role="status" aria-live="polite"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${toast.type === 'success' ? 'bg-green-soft text-green' : 'bg-red-50 text-red-600'}`}><Icon name={toast.type === 'success' ? 'check' : 'close'} size={16} /></span><p className="flex-1 pt-1 text-sm text-ink">{toast.message}</p><button className="rounded-md px-1 text-muted hover:text-ink" type="button" onClick={() => setToast(null)}><Icon name="close" size={16} /></button></div>}
			<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div>
					<p className="mb-2.5 text-[11px] font-bold tracking-widest text-muted uppercase">Finance / Team management — {organization.orgName}</p>
					<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Team management</h1>
					<p className="mt-3 text-[13px] leading-6 text-muted">Keep budgets, ownership, and team roles in one place.</p>
				</div>
				<button className={button.primary} type="button" onClick={() => setShowForm(true)}><Icon name="plus" size={16} /> Add team</button>
			</header>
			<OrganizationContext organization={organization} onGoToOrganization={onGoToOrganization} />
			<section className="grid gap-3">
				{loading ? <div className="grid min-h-32 place-items-center rounded-[14px] border border-line bg-white p-8"><p className="text-sm text-muted">Loading teams…</p></div> : teams.length ? teams.map((team) => {
					const percentage = usagePercent(team)
					return (
						<article className="rounded-[14px] border border-line bg-white p-5" key={team.id}>
							<div className="flex items-start justify-between gap-4 max-[700px]:flex-col">
								<div className="flex min-w-0 items-start gap-3">
									<span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="users" size={19} /></span>
									<div className="min-w-0"><h2 className="font-display text-[18px] tracking-[-0.03em] text-ink">{team.name}</h2><p className="mt-1 text-xs text-muted">{(team.members?.length ?? 0)} {(team.members?.length ?? 0) === 1 ? 'member' : 'members'} {team.orgName ? `· ${team.orgName}` : ''}</p></div>
								</div>
								<div className="flex gap-2">
									<button className={button.secondary} type="button" onClick={() => { setEditingTeam(team); setShowForm(true) }}>Edit</button>
									<button className="inline-flex min-h-10.5 items-center justify-center rounded-lg border border-red-200 px-3.75 text-[13px] font-bold text-red-600 transition hover:bg-red-50 focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={() => setDeleteTeam(team)}>Delete</button>
								</div>
							</div>
							<div className="mt-5 grid grid-cols-[1.2fr_1fr] gap-6 border-t border-line pt-5 max-[700px]:grid-cols-1">
								<div>
									<div className="mb-2 flex items-end justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Budget used</p><p className="mt-1 font-display text-[18px] text-ink">${(team.used ?? 0).toLocaleString()} <span className="font-body text-xs text-muted">/ ${(team.budget ?? 0).toLocaleString()}</span></p></div><strong className={percentage >= 90 ? 'text-red-600' : 'text-blue'}>{percentage}%</strong></div>
									<div className="h-2 overflow-hidden rounded-full bg-blue-soft"><div className={percentage >= 90 ? 'h-full rounded-full bg-red-500' : 'h-full rounded-full bg-blue'} style={{ width: `${Math.min(100, percentage)}%` }} /></div>
								</div>
								<div><p className="mb-2 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">Team members</p><div className="flex flex-wrap gap-2">{(team.members ?? []).length ? team.members.map((member) => <span className="rounded-full bg-paper px-3 py-1.5 text-xs text-ink" key={`${member.name}-${member.role}`}>{member.name} <span className="text-muted">· {member.role}</span></span>) : <span className="text-xs text-muted">No members yet — edit to add.</span>}</div></div>
							</div>
						</article>
					)
				}) : (
					<div className="grid min-h-64 place-items-center rounded-[14px] border border-dashed border-line bg-white p-8 text-center">
						<div>
							<span className="mx-auto grid size-11 place-items-center rounded-xl bg-blue-soft text-blue"><Icon name="users" size={20} /></span>
							<h2 className="mt-4 font-display text-[16px]">No teams yet</h2>
							<p className="mt-1 text-xs text-muted">Add your first team for {organization.orgName}.</p>
						</div>
					</div>
				)}
			</section>
			{(showForm || editingTeam) && <TeamModal team={editingTeam} teams={teams} onClose={() => { setShowForm(false); setEditingTeam(null); setServerError(null) }} onSave={saveTeam} serverError={serverError} />}
			{deleteTeam && <DeleteModal team={deleteTeam} onClose={() => setDeleteTeam(null)} onDelete={removeTeam} />}
		</>
	)
}
