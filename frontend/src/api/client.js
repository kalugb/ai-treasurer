import axios from 'axios'
import { answerFromSnapshot, getActiveSnapshot, readOnlyError, PASS } from './snapshotMode'

// Same origin by default: the Vite dev server (vite.config.js) and nginx (Docker/EC2) both forward /api to the backend.
// The session lives in httpOnly cookies, which is only simple and safe when the page and the API share an origin.
// VITE_API_URL is an override for talking to a backend on another origin (needs CORS + SameSite changes).
const baseUrl = import.meta.env.VITE_API_URL ?? ''
export const API_BASE_URL = baseUrl
const client = axios.create({
	baseURL: baseUrl,
	withCredentials: true,
	headers: { 'Content-Type': 'application/json' },
})

// One refresh at a time: the refresh token rotates, so two parallel refreshes would invalidate each other.
let refreshing = null
export function refreshSession() {
	refreshing ??= client.post('/api/auth/refresh', null, { _noRefresh: true })
		.then((response) => response.data)
		.finally(() => { refreshing = null })
	return refreshing
}

let onSignedOut = () => {}
export const setSignedOutHandler = (handler) => { onSignedOut = handler }

// An expired access cookie answers 401: refresh once and replay the request. If the refresh fails, the session is over.
client.interceptors.response.use(undefined, async (error) => {
	const config = error.config
	if (error.response?.status !== 401 || !config || config._retried || config._noRefresh || config.url?.startsWith('/api/auth/')) throw error
	config._retried = true
	try {
		await refreshSession()
	} catch {
		onSignedOut()
		throw error
	}
	return client(config)
})

// Sign-in/out calls. They bypass the snapshot read-only gate below: leaving a snapshot view must still be possible.
export async function authRequest(path, options) {
	const response = await client({ url: path, _noRefresh: true, ...options })
	return response.data
}

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
