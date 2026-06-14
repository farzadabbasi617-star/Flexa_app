"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  suggestions?: string[];
  provider?: string;
}

interface Position {
  x: number;
  y: number;
}

const BUTTON_SIZE = 56;
const STORAGE_KEY = "flexa-ai-button-position";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function providerLabel(provider?: string, cachedProvider?: string) {
  const actual = provider === "cache" ? cachedProvider : provider;
  if (actual === "openrouter") return "OpenRouter • Gemini";
  if (actual === "groq") return "Groq • Llama";
  if (provider === "cache") return "Cache";
  return "Local fallback";
}

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "سلام! 👋 من دستیار هوشمند Flexa هستم. می‌تونی دکمه من رو با لمس و کشیدن جابه‌جا کنی. چطور کمکت کنم؟",
      suggestions: ["چطور تورنومنت شرکت کنم؟", "چطور تورنومنت بسازم؟", "سیستم داوری چطوره؟"],
      provider: "local",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);
  const [lastProvider, setLastProvider] = useState("آماده اتصال");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    dragging: false,
    moved: false,
    pointerId: 0,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  useEffect(() => {
    function defaultPosition(): Position {
      return {
        x: window.innerWidth - BUTTON_SIZE - 20,
        y: window.innerHeight - BUTTON_SIZE - 92,
      };
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Position;
        setPosition({
          x: clamp(parsed.x, 12, window.innerWidth - BUTTON_SIZE - 12),
          y: clamp(parsed.y, 76, window.innerHeight - BUTTON_SIZE - 12),
        });
      } else {
        setPosition(defaultPosition());
      }
    } catch {
      setPosition(defaultPosition());
    }

    function handleResize() {
      setPosition((current) => {
        const next = current || defaultPosition();
        return {
          x: clamp(next.x, 12, window.innerWidth - BUTTON_SIZE - 12),
          y: clamp(next.y, 76, window.innerHeight - BUTTON_SIZE - 12),
        };
      });
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (position) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
    }
  }, [position]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text: string) {
    const cleanText = text.trim();
    if (!cleanText) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanText,
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
        body: JSON.stringify({ query: cleanText, lang: "fa" }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI request failed");

      const label = providerLabel(data.provider, data.cachedProvider);
      setLastProvider(label);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.response || "متوجه نشدم. لطفاً دوباره بپرس.",
        suggestions: data.suggestions,
        provider: label,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setLastProvider("خطا در اتصال");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "الان نتونستم به سرور هوش مصنوعی وصل بشم. کلیدهای OpenRouter/Groq و تنظیمات Render رو بررسی کن.",
          provider: "error",
        },
      ]);
    }

    setLoading(false);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!position) return;
    dragRef.current = {
      dragging: true,
      moved: false,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: position.x,
      initialY: position.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag.dragging || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;

    setPosition({
      x: clamp(drag.initialX + dx, 12, window.innerWidth - BUTTON_SIZE - 12),
      y: clamp(drag.initialY + dy, 76, window.innerHeight - BUTTON_SIZE - 12),
    });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (drag.pointerId === e.pointerId) {
      dragRef.current.dragging = false;
      if (!drag.moved) setIsOpen((value) => !value);
    }
  }

  const chatOnLeft = position ? position.x < window.innerWidth / 2 : false;

  return (
    <>
      {position && (
        <button
          type="button"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setIsOpen((value) => !value);
          }}
          className={`fixed w-14 h-14 rounded-full shadow-[0_18px_45px_rgba(0,0,0,0.45)] z-[80] flex items-center justify-center text-2xl transition-transform active:scale-95 border border-white/10 touch-none select-none ${
            isOpen ? "bg-dark-700 rotate-45" : "bg-gradient-to-br from-neon-purple to-neon-blue animate-glow"
          }`}
          style={{ left: position.x, top: position.y }}
          aria-label={isOpen ? "بستن دستیار هوشمند" : "باز کردن دستیار هوشمند"}
          title="برای جابه‌جایی نگه دار و بکش"
        >
          {isOpen ? "✕" : "🤖"}
        </button>
      )}

      {isOpen && (
        <div
          className="fixed bottom-[104px] w-[calc(100vw-2rem)] max-w-[400px] h-[520px] max-h-[calc(100vh-130px)] bg-dark-800 rounded-2xl shadow-2xl border border-gaming-border z-[75] flex flex-col overflow-hidden animate-slide-up"
          style={chatOnLeft ? { left: 16 } : { right: 16 }}
        >
          <div className="bg-gradient-to-r from-neon-purple to-neon-blue p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl">🤖</div>
            <div>
              <h3 className="font-bold text-white">دستیار هوشمند</h3>
              <p className="text-xs text-white/80">{lastProvider}</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id}>
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-6 ${
                      msg.role === "user"
                        ? "bg-neon-purple/30 text-white rounded-br-md"
                        : "bg-dark-600 text-gray-200 rounded-bl-md"
                    }`}
                  >
                    {msg.content}
                    {msg.role === "assistant" && msg.provider && msg.provider !== "local" && (
                      <div className="mt-2 text-[10px] text-gray-500">{msg.provider}</div>
                    )}
                  </div>
                </div>

                {msg.suggestions && msg.suggestions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.suggestions.map((sug) => (
                      <button
                        key={sug}
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
                  <span className="animate-pulse">در حال اتصال به AI...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

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
                placeholder="سوالت رو بپرس..."
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
