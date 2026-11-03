import { request, requestWithFile, API_BASE_URL } from './client'

// Drive sync lists + reconciles the whole folder; allow generous time for large folders.
export const SYNC_TIMEOUT_MS = 120000

// absolute URL for the SSE stream (EventSource can't use the axios client)
export const syncStreamUrl = (teamId) => `${API_BASE_URL}/api/google-drive/teams/${teamId}/receipts/sync/stream`

export const receiptsAPI = {
	getReceipts: (teamId, refresh = false) =>
		request(`/api/google-drive/teams/${teamId}/receipts`, { method: 'GET', ...(refresh ? { params: { refresh: true } } : {}) }),
	sync: (teamId) =>
		request(`/api/google-drive/teams/${teamId}/receipts/sync`, { method: 'POST', timeout: SYNC_TIMEOUT_MS }),
	updateReceipt: (teamId, fileId, patch) =>
		request(`/api/google-drive/teams/${teamId}/receipts/${fileId}`, { method: 'PATCH', data: patch }),
	upload: (teamId, formData) =>
		requestWithFile(`/api/google-drive/teams/${teamId}/receipts/upload`, formData),
}
