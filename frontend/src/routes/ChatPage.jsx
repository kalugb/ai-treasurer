import { useState } from 'react'
import ChatWindow from '../components/chat/ChatWindow'
import ChatInput from '../components/chat/ChatInput'
import EmptyState from '../components/chat/EmptyState'

export default function ChatPage() {
  // BACKEND: `messages` is the chat history array streamed to the UI.
  // Shape: { id, role: 'user' | 'assistant', content: string }[]
  // Replace with API-fetched history / websocket feed.
  const [messages, setMessages] = useState([])
  // BACKEND: `isTyping` gates the typing indicator while the model responds.
  // Flip true on request dispatch, false on stream complete / SSE done event.
  const [isTyping, setIsTyping] = useState(false)

  // BACKEND: this is the main integration point — user sends a message.
  // `text` is the sanitized user input. Replace the setTimeout block below
  // with your API call (fetch / SSE / websocket). On each streamed token
  // append/update an assistant message; on completion set isTyping = false.
  const handleSend = (text) => {
    const userMsg = { id: Date.now(), role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setIsTyping(true)

    // BACKEND: replace this fake delay with real model call + streaming.
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: 'This is a placeholder response. Backend integration coming soon.',
        },
      ])
      setIsTyping(false)
    }, 1200)
  }

  return (
    <div className="h-full flex flex-col">
      {messages.length === 0 ? (
        <EmptyState onPick={handleSend} />
      ) : (
        <ChatWindow messages={messages} isTyping={isTyping} />
      )}
      <ChatInput onSend={handleSend} />
    </div>
  )
}
