import { useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
import { useAuth } from '../context/auth'

const field = 'h-10.5 w-full rounded-[7px] border border-line bg-paper px-3 text-[13px] text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'
const label = 'grid gap-1.75 text-xs font-bold text-ink'
const tab = 'h-9 flex-1 rounded-md text-[13px] font-bold transition-colors focus-visible:outline-[3px] focus-visible:outline-blue-ring'

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
	const signingIn = mode === 'signin'
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
		<main className="grid min-h-svh place-items-center bg-paper px-4 py-10">
			<div className="w-[min(100%,400px)]">
				<div className="mb-6 flex items-center justify-center gap-2.5 font-display text-lg font-extrabold text-ink">
					<span className="grid size-8 place-items-center rounded-[9px] bg-blue text-white"><Icon name="spark" size={18} /></span>
					AI Treasurer
				</div>
				<div className="rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36/8%)] max-[420px]:p-4.5">
					<div className="mb-5 flex gap-1 rounded-lg bg-paper p-1" role="tablist" aria-label="Account">
						<button type="button" role="tab" aria-selected={signingIn} className={`${tab} ${signingIn ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`} onClick={() => { setMode('signin'); setError('') }}>Sign in</button>
						<button type="button" role="tab" aria-selected={!signingIn} className={`${tab} ${!signingIn ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`} onClick={() => { setMode('signup'); setError('') }}>Create account</button>
					</div>

					<form onSubmit={submit} className="grid gap-4" noValidate>
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
						<p className="min-h-4 text-xs text-red" role="alert" aria-live="polite">{error}</p>
						<button type="submit" className={`${button.primary} w-full`} disabled={busy}>
							{busy && <Icon name="spinner" size={16} className="shrink-0" />}
							{signingIn ? 'Sign in' : 'Create account'}
						</button>
					</form>

					<div className="my-4 flex items-center gap-3 text-[11px] font-bold tracking-widest text-muted uppercase"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
					<a className="inline-flex min-h-10.5 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-3.75 text-[13px] font-bold text-ink transition-colors hover:bg-paper focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2" href={googleUrl(remember)}><GoogleMark />Continue with Google</a>
				</div>
			</div>
		</main>
	)
}
