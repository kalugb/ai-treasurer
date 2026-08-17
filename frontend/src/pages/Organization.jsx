import { useState } from 'react'
import Icon from '../components/Icon'
import { button } from '../components/button'

const initialOrganizations = ['Personal workspace']

export default function Organization() {
  const [organizations, setOrganizations] = useState(initialOrganizations)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState(null)

  const save = (event) => {
    event.preventDefault()
    const value = name.trim()
    if (!value) return
    setOrganizations((current) => editing === null
      ? [...current, value]
      : current.map((organization, index) => index === editing ? value : organization))
    setName('')
    setEditing(null)
  }

  const edit = (index) => {
    setEditing(index)
    setName(organizations[index])
  }

  const remove = (index) => {
    setOrganizations((current) => current.filter((_, itemIndex) => itemIndex !== index))
    if (editing === index) {
      setEditing(null)
      setName('')
    }
  }

  return (
    <>
      <header className="mb-9 flex items-end justify-between gap-6 max-[820px]:flex-col max-[820px]:items-start">
        <div><p className="mb-[10px] text-[11px] font-bold tracking-[0.1em] uppercase text-muted">Workspace</p><h1 className="font-display text-[clamp(28px,3vw,42px)] leading-[1.08] tracking-[-0.05em] text-ink">Organizations</h1><p className="mt-3 text-[13px] leading-[1.55] text-muted">Create and manage the organizations that keep your finances separate.</p></div>
      </header>
      <section className="grid content-start gap-[18px] rounded-[14px] border border-line bg-white p-[22px] max-[560px]:p-4">
        <div className="mb-5 flex items-start justify-between gap-[18px]"><div><h2 className="font-display text-[17px] tracking-[-0.03em]">{editing === null ? 'Add an organization' : 'Edit organization'}</h2><p className="mt-[6px] text-[13px] leading-[1.55] text-muted">Local-only for now. Changes are kept in this page while it is open.</p></div><span className="rounded-[20px] bg-blue-soft px-[9px] py-[6px] text-[11px] font-bold text-blue">{organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'}</span></div>
        <form className="flex items-end gap-3 pb-[22px] max-[820px]:flex-col max-[820px]:items-stretch" onSubmit={save}>
          <label htmlFor="organization-name" className="grid flex-1 gap-[7px] text-xs font-bold text-ink">Organization name<input id="organization-name" className="h-[42px] w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Acme Inc." /></label>
          <div className="flex gap-2"><button className={button.primary} type="submit"><Icon name="plus" size={16} /> {editing === null ? 'Add organization' : 'Save changes'}</button>{editing !== null && <button className={button.secondary} type="button" onClick={() => { setEditing(null); setName('') }}>Cancel</button>}</div>
        </form>
        <div className="grid border-t border-line">
          {organizations.map((organization, index) => <div className="flex items-center gap-3 border-t border-line py-4" key={`${organization}-${index}`}><span className="grid size-[34px] shrink-0 place-items-center rounded-lg bg-blue-soft text-blue"><Icon name="grid" size={16} /></span><span className="grid flex-1 gap-[5px]"><strong>{organization}</strong><small className="text-xs text-muted">Local organization</small></span><span className="flex items-center gap-2"><button className="rounded-md border border-line bg-transparent px-[7px] py-[5px] text-[10px] font-bold text-blue hover:border-blue hover:bg-blue-soft" onClick={() => edit(index)}>Edit</button><button className="rounded-md border border-line bg-transparent px-[7px] py-[5px] text-[10px] font-bold text-brown hover:border-brown hover:bg-brown-soft" onClick={() => remove(index)}>Remove</button></span></div>)}
        </div>
      </section>
    </>
  )
}
