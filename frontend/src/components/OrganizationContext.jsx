import Icon from './Icon'

export function OrganizationContext({ organization, onChange }) {
    return (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-[14px] border border-line bg-white p-4">
            {organization ? (
                <label className="grid min-w-52 gap-2 text-xs font-bold text-ink">
                    Organization
                    <select className="h-10 rounded-lg border border-line bg-paper px-3 text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={organization.id} onChange={() => {}}>
                        <option value={organization.id}>{organization.name}</option>
                    </select>
                </label>
            ) : <p className="text-sm text-muted">Choose an organization to view this page.</p>}
            <div className="flex flex-wrap gap-2" aria-label="Organization state preview">
                <button className={`rounded-lg px-3 py-2 text-xs font-bold ${!organization ? 'bg-blue text-white' : 'bg-blue-soft text-blue'}`} type="button" aria-pressed={!organization} onClick={() => onChange(false)}>No organization</button>
                <button className={`rounded-lg px-3 py-2 text-xs font-bold ${organization ? 'bg-blue text-white' : 'bg-blue-soft text-blue'}`} type="button" aria-pressed={Boolean(organization)} onClick={() => onChange(true)}>Organization selected</button>
            </div>
        </div>
    )
}

export function OrganizationRequiredEmptyState() {
    return (
        <section className="grid min-h-80 place-items-center rounded-[14px] border border-line bg-white p-8 text-center">
            <div className="max-w-md">
                <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-soft text-blue"><Icon name="grid" size={24} /></span>
                <h2 className="mt-5 font-display text-[20px] tracking-[-0.03em]">Create and choose an organization first</h2>
                <p className="mt-2 text-[13px] leading-6 text-muted">Organizations keep your financial data separate. Create one, then select it to continue.</p>
            </div>
        </section>
    )
}
