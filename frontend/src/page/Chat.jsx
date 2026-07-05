import { useState, useEffect, useRef } from "react";
import { Send, Bot, User } from "lucide-react";

const userName = "Alex";

// Placeholder replies — the bot just cycles through these one at a time.
// Swap this out for a real API call later.
const botReplies = [
	"That sounds interesting — tell me more.",
	"Got it, I'm on it.",
	"Makes sense. What's the end goal here?",
	"I hear you. Let's break that down.",
	"Good point — how do you want to approach it?",
];

function Chat() {
	const [messages, setMessages] = useState([
		{ role: "assistant", content: "Hey! What are you working on today?" },
	]);
	const [chatTitle, setChatTitle] = useState("");
	const [input, setInput] = useState("");
	const [started, setStarted] = useState(false);
	const [isTyping, setIsTyping] = useState(false);
	const replyIndex = useRef(0);
	const scrollRef = useRef(null);

	useEffect(() => {
		scrollRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, isTyping]);

	const handleSend = () => {
		const trimmed = input.trim();
		if (!trimmed || isTyping) return;

		setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
		setInput("");

		if (!started) {
			setStarted(true);
			setChatTitle(trimmed); // capture the first message as the title
		}

		setIsTyping(true);

		// remove the setTimeout and replace it with an API call to your backend for real bot responses
		setTimeout(() => {
			const reply = botReplies[replyIndex.current % botReplies.length];
			replyIndex.current += 1;
			setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
			setIsTyping(false);
		}, 900);
	};

	const handleKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	const renderInput = () => (
		<div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
			<textarea
				rows={1}
				value={input}
				onChange={(e) => setInput(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder="Message..."
				className="flex-1 resize-none outline-none text-sm py-1.5 max-h-32"
			/>
			<button
				onClick={handleSend}
				disabled={!input.trim() || isTyping}
				className="flex items-center justify-center w-9 h-9 rounded-lg bg-secondary text-white disabled:opacity-40 
					disabled:cursor-not-allowed hover:bg-hover transition-colors shrink-0"
			>
				<Send size={16} />
			</button>
		</div>
	);

	return (
		<>
			{!started ? (
				// New conversation: centered greeting instead of a message list
				<div className="flex flex-col h-full">
					<div className="flex flex-1 flex-col items-center justify-center px-6">
						<h1 className="text-2xl font-semibold text-slate-800 mb-6 text-center">
							Hi {userName}, what are we working on today?
						</h1>
						<div className="w-full max-w-xl">{renderInput()}</div>
					</div>
				</div>
			) : (
				// Ongoing conversation: normal chat layout
				<div className="flex flex-col h-full bg-slate-50 text-slate-900">
					{/* Title bar — only appears once the user has sent a first message, centered */}
					{chatTitle && (
						<div className="flex justify-center px-6 py-4">
							<h2 className="inline-block border border-slate-200 text-lg font-semibold text-slate-800 rounded-full 
								text-[15px] pl-10 pr-10 pt-2 pb-2 bg-white shadow-sm">
								Current Chat: {chatTitle}
							</h2>
						</div>
					)}

					{/* Messages */}
					<div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
						{messages.map((m, i) => (
							<div
								key={i}
								className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
							>
								<div
									className={`flex items-center justify-center w-8 h-8 rounded-full shrink-0 ${m.role === "user"
											? "bg-indigo-600 text-white"
											: "bg-slate-200 text-slate-700"
										}`}
								>
									{m.role === "user" ? <User size={16} /> : <Bot size={16} />}
								</div>
								<div
									className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user"
											? "bg-indigo-600 text-white rounded-tr-sm"
											: "bg-white border border-slate-200 rounded-tl-sm"
										}`}
								>
									{m.content}
								</div>
							</div>
						))}

						{isTyping && (
							<div className="flex gap-3">
								<div className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 bg-slate-200 text-slate-700">
									<Bot size={16} />
								</div>
								<div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1 items-center">
									<span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.3s]" />
									<span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.15s]" />
									<span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
								</div>
							</div>
						)}

						<div ref={scrollRef} />
					</div>

					{/* Input */}
					<div className="border-t border-slate-200 px-6 py-4">
						<div className="max-w-3xl mx-auto w-full">{renderInput()}</div>
					</div>
				</div>
			)}
		</>
	);
}

export default Chat;