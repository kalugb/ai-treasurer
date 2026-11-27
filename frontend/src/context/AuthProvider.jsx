import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { authAPI } from '../api/auth'
import { refreshSession, setSignedOutHandler } from '../api/client'
import { AuthContext } from './auth'

const REFRESH_MARGIN = 60 // seconds before the access cookie expires that we renew it

// Who is signed in. The session itself is in httpOnly cookies (the browser never sees a token); this only holds the
// profile and keeps the cookie fresh so thumbnails, downloads and the agent stream (which can't retry) keep working.
export function AuthProvider({ children }) {
	const [state, setState] = useState({ status: 'loading', user: null })
	const hadSession = useRef(false) // a user was signed in during this page's life
	const timer = useRef(null)
	const scheduleRef = useRef(null)

	const signedIn = useCallback((body) => {
		hadSession.current = true
		setState({ status: 'signedIn', user: body.user })
		scheduleRef.current(body.expiresIn)
	}, [])

	const signedOut = useCallback(() => {
		clearTimeout(timer.current)
		// the next person to sign in on this page must not see the previous one's remembered org, page or snapshot
		if (hadSession.current) sessionStorage.clear()
		setState({ status: 'signedOut', user: null })
	}, [])

	useEffect(() => {
		scheduleRef.current = (expiresIn) => {
			clearTimeout(timer.current)
			timer.current = setTimeout(() => {
				// a failed refresh is handled by the 401 path of the next request
				refreshSession().then((body) => scheduleRef.current(body.expiresIn)).catch(() => {})
			}, Math.max(30, expiresIn - REFRESH_MARGIN) * 1000)
		}
		setSignedOutHandler(signedOut)
		// an expired access cookie with a live refresh cookie (e.g. the tab was closed overnight) is still a signed-in user
		authAPI.session().catch(() => refreshSession()).then(signedIn).catch(signedOut)
		return () => clearTimeout(timer.current)
	}, [signedIn, signedOut])

	// Module-level caches (overview figures, profile, selected organization) belong to whoever was signed in before,
	// so a sign-in after a session ended reloads the page instead of swapping the user underneath them.
	const finish = useCallback((body) => {
		if (hadSession.current) window.location.reload()
		else signedIn(body)
	}, [signedIn])

	const login = useCallback(async (identifier, password, remember) => finish(await authAPI.login(identifier, password, remember)), [finish])

	const logout = useCallback(async () => {
		try { await authAPI.logout() } catch { /* the cookies are cleared by the next failed refresh anyway */ }
		sessionStorage.clear()
		window.location.assign('/') // a full reload also drops every in-memory cache and the agent stream
	}, [])

	const value = useMemo(
		() => ({ ...state, login, logout, googleUrl: authAPI.googleUrl }),
		[state, login, logout],
	)
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
