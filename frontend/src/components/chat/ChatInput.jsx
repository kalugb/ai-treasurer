import { useState, useRef } from 'react'
import { ArrowUp } from 'lucide-react'

export default function ChatInput({ onSend }) {
  const [value, setValue] = useState('')
  const ref = useRef(null)

  const send = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSend(trimmed)
    setValue('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="border-t border-[#6B7B8D]/30 bg-[#F7F4EF] px-4 py-3 shadow-[0_-1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-end gap-2 max-w-3xl mx-auto">
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 5 * 24)}px`
          }}
          onKeyDown={onKeyDown}
          placeholder="Message..."
          className="flex-1 resize-none rounded-2xl border border-[#6B7B8D]/30 bg-white px-4 py-2.5 text-sm text-[#1C2B3A] outline-none placeholder-[#6B7B8D] focus:ring-2 focus:ring-[#C9A96E] focus:border-transparent"
        />
        <button
          onClick={send}
          disabled={!value.trim()}
          className="mb-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-[#C9A96E] text-[#1C2B3A] disabled:bg-[#C9A96E]/40 disabled:cursor-not-allowed hover:bg-[#C9A96E]/80 transition-colors"
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  )
}
