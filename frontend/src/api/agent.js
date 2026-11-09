import { request, requestWithFile, API_BASE_URL } from './client'

// Absolute SSE URL (EventSource can't use the axios client).
export const agentStreamUrl = (userId = '1') => `${API_BASE_URL}/api/agent/stream?userId=${encodeURIComponent(userId)}`

export const agentAPI = {
	listConversations: (userId = '1') =>
		request('/api/agent/conversations', { method: 'GET', params: { userId } }),
	getMessages: (conversationId, userId = '1') =>
		request(`/api/agent/conversations/${conversationId}/messages`, { method: 'GET', params: { userId } }),
	// convert one file to text server-side (Excel/PDF via MarkItDown, image via vision model)
	uploadAttachment: (file) => {
		const fd = new FormData()
		fd.append('file', file)
		return requestWithFile('/api/agent/attachments', fd)
	},
	sendMessage: (input, conversationId = null, orgId = null, attachments = [], userId = '1') =>
		request('/api/agent/messages', { method: 'POST', data: { input, conversationId, orgId, attachments, userId } }),
	regenerate: (memoryId, userId = '1') =>
		request('/api/agent/regenerate', { method: 'POST', data: { memoryId, userId } }),
	stop: (memoryId, userId = '1') =>
		request('/api/agent/stop', { method: 'POST', data: { memoryId, userId } }),
	deleteConversation: (conversationId, userId = '1') =>
		request(`/api/agent/conversations/${conversationId}`, { method: 'DELETE', params: { userId } }),
}
