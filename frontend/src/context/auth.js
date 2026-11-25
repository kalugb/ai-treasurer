import { createContext, useContext } from 'react'

export const AuthContext = createContext(null)

// { status: 'loading' | 'signedIn' | 'signedOut', user, login, register, logout, googleUrl }
export function useAuth() {
	const ctx = useContext(AuthContext)
	if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
	return ctx
}
