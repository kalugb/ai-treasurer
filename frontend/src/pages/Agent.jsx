import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useLocalRuntime,
} from '@assistant-ui/react'
import BlurText from '../components/BlurText'
import Icon from '../components/Icon'

const initialMessages = [
  { role: 'assistant', content: [{ type: 'text', text: 'Hi Alex — I’m your financial co-pilot. I can help you understand spending, find subscriptions, or prepare a concise monthly summary.' }] },
  { role: 'user', content: [{ type: 'text', text: 'What were my largest expenses this month?' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'Your largest recorded expense was Air Canada at $326.00, followed by Loblaws at $86.42 and Adobe Creative Cloud at $54.99. Travel is the main category to review this month.' }] },
]

const modelAdapter = {
  async run({ messages }) {
    const question = messages.at(-1)?.content
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('')

    return {
      content: [{
        type: 'text',
        text: question
          ? `I’ve noted “${question}”. The live finance connection is not set up yet, but I’ll be ready to analyse it once your records are connected.`
          : 'What would you like to look at?',
      }],
    }
  },
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex gap-3 px-1 py-5">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brown text-white" aria-label="AI Treasurer">
        <Icon name="assistant" size={17} />
      </span>
      <div className="min-w-0 max-w-195 pt-1 text-[14px] leading-7 text-ink">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  )
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end gap-3 px-1 py-5">
      <div className="max-w-[min(78%,620px)] rounded-[20px] rounded-br-md bg-blue px-4 py-3 text-[14px] leading-6 text-white">
        <MessagePrimitive.Parts />
      </div>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink text-white" aria-label="Alex">
        <Icon name="user" size={17} />
      </span>
    </MessagePrimitive.Root>
  )
}

function AgentChat() {
  const runtime = useLocalRuntime(modelAdapter, { initialMessages })

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <section className="mx-auto flex h-[calc(100vh-104px)] min-h-155 max-w-230 flex-col">
        <header className="flex items-center justify-between border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brown text-white">
              <Icon name="assistant" size={20} />
            </span>
            <div>
              <h1 className="font-display text-[18px] tracking-[-0.03em] text-ink">AI Treasurer</h1>
              <p className="mt-0.5 text-[12px] text-green">Online · Your financial co-pilot</p>
            </div>
          </div>
          <button className="rounded-lg px-3 py-2 text-[12px] font-semibold text-muted transition hover:bg-white hover:text-ink focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button">
            New chat
          </button>
        </header>

        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-205 py-8">
            <div className="mb-5 px-1 text-center">
              <p className="text-[12px] font-bold tracking-widest text-muted uppercase">Financial assistant</p>
              <BlurText className="mt-2 block font-display text-[clamp(26px,4vw,38px)] tracking-tighter text-ink" text="How can I help today?" />
            </div>
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          </div>
        </ThreadPrimitive.Viewport>

        <ThreadPrimitive.ViewportFooter className="border-t border-line bg-paper pt-4">
          <div className="mx-auto max-w-205">
            <ComposerPrimitive.Root className="flex items-end gap-2 rounded-2xl border border-line bg-white p-2 shadow-[0_8px_30px_oklch(30%_0.03_260/0.06)] focus-within:border-blue">
              <button className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-paper hover:text-ink focus-visible:outline-[3px] focus-visible:outline-blue-ring" type="button" aria-label="Attach a receipt">
                <Icon name="plus" size={19} />
              </button>
              <ComposerPrimitive.Input className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2 text-[14px] leading-6 text-ink outline-none placeholder:text-muted" placeholder="Message AI Treasurer…" />
              <ComposerPrimitive.Send className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue text-white transition hover:bg-blue-dark disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message">
                <Icon name="arrow" size={18} />
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
            <p className="py-3 text-center text-[11px] text-muted">AI Treasurer can make mistakes. Review important financial decisions.</p>
          </div>
        </ThreadPrimitive.ViewportFooter>
      </section>
    </AssistantRuntimeProvider>
  )
}

export default function Agent() {
  return <AgentChat />
}
