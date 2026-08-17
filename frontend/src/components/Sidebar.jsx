import Icon from './Icon'
import { navGroups } from '../data/mockData'

const navFocus = 'focus-visible:outline-[3px] focus-visible:outline-blue-ring focus-visible:outline-offset-2'

export default function Sidebar({ page, setPage }) {
  return (
    <>
      <aside className="sticky top-0 flex h-svh w-(--sidebar-width) max-w-[50%] min-w-[10%] flex-col overflow-y-auto border-r border-line bg-sidebar pt-7 pr-[14px] pb-[18px] pl-[14px] transition-[width] duration-150 ease-out max-[560px]:w-[58px] max-[560px]:min-w-[58px] max-[560px]:px-2">
        <div className="flex items-center gap-[10px] overflow-hidden px-[10px] pb-11 font-display text-base font-extrabold whitespace-nowrap text-ink max-[560px]:px-[6px] max-[560px]:pb-8">
          <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-blue text-white"><Icon name="spark" size={17} /></span>
          <span className="max-[560px]:hidden">AI Treasurer</span>
        </div>

        <nav aria-label="Main navigation" className="grid">
          {navGroups.map((group) => (
            <div className="mb-6 grid gap-[6px] max-[560px]:mb-[18px]" key={group.label}>
              <span className="px-3 pb-[5px] text-[10px] font-bold tracking-[0.12em] uppercase text-muted max-[560px]:hidden">{group.label}</span>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-[9px] border-0 px-3 text-left whitespace-nowrap overflow-hidden text-muted transition-colors duration-200 ease-out hover:bg-blue-soft hover:text-blue max-[560px]:justify-center max-[560px]:px-0 ${navFocus} ${page === item.id ? 'bg-blue-soft text-blue' : ''}`}
                  onClick={() => setPage(item.id)}
                >
                  <Icon name={item.icon} />
                  <span className="max-[560px]:hidden">{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex min-w-0 items-center gap-[10px] border-t border-line px-2 pt-4 max-[560px]:justify-center max-[560px]:px-0">
          <div className="grid size-[32px] shrink-0 place-items-center rounded-full bg-brown-soft text-[11px] font-bold text-brown">AM</div>
          <div className="overflow-hidden whitespace-nowrap max-[560px]:hidden">
            <strong className="block overflow-hidden text-xs text-ellipsis">Alex Morgan</strong>
            <small className="mt-[3px] block overflow-hidden text-[11px] text-ellipsis text-muted">Personal workspace</small>
          </div>
          <button className="ml-auto text-muted max-[560px]:hidden" aria-label="Open user menu">•••</button>
        </div>
      </aside>
      <button
        className="z-[2] -ml-[15px] grid w-[18px] cursor-col-resize place-items-center border-0 bg-transparent p-0 focus:outline-none focus-visible:[&>span]:outline-[3px] focus-visible:[&>span]:outline-blue-ring focus-visible:[&>span]:outline-offset-2 max-[560px]:hidden"
        aria-label="Drag to resize navigation"
        onPointerDown={() => { window.__resizing = true }}
      >
        <span className="grid size-7 place-items-center rounded-full border border-line bg-sidebar text-muted shadow-sm transition-colors hover:border-blue hover:bg-blue-soft hover:text-blue">
          <Icon name="resize" size={14} />
        </span>
      </button>
    </>
  )
}
