import axios from 'axios'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const client = axios.create({
	baseURL: baseUrl,
	headers: { 'Content-Type': 'application/json' },
})

export async function request(path, options) {
	const response = await client({
		url: path,
		...options
	})

	return response.status === 204 ? null : response.data
}

export async function requestWithFile(path, formData, options = {}) {
	const response = await client({
		url: path,
		method: 'POST',
		data: formData,
		...options,
		headers: {
			'Content-Type': undefined,
			...options.headers,
		}
	})

	return response.status === 204 ? null : response.data
}