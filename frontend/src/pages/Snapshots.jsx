import { useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'

// Placeholder UI only: static data, no backend. Functionality is not finalized yet.
const initial = [
	{ id: 's3', name: 'Q4 budget review', note: 'After approving all November reimbursements', date: 'Nov 10, 2026', teams: 6, receipts: 142, current: true },
	{ id: 's2', name: 'Before team restructure', note: 'Last state with the old Marketing team', date: 'Oct 28, 2026', teams: 5, receipts: 117, current: false },
	{ id: 's1', name: 'Initial setup', note: 'First import from Google Drive', date: 'Oct 02, 2026', teams: 3, receipts: 48, current: false },
]

export default function Snapshots() {
	const [snapshots, setSnapshots] = useState(initial)
	const [viewing, setViewing] = useState(null)

	const create = () => setSnapshots((list) => [{ id: `s${Date.now()}`, name: 'New snapshot', note: 'Mock snapshot (not saved anywhere)', date: 'Today', teams: 6, receipts: 142, current: false }, ...list])
	const remove = (id) => {
		if (viewing?.id === id) setViewing(null)
		setSnapshots((list) => list.filter((s) => s.id !== id))
	}

	return (
		<>
			<header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
				<div>
					<p className="mb-2.5 text-[11px] font-bold tracking-widest uppercase text-muted">Snapshots / Management</p>
					<h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-tighter text-ink">Snapshot management.</h1>
					<p className="mt-3 text-[13px] leading-[1.55] text-muted">Save the state of your organization, teams and receipts, then revisit or load it later.</p>
				</div>
				<button className={button.primary} onClick={create}><Icon name="plus" size={16} /> Create snapshot</button>
			</header>

			<section className="min-h-90 rounded-[14px] border border-line bg-white p-5.5 max-[560px]:p-4">
				<div className="mb-5 flex items-start justify-between gap-4.5">
					<div>
						<h2 className="font-display text-[17px] tracking-[-0.03em]">History</h2>
						<p className="mt-1.5 text-[13px] leading-[1.55] text-muted">Placeholder UI · no backend connected</p>
					</div>
					<span className="rounded-[20px] bg-blue-soft px-2.25 py-1.5 text-[11px] font-bold text-blue">{snapshots.length} snapshots</span>
				</div>

				{snapshots.length === 0 ? (
					<div className="grid justify-items-center px-6 pt-14.5 pb-11.5 text-center">
						<span className="mb-4 grid size-12 place-items-center rounded-[14px] bg-blue-soft text-blue"><Icon name="snapshot" size={22} /></span>
						<h3 className="font-display text-[17px]">No snapshots yet</h3>
						<p className="mb-5 mt-2 max-w-90 text-[13px] leading-normal text-muted">Create a snapshot to save the current state of your organization.</p>
						<button className={button.primary} onClick={create}><Icon name="plus" size={16} /> Create snapshot</button>
					</div>
				) : (
					<div className="grid">
						{snapshots.map((s) => (
							<div className="flex flex-wrap items-center gap-3 border-t border-line py-4" key={s.id}>
								<span className="grid size-8.5 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="snapshot" size={16} /></span>
								<span className="grid min-w-0 flex-1 gap-1.25">
									<strong className="flex items-center gap-2">{s.name}{s.current && <span className="rounded-[20px] bg-brown-soft px-2 py-0.75 text-[10px] font-bold text-brown">Loaded</span>}</strong>
									<small className="text-xs text-muted">{s.note}</small>
									<small className="text-[11px] text-muted">{s.date} · {s.teams} teams · {s.receipts} receipts</small>
								</span>
								<span className="flex items-center gap-2">
									<button className="rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold text-blue hover:border-blue hover:bg-blue-soft" onClick={() => setViewing(s)}>View</button>
									<button className="rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold text-blue hover:border-blue hover:bg-blue-soft" onClick={() => setViewing(s)}>Load</button>
									<button className="rounded-md border border-line bg-transparent px-1.75 py-1.25 text-[10px] font-bold text-brown hover:border-brown hover:bg-brown-soft" onClick={() => remove(s.id)}>Delete</button>
								</span>
								{viewing?.id === s.id && (
									<div className="ml-11.5 grid basis-full gap-1 rounded-lg bg-paper p-3 text-xs text-muted">
										<strong className="text-ink">{s.name}</strong>
										<span>{s.teams} teams · {s.receipts} receipts · saved {s.date}</span>
										<small className="text-[11px]">Mock detail view · what a snapshot contains and what loading does are not decided yet</small>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</section>
		</>
	)
}
