import axios from 'axios'
import { answerFromSnapshot, getActiveSnapshot, readOnlyError, PASS } from './snapshotMode'

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const API_BASE_URL = baseUrl
const client = axios.create({
	baseURL: baseUrl,
	headers: { 'Content-Type': 'application/json' },
})

export async function request(path, options) {
	const answered = answerFromSnapshot(path, options?.method, options?.params) // snapshot mode: read-only, saved data
	if (answered !== PASS) return answered
	const response = await client({
		url: path,
		...options
	})

	return response.status === 204 ? null : response.data
}

export async function requestWithFile(path, formData, options = {}) {
	if (getActiveSnapshot()) throw readOnlyError() // uploads are writes
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