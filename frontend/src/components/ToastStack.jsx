import { useEffect } from 'react'
import Icon from './Icon'
import { useToast } from '../context/toast'
import { useSyncStatus } from '../context/syncStatus'
import { useBulkScan } from '../context/bulkScan'

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
	const { run, cancel, report, dismissReport, setReviewIndex } = useBulkScan()

	if (!toasts.length && !syncing && !run && !report) return null
	return (
		<div className="fixed top-5 right-5 z-50 flex flex-col items-end gap-2">
			{syncing && (
				<div className="flex items-center gap-3 rounded-lg border border-line/50 bg-white px-4 py-3 text-blue shadow-xl animate-slide-in" role="status" aria-live="polite">
					<Icon name="spinner" size={16} className="shrink-0" />
					<span className="text-[13px] font-medium">Syncing Google Drive…</span>
				</div>
			)}
			{run && (
				<div className="flex max-w-sm items-center gap-3 rounded-lg border border-line/50 bg-white px-4 py-3 text-blue shadow-xl animate-slide-in" role="status" aria-live="polite">
					<Icon name="spinner" size={16} className="shrink-0" />
					<div className="min-w-0"><span className="block text-[13px] font-medium">AI filling amounts… {run.done} / {run.total}</span>{run.current && <span className="mt-0.5 block truncate text-[12px] font-bold text-ink" title={run.current}>Now: {run.current}</span>}<span className="mt-0.5 block text-[11px] text-muted">Don't reload or close this page: it will stop the run. Receipts already saved stay saved.</span></div>
					<button className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-bold text-red hover:bg-red-soft" type="button" onClick={cancel}>Cancel</button>
				</div>
			)}
			{report && (
				<div className="w-sm max-w-[calc(100vw-2.5rem)] rounded-lg border border-line/50 bg-white px-4 py-3 shadow-xl animate-slide-in" role="status" aria-live="polite">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0">
							<p className={`text-[13px] font-bold ${report.outcome === 'stopped' ? 'text-red' : 'text-blue'}`}>{report.outcome === 'cancelled' ? 'AI run cancelled' : report.outcome === 'stopped' ? 'AI run stopped: the AI kept failing' : 'AI run finished'}</p>
							<p className="mt-0.5 text-[11px] text-muted">Filled {report.filled} of {report.total}{report.nothingFound ? ` · ${report.nothingFound} nothing found` : ''}{report.failed ? ` · ${report.failed} failed` : ''}. The AI can be wrong: please review.</p>
							{report.outcome === 'stopped' && report.lastError && <p className="mt-0.5 text-[11px] text-red">Last error: {report.lastError}</p>}
						</div>
						<button className="shrink-0 rounded p-1 hover:bg-black/10 transition-colors" type="button" onClick={dismissReport} aria-label="Dismiss"><Icon name="close" size={14} /></button>
					</div>
					{report.edited.length > 0 && (
						<ul className="mt-2 max-h-40 overflow-y-auto border-t border-line pt-2">
							{report.edited.map((receipt, index) => <li key={receipt.id}><button className="w-full truncate rounded px-2 py-1 text-left text-xs font-bold text-blue hover:bg-blue-soft focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" title="Review what the AI filled" onClick={() => setReviewIndex(index)}>{receipt.label || receipt.filename}</button></li>)}
						</ul>
					)}
				</div>
			)}
			{toasts.map((toast) => <ToastItem key={toast.id} toast={toast} onClose={dismiss} />)}
		</div>
	)
}
