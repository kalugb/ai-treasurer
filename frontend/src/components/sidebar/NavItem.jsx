import { NavLink } from 'react-router-dom'

export default function NavItem({ label, href, icon: Icon }) {
  return (
    <NavLink
      to={href}
      end={href === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-[#C9A96E] text-[#1C2B3A]'
            : 'text-[#6B7B8D] hover:bg-[#C9A96E]/20 hover:text-[#F7F4EF]'
        }`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  )
}
