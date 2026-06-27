export default function ChatMessage({ role, content }) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] px-4 py-2 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#1C2B3A] text-[#F7F4EF] rounded-2xl rounded-br-sm'
            : 'bg-white text-[#1C2B3A] border border-[#e5e7eb] rounded-2xl rounded-bl-sm'
        }`}
      >
        {content}
      </div>
    </div>
  )
}
