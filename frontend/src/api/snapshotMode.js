// Snapshot mode. While a snapshot is active, the API client (client.js) answers reads of the org's teams,
// receipts and reimbursements from the snapshot and refuses every write, so the whole app renders the saved
// state read-only. No import of client.js here (it imports this module).

const READ_ONLY = 'Read-only: you are viewing a snapshot. Exit the snapshot to make changes.'
// data that lives inside a snapshot; any other read (organizations, agent chats, Drive status) stays live
const SCOPED = ['/api/teams', '/api/google-drive', '/api/reimbursements']
export const PASS = Symbol('pass') // "not answered by the snapshot, send to the server"

let active = null // { snapshot, orgId, ownerId }

export const getActiveSnapshot = () => active
export const setActiveSnapshot = (value) => { active = value }

// shaped like an axios error so the pages' existing `err.response.data.detail` handling shows it
export const readOnlyError = () => Object.assign(new Error(READ_ONLY), { response: { status: 403, data: { detail: READ_ONLY } } })

const round = (n) => Math.round(n * 100) / 100
const PREVIEWABLE = (mime) => Boolean(mime) && (mime.startsWith('image/') || mime === 'application/pdf')

function links(snapshot) {
	const byReceipt = {}
	for (const rec of snapshot.records) {
		for (const id of rec.receiptIds) byReceipt[id] = { id: rec.recordId, name: rec.name, status: rec.status }
	}
	return byReceipt
}

// same shapes the live endpoints return (routers/teams.py, google_drive.py, reimbursement.py `_to_out`)
const teamsOut = ({ snapshot, orgId }) => snapshot.teams.map((t) => ({
	id: t.teamId, name: t.name, orgId, orgName: '', createdAt: null,
	budget: t.budget ?? 0, used: 0, members: t.members ?? [],
	googleDriveFolderId: null, // nothing to sync in a snapshot
}))

function receiptsOut({ snapshot, orgId, ownerId }, teamId) {
	const linked = links(snapshot)
	const scope = new URLSearchParams({ orgId, ownerId })
	return (snapshot.receipts[teamId] ?? []).map((r) => {
		const link = linked[r.receiptId] ?? null
		return {
			id: r.receiptId, googleDriveFileId: r.receiptId,
			receiptName: r.name, receiptAmount: r.amount ?? 0, description: r.description, label: r.label,
			date: r.date, source: r.source,
			// current file, served through the owner-checked snapshot route (images are not frozen)
			thumbnail: PREVIEWABLE(r.mimeType) ? `/api/snapshots/${snapshot.id}/teams/${teamId}/receipts/${encodeURIComponent(r.receiptId)}/thumbnail?${scope}` : null,
			reimbursement: link, reimbursed: Boolean(link && link.status === 'Reimbursed'),
		}
	})
}

function reimbursementsOut({ snapshot }) {
	const present = new Set(Object.values(snapshot.receipts).flat().map((r) => r.receiptId))
	const records = snapshot.records.map((rec) => {
		const missing = rec.receiptIds.filter((id) => !present.has(id))
		const nameOf = Object.fromEntries(rec.receiptIds.map((id, i) => [id, rec.receiptNames[i] || id]))
		return {
			id: rec.recordId, name: rec.name, date: rec.date, teamInvolved: rec.teamInvolved, teamInvolvedId: rec.teamInvolvedId,
			amount: rec.amount ?? 0, status: rec.status,
			receiptInvolved: { receiptNames: rec.receiptNames, receiptIds: rec.receiptIds, missingReceiptIds: missing, missingReceiptNames: missing.map((id) => nameOf[id]) },
		}
	}).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
	const paid = records.filter((r) => r.status === 'Reimbursed')
	const unpaid = records.filter((r) => r.status !== 'Reimbursed')
	const sum = (list) => round(list.reduce((s, r) => s + r.amount, 0))
	return { records, totals: { reimbursed: sum(paid), notReimbursed: sum(unpaid), reimbursedCount: paid.length, notReimbursedCount: unpaid.length } }
}

// Answer a request from the active snapshot. Returns PASS when it should go to the server; throws on writes.
export function answerFromSnapshot(path, method = 'GET', params = {}) {
	if (!active) return PASS
	if (method.toUpperCase() !== 'GET') throw readOnlyError()
	if (!SCOPED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return PASS
	if (path === '/api/teams') return params.orgId === active.orgId ? teamsOut(active) : []
	if (path === '/api/reimbursements') return params.orgId === active.orgId ? reimbursementsOut(active) : { records: [], totals: { reimbursed: 0, notReimbursed: 0, reimbursedCount: 0, notReimbursedCount: 0 } }
	const receipts = path.match(/^\/api\/google-drive\/teams\/([^/]+)\/receipts$/)
	if (receipts) return receiptsOut(active, receipts[1])
	throw readOnlyError() // other team/receipt endpoints (delete impact, sync, …) are write flows
}
