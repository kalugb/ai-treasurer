import { button } from '../components/button'

const field = 'h-[42px] w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]'

export default function Settings() {
  return (
    <>
      <header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div><p className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Workspace preferences</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">Settings</h1><p className="mt-3 text-[13px] leading-[1.55] text-muted">Make AI Treasurer work the way you do.</p></div>
      </header>
      <section className="grid grid-cols-2 gap-[14px] max-[820px]:grid-cols-1">
        <article className="grid content-start gap-[18px] rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4">
          <div className="mb-5 flex items-start justify-between gap-[18px]"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">Profile</h2><p className="mt-[6px] text-[13px] leading-[1.55] text-muted">Your personal details</p></div></div>
          <label className="grid gap-[7px] text-xs font-bold text-ink">Display name<input className={field} defaultValue="Alex Morgan" /></label>
          <label className="grid gap-[7px] text-xs font-bold text-ink">Email address<input className={field} defaultValue="alex@example.com" type="email" /></label>
          <button className={button.primary}>Save changes</button>
        </article>
        <article className="grid content-start gap-[18px] rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4">
          <div className="mb-5 flex items-start justify-between gap-[18px]"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">AI preferences</h2><p className="mt-[6px] text-[13px] leading-[1.55] text-muted">Tune how your assistant helps</p></div></div>
          <label className="flex items-center justify-between gap-[14px]"><span><strong className="text-xs">Monthly spending summaries</strong><small className="mt-1 block text-muted">Receive a plain-English recap</small></span><input type="checkbox" className="h-5 w-9 accent-blue" defaultChecked /></label>
          <label className="flex items-center justify-between gap-[14px]"><span><strong className="text-xs">Review reminders</strong><small className="mt-1 block text-muted">Get notified when receipts need attention</small></span><input type="checkbox" className="h-5 w-9 accent-blue" defaultChecked /></label>
          <label className="grid gap-[7px] text-xs font-bold text-ink">Default currency<select className={field} defaultValue="USD"><option>USD — US Dollar</option><option>CAD — Canadian Dollar</option><option>GBP — Pound Sterling</option></select></label>
        </article>
      </section>
    </>
  )
}
