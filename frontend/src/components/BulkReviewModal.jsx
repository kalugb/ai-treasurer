import Icon from './Icon'
import ReceiptEditor from './ReceiptEditor'
import { receiptsAPI } from '../api/receipts'
import { useBulkScan } from '../context/bulkScan'
import { useSnapshotMode } from '../context/snapshotMode'

// Edit modal for a receipt the AI filled in (opened from the end-of-run card). Shows what the AI saved so the
// user can correct it; prev/next walks through the receipts the run edited.
export default function BulkReviewModal() {
	const { report, reviewIndex, setReviewIndex, saveReviewed } = useBulkScan()
	const { readOnly } = useSnapshotMode()
	const receipt = report && reviewIndex != null ? report.edited[reviewIndex] : null
	if (!receipt) return null
	const total = report.edited.length
	const close = () => setReviewIndex(null)
	const arrow = 'absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-blue shadow-md transition hover:bg-blue-soft disabled:cursor-not-allowed disabled:opacity-40'

	return (
		<div className="fixed inset-0 z-40 grid place-items-center bg-[rgb(28_35_36/38%)] p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
			<div className="flex max-h-[92vh] w-[min(100%,1100px)] flex-col overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_20px_50px_rgb(28_35_36/18%)]" role="dialog" aria-modal="true" aria-labelledby="bulk-review-title">
				<div className="flex items-start justify-between gap-4 border-b border-line p-5">
					<div><p className="text-[11px] font-bold tracking-widest text-muted uppercase">Filled by AI · review</p><h2 id="bulk-review-title" className="mt-1 font-display text-[20px] tracking-[-0.03em]">{receipt.label || receipt.filename}</h2></div>
					<div className="flex items-center gap-3"><span className="text-xs font-bold text-muted">{reviewIndex + 1} / {total}</span><button className="rounded-lg px-2 py-1 text-xs font-bold text-blue focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" onClick={close}>Close</button></div>
				</div>
				<ReceiptEditor key={receipt.id} receipt={receipt} readOnly={readOnly} onSave={(patch) => saveReviewed(receipt.googleDriveFileId, patch)} onScan={() => receiptsAPI.scan(report.teamId, receipt.googleDriveFileId)}>
					<button className={`${arrow} left-3`} type="button" aria-label="Previous receipt" onClick={() => setReviewIndex(reviewIndex - 1)} disabled={reviewIndex <= 0}><span className="rotate-180"><Icon name="chevron" size={18} /></span></button>
					<button className={`${arrow} right-3`} type="button" aria-label="Next receipt" onClick={() => setReviewIndex(reviewIndex + 1)} disabled={reviewIndex >= total - 1}><Icon name="chevron" size={18} /></button>
				</ReceiptEditor>
			</div>
		</div>
	)
}
