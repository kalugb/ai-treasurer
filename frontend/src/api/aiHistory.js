import { request } from './client'

export const TRIGGER_LABEL = { upload_form: 'Upload form scan', receipt_edit: 'Receipt edit scan', bulk: 'Bulk run scan' }

// AI usage history (scans + "fill all with AI" runs; never the AI agent). Entries expire after 14 days.
export const aiHistoryAPI = {
	list: (orgId, ownerId, { kind = 'all', offset = 0, limit = 20 } = {}) =>
		request('/api/ai-history', { method: 'GET', params: { orgId, ownerId, kind, offset, limit } }),
	get: (id, orgId, ownerId) => request(`/api/ai-history/${id}`, { method: 'GET', params: { orgId, ownerId } }),
	createRun: (orgId, ownerId, teamId, total) =>
		request('/api/ai-history/runs', { method: 'POST', params: { ownerId }, data: { orgId, teamId, total } }),
	finishRun: (runId, orgId, ownerId, outcome, lastError = null) =>
		request(`/api/ai-history/runs/${runId}/finish`, { method: 'POST', params: { ownerId }, data: { orgId, outcome, lastError } }),
}
