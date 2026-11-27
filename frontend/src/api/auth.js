import { authRequest, API_BASE_URL } from './client'

// Tokens never reach JavaScript: the server keeps them in httpOnly cookies. These calls only carry credentials out
// and a profile + remaining lifetime back.
export const authAPI = {
	session: () => authRequest('/api/auth/session', { method: 'GET' }),
	login: (identifier, password, remember) => authRequest('/api/auth/login', { method: 'POST', data: { identifier, password, remember } }),
	// no session yet: the account must verify its email with the emailed code first
	register: (username, email, password) => authRequest('/api/auth/register', { method: 'POST', data: { username, email, password } }),
	verifyEmail: (email, code) => authRequest('/api/auth/verify-email', { method: 'POST', data: { email, code } }),
	resendCode: (email) => authRequest('/api/auth/resend-code', { method: 'POST', data: { email } }),
	forgotPassword: (email) => authRequest('/api/auth/forgot-password', { method: 'POST', data: { email } }),
	resetPassword: (email, code, newPassword) => authRequest('/api/auth/reset-password', { method: 'POST', data: { email, code, newPassword } }),
	logout: () => authRequest('/api/auth/logout', { method: 'POST' }),
	// a full-page navigation (Google sign-in is a redirect flow finished by the backend)
	googleUrl: (remember) => `${API_BASE_URL}/api/auth/google/start${remember ? '?remember=true' : ''}`,
}
