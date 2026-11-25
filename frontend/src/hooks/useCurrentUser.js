import { useEffect, useState } from 'react'
import { usersAPI } from '../api/users'

const USER_CHANGED_EVENT = 'ai-treasurer:user-changed'
let lastUser = null // shared across components so the sidebar doesn't refetch on every page change

// The current user's profile from the database (GET /api/users/me); updates when Settings saves.
export function useCurrentUser() {
	const [user, setUser] = useState(lastUser)

	useEffect(() => {
		let cancelled = false
		const onChange = (event) => setUser(event.detail)
		window.addEventListener(USER_CHANGED_EVENT, onChange)
		usersAPI.getMe()
			.then((u) => { lastUser = u; if (!cancelled) setUser(u) })
			.catch((error) => console.error('Error loading the current user:', error))
		return () => {
			cancelled = true
			window.removeEventListener(USER_CHANGED_EVENT, onChange)
		}
	}, [])

	return user
}

export function dispatchUserChange(user) {
	lastUser = user
	window.dispatchEvent(new CustomEvent(USER_CHANGED_EVENT, { detail: user }))
}

export function userInitials(user) {
	const name = user?.displayName?.trim()
	if (name) return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
	return (user?.email?.[0] ?? '?').toUpperCase()
}
