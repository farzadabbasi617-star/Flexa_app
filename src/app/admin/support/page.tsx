"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface Ticket { id: string; subject: string; status: string; createdAt: string; displayName: string | null; username: string | null; phoneNumber: string | null; }
interface TicketMessage { id: string; senderName: string | null; message: string; createdAt: string; }

export default function AdminSupportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("open");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => { setBusy(true); try { const res = await fetch("/api/admin/support", { cache: "no-store" }); const data = await res.json(); setTickets(data.tickets || []); } finally { setBusy(false); } }, []);
  useEffect(() => { if (!loading && (!user || !isAdmin)) router.push("/"); }, [loading, user, isAdmin, router]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const filtered = useMemo(() => { const q = query.toLowerCase(); return q ? tickets.filter((t) => JSON.stringify(t).toLowerCase().includes(q)) : tickets; }, [query, tickets]);

  async function open(ticket: Ticket) { setSelected(ticket); setStatus(ticket.status || "open"); const res = await fetch(`/api/admin/support?ticketId=${ticket.id}`); const data = await res.json(); setMessages(data.messages || []); }
  async function send(e: FormEvent) { e.preventDefault(); if (!selected || !reply.trim()) return; const res = await fetch("/api/admin/support", { method: "POST", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ ticketId: selected.id, message: reply, status }) }); if (res.ok) { setReply(""); open(selected); load(); } else alert("ارسال نشد"); }
  async function saveStatus(ticket: Ticket, next: string) { await fetch("/api/admin/support", { method: "PATCH", headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" }, body: JSON.stringify({ id: ticket.id, status: next }) }); load(); }

  if (loading || !user || !isAdmin) return null;

  return <div className="min-h-screen bg-dark-900 text-white"><Navbar /><main className="max-w-7xl mx-auto px-4 sm:px-6 py-8"><button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button><h1 className="text-3xl font-black neon-text-purple mb-2">🎧 مرکز پشتیبانی</h1><p className="text-gray-500 text-sm mb-6">مشاهده تیکت‌ها، پاسخ مدیر، تغییر وضعیت</p><div className="grid grid-cols-1 lg:grid-cols-3 gap-5"><section className="lg:col-span-1"><input className="gaming-input mb-4" placeholder="جستجو..." value={query} onChange={(e) => setQuery(e.target.value)} />{busy ? <div className="text-center py-16">🎧</div> : <div className="space-y-3">{filtered.map((t) => <button key={t.id} onClick={() => open(t)} className={`gaming-card p-4 w-full text-right ${selected?.id === t.id ? "border-neon-purple" : ""}`}><div className="font-black">{t.subject}</div><div className="text-xs text-gray-500 mt-1">{t.displayName || t.username || "—"} • {t.status}</div></button>)}</div>}</section><section className="lg:col-span-2 gaming-card p-5 min-h-[520px]">{selected ? <><div className="flex flex-col sm:flex-row justify-between gap-3 mb-4"><div><h2 className="font-black text-xl">{selected.subject}</h2><p className="text-xs text-gray-500 mt-1">{selected.displayName || selected.username || "—"} • {selected.phoneNumber || "—"}</p></div><select className="gaming-select max-w-[180px]" value={status} onChange={(e) => { setStatus(e.target.value); saveStatus(selected, e.target.value); }}><option value="open">باز</option><option value="pending">در انتظار</option><option value="closed">بسته</option><option value="resolved">حل شده</option></select></div><div className="space-y-3 max-h-[360px] overflow-y-auto mb-4">{messages.map((m) => <div key={m.id} className="bg-dark-700 rounded-2xl p-3"><div className="text-xs text-gray-500 mb-2">{m.senderName || "کاربر"} • {new Date(m.createdAt).toLocaleString("fa-IR")}</div><p className="text-sm leading-7">{m.message}</p></div>)}</div><form onSubmit={send} className="space-y-3"><textarea className="gaming-input min-h-28" placeholder="پاسخ مدیریت..." value={reply} onChange={(e) => setReply(e.target.value)} /><button className="gaming-btn">ارسال پاسخ</button></form></> : <div className="text-center text-gray-500 py-24">یک تیکت را انتخاب کن.</div>}</section></div></main></div>;
}
