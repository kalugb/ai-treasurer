import { request, requestWithFile } from './client'

// the image route is owner-checked on the server; a snapshot's records already carry their own imageUrl
const withImage = (ownerId) => (r) => ({ ...r, imageUrl: r.imageUrl ?? (r.hasImage ? `/api/cashins/${r.id}/image?ownerId=${encodeURIComponent(ownerId)}` : null) })

export const cashInAPI = {
	list: async (orgId, ownerId) => {
		const res = await request('/api/cashins', { method: 'GET', params: { orgId, ownerId } })
		return { ...res, records: res.records.map(withImage(ownerId)) }
	},
	create: (formData, ownerId) => requestWithFile('/api/cashins', formData, { params: { ownerId } }),
	update: (id, formData, ownerId) => requestWithFile(`/api/cashins/${id}`, formData, { method: 'PATCH', params: { ownerId } }),
	remove: (orgId, ids, ownerId) => request('/api/cashins/delete', { method: 'POST', data: { orgId, ids }, params: { ownerId } }),
	cashflow: (orgId, ownerId, limit = 5, offset = 0) => request('/api/cashflow', { method: 'GET', params: { orgId, ownerId, limit, offset } }),
}
