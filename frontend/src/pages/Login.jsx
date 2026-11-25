import { useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { useAuth } from '../context/auth'

const field = 'h-11 w-full rounded-xl border border-line bg-paper px-3.75 text-[13px] text-ink outline-none transition-colors focus:border-blue focus:bg-white focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'
const label = 'grid gap-1.75 text-xs font-bold text-ink'
const tab = 'h-9 flex-1 rounded-md text-[13px] font-bold transition-colors focus-visible:outline-[3px] focus-visible:outline-blue-ring'
const floatCard = 'absolute rounded-2xl bg-white p-4 text-ink shadow-[0_24px_50px_rgb(10_20_40/30%)] ring-1 ring-black/5'

const REDIRECT_ERRORS = { error: 'Google sign-in did not finish. Please try again.', disabled: 'This account is disabled.' }

// Readable message from an API error: our own `detail` string, or the first validation message.
function errorText(e) {
	if (!e?.response) return "Can't reach the server. Check your connection and try again."
	const detail = e.response.data?.detail
	if (typeof detail === 'string') return detail
	if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg.replace(/^Value error, /, '')
	return 'Something went wrong. Please try again.'
}

function GoogleMark() {
	return (
		<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
			<path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
			<path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.2-3.9 7.2-9.6 7.2-16.8z" />
			<path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
			<path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
		</svg>
	)
}

function BrandMark({ className = '' }) {
	return (
		<span className={`grid size-8 place-items-center rounded-[9px] ${className}`}><Icon name="spark" size={18} /></span>
	)
}

// Decorative only: the marketing panel never shows real data.
function Showcase() {
	return (
		<aside aria-hidden="true" className="relative hidden overflow-hidden bg-[linear-gradient(160deg,oklch(30%_0.13_258),oklch(45%_0.17_255)_52%,oklch(62%_0.16_32))] px-10 py-9 text-white lg:flex lg:flex-col">
			<div className="pointer-events-none absolute inset-0 [background:radial-gradient(58%_48%_at_12%_2%,oklch(70%_0.2_250/60%),transparent),radial-gradient(52%_44%_at_92%_98%,oklch(78%_0.18_40/55%),transparent)]" />
			<div className="relative flex items-center gap-2.5 font-display text-lg font-extrabold">
				<BrandMark className="bg-white/15 ring-1 ring-white/25" />
				AI Treasurer
			</div>

			<div className="relative my-auto grid place-items-center py-8">
				<div className="relative h-[380px] w-[min(100%,360px)]">
					<div className={`${floatCard} -left-2 top-2 w-44 -rotate-6`}>
						<p className="text-[10px] font-bold tracking-wider text-muted uppercase">Total spent</p>
						<p className="mt-1 font-display text-lg font-extrabold">RM40,832.32</p>
						<div className="mt-3 flex items-end gap-1.5">
							{[38, 66, 48, 30, 74].map((h, i) => (
								<span key={i} className={`w-5 rounded-md ${i === 4 ? 'bg-blue' : i === 1 ? 'bg-green' : 'bg-brown-soft'}`} style={{ height: `${h}%` }} />
							))}
						</div>
					</div>

					<div className={`${floatCard} -right-1 top-28 w-52 rotate-3`}>
						<p className="text-[10px] font-bold tracking-wider text-muted uppercase">Cash balance</p>
						<p className="mt-1 font-display text-xl font-extrabold">RM12,485.00</p>
						<p className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-soft px-2 py-0.5 text-[10px] font-bold text-green">
							<Icon name="trend" size={11} /> 15.6% this month
						</p>
					</div>

					<div className={`${floatCard} bottom-2 left-3 w-40 rotate-2`}>
						<p className="text-[10px] font-bold tracking-wider text-muted uppercase">Receipts</p>
						<p className="mt-1 font-display text-xl font-extrabold">218</p>
						<p className="mt-1 text-[10px] text-muted">filed and matched</p>
					</div>

					<div className={`${floatCard} bottom-20 -right-2 flex w-40 rotate-[-4deg] items-center gap-2.5 p-3`}>
						<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="check" size={16} /></span>
						<span className="text-[11px] font-bold leading-tight">Reimbursement paid</span>
					</div>
				</div>
			</div>

			<div className="relative max-w-[38ch]">
				<p className="font-display text-2xl font-extrabold leading-tight">Every receipt, budget and payout in one place.</p>
				<p className="mt-2 text-[13px] leading-relaxed text-white/70">Sync Google Drive, track each team's spending and let the AI agent handle the paperwork.</p>
			</div>
		</aside>
	)
}

export default function Login() {
	const { login, register, googleUrl } = useAuth()
	const [mode, setMode] = useState('signin')
	const [form, setForm] = useState({ identifier: '', username: '', email: '', password: '' })
	// only the choice is remembered (never the credentials), so the box stays ticked for people who ticked it
	const [remember, setRemember] = useState(() => localStorage.getItem('auth:remember') === '1')
	const toggleRemember = (event) => {
		setRemember(event.target.checked)
		localStorage.setItem('auth:remember', event.target.checked ? '1' : '0')
	}
	const [error, setError] = useState(() => {
		const code = new URLSearchParams(window.location.search).get('auth') // set by the Google callback on failure
		if (code) window.history.replaceState(null, '', window.location.pathname)
		return REDIRECT_ERRORS[code] ?? ''
	})
	const [busy, setBusy] = useState(false)
	const [dir, setDir] = useState(0) // 0 = first render (no animation), then which way the content slides in: 1 = from the right, -1 = from the left
	const signingIn = mode === 'signin'
	const enterClass = dir ? 'animate-fade-slide' : ''
	const enter = { '--enter-x': `${dir * 12}px` }
	const switchMode = (next) => {
		setDir(next === 'signup' ? 1 : -1)
		setMode(next)
		setError('')
	}
	const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

	const submit = async (event) => {
		event.preventDefault()
		setBusy(true)
		setError('')
		try {
			if (signingIn) await login(form.identifier.trim(), form.password, remember)
			else await register(form.username.trim(), form.email.trim(), form.password, remember)
		} catch (e) {
			setError(errorText(e))
			setBusy(false)
		}
	}

	return (
		<main className="grid min-h-svh bg-paper lg:grid-cols-[1.05fr_1fr]">
			<Showcase />

			<section className="grid place-items-center px-4 py-10 lg:bg-white">
				<div className="w-[min(100%,392px)] rounded-[18px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/8%)] max-[420px]:p-4.5 lg:border-0 lg:p-0 lg:shadow-none">
					<div className="mb-7 flex items-center justify-center gap-2.5 font-display text-lg font-extrabold text-ink lg:hidden">
						<BrandMark className="bg-blue text-white" />
						AI Treasurer
					</div>

					<h1 key={`title-${mode}`} className={`${enterClass} font-display text-[22px] font-extrabold text-ink`} style={enter}>{signingIn ? 'Sign in to your account' : 'Create your account'}</h1>
					<p key={`sub-${mode}`} className={`${enterClass} mt-1.5 text-[13px] text-muted`} style={enter}>{signingIn ? 'Welcome back. Pick up where you left off.' : 'Start tracking every team budget in minutes.'}</p>

					<div className="mt-6 mb-5 flex gap-1 rounded-lg bg-paper p-1" role="tablist" aria-label="Account">
						<button type="button" role="tab" aria-selected={signingIn} className={`${tab} ${signingIn ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`} onClick={() => switchMode('signin')}>Sign in</button>
						<button type="button" role="tab" aria-selected={!signingIn} className={`${tab} ${!signingIn ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`} onClick={() => switchMode('signup')}>Create account</button>
					</div>

					<form onSubmit={submit} className="grid gap-4" noValidate>
						<div key={mode} className={`${enterClass} grid gap-4`} style={enter}>
							{signingIn ? (
								<label className={label}>Username or email
									<input className={field} value={form.identifier} onChange={set('identifier')} autoComplete="username" autoFocus required maxLength={254} />
								</label>
							) : (
								<>
									<label className={label}>Username
										<input className={field} value={form.username} onChange={set('username')} autoComplete="username" autoFocus required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" />
										<small className="font-normal text-muted">3-30 letters, numbers, dots or underscores. This is also your display name for now.</small>
									</label>
									<label className={label}>Email
										<input className={field} type="email" value={form.email} onChange={set('email')} autoComplete="email" required maxLength={254} />
									</label>
								</>
							)}
							<label className={label}>Password
								<input className={field} type="password" value={form.password} onChange={set('password')} autoComplete={signingIn ? 'current-password' : 'new-password'} required minLength={signingIn ? undefined : 8} maxLength={72} />
								{!signingIn && <small className="font-normal text-muted">At least 8 characters.</small>}
							</label>
							<label className="flex items-start gap-2.5 text-[13px] text-ink">
								<input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-blue" checked={remember} onChange={toggleRemember} />
								<span>Remember me<small className="block text-xs text-muted">Stay signed in after you close the browser (up to 60 days). Leave it off on a shared computer.</small></span>
							</label>
						</div>
						<p className="min-h-4 text-xs text-red" role="alert" aria-live="polite">{error}</p>
						<button type="submit" className={`${button.primary} w-full`} disabled={busy}>
							{busy && <Icon name="spinner" size={16} />}
							{signingIn ? 'Sign in' : 'Create account'}
						</button>
					</form>

					<div className="my-4 flex items-center gap-3 text-[11px] font-bold tracking-widest text-muted uppercase"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
					<a className="inline-flex min-h-10.5 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-3.75 text-[13px] font-bold text-ink transition-colors hover:bg-paper focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2" href={googleUrl(remember)}><GoogleMark />Continue with Google</a>
				</div>
			</section>
		</main>
	)
}
