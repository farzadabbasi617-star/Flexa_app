"use client";

import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
}

export default function AIAssistant() {
  const { lang } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // Initial greeting
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: lang === "fa"
            ? "سلام! 👋 من دستیار هوشمند Flexa هستم. چطور میتونم کمکت کنم؟"
            : "Hi! 👋 I'm the Flexa AI Assistant. How can I help you?",
          suggestions: lang === "fa"
            ? ["چطور تورنومنت شرکت کنم؟", "آیدی بازی چیه؟", "سیستم داوری"]
            : ["How to join tournaments?", "What are game IDs?", "Judging system"],
        },
      ]);
    }
  }, [isOpen, lang, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ query: text, lang }),
      });

      const data = await res.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || (lang === "fa" ? "متوجه نشدم. لطفاً دوباره بپرس." : "I didn't understand. Please try again."),
        suggestions: data.suggestions,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: lang === "fa" ? "خطا در پاسخگویی. لطفاً دوباره تلاش کن." : "Error responding. Please try again.",
        },
      ]);
    }

    setLoading(false);
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 end-6 w-14 h-14 rounded-full shadow-lg z-50 flex items-center justify-center text-2xl transition-all ${
          isOpen
            ? "bg-dark-700 rotate-45"
            : "bg-gradient-to-br from-neon-purple to-neon-blue animate-glow"
        }`}
      >
        {isOpen ? "✕" : "🤖"}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 end-6 w-[350px] sm:w-[400px] h-[500px] bg-dark-800 rounded-2xl shadow-2xl border border-gaming-border z-50 flex flex-col overflow-hidden animate-slide-up">
          {/* Header */}
          <div className="bg-gradient-to-r from-neon-purple to-neon-blue p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">
              🤖
            </div>
            <div>
              <h3 className="font-bold text-white">
                {lang === "fa" ? "دستیار هوشمند" : "AI Assistant"}
              </h3>
              <p className="text-xs text-white/70">
                {lang === "fa" ? "آنلاین • پاسخ فوری" : "Online • Instant replies"}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id}>
                <div
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-neon-purple/30 text-white rounded-br-md"
                        : "bg-dark-600 text-gray-200 rounded-bl-md"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>

                {/* Suggestions */}
                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.suggestions.map((sug, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(sug)}
                        className="text-xs px-3 py-1.5 rounded-full bg-dark-700 text-neon-blue hover:bg-dark-600 transition-all"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-dark-600 text-gray-400 px-4 py-2.5 rounded-2xl rounded-bl-md text-sm">
                  <span className="animate-pulse">
                    {lang === "fa" ? "در حال تایپ..." : "Typing..."}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gaming-border">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                className="flex-1 bg-dark-700 rounded-full px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-neon-purple/50"
                placeholder={lang === "fa" ? "سوالت رو بپرس..." : "Ask a question..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="w-10 h-10 rounded-full bg-neon-purple flex items-center justify-center text-white disabled:opacity-50"
              >
                ↑
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
