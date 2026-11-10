import { request } from './client'

const owner = (ownerId) => (ownerId ? { ownerId } : {})

export const reimbursementAPI = {
	list: (orgId, ownerId) => request('/api/reimbursements', { method: 'GET', params: { orgId, ...owner(ownerId) } }),
	create: (record, ownerId) => request('/api/reimbursements', { method: 'POST', data: record, params: owner(ownerId) }),
	update: (id, patch, ownerId) => request(`/api/reimbursements/${id}`, { method: 'PATCH', data: patch, params: owner(ownerId) }),
	remove: (orgId, ids, ownerId) => request('/api/reimbursements/delete', { method: 'POST', data: { orgId, ids }, params: owner(ownerId) }),
}
