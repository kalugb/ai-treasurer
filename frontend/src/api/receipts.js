import { request } from './client'

export const SYNC_TIMEOUT_MS = 300000  // 5min; sync is sequential (~2s/file), so large folders need headroom

export const receiptsAPI = {
	getReceipts: (teamId) => request(`/api/google-drive/teams/${teamId}/receipts`),
	sync: (teamId) => request(`/api/google-drive/teams/${teamId}/receipts/sync`, { method: 'POST', timeout: SYNC_TIMEOUT_MS }),
}
