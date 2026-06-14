"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface UserRow {
  id: string;
  phoneNumber: string;
  email: string | null;
  username: string | null;
  displayName: string;
  role: string;
  isVerified: boolean;
  clashRoyaleId: string | null;
  codMobileId: string | null;
  fortniteId: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

export default function AdminUsersPage() {
  const { lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) router.push("/");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (isAdmin) fetchUsers();
  }, [isAdmin]);

  async function fetchUsers() {
    setLoadingUsers(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setError("لیست کاربران بارگذاری نشد.");
      setUsers([]);
    }
    setLoadingUsers(false);
  }

  async function patchUser(id: string, payload: Record<string, unknown>) {
    setError("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ id, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تغییرات ذخیره نشد.");
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      (u.username || "").toLowerCase().includes(q) ||
      (u.displayName || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.phoneNumber || "").toLowerCase().includes(q)
    );
  });

  if (loading || !user || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/admin")} className="text-gray-500 hover:text-white">←</button>
            <h1 className="text-2xl font-bold">
              👥 <span className="neon-text-purple">{lang === "fa" ? "مدیریت کاربران" : "User Manager"}</span>
            </h1>
            <span className="text-sm text-gray-500">({users.length})</span>
          </div>
        </div>

        {error && <div className="bg-red-900/30 border border-red-500/40 text-red-300 rounded-xl p-3 mb-5 text-sm">{error}</div>}

        <div className="mb-6">
          <input
            type="text"
            className="gaming-input"
            placeholder="🔍 جستجوی نام، موبایل، ایمیل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loadingUsers ? (
          <div className="text-center py-16">
            <div className="text-4xl animate-neon-pulse mb-4">👥</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => {
              const canEditAdminRole = isSuperAdmin || (u.role !== "admin" && u.role !== "super_admin");
              return (
                <div key={u.id} className="gaming-card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {u.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{u.displayName}</span>
                          {u.isVerified && <span className="text-neon-green text-xs">✓</span>}
                        </div>
                        <div className="text-xs text-gray-500 truncate" dir="ltr">
                          @{u.username || "-"} · {u.phoneNumber} · {u.email || "no email"}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.clashRoyaleId ? "text-neon-blue" : "text-gray-600"}`}>⚔️</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.codMobileId ? "text-neon-orange" : "text-gray-600"}`}>🎯</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.fortniteId ? "text-neon-purple" : "text-gray-600"}`}>🏗️</span>
                    </div>

                    <select
                      className="bg-dark-700 border border-gaming-border rounded-lg px-3 py-1.5 text-xs text-white flex-shrink-0 disabled:opacity-50"
                      value={u.role}
                      disabled={!canEditAdminRole}
                      onChange={(e) => patchUser(u.id, { role: e.target.value })}
                    >
                      <option value="player">👤 بازیکن</option>
                      <option value="judge">⚖️ داور</option>
                      <option value="moderator">🛡️ ناظر</option>
                      {isSuperAdmin && <option value="admin">👑 ادمین</option>}
                      {isSuperAdmin && <option value="super_admin">💎 مدیر اصلی</option>}
                    </select>

                    <button
                      onClick={() => patchUser(u.id, { isVerified: !u.isVerified })}
                      className={`text-xs px-3 py-1.5 rounded-lg flex-shrink-0 ${
                        u.isVerified ? "bg-neon-green/20 text-neon-green" : "bg-dark-600 text-gray-500"
                      }`}
                    >
                      {u.isVerified ? "✓ تأیید شده" : "تأیید نشده"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
