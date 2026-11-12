import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BulkScanContext, runBulkScan } from './bulkScan'
import { useToast } from './toast'
import { receiptsAPI, toReceipt } from '../api/receipts'
import { aiHistoryAPI } from '../api/aiHistory'

// Owns the "fill all unset receipts with AI" run so it keeps going when the modal closes or the page changes.
// It lives in the browser: a reload or closed tab stops it (receipts already saved stay saved).
// When a run ends (finished / cancelled / stopped by repeated AI errors) `report` keeps the outcome and the
// receipts the AI edited until dismissed; `reviewIndex` opens one of them in the review modal.
export function BulkScanProvider({ children }) {
	const { push } = useToast()
	const [run, setRun] = useState(null) // { teamId, total, done, filled, nothingFound, failed, current } while running
	const [report, setReport] = useState(null) // { teamId, total, outcome, edited: [receipt], ...stats } after a run
	const [reviewIndex, setReviewIndex] = useState(null)
	const [lastUpdate, setLastUpdate] = useState(null) // { teamId, receipt, n } for each saved receipt
	const [completed, setCompleted] = useState({ teamId: null, at: 0 })
	const controllerRef = useRef(null)
	const running = run !== null

	// ctx = { ownerId, orgId } of the selected organization: needed to log the run in the AI history (skipped without it)
	const start = useCallback(async (teamId, receipts, ctx = {}) => {
		if (controllerRef.current || !receipts.length) return
		const controller = new AbortController()
		controllerRef.current = controller
		setReport(null)
		setReviewIndex(null)
		setRun({ teamId, total: receipts.length, done: 0, filled: 0, nothingFound: 0, failed: 0, current: null })
		const { ownerId, orgId } = ctx
		// best effort: a failure here only means this run is not in the history
		const runId = ownerId && orgId ? await aiHistoryAPI.createRun(orgId, ownerId, teamId, receipts.length).then((r) => r.runId).catch(() => null) : null
		let n = 0
		const stats = await runBulkScan({
			receipts,
			scan: (fileId, signal) => receiptsAPI.scan(teamId, fileId, { signal, ownerId, trigger: 'bulk', runId }),
			save: async (fileId, patch, found) => toReceipt(await receiptsAPI.updateReceipt(teamId, fileId, patch, { ownerId, historyId: found?.historyId })),
			signal: controller.signal,
			onStart: (receipt) => setRun((current) => current && { ...current, current: receipt.label || receipt.filename }),
			onProgress: (s, saved) => {
				setRun((current) => current && { ...current, done: s.done, filled: s.filled, nothingFound: s.nothingFound, failed: s.failed })
				if (saved) setLastUpdate({ teamId, receipt: saved, n: ++n })
			},
		})
		controllerRef.current = null
		if (runId) aiHistoryAPI.finishRun(runId, orgId, ownerId, stats.cancelled ? 'Cancelled' : stats.stopped ? 'Stopped' : 'Finished', stats.lastError).catch(() => {})
		setRun(null)
		setCompleted({ teamId, at: Date.now() })
		setReport({ ...stats, teamId, ownerId, total: receipts.length, outcome: stats.cancelled ? 'cancelled' : stats.stopped ? 'stopped' : 'finished' })
	}, [])

	const cancel = useCallback(() => controllerRef.current?.abort(), [])
	const dismissReport = useCallback(() => { setReport(null); setReviewIndex(null) }, [])

	// save from the review modal: update the report's copy and tell the page showing that team
	const saveReviewed = useCallback(async (fileId, patch) => {
		if (!report) return
		const saved = toReceipt(await receiptsAPI.updateReceipt(report.teamId, fileId, patch))
		setReport((r) => r && { ...r, edited: r.edited.map((x) => x.googleDriveFileId === fileId ? saved : x) })
		setLastUpdate((u) => ({ teamId: report.teamId, receipt: saved, n: (u?.n ?? 0) + 1 }))
		push('Receipt details saved.', 'success')
	}, [report, push])

	// a reload/close would silently stop the run: let the browser ask first
	useEffect(() => {
		if (!running) return
		const warn = (event) => { event.preventDefault(); event.returnValue = '' }
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [running])

	const value = useMemo(() => ({ run, running, report, reviewIndex, setReviewIndex, lastUpdate, completed, start, cancel, dismissReport, saveReviewed }), [run, running, report, reviewIndex, lastUpdate, completed, start, cancel, dismissReport, saveReviewed])
	return <BulkScanContext.Provider value={value}>{children}</BulkScanContext.Provider>
}
