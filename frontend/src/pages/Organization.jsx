import { useEffect, useState, useRef } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { organizationAPI } from '../api/organization'

export default function Organization() {
	const [organizations, setOrganizations] = useState([])
	const [name, setName] = useState('')
	const [editing, setEditing] = useState(null)
	const [showModal, setShowModal] = useState(false)
	const [toast, setToast] = useState(null)
	const hasFetched = useRef(false)

	useEffect(() => {
		if (!toast) return undefined
		const timer = window.setTimeout(() => setToast(null), 4000)
		return () => window.clearTimeout(timer)
	}, [toast])

	useEffect(() => {
		if (hasFetched.current) return
		hasFetched.current = true

		const fetchOrganizations = async () => {
			try {
				// for now, treat public ip addr as ownerId before auth is implemented
				// const ipRes = await fetch('https://api.ipify.org?format=json');
				// const ipData = await ipRes.json();
				const ownerId = "1"

				const res = await organizationAPI.getOrganization(ownerId);
				console.log(res);
			} catch (error) {
				console.error('Error fetching organizations:', error)
				// setToast({ type: 'error', message: 'Failed to fetch organizations. Please try again later.' })
			}
		}

		fetchOrganizations()
	}, [])

	const save = (event) => {
		event.preventDefault()
		const value = name.trim()
		if (!value) {
			setToast({ type: 'error', message: 'Organization creation failed. Enter an organization name.' })
			return
		}
		if (organizations.some((organization, index) => index !== editing && organization.toLowerCase() === value.toLowerCase())) {
			setToast({ type: 'error', message: `Organization ${value} creation failed. That name already exists.` })
			return
		}
		setOrganizations((current) => editing === null
			? [...current, value]
			: current.map((organization, index) => index === editing ? value : organization))
		setToast({ type: 'success', message: editing === null ? `Organization ${value} is created successfully.` : `Organization ${value} is updated successfully.` })
		setName('')
		setEditing(null)
		setShowModal(false)
	}

	const edit = (index) => {
		setEditing(index)
		setName(organizations[index])
		setShowModal(true)
	}

	const closeModal = () => {
		setShowModal(false)
		setEditing(null)
		setName('')
	}

	const remove = (index) => {
		setOrganizations((current) => current.filter((_, itemIndex) => itemIndex !== index))
		if (editing === index) {
			setEditing(null)
			setName('')
		}
	}

	return (
		<>
			{toast && <div className="fixed top-5 left-1/2 z-30 flex w-[min(100%-2.5rem,520px)] -translate-x-1/2 items-start gap-3 rounded-xl border bg-white p-4 shadow-lg" role="status" aria-live="polite"><span className={`grid size-8 shrink-0 place-items-center rounded-lg ${toast.type === 'success' ? 'bg-green-soft text-green' : 'bg-red-50 text-red-600'}`}><Icon name={toast.type === 'success' ? 'check' : 'close'} size={16} /></span><p className="flex-1 pt-1 text-sm text-ink">{toast.message}</p><button className="rounded-md px-1 text-muted hover:text-ink focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={() => setToast(null)} aria-label="Dismiss notification"><Icon name="close" size={16} /></button></div>}
			<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div><p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Workspace</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Organizations</h1><p className="mt-3 text-[13px] leading-[1.55] text-muted">Create and manage the organizations that keep your finances separate.</p></div>
				<button className={button.primary} type="button" onClick={() => setShowModal(true)}><Icon name="plus" size={16} /> Add organization</button>
			</header>
			<section className="grid content-start gap-4.5 rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
				<div className="flex items-start justify-between gap-4.5"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">Your organizations</h2><p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Local-only for now. Changes are kept in this page while it is open.</p></div><span className="rounded-[20px] bg-blue-soft px-2.25 py-1.5 text-[11px] font-bold text-blue">{organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'}</span></div>
				<div className="grid border-t border-line">
					{organizations.length ? organizations.map((organization, index) => <div className="flex items-center gap-3 border-t border-line py-4" key={`${organization}-${index}`}><span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="grid" size={16} /></span><span className="grid flex-1 gap-1.25"><strong>{organization}</strong><small className="text-xs text-muted">Local organization</small></span><span className="flex items-center gap-2"><button className="rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold text-blue hover:border-blue hover:bg-blue-soft" onClick={() => edit(index)}>Edit</button><button className="rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold text-brown hover:border-brown hover:bg-brown-soft" onClick={() => remove(index)}>Remove</button></span></div>) : <div className="grid min-h-48 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-soft text-blue"><Icon name="grid" size={22} /></span><h3 className="mt-4 font-display text-[16px]">No organizations yet</h3><p className="mt-1 text-xs text-muted">Create your first organization to keep your finances separate.</p></div></div>}
				</div>
			</section>
			{showModal && <div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}><div className="w-[min(100%,480px)] rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="organization-modal-title"><div className="mb-6 flex items-start justify-between gap-4"><div><h2 id="organization-modal-title" className="font-display text-[20px] tracking-[-0.03em]">{editing === null ? 'Add organization' : 'Edit organization'}</h2><p className="mt-1.5 text-[13px] leading-6 text-muted">Give this organization a clear, recognizable name.</p></div><button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={closeModal}>Close</button></div><form className="grid gap-5" onSubmit={save}><label className="grid gap-2 text-xs font-bold text-ink">Organization name<input className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Inc." autoFocus /></label><div className="flex gap-2 border-t border-line pt-5"><button className={button.primary} type="submit">{editing === null ? 'Create organization' : 'Save changes'}</button><button className={button.secondary} type="button" onClick={closeModal}>Cancel</button></div></form></div></div>}
		</>
	)
}
