import { useEffect, useState, useRef } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { organizationAPI } from '../api/organization'

// eslint-disable-next-line no-unused-vars
const getPublicIP = async () => {
	try {
		const response = await fetch('https://api.ipify.org?format=json')
		if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
		const data = await response.json()
		return data.ip
	} catch (error) {
		console.error('Error fetching public IP:', error)
		return '1'
	}
}

export default function Organization({ selectedId = null, onSelect }) {
	const [organizations, setOrganizations] = useState([])
	const [name, setName] = useState('')
	const [editingId, setEditingId] = useState(null)
	const [showModal, setShowModal] = useState(false)
	const [toast, setToast] = useState(null)
	const [loading, setLoading] = useState(true)
	const [saving, setSaving] = useState(false)
	const hasFetched = useRef(false)
	const ownerIdRef = useRef(null)

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
				// const ownerId = await getPublicIP()
				const ownerId = "1"
				ownerIdRef.current = ownerId
				const res = await organizationAPI.getOrganization(ownerId)
				const items = Array.isArray(res)
					? res.map((org) => ({
						id: org?.id ?? org?._id ?? null,
						orgName: org?.orgName ?? org?.org_name ?? org?.name ?? null,
						createdAt: org?.createdAt ?? org?.created_at ?? null,
						ownerId: org?.ownerId ?? org?.owner_id ?? ownerId,
					})).filter((o) => o.orgName && o.id)
					: []
				setOrganizations(items)
			} catch (error) {
				if (error?.response?.status !== 404) {
					console.error('Error fetching organizations:', error)
					setToast({ type: 'error', message: 'Failed to fetch organizations. Please try again later.' })
				}
			} finally {
				setLoading(false)
			}
		}
		fetchOrganizations()
	}, [])

	const formatCreatedAt = (value) => {
		if (!value) return null
		const d = new Date(value)
		if (Number.isNaN(d.getTime())) return String(value)
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
	}

	const save = async (event) => {
		event.preventDefault()
		const value = name.trim()
		if (!value) {
			setToast({ type: 'error', message: 'Organization creation failed. Enter an organization name.' })
			return
		}
		if (organizations.some((org) => org.id !== editingId && org.orgName.toLowerCase() === value.toLowerCase())) {
			setToast({ type: 'error', message: `Organization ${value} creation failed. That name already exists.` })
			return
		}
		setSaving(true)
		try {
			// const ownerId = ownerIdRef.current ?? await getPublicIP()
			const ownerId = ownerIdRef.current ?? "1"
			ownerIdRef.current = ownerId
			if (editingId === null) {
				const created = await organizationAPI.createOrganization({ orgName: value, ownerId })
				setOrganizations((cur) => [...cur, { id: created.id, orgName: created.orgName, createdAt: created.createdAt, ownerId: created.ownerId }])
				setToast({ type: 'success', message: `Organization ${value} is created successfully.` })
			} else {
				const updated = await organizationAPI.updateOrganization(editingId, { orgName: value })
				setOrganizations((cur) => cur.map((org) => org.id === editingId ? { ...org, orgName: updated.orgName } : org))
				if (selectedId === editingId && onSelect) {
					onSelect({ id: updated.id, orgName: updated.orgName, createdAt: updated.createdAt, ownerId: updated.ownerId })
				}
				setToast({ type: 'success', message: `Organization ${value} is updated successfully.` })
			}
			setName('')
			setEditingId(null)
			setShowModal(false)
		} catch (error) {
			const detail = error?.response?.data?.detail
			if (error?.response?.status === 409) {
				setToast({ type: 'error', message: detail || `Organization ${value} already exists.` })
			} else {
				setToast({ type: 'error', message: detail || 'Failed to save organization. Please try again.' })
			}
		} finally {
			setSaving(false)
		}
	}

	const edit = (id) => {
		const org = organizations.find((o) => o.id === id)
		setEditingId(id)
		setName(org?.orgName ?? '')
		setShowModal(true)
	}

	const closeModal = () => {
		setShowModal(false)
		setEditingId(null)
		setName('')
	}

	const select = (org) => {
		if (!onSelect) return
		onSelect({ id: org.id, orgName: org.orgName, createdAt: org.createdAt, ownerId: org.ownerId })
		setToast({ type: 'success', message: `Organization ${org.orgName} selected.` })
	}

	const remove = async (id) => {
		const org = organizations.find((o) => o.id === id)
		try {
			await organizationAPI.deleteOrganization(id)
			setOrganizations((cur) => cur.filter((o) => o.id !== id))
			if (selectedId === id && onSelect) onSelect(null)
			if (editingId === id) {
				setEditingId(null)
				setName('')
			}
			setToast({ type: 'success', message: `Organization ${org?.orgName ?? ''} removed.` })
		} catch (error) {
			setToast({ type: 'error', message: error?.response?.data?.detail || 'Failed to remove organization.' })
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
				<div className="flex items-start justify-between gap-4.5"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">Your organizations</h2><p className="mt-1.5 text-[13px] leading-[1.55] text-muted">{loading ? 'Loading organizations…' : `${organizations.length} from server`}</p></div><span className="rounded-[20px] bg-blue-soft px-2.25 py-1.5 text-[11px] font-bold text-blue">{organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'}</span></div>
				<div className="grid border-t border-line">
					{loading ? <div className="grid min-h-48 place-items-center p-8 text-center"><p className="text-sm text-muted">Loading…</p></div> : organizations.length ? organizations.map((org) => {
						const created = formatCreatedAt(org.createdAt)
						const isSelected = org.id === selectedId
						return <div className={`flex items-center gap-3 border-t border-line py-4 ${isSelected ? 'rounded-lg bg-blue-soft/40 -mx-2 px-2' : ''}`} key={org.id}><span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="grid" size={16} /></span><span className="grid flex-1 gap-1.25"><strong className="flex items-center gap-2">{org.orgName}{isSelected && <span className="rounded-full bg-blue px-2 py-0.5 text-[10px] font-bold text-white">Selected</span>}</strong><small className="text-xs text-muted">{created ? `Created ${created} • Synced from server` : 'Synced from server'}</small></span><span className="flex items-center gap-2"><button className={`rounded-md border px-1.75 py-1.25 text-[10px] font-bold ${isSelected ? 'border-blue bg-blue text-white' : 'border-line bg-transparent text-blue hover:border-blue hover:bg-blue-soft'}`} onClick={() => select(org)} disabled={isSelected} aria-pressed={isSelected}>{isSelected ? 'Selected' : 'Select'}</button><button className="rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold text-blue hover:border-blue hover:bg-blue-soft" onClick={() => edit(org.id)}>Edit</button><button className="rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold text-brown hover:border-brown hover:bg-brown-soft" onClick={() => remove(org.id)}>Remove</button></span></div>
					}) : <div className="grid min-h-48 place-items-center p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-soft text-blue"><Icon name="grid" size={22} /></span><h3 className="mt-4 font-display text-[16px]">No organizations yet</h3><p className="mt-1 text-xs text-muted">Create your first organization to keep your finances separate.</p></div></div>}
				</div>
			</section>
			{showModal && <div className="fixed inset-0 z-20 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}><div className="w-[min(100%,480px)] rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="organization-modal-title"><div className="mb-6 flex items-start justify-between gap-4"><div><h2 id="organization-modal-title" className="font-display text-[20px] tracking-[-0.03em]">{editingId === null ? 'Add organization' : 'Edit organization'}</h2><p className="mt-1.5 text-[13px] leading-6 text-muted">Give this organization a clear, recognizable name.</p></div><button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={closeModal}>Close</button></div><form className="grid gap-5" onSubmit={save}><label className="grid gap-2 text-xs font-bold text-ink">Organization name<input className="h-10 w-full rounded-lg border border-line bg-paper px-3 text-[13px] text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Inc." autoFocus disabled={saving} /></label><div className="flex gap-2 border-t border-line pt-5"><button className={button.primary} type="submit" disabled={saving}>{saving ? 'Saving…' : editingId === null ? 'Create organization' : 'Save changes'}</button><button className={button.secondary} type="button" onClick={closeModal} disabled={saving}>Cancel</button></div></form></div></div>}
		</>
	)
}
