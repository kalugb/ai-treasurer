import { useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'
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
      <header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div><p className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Finance / Receipts management</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">Receipts management</h1><p className="mt-3 text-[13px] leading-[1.55] text-muted">Choose a team and see the receipts collected from its connected sources.</p></div>
        <button className={googleConnected ? button.secondary : button.primary} onClick={() => setGoogleConnected((value) => !value)}><Icon name={googleConnected ? 'plug' : 'plus'} size={16} /> {googleConnected ? 'Google connected' : 'Set Google integration'}</button>
      </header>
      <section className="mb-[14px] grid grid-cols-2 gap-[14px] max-[820px]:grid-cols-1">
        <article className="flex items-center gap-3 rounded-[14px] border border-line bg-white px-[18px] py-4"><span className="size-[10px] shrink-0 rounded-full bg-muted data-[active=true]:bg-green" data-active={googleConnected} /><div className="grid gap-1"><strong>Google Drive integration</strong><small className="text-xs text-muted">{googleConnected ? 'Set' : 'Not set'}</small></div></article>
      </section>
      <section className="min-h-[360px] rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4">
        <div className="mb-5 flex items-start justify-between gap-[18px]"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">Receipt sources</h2><p className="mt-[6px] text-[13px] leading-[1.55] text-muted">These values are local-only until Google integration is wired to a backend.</p></div></div>
        <div className="flex items-end gap-3 pt-[6px] pb-[22px]"><label className="grid flex-1 gap-[7px] text-xs font-bold text-ink">Team<select className="h-[42px] w-full rounded-[7px] border border-line bg-paper px-3 text-ink" value={teamIndex} onChange={(event) => setTeamIndex(Number(event.target.value))}>{teams.map((item, index) => <option value={index} key={item.name}>{item.name}</option>)}</select></label><button className={button.primary} onClick={() => setModalOpen(true)}><Icon name="plus" size={16} /> Add team</button></div>
        {team && <div className="flex items-center gap-3 border-t border-line py-[14px]"><span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-brown-soft text-brown"><Icon name="folder" size={16} /></span><div className="grid flex-1 gap-1"><strong>{team.name}</strong><small className="text-xs text-muted">Showing {sourceLabel[team.source]} receipts</small></div><span className="rounded-[20px] bg-blue-soft px-[9px] py-[6px] text-[11px] font-bold text-blue">{visibleReceipts.length} receipts</span></div>}
        <div className="grid border-t border-line">{visibleReceipts.map(([date, merchant, category, amount, status]) => <div className="flex items-center gap-3 border-t border-line py-4" key={merchant}><span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="receipt" size={16} /></span><span className="grid flex-1 gap-[5px]"><strong>{merchant}</strong><small className="text-xs text-muted">{date} · {category} · {amount}</small></span><span className="rounded-[20px] bg-brown-soft px-[9px] py-[5px] text-[10px] font-bold text-brown">{status}</span></div>)}</div>
      </section>
      <AddTeamModal open={modalOpen} onClose={() => setModalOpen(false)} onAdd={saveTeam} />
    </>
  )
}
