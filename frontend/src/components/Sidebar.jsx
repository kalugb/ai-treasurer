import Icon from './Icon'
import { navGroups } from '../data/mockData'

export default function Sidebar({ page, setPage }) {
  return (
    <>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="spark" size={17} /></span>
          <span>AI Treasurer</span>
        </div>

        <nav aria-label="Main navigation">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? 'active' : ''}`}
                  onClick={() => setPage(item.id)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-avatar">AM</div>
          <div className="user-copy">
            <strong>Alex Morgan</strong>
            <small>Personal workspace</small>
          </div>
          <button className="user-menu" aria-label="Open user menu">•••</button>
        </div>
      </aside>
      <button
        className="resize-handle"
        aria-label="Resize navigation"
        onPointerDown={() => { window.__resizing = true }}
      />
    </>
  )
}
