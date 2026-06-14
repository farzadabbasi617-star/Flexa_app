"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { useAuth } from "@/contexts/AuthContext";

interface ChatMessage {
  id: string;
  message: string;
  createdAt: string;
  sender: {
    id: string;
    username: string | null;
    displayName: string;
    role: string;
  };
}

interface ChatStats {
  totalMembers: number;
  onlineMembers: number;
}

export default function ChatPage() {
  const { user, loading: authLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stats, setStats] = useState<ChatStats>({ totalMembers: 0, onlineMembers: 0 });
  const [strikes, setStrikes] = useState(0);
  const [chatBanUntil, setChatBanUntil] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const fetchChat = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/chat", { cache: "no-store", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "چت بارگذاری نشد");

      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setStats(data.stats || { totalMembers: 0, onlineMembers: 0 });
      setStrikes(data.strikes || 0);
      setChatBanUntil(data.chatBanUntil || null);
      setError("");
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "چت بارگذاری نشد");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChat();
    const interval = setInterval(() => fetchChat(true), 5000);
    return () => clearInterval(interval);
  }, [fetchChat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const clean = input.trim();
    if (!clean || sending || !user) return;

    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ message: clean }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "پیام ارسال نشد");

      if (data.message) {
        setMessages((prev) => [...prev.filter((m) => m.id !== data.message.id), data.message]);
      }
      setStats(data.stats || stats);
      setStrikes(data.strikes || 0);
      setChatBanUntil(data.chatBanUntil || null);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "پیام ارسال نشد");
    } finally {
      setSending(false);
    }
  }

  const isBanned = chatBanUntil && new Date(chatBanUntil) > new Date();

  return (
    <div className="min-h-screen bg-[#050508] text-white flex flex-col relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,_rgba(92,0,160,.62),_transparent_70%)]" />

      <header className="relative z-10 pt-12 pb-5 px-6 border-b border-white/5 glass-panel">
        <div className="max-w-[480px] mx-auto">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="text-4xl font-black italic tracking-tighter en-font leading-none">CHAT</h1>
              <p className="mt-2 text-[10px] font-black text-purple-400 uppercase opacity-70 tracking-[0.25em]">
                Global Arena Chat
              </p>
            </div>
            <div className="text-left space-y-2 min-w-[130px]">
              <div className="px-4 py-1.5 rounded-full text-[10px] font-black border bg-green-500/10 border-green-500/40 text-green-400 flex justify-between gap-2">
                <span>آنلاین</span>
                <span>{stats.onlineMembers.toLocaleString("fa-IR")}</span>
              </div>
              <div className="px-4 py-1.5 rounded-full text-[10px] font-black border bg-purple-500/10 border-purple-500/30 text-purple-300 flex justify-between gap-2">
                <span>اعضا</span>
                <span>{stats.totalMembers.toLocaleString("fa-IR")}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="px-4 py-1.5 rounded-full text-[10px] font-black border bg-orange-500/10 border-orange-500/30 text-orange-300">
              اخطار: {strikes.toLocaleString("fa-IR")} / ۳
            </div>
            {user ? (
              <div className="text-[10px] text-gray-500 truncate">وارد شده: {user.displayName}</div>
            ) : (
              <Link href="/login" className="text-[10px] font-black text-cyan-300">ورود برای ارسال پیام</Link>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 overflow-y-auto px-6 pt-5 pb-36">
        <div className="max-w-[480px] mx-auto space-y-5">
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] w-full text-center p-3 rounded-2xl leading-6">
            🤖 ناظر هوشمند فلکسا فعال است. رعایت ادب الزامی است.
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/25 text-red-300 text-[11px] w-full text-center p-3 rounded-2xl leading-6">
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-center py-16 text-4xl animate-neon-pulse">💬</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">🏟️</div>
              <h2 className="text-lg font-black mb-2">هنوز پیامی نیست</h2>
              <p className="text-sm text-gray-500">اولین پیام آرنا رو تو بفرست.</p>
            </div>
          ) : (
            messages.map((msg) => {
              const mine = user?.id === msg.sender.id;
              const isAdmin = msg.sender.role === "admin" || msg.sender.role === "super_admin";
              return (
                <div key={msg.id} className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-2 text-[9px] font-black text-gray-500">
                    {isAdmin && <span className="text-fuchsia-400">👑</span>}
                    <span>{msg.sender.displayName || msg.sender.username || "کاربر"}</span>
                    <span dir="ltr">{new Date(msg.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div
                    className={`max-w-[82%] p-4 rounded-2xl text-xs border leading-6 whitespace-pre-wrap ${
                      mine
                        ? "bg-purple-600/25 border-purple-400/20 rounded-br-none"
                        : "bg-white/5 border-white/5 rounded-bl-none"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
      </main>

      <div className="fixed bottom-14 left-0 right-0 z-30 max-w-[480px] mx-auto px-6 pointer-events-none">
        {!user && !authLoading ? (
          <div className="glass-panel p-3 rounded-[28px] border border-white/10 text-center pointer-events-auto">
            <p className="text-xs text-gray-300 mb-3">برای ارسال پیام وارد حساب شو.</p>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/login" className="bg-purple-600 py-3 rounded-2xl text-xs font-black">ورود</Link>
              <Link href="/register" className="bg-white/5 py-3 rounded-2xl text-xs font-black">ثبت‌نام</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-panel p-2 rounded-full flex gap-3 border border-white/10 shadow-2xl pointer-events-auto">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              disabled={sending || Boolean(isBanned)}
              placeholder={isBanned ? "فعلاً از چت بن هستی..." : "چیزی بنویسید..."}
              className="flex-1 bg-transparent outline-none px-5 text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || !input.trim() || Boolean(isBanned)}
              className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-xl shadow-lg disabled:opacity-50 active:scale-95 transition-transform"
            >
              {sending ? "…" : "🚀"}
            </button>
          </form>
        )}
      </div>

      <BottomNav />
      <style jsx global>{`
        .glass-panel { background: rgba(20, 20, 25, 0.85); backdrop-filter: blur(25px); }
        .en-font { font-family: Impact, "Arial Black", system-ui, sans-serif; letter-spacing: -0.04em; }
      `}</style>
    </div>
  );
}
