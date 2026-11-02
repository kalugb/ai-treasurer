import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { receiptsAPI, syncStreamUrl } from '../api/receipts'
import { SyncStatusContext } from './syncStatus'

// Global Google Drive sync status. The SSE connection lives here (mounted once in App),
// so the status pill shows on any page and survives in-app navigation.
export function SyncStatusProvider({ children }) {
	const [status, setStatus] = useState('idle') // 'idle' | 'syncing' | 'done' | 'error'
	const [result, setResult] = useState(null) // {inserted, updated, deleted, total} on done
	const [error, setError] = useState(null) // string on error
	const [teamId, setTeamId] = useState(null)
	const [completedAt, setCompletedAt] = useState(0) // bumps on done/error so pages can refetch
	const sourceRef = useRef(null)

	const closeSource = () => {
		if (sourceRef.current) {
			sourceRef.current.close()
			sourceRef.current = null
		}
	}

	useEffect(() => closeSource, [])

	const startSync = useCallback((id) => {
		if (!id || status === 'syncing') return
		setTeamId(id)
		setResult(null)
		setError(null)
		setStatus('syncing')

		// EventSource is unavailable (SSR/old env) -> fall back to the blocking POST
		if (typeof EventSource === 'undefined') {
			receiptsAPI.sync(id)
				.then((res) => { setResult(res); setStatus('done') })
				.catch(() => { setError('Sync failed. Check the Google Drive connection.'); setStatus('error') })
				.finally(() => setCompletedAt((n) => n + 1))
			return
		}

		closeSource()
		const source = new EventSource(syncStreamUrl(id))
		sourceRef.current = source

		source.addEventListener('done', (event) => {
			try { setResult(JSON.parse(event.data)) } catch { setResult(null) }
			setStatus('done')
			setCompletedAt((n) => n + 1)
			closeSource()
		})
		source.addEventListener('error', (event) => {
			// SSE 'error' event: either our server-sent error payload, or a transport drop
			let detail = 'Sync failed. Check the Google Drive connection.'
			if (event?.data) {
				try { detail = JSON.parse(event.data).detail || detail } catch { /* keep default */ }
			}
			setError(detail)
			setStatus('error')
			setCompletedAt((n) => n + 1)
			closeSource()
		})
	}, [status])

	const dismiss = useCallback(() => {
		if (status === 'syncing') return // can't dismiss an in-flight sync
		setStatus('idle')
		setResult(null)
		setError(null)
	}, [status])

	const value = useMemo(
		() => ({ status, result, error, teamId, completedAt, startSync, dismiss }),
		[status, result, error, teamId, completedAt, startSync, dismiss],
	)

	return <SyncStatusContext.Provider value={value}>{children}</SyncStatusContext.Provider>
}
