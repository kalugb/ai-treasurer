import { useState } from 'react'
import Icon from '../components/Icon'
import AddTeamModal from '../components/AddTeamModal'
import { receipts } from '../data/mockData'

const initialTeams = [
  { name: 'Personal', source: 'both', googleFolderId: 'personal-folder' },
  { name: 'Northwind Co.', source: 'google', googleFolderId: 'northwind-folder' },
  { name: 'Side project', source: 'manual' },
]

export default function Folders() {
  const [teams, setTeams] = useState(initialTeams)
  const [teamIndex, setTeamIndex] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [googleConnected, setGoogleConnected] = useState(false)

  const saveTeam = ({ name, source, googleFolderId }) => {
    if (!name || (source !== 'manual' && !googleFolderId)) return
    setTeams((current) => [...current, { name, source, googleFolderId }])
    setTeamIndex(teams.length)
    setModalOpen(false)
  }

  const team = teams[teamIndex] || teams[0]
  const visibleReceipts = team?.source === 'google' ? receipts.slice(0, 2) : team?.source === 'manual' ? receipts.slice(2) : receipts
  const sourceLabel = { manual: 'Manual upload', google: 'Google Drive', both: 'Manual + Google Drive' }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">Finance / Receipts management</p><h1>Receipts management</h1><p className="subtle">Choose a team and see the receipts collected from its connected sources.</p></div>
        <button className={`button ${googleConnected ? 'button-secondary' : 'button-primary'}`} onClick={() => setGoogleConnected((value) => !value)}><Icon name={googleConnected ? 'plug' : 'plus'} size={16} /> {googleConnected ? 'Google connected' : 'Set Google integration'}</button>
      </header>
      <section className="folder-status-grid">
        <article className="panel folder-status-card"><span className="folder-status-dot" data-active={googleConnected} /><div><strong>Google Drive integration</strong><small>{googleConnected ? 'Set' : 'Not set'}</small></div></article>
      </section>
      <section className="panel folders-page">
        <div className="panel-heading"><div><h2>Receipt sources</h2><p className="subtle">These values are local-only until Google integration is wired to a backend.</p></div></div>
        <div className="team-toolbar"><label>Team<select value={teamIndex} onChange={(event) => setTeamIndex(Number(event.target.value))}>{teams.map((item, index) => <option value={index} key={item.name}>{item.name}</option>)}</select></label><button className="button button-primary" onClick={() => setModalOpen(true)}><Icon name="plus" size={16} /> Add team</button></div>
        {team && <div className="team-source-row"><span className="mock-icon folder-icon"><Icon name="folder" size={16} /></span><div><strong>{team.name}</strong><small>Showing {sourceLabel[team.source]} receipts</small></div><span className="mock-count">{visibleReceipts.length} receipts</span></div>}
        <div className="mock-list receipt-source-list">{visibleReceipts.map(([date, merchant, category, amount, status]) => <div className="mock-row" key={merchant}><span className="mock-icon"><Icon name="receipt" size={16} /></span><span><strong>{merchant}</strong><small>{date} · {category} · {amount}</small></span><span className="mock-action">{status}</span></div>)}</div>
      </section>
      <AddTeamModal open={modalOpen} onClose={() => setModalOpen(false)} onAdd={saveTeam} />
    </>
  )
}
