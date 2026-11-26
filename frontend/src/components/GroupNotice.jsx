// Shown in the receipt preview for a grouped receipt: which group it is in, and how to change that.
// onRename() / onRemove() (this receipt only) / onUngroup() (all of them) are hidden when readOnly (snapshot).
export default function GroupNotice({ receipt, count, readOnly, onRename, onRemove, onUngroup }) {
	if (!receipt.groupName) return null
	const link = 'font-bold text-blue underline underline-offset-2'
	return (
		<div className="mt-3 rounded-lg bg-blue-soft px-3 py-2 text-xs text-ink">
			<p><span className="font-bold">Group: {receipt.groupName}</span> <span className="text-muted">· {count} {count === 1 ? 'receipt' : 'receipts'}{receipt.groupSource === 'folder' ? ' · from a Drive folder' : ''}</span></p>
			{!readOnly && <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
				<button className={link} type="button" onClick={onRename}>Rename group</button>
				<button className={link} type="button" onClick={onRemove}>Remove from group</button>
				{count > 1 && <button className={link} type="button" onClick={onUngroup}>Ungroup all</button>}
			</p>}
		</div>
	)
}
