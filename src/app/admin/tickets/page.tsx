"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

interface TicketRow {
  id: string;
  code: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  maxUses: number;
  usedCount: number;
  status: string;
  note: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  createdAt: string;
}

export default function AdminTicketsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<{ tickets: TicketRow[]; tournaments: Array<{ id: string; name: string; status: string }> } | null>(null);
  const [busy, setBusy] = useState(true);
  const [form, setForm] = useState({ username: "", tournamentId: "", quantity: "1", expiresInDays: "", note: "جایزه تورنومنت" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tickets", { cache: "no-store" });
      const json = await res.json();
      setData(res.ok ? json : null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (!loading && (!user || !isAdmin)) router.push("/"); }, [loading, user, isAdmin, router]);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  async function issue(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({
          username: form.username.trim(),
          tournamentId: form.tournamentId || null,
          quantity: Number(form.quantity) || 1,
          expiresInDays: form.expiresInDays === "" ? null : Number(form.expiresInDays),
          note: form.note || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "صدور بلیت انجام نشد");
      setMessage(`✅ ${json.issued} بلیت برای ${json.user?.username || "کاربر"} صادر شد: ${json.tickets.map((t: { code: string }) => t.code).join("، ")}`);
      setForm({ ...form, username: "", quantity: "1" });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "صدور بلیت انجام نشد");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(ticketId: string) {
    if (!confirm("این بلیت لغو شود؟")) return;
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ ticketId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "لغو انجام نشد");
      setMessage(`بلیت ${json.revoked} لغو شد.`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "لغو انجام نشد");
    }
  }

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white mb-4">← بازگشت</button>
        <h1 className="text-3xl font-black neon-text-purple mb-2">🎟 بلیت‌های رایگان تورنومنت</h1>
        <p className="text-gray-500 text-sm mb-6">صدور بلیت رایگان برای کاربران — دارنده بلیت می‌تواند بدون پرداخت ورودی در یک تورنومنت پولی ثبت‌نام کند.</p>

        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}
        {message && <div className="bg-green-500/10 border border-green-500/30 text-green-300 rounded-xl p-3 mb-5 text-sm">{message}</div>}

        {busy ? (
          <div className="text-center py-20 text-4xl animate-neon-pulse">🎟</div>
        ) : data && (
          <>
            <form onSubmit={issue} className="gaming-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input className="gaming-input" placeholder="نام کاربری یا شناسه گیمنت کاربر" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              <input className="gaming-input" placeholder="تعداد (پیش‌فرض ۱)" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\\D/g, "") })} />
              <select className="gaming-select" value={form.tournamentId} onChange={(e) => setForm({ ...form, tournamentId: e.target.value })}>
                <option value="">🎫 بلیت باز — قابل استفاده در هر تورنومنت پولی</option>
                {(data.tournaments || []).map((tr) => (
                  <option key={tr.id} value={tr.id}>🔒 فقط: {tr.name} ({tr.status})</option>
                ))}
              </select>
              <input className="gaming-input" placeholder="مهلت اعتبار (روز — خالی = بدون انقضا)" inputMode="numeric" value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: e.target.value.replace(/\\D/g, "") })} />
              <input className="gaming-input sm:col-span-2" placeholder="یادداشت (مثلاً: جایزه دوم بتل رویال)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              <button disabled={saving || !form.username.trim()} className="gaming-btn sm:col-span-2 disabled:opacity-50">{saving ? "در حال صدور..." : "صدور بلیت"}</button>
            </form>

            <section className="gaming-card overflow-hidden">
              <div className="p-4 border-b border-white/5 font-black">بلیت‌های صادرشده</div>
              <div className="divide-y divide-white/5">
                {(data.tickets || []).length === 0 && <div className="p-6 text-center text-gray-500 text-sm">هنوز بلیتی صادر نشده است.</div>}
                {(data.tickets || []).map((t) => (
                  <div key={t.id} className="p-4 flex flex-col sm:flex-row justify-between gap-3">
                    <div>
                      <div className="font-bold">
                        <span className="font-mono">{t.code}</span> — {t.displayName || t.username || "—"}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {t.tournamentName ? `🔒 مخصوص: ${t.tournamentName}` : "🔓 هر تورنومنت پولی"}
                        {" • "}
                        {t.status === "active" && t.usedCount < t.maxUses ? "فعال" : t.usedCount >= t.maxUses ? "مصرف‌شده" : t.status === "revoked" ? "لغوشده" : t.status}
                        {t.expiresAt ? ` • انقضا: ${new Date(t.expiresAt).toLocaleDateString("fa-IR")}` : ""}
                        {t.usedAt ? ` • مصرف: ${new Date(t.usedAt).toLocaleString("fa-IR")}` : ""}
                        {t.note ? ` • ${t.note}` : ""}
                      </div>
                    </div>
                    {t.status === "active" && t.usedCount < t.maxUses && (
                      <button onClick={() => revoke(t.id)} className="text-xs bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-3 py-2 h-fit hover:bg-red-500/20 shrink-0">لغو بلیت</button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
