import Icon from './Icon'
import { button } from './button'

// Shown above every page while the app is in snapshot mode.
export default function SnapshotBanner({ snapshot, onExit }) {
	return (
		<div className="sticky top-3 z-10 mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-blue bg-blue-soft p-4 shadow-sm" role="status">
			<div className="flex min-w-0 items-center gap-3">
				<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-blue"><Icon name="snapshot" size={18} /></span>
				<span className="grid min-w-0 gap-0.5">
					<span className="text-[11px] font-bold tracking-widest uppercase text-blue">Viewing snapshot · Read-only</span>
					<strong className="truncate text-[15px] text-ink">{snapshot?.name ?? 'Loading snapshot…'}</strong>
					{snapshot && <small className="text-xs text-muted">Saved {new Date(snapshot.snapshotTime).toLocaleString()} · nothing can be changed until you exit</small>}
				</span>
			</div>
			<button className={button.primary} type="button" onClick={onExit}><Icon name="close" size={16} /> Exit snapshot</button>
		</div>
	)
}
