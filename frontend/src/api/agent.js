import { request, requestWithFile, API_BASE_URL } from './client'

const USER_ID = import.meta.env.VITE_TEMP_USER_ID ?? '1' // temp pre-auth user, set in frontend/.env

// Absolute SSE URL (EventSource can't use the axios client).
export const agentStreamUrl = (userId = USER_ID) => `${API_BASE_URL}/api/agent/stream?userId=${encodeURIComponent(userId)}`

export const agentAPI = {
	listConversations: (userId = USER_ID) =>
		request('/api/agent/conversations', { method: 'GET', params: { userId } }),
	getMessages: (conversationId, userId = USER_ID) =>
		request(`/api/agent/conversations/${conversationId}/messages`, { method: 'GET', params: { userId } }),
	// convert one file to text server-side (Excel/PDF via MarkItDown, image via vision model)
	uploadAttachment: (file) => {
		const fd = new FormData()
		fd.append('file', file)
		return requestWithFile('/api/agent/attachments', fd)
	},
	// one-shot AI extraction of a receipt file -> { receiptName, receiptAmount, description } (nulls when unsure)
	// ownerId + orgId (+ teamId) make the server log the scan in the AI history
	scanReceipt: (file, { ownerId, orgId, teamId } = {}) => {
		const fd = new FormData()
		fd.append('file', file)
		return requestWithFile('/api/agent/receipts/scan', fd, { params: { ownerId, orgId, teamId } })
	},
	sendMessage: (input, conversationId = null, orgId = null, attachments = [], userId = USER_ID) =>
		request('/api/agent/messages', { method: 'POST', data: { input, conversationId, orgId, attachments, userId } }),
	regenerate: (memoryId, userId = USER_ID) =>
		request('/api/agent/regenerate', { method: 'POST', data: { memoryId, userId } }),
	stop: (memoryId, userId = USER_ID) =>
		request('/api/agent/stop', { method: 'POST', data: { memoryId, userId } }),
	deleteConversation: (conversationId, userId = USER_ID) =>
		request(`/api/agent/conversations/${conversationId}`, { method: 'DELETE', params: { userId } }),
}
