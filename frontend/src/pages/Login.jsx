import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { authAPI } from '../api/auth'
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
	if (typeof detail?.message === 'string') return detail.message
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

const RESEND_SECONDS = 60

export default function Login() {
	const { login, googleUrl } = useAuth()
	// signin | signup | verify (enter the emailed code) | forgot (ask for a reset code) | reset (code + new password)
	const [mode, setMode] = useState('signin')
	const [form, setForm] = useState({ identifier: '', username: '', email: '', password: '', confirm: '' })
	const [code, setCode] = useState('')
	const [notice, setNotice] = useState('')
	const [cooldown, setCooldown] = useState(0) // seconds until another code may be requested
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
	const [showPassword, setShowPassword] = useState(false)
	const [dir, setDir] = useState(0) // 0 = first render (no animation), then which way the content slides in: 1 = from the right, -1 = from the left
	const signingIn = mode === 'signin'
	const tabbed = mode === 'signin' || mode === 'signup'
	const enterClass = dir ? 'animate-fade-slide' : ''
	const enter = { '--enter-x': `${dir * 12}px` }

	useEffect(() => {
		if (cooldown <= 0) return undefined
		const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
		return () => clearTimeout(timer)
	}, [cooldown])

	const goTo = (next, forward = true) => {
		setDir(forward ? 1 : -1)
		setMode(next)
		setError('')
		setNotice('')
		setCode('')
		setShowPassword(false)
	}
	const switchMode = (next) => goTo(next, next === 'signup')
	const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

	const titles = {
		signin: ['Sign in to your account', 'Welcome back. Pick up where you left off.'],
		signup: ['Create your account', 'Start tracking every team budget in minutes.'],
		verify: ['Check your email', `We sent a 6-digit code to ${form.email}. It expires in 10 minutes.`],
		forgot: ['Reset your password', "Enter your account email and we'll send you a code."],
		reset: ['Choose a new password', `Enter the code we sent to ${form.email} and your new password.`],
	}
	const [title, subtitle] = titles[mode]

	const resend = async () => {
		setError('')
		try {
			await (mode === 'reset' ? authAPI.forgotPassword(form.email) : authAPI.resendCode(form.email))
			setCooldown(RESEND_SECONDS)
			setNotice('A new code is on its way.')
		} catch (e) {
			setError(errorText(e))
		}
	}

	const submit = async (event) => {
		event.preventDefault()
		setError('')
		setNotice('')
		const codeOk = /^\d{6}$/.test(code.trim())
		const missing = {
			signin: [!form.identifier.trim() && 'Please enter your username or email.', !form.password && 'Please enter your password.'],
			signup: [!form.username.trim() && 'Please enter a username.', !form.email.trim() && 'Please enter your email.', !form.password && 'Please enter a password.', form.password !== form.confirm && 'The passwords do not match.'],
			verify: [!codeOk && 'Enter the 6-digit code from the email.'],
			forgot: [!form.email.trim() && 'Please enter your email.'],
			reset: [!codeOk && 'Enter the 6-digit code from the email.', form.password.length < 8 && 'Choose a password of at least 8 characters.', form.password !== form.confirm && 'The passwords do not match.'],
		}[mode]
		const firstMissing = missing.find(Boolean)
		if (firstMissing) return setError(firstMissing)
		setBusy(true)
		try {
			if (mode === 'signin') {
				await login(form.identifier.trim(), form.password, remember)
			} else if (mode === 'signup') {
				const email = form.email.trim()
				await authAPI.register(form.username.trim(), email, form.password)
				setForm((f) => ({ ...f, email }))
				setCooldown(RESEND_SECONDS)
				goTo('verify')
			} else if (mode === 'verify') {
				await authAPI.verifyEmail(form.email.trim(), code.trim())
				// the password typed a moment ago is still in this form, so verifying ends in a normal sign-in
				await login(form.email.trim(), form.password, remember)
			} else if (mode === 'forgot') {
				await authAPI.forgotPassword(form.email.trim())
				setForm((f) => ({ ...f, email: f.email.trim(), password: '', confirm: '' }))
				setCooldown(RESEND_SECONDS)
				goTo('reset')
				setNotice('If that email has an account, we sent a code to it.')
			} else {
				await authAPI.resetPassword(form.email.trim(), code.trim(), form.password)
				setForm((f) => ({ ...f, identifier: f.email, password: '', confirm: '' }))
				goTo('signin', false)
				setNotice('Password changed. Sign in with your new password.')
			}
		} catch (e) {
			const detail = e?.response?.data?.detail
			if (mode === 'signin' && e?.response?.status === 403 && detail?.code === 'email_not_verified') {
				// signed up but never entered the code: the server just sent a new one
				setForm((f) => ({ ...f, email: detail.email || f.identifier }))
				setCooldown(RESEND_SECONDS)
				goTo('verify')
			} else {
				setError(errorText(e))
			}
		} finally {
			setBusy(false)
		}
	}

	const submitLabel = { signin: 'Sign in', signup: 'Create account', verify: 'Verify email', forgot: 'Send code', reset: 'Change password' }[mode]

	return (
		<main className="grid min-h-svh bg-paper lg:grid-cols-[1.05fr_1fr]">
			<Showcase />

			<section className="grid place-items-center px-4 py-10 lg:bg-white">
				<div className="w-[min(100%,392px)] rounded-[18px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/8%)] max-[420px]:p-4.5 lg:border-0 lg:p-0 lg:shadow-none">
					<div className="mb-7 flex items-center justify-center gap-2.5 font-display text-lg font-extrabold text-ink lg:hidden">
						<BrandMark className="bg-blue text-white" />
						AI Treasurer
					</div>

					<h1 key={`title-${mode}`} className={`${enterClass} font-display text-[22px] font-extrabold text-ink`} style={enter}>{title}</h1>
					<p key={`sub-${mode}`} className={`${enterClass} mt-1.5 text-[13px] text-muted`} style={enter}>{subtitle}</p>

					{tabbed && (
						<div className="mt-6 mb-5 flex gap-1 rounded-lg bg-paper p-1" role="tablist" aria-label="Account">
							<button type="button" role="tab" aria-selected={signingIn} className={`${tab} ${signingIn ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`} onClick={() => switchMode('signin')}>Sign in</button>
							<button type="button" role="tab" aria-selected={!signingIn} className={`${tab} ${!signingIn ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`} onClick={() => switchMode('signup')}>Create account</button>
						</div>
					)}

					<form onSubmit={submit} className={`grid gap-4 ${tabbed ? '' : 'mt-6'}`} noValidate>
						<div key={mode} className={`${enterClass} grid gap-4`} style={enter}>
							{mode === 'signin' && (
								<label className={label}>Username or email
									<input className={field} value={form.identifier} onChange={set('identifier')} autoComplete="username" autoFocus required maxLength={254} />
								</label>
							)}
							{mode === 'signup' && (
								<>
									<label className={label}>Username
										<input className={field} value={form.username} onChange={set('username')} autoComplete="username" autoFocus required minLength={3} maxLength={30} pattern="[A-Za-z0-9_.]+" />
										<small className="font-normal text-muted">3-30 letters, numbers, dots or underscores. This is also your display name for now.</small>
									</label>
									<label className={label}>Email
										<input className={field} type="email" value={form.email} onChange={set('email')} autoComplete="email" required maxLength={254} />
										<small className="font-normal text-muted">We'll email you a code to confirm it.</small>
									</label>
								</>
							)}
							{mode === 'forgot' && (
								<label className={label}>Email
									<input className={field} type="email" value={form.email} onChange={set('email')} autoComplete="email" autoFocus required maxLength={254} />
								</label>
							)}
							{(mode === 'verify' || mode === 'reset') && (
								<label className={label}>6-digit code
									<input className={`${field} text-center font-display text-lg tracking-[0.5em]`} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="000000" />
								</label>
							)}
							{(mode === 'signin' || mode === 'signup' || mode === 'reset') && (
								<label className={label}>{mode === 'reset' ? 'New password' : 'Password'}
									<span className="relative block">
										<input className={`${field} pr-11`} type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')} autoComplete={signingIn ? 'current-password' : 'new-password'} required minLength={signingIn ? undefined : 8} maxLength={72} />
										<button type="button" className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-xl text-muted hover:text-ink focus-visible:outline-[3px] focus-visible:outline-blue-ring" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((v) => !v)}>
											<Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} />
										</button>
									</span>
									{!signingIn && <small className="font-normal text-muted">At least 8 characters.</small>}
								</label>
							)}
							{(mode === 'signup' || mode === 'reset') && (
								<label className={label}>Confirm password
									<input className={field} type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required maxLength={72} />
								</label>
							)}
							{(mode === 'signin' || mode === 'verify') && (
								<label className="flex items-start gap-2.5 text-[13px] text-ink">
									<input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-blue" checked={remember} onChange={toggleRemember} />
									<span>Remember me<small className="block text-xs text-muted">Stay signed in after you close the browser (up to 60 days). Leave it off on a shared computer.</small></span>
								</label>
							)}
							{signingIn && (
								<button type="button" className="justify-self-start text-xs font-bold text-blue hover:underline focus-visible:outline-[3px] focus-visible:outline-blue-ring" onClick={() => { setForm((f) => ({ ...f, email: f.identifier.includes('@') ? f.identifier.trim() : f.email })); goTo('forgot') }}>Forgot password?</button>
							)}
						</div>
						<p className="min-h-4 text-xs font-bold text-red-600" role="alert" aria-live="polite">{error}</p>
						{notice && <p className="-mt-2 text-xs font-bold text-green" role="status">{notice}</p>}
						<button type="submit" className={`${button.primary} w-full`} disabled={busy}>
							{busy && <Icon name="spinner" size={16} />}
							{submitLabel}
						</button>
						{(mode === 'verify' || mode === 'reset') && (
							<button type="button" className="text-xs font-bold text-blue hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline" disabled={cooldown > 0} onClick={resend}>
								{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
							</button>
						)}
						{!tabbed && (
							<button type="button" className="text-xs font-bold text-muted hover:text-ink" onClick={() => goTo('signin', false)}>Back to sign in</button>
						)}
					</form>

					{tabbed && (
						<>
							<div className="my-4 flex items-center gap-3 text-[11px] font-bold tracking-widest text-muted uppercase"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
							<a className="inline-flex min-h-10.5 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-3.75 text-[13px] font-bold text-ink transition-colors hover:bg-paper focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2" href={googleUrl(remember)}><GoogleMark />Continue with Google</a>
						</>
					)}
				</div>
			</section>
		</main>
	)
}
