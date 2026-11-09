import { useEffect } from 'react'
import Icon from './Icon'
import { useToast } from '../context/toast'
import { useSyncStatus } from '../context/syncStatus'

// Single fixed top-right container stacking all app notifications so they never cover each other.
// The blue "Syncing…" spinner (persistent) sits at the top; transient toasts stack below it.
// The store caps toasts at 4 and drops the oldest; each toast auto-dismisses after its duration.
function ToastItem({ toast, onClose }) {
	useEffect(() => {
		const timer = setTimeout(() => onClose(toast.id), toast.duration)
		return () => clearTimeout(timer)
	}, [toast.id, toast.duration, onClose])

	const bgClass = toast.type === 'success' ? 'bg-green-soft text-green' : 'bg-red-soft text-red'
	const iconName = toast.type === 'success' ? 'check' : 'close'

	return (
		<div className={`flex items-center gap-3 rounded-lg border border-line/50 bg-white px-4 py-3 shadow-xl animate-slide-in ${bgClass}`} role="alert" aria-live="polite">
			<Icon name={iconName} size={16} className="shrink-0" />
			<span className="text-[13px] font-medium">{toast.message}</span>
			<button onClick={() => onClose(toast.id)} className="ml-2 rounded p-1 hover:bg-black/10 transition-colors" aria-label="Dismiss">
				<Icon name="close" size={14} />
			</button>
		</div>
	)
}

export default function ToastStack() {
	const { toasts, dismiss } = useToast()
	const { status: syncStatus } = useSyncStatus()
	const syncing = syncStatus === 'syncing'

	if (!toasts.length && !syncing) return null
	return (
		<div className="fixed top-5 right-5 z-50 flex flex-col items-end gap-2">
			{syncing && (
				<div className="flex items-center gap-3 rounded-lg border border-line/50 bg-white px-4 py-3 text-blue shadow-xl animate-slide-in" role="status" aria-live="polite">
					<Icon name="spinner" size={16} className="shrink-0" />
					<span className="text-[13px] font-medium">Syncing Google Drive…</span>
				</div>
			)}
			{toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onClose={dismiss} />)}
		</div>
	)
}
