import { useState } from 'react'
import Icon from '../components/Icon'

export default function Agent() {
  const [prompt, setPrompt] = useState('')
  return (
    <>
      <header className="mb-9 flex items-center justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div><p className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Your financial co-pilot</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">What would you like to know?</h1><p className="mt-3 text-[13px] leading-[1.55] text-muted">Ask about your spending, upload a receipt, or get a clear summary.</p></div>
        <span className="grid size-[72px] place-items-center rounded-[22px] bg-blue-soft text-blue max-[820px]:hidden"><Icon name="spark" size={25} /></span>
      </header>
      <section className="grid grid-cols-[minmax(0,1.65fr)_minmax(260px,1fr)] gap-[14px] max-[820px]:grid-cols-1">
        <article className="flex min-h-[510px] flex-col rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4">
          <div className="mx-auto mb-7 max-w-[480px] text-center"><span className="mb-5 grid size-[38px] place-items-center rounded-[9px] bg-brown text-white"><Icon name="spark" size={18} /></span><h2 className="font-display text-[22px] tracking-[-0.03em]">Hi Alex, I’m ready to help.</h2><p className="mx-auto mt-[10px] max-w-[390px] text-[13px] leading-[1.55] text-muted">I can analyse your records, organize receipts, and turn your finances into simple next steps.</p></div>
          <div className="mb-[22px] flex flex-wrap justify-center gap-2">
            <button className="inline-flex items-center gap-2 rounded-[7px] border border-line bg-paper px-3 py-[10px] text-[11px] text-muted hover:border-blue hover:text-blue" onClick={() => setPrompt('Summarize my spending this month')}>Summarize my spending <Icon name="arrow" size={15} /></button>
            <button className="inline-flex items-center gap-2 rounded-[7px] border border-line bg-paper px-3 py-[10px] text-[11px] text-muted hover:border-blue hover:text-blue" onClick={() => setPrompt('Which subscriptions should I review?')}>Find subscriptions to review <Icon name="arrow" size={15} /></button>
            <button className="inline-flex items-center gap-2 rounded-[7px] border border-line bg-paper px-3 py-[10px] text-[11px] text-muted hover:border-blue hover:text-blue" onClick={() => setPrompt('Show my biggest expenses')}>Show my biggest expenses <Icon name="arrow" size={15} /></button>
          </div>
          <div className="flex items-center gap-2 rounded-[9px] border border-line py-[7px] pr-[7px] pl-[15px]"><input aria-label="Ask the AI agent" className="w-full bg-transparent text-[13px] text-ink outline-none" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask anything about your finances..." /><button className="grid size-[34px] shrink-0 place-items-center rounded-[7px] border-0 bg-blue text-white" aria-label="Send question"><Icon name="arrow" size={18} /></button></div>
        </article>
        <aside className="max-[820px]:order-first"><div className="grid gap-[10px] rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4"><span className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Quick actions</span><button className="flex items-center gap-[10px] border-0 border-t border-line bg-transparent py-3 text-left text-ink focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2"><span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="receipt" size={17} /></span><span className="grid flex-1 gap-1"><strong>Add a receipt</strong><small className="text-[11px] text-muted">Upload or enter one manually</small></span><Icon name="chevron" size={16} /></button><button className="flex items-center gap-[10px] border-0 border-t border-line bg-transparent py-3 text-left text-ink focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2"><span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-brown-soft text-brown"><Icon name="chat" size={17} /></span><span className="grid flex-1 gap-1"><strong>Prepare a summary</strong><small className="text-[11px] text-muted">Get a shareable monthly view</small></span><Icon name="chevron" size={16} /></button></div></aside>
      </section>
    </>
  )
}
