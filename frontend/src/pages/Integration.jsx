import { useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'

export default function Integration() {
  const [connected, setConnected] = useState(false)

  return (
    <>
      <header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div>
          <p className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Settings / Integration</p>
          <h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">Connect your tools.</h1>
          <p className="mt-3 text-[13px] leading-[1.55] text-muted">Bring the places where your financial records already live into AI Treasurer.</p>
        </div>
      </header>
      <section className="grid grid-cols-[minmax(0,620px)]">
        <article className="flex items-start gap-[18px] rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4">
          <div className="grid size-[48px] shrink-0 place-items-center rounded-xl bg-blue-soft font-display text-2xl font-extrabold text-[#4285f4]">G</div>
          <div className="flex-1">
            <div className="flex items-center gap-[10px]"><h2 className="font-display text-[17px] tracking-[-0.03em]">Google</h2><span className={`rounded-[20px] px-2 py-[5px] text-[10px] font-bold ${connected ? 'bg-green-soft text-green' : 'bg-paper text-muted'}`}>{connected ? 'Connected' : 'Available'}</span></div>
            <p className="mb-[18px] mt-2 max-w-[450px] text-[13px] leading-[1.55] text-muted">Connect Google Drive to import receipt files and keep your records organized.</p>
            <button className={connected ? button.secondary : button.primary} onClick={() => setConnected((value) => !value)}>
              <Icon name={connected ? 'plug' : 'plus'} size={16} />
              {connected ? 'Disconnect' : 'Connect Google'}
            </button>
          </div>
        </article>
      </section>
    </>
  )
}
