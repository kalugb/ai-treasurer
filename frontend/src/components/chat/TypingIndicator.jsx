export default function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-[#e5e7eb] rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1">
        <span className="animate-bounce [animation-delay:0ms] text-[#6B7B8D]">.</span>
        <span className="animate-bounce [animation-delay:150ms] text-[#6B7B8D]">.</span>
        <span className="animate-bounce [animation-delay:300ms] text-[#6B7B8D]">.</span>
      </div>
    </div>
  )
}
