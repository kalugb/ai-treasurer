import { useState } from 'react'
import Icon from './Icon'
import { button } from './button'

const field = 'grid gap-[7px] text-xs font-bold text-ink'

export default function AddTeamModal({ open, onClose, onAdd }) {
  const [name, setName] = useState('')
  const [source, setSource] = useState('both')
  const [googleFolderId, setGoogleFolderId] = useState('')

  if (!open) return null

  const submit = (event) => {
    event.preventDefault()
    onAdd({ name: name.trim(), source, googleFolderId: googleFolderId.trim() })
    setName('')
    setSource('both')
    setGoogleFolderId('')
  }

  return (
    <div
      className="fixed inset-0 z-10 grid place-items-center bg-[rgb(28_35_36_/_35%)] p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="w-[min(100%,480px)] rounded-[14px] border border-line bg-white p-6 shadow-[0_20px_50px_rgb(28_35_36_/_18%)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-team-title"
      >
        <div className="mb-5 flex items-start justify-between gap-[18px]">
          <div>
            <h2 id="add-team-title" className="font-display text-[17px] tracking-[-0.03em]">Add team</h2>
            <p className="mt-[6px] text-[13px] leading-[1.55] text-muted">
              Choose where this team receives receipts from.
            </p>
          </div>
          <button className="mt-5 inline-flex items-center gap-2 border-0 bg-transparent p-0 text-xs font-bold text-blue" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="grid gap-[18px]" onSubmit={submit}>
          <label className={field}>
            Team name
            <input
              autoFocus
              className="h-[42px] w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Marketing"
              required
            />
          </label>

          <label className={field}>
            Receipt source
            <select
              className="h-[42px] w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]"
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
                if (event.target.value === 'manual') setGoogleFolderId('')
              }}
            >
              <option value="manual">Manual upload</option>
              <option value="google">Google Drive</option>
              <option value="both">Both sources</option>
            </select>
          </label>

          {source !== 'manual' && (
            <label className={field}>
              Google folder ID
              <input
                className="h-[42px] w-full rounded-[7px] border border-line bg-paper px-3 text-ink outline-none focus:border-blue focus:shadow-[0_0_0_3px_var(--color-blue-ring)]"
                value={googleFolderId}
                onChange={(event) => setGoogleFolderId(event.target.value)}
                placeholder="Paste Google Drive folder ID"
                required
              />
            </label>
          )}

          <div className="flex gap-2">
            <button className={button.primary} type="submit">
              <Icon name="plus" size={16} />
              Add team
            </button>
            <button className={button.secondary} type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
