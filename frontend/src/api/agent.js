import { request, requestWithFile, API_BASE_URL } from './client'

// The user is whoever the session cookie says; none of these send a user id.
// Absolute SSE URL (EventSource can't use the axios client; the cookie rides along on its own, same origin).
export const agentStreamUrl = () => `${API_BASE_URL}/api/agent/stream`
// owner-checked download of a spreadsheet the agent made (plain <a href>, the server sends it as an attachment)
export const agentFileUrl = (fileId) => `${API_BASE_URL}/api/agent/files/${encodeURIComponent(fileId)}`

export const agentAPI = {
	listConversations: () => request('/api/agent/conversations', { method: 'GET' }),
	getMessages: (conversationId) => request(`/api/agent/conversations/${conversationId}/messages`, { method: 'GET' }),
	// convert one file to text server-side (Excel/PDF via MarkItDown, image via vision model)
	uploadAttachment: (file) => {
		const fd = new FormData()
		fd.append('file', file)
		return requestWithFile('/api/agent/attachments', fd)
	},
	// one-shot AI extraction of a receipt file -> { receiptName, receiptAmount, description } (nulls when unsure)
	// orgId (+ teamId) make the server log the scan in the AI history
	scanReceipt: (file, { orgId, teamId } = {}) => {
		const fd = new FormData()
		fd.append('file', file)
		return requestWithFile('/api/agent/receipts/scan', fd, { params: { orgId, teamId } })
	},
	sendMessage: (input, conversationId = null, orgId = null, attachments = []) =>
		request('/api/agent/messages', { method: 'POST', data: { input, conversationId, orgId, attachments } }),
	regenerate: (memoryId) => request('/api/agent/regenerate', { method: 'POST', data: { memoryId } }),
	stop: (memoryId) => request('/api/agent/stop', { method: 'POST', data: { memoryId } }),
	deleteConversation: (conversationId) => request(`/api/agent/conversations/${conversationId}`, { method: 'DELETE' }),
}
