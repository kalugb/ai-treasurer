import { request } from './client'

// Drive sync lists + reconciles the whole folder; allow generous time for large folders.
export const SYNC_TIMEOUT_MS = 120000

export const receiptsAPI = {
	getReceipts: (teamId, refresh = false) =>
		request(`/api/google-drive/teams/${teamId}/receipts`, { method: 'GET', ...(refresh ? { params: { refresh: true } } : {}) }),
	sync: (teamId) =>
		request(`/api/google-drive/teams/${teamId}/receipts/sync`, { method: 'POST', timeout: SYNC_TIMEOUT_MS }),
	updateReceipt: (teamId, fileId, patch) =>
		request(`/api/google-drive/teams/${teamId}/receipts/${fileId}`, { method: 'PATCH', data: patch }),
}
