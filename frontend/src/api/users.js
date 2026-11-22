import { request } from './client'
import { CURRENT_USER_ID } from './currentUser'

const me = { userId: CURRENT_USER_ID }

export const usersAPI = {
	getMe: () => request('/api/users/me', { method: 'GET', params: me }),
	updateMe: (patch) => request('/api/users/me', { method: 'PATCH', data: patch, params: me }),
	driveStatus: () => request('/api/users/me/google-drive', { method: 'GET', params: me }),
	// returns { authUrl }; the browser goes to Google, which redirects back to /?googleDrive=connected|error
	connectDrive: () => request('/api/users/me/google-drive/connect', { method: 'POST', params: me }),
	disconnectDrive: () => request('/api/users/me/google-drive', { method: 'DELETE', params: me }),
}
