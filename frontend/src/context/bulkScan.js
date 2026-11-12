import { createContext, useContext } from 'react'

export const BulkScanContext = createContext(null)

export function useBulkScan() {
	const ctx = useContext(BulkScanContext)
	if (!ctx) throw new Error('useBulkScan must be used within a BulkScanProvider')
	return ctx
}

export const MAX_CONSECUTIVE_FAILURES = 3 // the AI is probably down: stop instead of failing every receipt

// Save only what the receipt is still missing: the scan never overwrites existing data, and a
// reimbursed receipt's amount is locked. Returns null when the scan found nothing usable.
export function buildPatch(receipt, found) {
	const patch = {}
	if (Number.isFinite(found?.receiptAmount) && found.receiptAmount > 0 && !receipt.reimbursed && !receipt.amount) patch.receiptAmount = found.receiptAmount
	if (found?.receiptName && !receipt.label) patch.label = found.receiptName
	if (found?.description && !receipt.description) patch.description = found.description
	return Object.keys(patch).length ? patch : null
}

const errorText = (e) => e?.response?.data?.detail || e?.message || 'unknown error'

// One receipt at a time: scan -> save. A scan/save error skips that receipt and goes on, but
// MAX_CONSECUTIVE_FAILURES in a row ends the run (stopped). Cancelling (signal) aborts the scan in
// flight and drops its result; saves already made stay. Result: { done, filled, nothingFound, failed,
// cancelled, stopped, lastError, edited: [saved receipts] }.
// onStart(receipt) before each scan; onProgress(statsCopy, savedReceipt?) after each receipt.
export async function runBulkScan({ receipts, scan, save, signal, onStart, onProgress }) {
	const stats = { done: 0, filled: 0, nothingFound: 0, failed: 0, cancelled: false, stopped: false, lastError: null, edited: [] }
	let streak = 0
	for (const receipt of receipts) {
		if (signal.aborted) { stats.cancelled = true; break }
		onStart?.(receipt)
		let saved = null
		try {
			const found = await scan(receipt.googleDriveFileId, signal)
			if (signal.aborted) { stats.cancelled = true; break }
			const patch = buildPatch(receipt, found)
			if (!patch) stats.nothingFound++
			else { saved = await save(receipt.googleDriveFileId, patch); stats.filled++; stats.edited.push(saved) }
			streak = 0
		} catch (e) {
			if (signal.aborted) { stats.cancelled = true; break }
			stats.failed++
			stats.lastError = errorText(e)
			streak++
		}
		stats.done++
		onProgress?.({ ...stats }, saved)
		if (streak >= MAX_CONSECUTIVE_FAILURES) { stats.stopped = true; break }
	}
	return stats
}
