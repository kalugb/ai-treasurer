const suggestions = ['What can you do?', 'Help me get started', 'Tell me a joke']

export default function EmptyState({ onPick }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
      <h2 className="text-2xl font-semibold text-[#1C2B3A]">
        What can I help you with?
      </h2>
      <p className="text-[#6B7B8D] text-sm">Your AI Agent is ready to go.</p>
      <div className="flex flex-wrap gap-2 justify-center mt-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="px-3 py-1.5 text-sm border border-[#C9A96E]/40 rounded-full bg-white text-[#1C2B3A] hover:border-[#C9A96E] hover:bg-[#C9A96E]/10 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
