import Icon from './Icon'
import Toast from './Toast'
import { useSyncStatus } from '../context/syncStatus'

// Fixed top-right status for Google Drive sync, visible on any page.
// Syncing: a persistent spinner pill. Done/error: an auto-dismissing Toast.
export default function SyncStatusPill() {
	const { status, result, error, dismiss } = useSyncStatus()

	if (status === 'syncing') {
		return (
			<div className="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-lg border border-line/50 bg-white px-4 py-3 text-blue shadow-xl animate-slide-in" role="status" aria-live="polite">
				<Icon name="spinner" size={16} className="shrink-0" />
				<span className="text-[13px] font-medium">Syncing Google Drive…</span>
			</div>
		)
	}

	if (status === 'done') {
		const r = result || {}
		return (
			<Toast
				type="success"
				message={`Sync complete · ${r.inserted ?? 0} new, ${r.updated ?? 0} updated, ${r.deleted ?? 0} removed`}
				onClose={dismiss}
			/>
		)
	}

	if (status === 'error') {
		return <Toast type="error" message={error || 'Sync failed.'} onClose={dismiss} />
	}

	return null
}
