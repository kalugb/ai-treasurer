import { request, API_BASE_URL } from './client'

export const snapshotsAPI = {
	list: (orgId, ownerId) => request('/api/snapshots', { method: 'GET', params: { orgId, ownerId } }),
	get: (id, orgId, ownerId) => request(`/api/snapshots/${id}`, { method: 'GET', params: { orgId, ownerId } }),
	create: (orgId, name, ownerId) => request('/api/snapshots', { method: 'POST', params: { ownerId }, data: { orgId, name } }),
	remove: (id, orgId, ownerId) => request(`/api/snapshots/${id}`, { method: 'DELETE', params: { orgId, ownerId } }),
	// <img> can't send headers, so the (owner-checked) query string carries the scope
	thumbnailUrl: (id, teamId, receiptId, orgId, ownerId) =>
		`${API_BASE_URL}/api/snapshots/${id}/teams/${teamId}/receipts/${encodeURIComponent(receiptId)}/thumbnail?${new URLSearchParams({ orgId, ownerId })}`,
}

export const errorDetail = (error, fallback) => {
	const detail = error?.response?.data?.detail
	return typeof detail === 'string' ? detail : fallback // 422 validation errors come back as an array
}
