import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { receiptsAPI, syncStreamUrl } from '../api/receipts'
import { getActiveSnapshot } from '../api/snapshotMode'
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
		if (!id || status === 'syncing' || getActiveSnapshot()) return // a sync writes; never during a snapshot
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
			// EventSource fires a native 'error' on every stream close too — including the normal
			// close right after our 'done'. Only a server-sent payload (event.data) is a real failure;
			// a dataless close means the stream ended (done/error already handled) — ignore it so a
			// successful sync isn't flipped to "failed". A real transport drop leaves readyState
			// CONNECTING (reconnecting) while we never got a terminal event -> surface that.
			if (event?.data) {
				let detail = 'Sync failed. Check the Google Drive connection.'
				try { detail = JSON.parse(event.data).detail || detail } catch { /* keep default */ }
				setError(detail)
				setStatus('error')
				setCompletedAt((n) => n + 1)
				closeSource()
				return
			}
			// dataless: only an error if we're still syncing and the socket genuinely broke
			if (sourceRef.current && source.readyState !== EventSource.CLOSED) {
				setError('Sync connection lost. Check the Google Drive connection.')
				setStatus('error')
				setCompletedAt((n) => n + 1)
				closeSource()
			}
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
