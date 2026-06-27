import { navItems } from './nav-config'
import NavItem from './NavItem'

export default function Sidebar() {
  return (
    <aside className="w-[30%] min-w-[220px] max-w-[300px] h-screen bg-[#1C2B3A] text-[#F7F4EF] flex flex-col">
      <div className="px-4 py-5 text-lg font-semibold border-b border-[#F7F4EF]/10">
        AI Agent
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-[#F7F4EF]/10 text-xs text-[#6B7B8D]">
        {/* TODO: mobile sidebar */}
        Settings
      </div>
    </aside>
  )
}
