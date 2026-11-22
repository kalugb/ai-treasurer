import { useEffect, useState } from 'react'
import { button } from '../components/button'
import { usersAPI } from '../api/users'
import { useToast } from '../context/toast'
import Integration from './Integration'

const field = 'h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'
const CURRENCIES = [['MYR', 'Malaysian Ringgit'], ['USD', 'US Dollar'], ['CAD', 'Canadian Dollar'], ['GBP', 'Pound Sterling']]

const errorText = (e, fallback) => {
	const detail = e?.response?.data?.detail
	if (typeof detail === 'string') return detail
	if (Array.isArray(detail)) return 'Please check the highlighted values (email must look like name@example.com).'
	return fallback
}

export default function Settings() {
	const { push } = useToast()
	const [user, setUser] = useState(null)
	const [loadError, setLoadError] = useState('')
	const [profile, setProfile] = useState({ displayName: '', email: '' })
	const [profileError, setProfileError] = useState('')
	const [savingProfile, setSavingProfile] = useState(false)

	useEffect(() => {
		let cancelled = false
		usersAPI.getMe()
			.then((u) => {
				if (cancelled) return
				setUser(u)
				setProfile({ displayName: u.displayName ?? '', email: u.email ?? '' })
			})
			.catch((e) => { if (!cancelled) setLoadError(errorText(e, 'Could not load your settings.')) })
		return () => { cancelled = true }
	}, [])

	const saveProfile = async (event) => {
		event.preventDefault()
		setSavingProfile(true)
		setProfileError('')
		try {
			const saved = await usersAPI.updateMe({ displayName: profile.displayName, email: profile.email.trim() })
			setUser(saved)
			setProfile({ displayName: saved.displayName ?? '', email: saved.email ?? '' })
			push('Profile saved')
		} catch (e) {
			setProfileError(errorText(e, 'Could not save your profile.'))
		} finally {
			setSavingProfile(false)
		}
	}

	// preferences save on change; the previous value comes back if the save fails
	const saveSetting = async (key, value) => {
		const previous = user.settings
		setUser((u) => ({ ...u, settings: { ...u.settings, [key]: value } }))
		try {
			const saved = await usersAPI.updateMe({ settings: { [key]: value } })
			setUser(saved)
		} catch (e) {
			setUser((u) => ({ ...u, settings: previous }))
			push(errorText(e, 'Could not save that preference.'), 'error')
		}
	}

	const settings = user?.settings
	return (
		<>
			<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div><p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Workspace preferences</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Settings</h1><p className="mt-3 text-[13px] leading-[1.55] text-muted">Make AI Treasurer work the way you do.</p></div>
			</header>
			{loadError && <p className="mb-3.5 rounded-lg bg-red-soft px-3.5 py-2.5 text-[13px] text-red" role="alert">{loadError}</p>}
			<section className="grid grid-cols-2 gap-3.5 max-[820px]:grid-cols-1">
				<form onSubmit={saveProfile} className="grid content-start gap-4.5 rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
					<div className="mb-5 flex items-start justify-between gap-4.5"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">Profile</h2><p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Your personal details</p></div></div>
					<label className="grid gap-1.75 text-xs font-bold text-ink">Display name<input className={field} value={profile.displayName} maxLength={80} disabled={!user} onChange={(e) => setProfile((p) => ({ ...p, displayName: e.target.value }))} /></label>
					<label className="grid gap-1.75 text-xs font-bold text-ink">Email address<input className={field} value={profile.email} maxLength={254} type="email" disabled={!user} aria-invalid={Boolean(profileError)} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} /></label>
					{profileError && <p className="text-xs text-red" role="alert">{profileError}</p>}
					<button type="submit" className={button.primary} disabled={!user || savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</button>
				</form>
				<article className="grid content-start gap-4.5 rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
					<div className="mb-5 flex items-start justify-between gap-4.5"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">AI preferences</h2><p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Tune how your assistant helps</p></div></div>
					<label className="flex items-center justify-between gap-3.5"><span><strong className="text-xs">Monthly spending summaries</strong><small className="mt-1 block text-muted">Receive a plain-English recap</small></span><input type="checkbox" className="h-5 w-9 accent-blue" checked={settings?.monthlySummaries ?? false} disabled={!settings} onChange={(e) => saveSetting('monthlySummaries', e.target.checked)} /></label>
					<label className="flex items-center justify-between gap-3.5"><span><strong className="text-xs">Review reminders</strong><small className="mt-1 block text-muted">Get notified when receipts need attention</small></span><input type="checkbox" className="h-5 w-9 accent-blue" checked={settings?.reviewReminders ?? false} disabled={!settings} onChange={(e) => saveSetting('reviewReminders', e.target.checked)} /></label>
					<label className="grid gap-1.75 text-xs font-bold text-ink">Default currency<select className={field} value={settings?.currency ?? 'MYR'} disabled={!settings} onChange={(e) => saveSetting('currency', e.target.value)}>{CURRENCIES.map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}</select></label>
				</article>
			</section>
			<Integration />
		</>
	)
}
