import { authRequest, API_BASE_URL } from './client'

// Tokens never reach JavaScript: the server keeps them in httpOnly cookies. These calls only carry credentials out
// and a profile + remaining lifetime back.
export const authAPI = {
	session: () => authRequest('/api/auth/session', { method: 'GET' }),
	login: (identifier, password, remember) => authRequest('/api/auth/login', { method: 'POST', data: { identifier, password, remember } }),
	register: (username, email, password, remember) => authRequest('/api/auth/register', { method: 'POST', data: { username, email, password, remember } }),
	logout: () => authRequest('/api/auth/logout', { method: 'POST' }),
	// a full-page navigation (Google sign-in is a redirect flow finished by the backend)
	googleUrl: (remember) => `${API_BASE_URL}/api/auth/google/start${remember ? '?remember=true' : ''}`,
}
