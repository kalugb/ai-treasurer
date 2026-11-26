import { useState } from 'react'
import Icon from './Icon'
import { button } from './button'

const control = 'h-9 w-full rounded-lg border border-line bg-white px-2.5 text-[12px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'
const label = 'grid gap-1.5 text-xs font-bold text-ink'
const off = 'disabled:cursor-not-allowed disabled:opacity-50'

// Receipts management toolbar. Two fixed rows, so nothing moves when state changes:
//   row 1: title + count (left), actions (right; unavailable actions are disabled, not removed)
//   row 2: search + Source / Reimbursement / Duplicates / Sort as same-height controls in a grid
// While selecting for deletion, the actions slot swaps to "Delete (n)" + "Cancel"; the filters stay usable.
// filters = { source, reimbursed, duplicates, search, order }; onFilter(key, value) changes one of them.
export default function ReceiptsToolbar({
	count, filters, onFilter, onClear, duplicateCounts, groupOptions, groupView, onGroupView, selectableCount, allSelected, onSelectAll,
	readOnly, selecting, selectMode, selectedCount, deleting, refreshing, syncing, canSync, unsetCount, localCount,
	onRefresh, onSync, onFillMissing, onSelect, onGroupSelect, onDelete, onGroup, onCancelSelect, onAdd,
}) {
	const filtering = filters.source !== 'all' || filters.reimbursed !== 'all' || filters.duplicates !== 'all' || filters.group !== 'all' || filters.search.trim() !== ''
	const seg = (active) => `h-8 px-3 text-xs font-bold ${off} ${active ? 'bg-blue text-white' : 'bg-white text-ink hover:bg-blue-soft'}`
	// the filter row can be folded away; the choice is remembered per browser
	const [showFilters, setShowFilters] = useState(() => localStorage.getItem('receipts:showFilters') !== '0')
	const toggleFilters = () => {
		setShowFilters(!showFilters)
		localStorage.setItem('receipts:showFilters', showFilters ? '0' : '1')
	}
	const toReview = duplicateCounts.pending

	return (
		<div className="mb-4 grid gap-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-baseline gap-3">
					<h2 className="font-display text-[18px] tracking-[-0.03em]">Team receipts</h2>
					<span className="text-xs text-muted">{count} {count === 1 ? 'receipt' : 'receipts'}</span>
					<div className="inline-flex self-center overflow-hidden rounded-lg border border-line" role="group" aria-label="Show receipts">
						<button className={seg(groupView === 'grouped')} type="button" aria-pressed={groupView === 'grouped'} onClick={() => onGroupView('grouped')} disabled={selecting} title="One card per group">Grouped</button>
						<button className={`${seg(groupView === 'flat')} border-l border-line`} type="button" aria-pressed={groupView === 'flat'} onClick={() => onGroupView('flat')} disabled={selecting} title="Every receipt on its own, marked with its group name">One by one</button>
					</div>
					<button className={`${seg(!showFilters)} self-center rounded-lg border border-line`} type="button" aria-pressed={!showFilters} onClick={toggleFilters} title={showFilters ? 'Hide the filters' : 'Show the filters'}>
						Hide filters
					</button>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{selecting ? (
						<>
							<button className={`${button.quiet} ${off}`} type="button" onClick={onSelectAll} disabled={selectableCount === 0}>{allSelected ? 'Clear selection' : `Select all (${selectableCount})`}</button>
							{selectMode === 'group'
								? <button className={`${button.primary} ${off}`} type="button" onClick={onGroup} disabled={selectedCount === 0}><Icon name="folder" size={15} /> Group{selectedCount ? ` (${selectedCount})` : ''}</button>
								: <button className={`${button.danger} ${off}`} type="button" onClick={onDelete} disabled={selectedCount === 0}><Icon name="trash" size={15} /> Delete{selectedCount ? ` (${selectedCount})` : ''}</button>}
							<button className={`${button.outline} ${off}`} type="button" onClick={onCancelSelect} disabled={deleting}>Cancel</button>
						</>
					) : (
						<>
							<button className={`${button.outline} ${off}`} type="button" onClick={onRefresh} disabled={refreshing} title="Re-read from the database (picks up external edits)"><Icon name={refreshing ? 'spinner' : 'sync'} size={15} /> {refreshing ? 'Refreshing…' : 'Refresh'}</button>
							{!readOnly && <button className={`${button.secondary} ${off}`} type="button" onClick={onSync} disabled={syncing || !canSync} title={canSync ? 'Sync receipts from the team’s Google Drive folder' : 'This team has no Google Drive folder set'}><Icon name={syncing ? 'spinner' : 'sync'} size={15} /> {syncing ? 'Syncing…' : 'Sync Google Drive'}</button>}
							{!readOnly && <button className={`${button.warning} ${off}`} type="button" onClick={onFillMissing} disabled={unsetCount === 0} title="Step through Drive receipts that have no amount"><Icon name="edit" size={15} /> Set missing amounts ({unsetCount})</button>}
							{!readOnly && <button className={`${button.outline} ${off}`} type="button" onClick={onGroupSelect} disabled={count === 0} title="Select receipts to put in one named group"><Icon name="folder" size={15} /> Group receipts</button>}
							{!readOnly && <button className={`${button.dangerSoft} ${off}`} type="button" onClick={onSelect} disabled={localCount === 0} title="Select local-upload receipts to delete"><Icon name="check" size={15} /> Select for deletion</button>}
							{!readOnly && <button className={button.primary} type="button" onClick={onAdd}><Icon name="plus" size={15} /> Add receipt</button>}
						</>
					)}
				</div>
			</div>

			{showFilters && <div className="grid grid-cols-2 items-end gap-3 min-[900px]:grid-cols-[minmax(180px,1.5fr)_repeat(5,minmax(110px,1fr))_auto]">
				<label className={`${label} col-span-2 min-[900px]:col-span-1`}>Search
					<span className="relative block">
						<input className={`${control} pr-8 [&::-webkit-search-cancel-button]:hidden`} type="search" placeholder="Name or label" value={filters.search} onChange={(event) => onFilter('search', event.target.value)} />
						{filters.search && <button className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-blue-soft hover:text-ink" type="button" aria-label="Clear search" onClick={() => onFilter('search', '')}><Icon name="close" size={13} /></button>}
					</span>
				</label>
				<label className={label}>Group
					<select className={control} value={filters.group} onChange={(event) => onFilter('group', event.target.value)}>
						<option value="all">All</option><option value="none">No group</option>
						{groupOptions.map((option) => <option key={option.key} value={option.key}>{option.name}</option>)}
					</select>
				</label>
				<label className={label}>Source
					<select className={control} value={filters.source} onChange={(event) => onFilter('source', event.target.value)}>
						<option value="all">All</option><option value="google">Google Drive</option><option value="manual">Local upload</option>
					</select>
				</label>
				<label className={label}>Reimbursement
					<select className={control} value={filters.reimbursed} onChange={(event) => onFilter('reimbursed', event.target.value)}>
						<option value="all">All</option><option value="unreimbursed">Not reimbursed</option><option value="reimbursed">Reimbursed</option>
					</select>
				</label>
				<label className={label}>Duplicates
					<select className={control} value={filters.duplicates} onChange={(event) => onFilter('duplicates', event.target.value)}>
						<option value="all">All</option>
						<option value="pending">Needs review ({duplicateCounts.pending})</option>
						<option value="confirmed">Confirmed ({duplicateCounts.confirmed})</option>
						<option value="dismissed">Not duplicate ({duplicateCounts.dismissed})</option>
					</select>
				</label>
				<label className={label}>Sort by
					<select className={control} value={filters.order} onChange={(event) => onFilter('order', event.target.value)}>
						<optgroup label="Date"><option value="desc">Newest first</option><option value="asc">Oldest first</option></optgroup>
						<optgroup label="Amount"><option value="amount-desc">Highest amount</option><option value="amount-asc">Lowest amount</option></optgroup>
					</select>
				</label>
				<button className={`h-9 px-1 text-xs font-bold text-blue ${off} max-[899px]:col-span-2 max-[899px]:justify-self-start`} type="button" onClick={onClear} disabled={!filtering}>Clear filters</button>
			</div>}

			{toReview > 0 && filters.duplicates !== 'pending' && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brown-soft px-3.5 py-2.5 text-xs font-bold text-brown" role="status">
					<span className="flex items-center gap-2"><Icon name="insight" size={14} /> {toReview} {toReview === 1 ? 'receipt needs' : 'receipts need'} duplicate review.</span>
					<button className="underline underline-offset-2" type="button" onClick={() => onFilter('duplicates', 'pending')}>Review them</button>
				</div>
			)}
		</div>
	)
}
