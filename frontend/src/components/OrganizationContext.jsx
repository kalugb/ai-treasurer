import Icon from './Icon'
import { button } from './button'

export function OrganizationContext({ organization, onGoToOrganization }) {
	const label = organization?.orgName ?? organization?.name ?? null
	return (
		<div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-line bg-white p-4">
			<div className="flex min-w-0 items-center gap-3">
				<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="grid" size={16} /></span>
				{organization && label ? (
					<span className="grid gap-0.5">
						<span className="text-[11px] font-bold tracking-widest uppercase text-muted">Selected organization</span>
						<strong className="text-[13px] text-ink">{label}</strong>
					</span>
				) : (
					<span className="text-sm text-muted">Choose an organization to view this page.</span>
				)}
			</div>
			<button className={button.secondary} type="button" onClick={onGoToOrganization}>Change Organization</button>
		</div>
	)
}

export function OrganizationRequiredEmptyState({ onGoToOrganization }) {
	return (
		<section className="grid min-h-80 place-items-center rounded-[14px] border border-line bg-white p-8 text-center">
			<div className="max-w-md">
				<span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-soft text-blue"><Icon name="grid" size={24} /></span>
				<h2 className="mt-5 font-display text-[20px] tracking-[-0.03em]">Create and choose an organization first</h2>
				<p className="mt-2 text-[13px] leading-6 text-muted">Organizations keep your financial data separate. Create one, then select it to continue.</p>
				{onGoToOrganization && (
					<button className={`${button.primary} mt-6`} type="button" onClick={onGoToOrganization}><Icon name="grid" size={16} /> Go to Organizations</button>
				)}
			</div>
		</section>
	)
}
