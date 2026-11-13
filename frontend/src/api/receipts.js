import { request, requestWithFile, API_BASE_URL } from './client'

// Drive sync lists + reconciles the whole folder; allow generous time for large folders.
export const SYNC_TIMEOUT_MS = 120000

// Drive sync stream: POST (it writes, so a typed URL must not trigger it), read as SSE frames.
// EventSource only does GET, hence fetch. Calls onEvent(name, data) per frame; resolves when the stream ends.
// Not routed through client.js: the snapshot read-only gate for this lives in SyncStatusContext.startSync.
export async function streamSync(teamId, { signal, onEvent }) {
	const response = await fetch(`${API_BASE_URL}/api/google-drive/teams/${teamId}/receipts/sync/stream`, { method: 'POST', signal, headers: { Accept: 'text/event-stream' } })
	if (!response.ok || !response.body) throw new Error(`Sync request failed (${response.status})`)
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
	let buffer = ''
	for (;;) {
		const { value, done } = await reader.read()
		if (done) return
		buffer += value
		let end
		while ((end = buffer.indexOf('\n\n')) !== -1) {
			const frame = buffer.slice(0, end)
			buffer = buffer.slice(end + 2)
			const name = frame.match(/^event: (.*)$/m)?.[1]
			const data = frame.match(/^data: (.*)$/m)?.[1]
			if (name) onEvent(name, data ? JSON.parse(data) : null)
		}
	}
}

export const receiptsAPI = {
	getReceipts: (teamId, refresh = false) =>
		request(`/api/google-drive/teams/${teamId}/receipts`, { method: 'GET', ...(refresh ? { params: { refresh: true } } : {}) }),
	sync: (teamId) =>
		request(`/api/google-drive/teams/${teamId}/receipts/sync`, { method: 'POST', timeout: SYNC_TIMEOUT_MS }),
	// historyId + ownerId (bulk AI run): the server records in the AI history that the AI saved this patch
	updateReceipt: (teamId, fileId, patch, { ownerId, historyId } = {}) =>
		request(`/api/google-drive/teams/${teamId}/receipts/${fileId}`, { method: 'PATCH', data: patch, ...(historyId ? { params: { ownerId, historyId } } : {}) }),
	upload: (teamId, formData) =>
		requestWithFile(`/api/google-drive/teams/${teamId}/receipts/upload`, formData),
	// 409 {code: 'duplicate_receipt', existing} when this exact file is already a receipt in the organization
	checkDuplicate: (teamId, file) => {
		const formData = new FormData()
		formData.append('file', file)
		return requestWithFile(`/api/google-drive/teams/${teamId}/receipts/duplicate-check`, formData)
	},
	// AI-extract { receiptName, receiptAmount, description } from the stored original file (nothing is saved)
	// ownerId makes the server log the scan in the AI history; trigger is receipt_edit (default) or bulk (+ runId)
	scan: (teamId, fileId, { signal, ownerId, trigger, runId } = {}) =>
		request(`/api/google-drive/teams/${teamId}/receipts/${fileId}/scan`, { method: 'POST', signal, params: { ownerId, trigger, runId } }),
	remove: (teamId, ids, confirmLinked = false) =>
		request(`/api/google-drive/teams/${teamId}/receipts/delete`, { method: 'POST', data: { ids, confirmLinked } }),
	// status: 'dismissed' (not a duplicate) | 'confirmed' (a real duplicate) | 'clear' (forget the decision)
	reviewDuplicate: (teamId, fileId, status) =>
		request(`/api/google-drive/teams/${teamId}/receipts/${fileId}/duplicate-review`, { method: 'POST', data: { status } }),
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
	reimbursed: r.reimbursed ?? false, // unreimbursed unless its record is marked Reimbursed
	reimbursement: r.reimbursement ?? null, // { id, name, status } of the record holding this receipt
	duplicate: r.duplicate ?? null, // null, or { status: pending|confirmed|dismissed, excluded, of } when an older copy exists in the org
})

// a receipt a human confirmed as a duplicate: not a real expense (left out of totals, queues and the reimbursement picker)
export const isExcluded = (r) => Boolean(r.duplicate?.excluded)
// still waiting for a human decision
export const needsDuplicateReview = (r) => r.duplicate?.status === 'pending'

export const fetchReceipts = (teamId, refresh = false) => receiptsAPI.getReceipts(teamId, refresh).then((list) => (Array.isArray(list) ? list.map(toReceipt) : []))

// the server returns 0 for a Drive receipt nobody set an amount on (a real $0 Drive receipt looks the same) — say so instead of showing $0.00
export const isUnset = (r) => r.source === 'google' && !r.amount && !isExcluded(r)
export const receiptAmountText = (r) => isUnset(r)
	? 'Amount not set'
	: `$${(r.amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
