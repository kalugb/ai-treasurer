import { request } from './client'

// "me" is whoever the session cookie says; the server never takes a user id from the client.
export const usersAPI = {
	getMe: () => request('/api/users/me', { method: 'GET' }),
	updateMe: (patch) => request('/api/users/me', { method: 'PATCH', data: patch }),
	driveStatus: () => request('/api/users/me/google-drive', { method: 'GET' }),
	// returns { authUrl }; the browser goes to Google, which redirects back to /?googleDrive=connected|error
	connectDrive: () => request('/api/users/me/google-drive/connect', { method: 'POST' }),
	disconnectDrive: () => request('/api/users/me/google-drive', { method: 'DELETE' }),
}
