import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { receiptsAPI, streamSync } from '../api/receipts'
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
			sourceRef.current.abort() // AbortController of the in-flight sync stream
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

		// streaming fetch unavailable (old env) -> fall back to the blocking POST
		if (typeof TextDecoderStream === 'undefined') {
			receiptsAPI.sync(id)
				.then((res) => { setResult(res); setStatus('done') })
				.catch(() => { setError('Sync failed. Check the Google Drive connection.'); setStatus('error') })
				.finally(() => setCompletedAt((n) => n + 1))
			return
		}

		closeSource()
		const controller = new AbortController()
		sourceRef.current = controller
		let finished = false
		const finish = (ok, payload) => {
			if (finished || sourceRef.current !== controller) return // already reported, or superseded/unmounted
			finished = true
			if (ok) { setResult(payload); setStatus('done') } else { setError(payload); setStatus('error') }
			setCompletedAt((n) => n + 1)
			sourceRef.current = null
		}

		streamSync(id, {
			signal: controller.signal,
			onEvent: (name, data) => {
				if (name === 'done') finish(true, data)
				else if (name === 'error') finish(false, data?.detail || 'Sync failed. Check the Google Drive connection.')
			},
		})
			// the stream ended without a done/error frame -> the connection dropped mid-sync
			.then(() => finish(false, 'Sync connection lost. Check the Google Drive connection.'))
			.catch(() => finish(false, 'Sync failed. Check the Google Drive connection.'))
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
