import { useEffect, useRef } from 'react'
import { useSyncStatus } from '../context/syncStatus'
import { useToast } from '../context/toast'

// Bridges sync status -> shared toast stack. The blue "Syncing…" pill is rendered by ToastStack
// (so it shares the stack and never gets covered); done/error are pushed as transient toasts here.
export default function SyncStatusPill() {
	const { status, result, error, dismiss } = useSyncStatus()
	const { push } = useToast()
	const shownRef = useRef(null) // guard so each outcome is toasted once

	useEffect(() => {
		if (status === 'done') {
			if (shownRef.current === 'done') return
			shownRef.current = 'done'
			const r = result || {}
			push(`Sync complete · ${r.inserted ?? 0} new, ${r.updated ?? 0} updated, ${r.deleted ?? 0} removed`, 'success')
			dismiss()
		} else if (status === 'error') {
			if (shownRef.current === 'error') return
			shownRef.current = 'error'
			push(error || 'Sync failed.', 'error')
			dismiss()
		} else {
			shownRef.current = null
		}
	}, [status, result, error, push, dismiss])

	return null
}
