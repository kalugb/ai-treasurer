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
	remove: (teamId, ids) =>
		request(`/api/google-drive/teams/${teamId}/receipts/delete`, { method: 'POST', data: { ids } }),
}

// backend returns persisted receipts; map to the shape the UI renders (shared by Folders + ReceiptPickerModal)
export const toReceipt = (r) => ({
	id: r.googleDriveFileId,
	googleDriveFileId: r.googleDriveFileId,
	filename: r.receiptName,
	label: r.label ?? null,
	description: r.description ?? null,
	date: r.date || '—',
	amount: r.receiptAmount ?? 0,
	category: r.source === 'local_upload' ? 'Local upload' : 'Google Drive',
	source: r.source === 'local_upload' ? 'manual' : 'google',
	thumbnail: r.thumbnail ? `${API_BASE_URL}${r.thumbnail}` : null,
})

export const fetchReceipts = (teamId, refresh = false) => receiptsAPI.getReceipts(teamId, refresh).then((list) => (Array.isArray(list) ? list.map(toReceipt) : []))
