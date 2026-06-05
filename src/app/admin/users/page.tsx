"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface UserRow {
  id: string;
  email: string;
  username: string;
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

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) router.push("/");
  }, [loading, user, router]);

  useEffect(() => {
    if (user?.role === "admin") fetchUsers();
  }, [user]);

  async function fetchUsers() {
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch { setUsers([]); }
    setLoadingUsers(false);
  }

  async function changeRole(id: string, role: string) {
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role }),
      });
      fetchUsers();
    } catch { /* ignore */ }
  }

  async function toggleVerified(id: string, current: boolean) {
    try {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isVerified: !current }),
      });
      fetchUsers();
    } catch { /* ignore */ }
  }

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.displayName.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading || !user || user.role !== "admin") return null;

  const ROLE_BADGES: Record<string, { color: string; label: string }> = {
    admin: { color: "bg-neon-pink/20 text-neon-pink", label: lang === "fa" ? "ادمین" : "Admin" },
    judge: { color: "bg-neon-blue/20 text-neon-blue", label: lang === "fa" ? "داور" : "Judge" },
    user: { color: "bg-dark-600 text-gray-400", label: lang === "fa" ? "کاربر" : "User" },
  };

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

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            className="gaming-input"
            placeholder={lang === "fa" ? "🔍 جستجوی نام، ایمیل..." : "🔍 Search name, email..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Users Table */}
        {loadingUsers ? (
          <div className="text-center py-16">
            <div className="text-4xl animate-neon-pulse mb-4">👥</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((u) => {
              const badge = ROLE_BADGES[u.role] || ROLE_BADGES.user;
              return (
                <div key={u.id} className="gaming-card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Avatar + Info */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neon-purple to-neon-blue flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {u.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{u.displayName}</span>
                          {u.isVerified && <span className="text-neon-green text-xs">✓</span>}
                        </div>
                        <div className="text-xs text-gray-500 truncate">@{u.username} · {u.email}</div>
                      </div>
                    </div>

                    {/* Game IDs */}
                    <div className="flex gap-2 flex-shrink-0">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.clashRoyaleId ? "text-neon-blue" : "text-gray-600"}`}>⚔️</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.codMobileId ? "text-neon-orange" : "text-gray-600"}`}>🎯</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${u.fortniteId ? "text-neon-purple" : "text-gray-600"}`}>🏗️</span>
                    </div>

                    {/* Role */}
                    <select
                      className="bg-dark-700 border border-gaming-border rounded-lg px-3 py-1.5 text-xs text-white flex-shrink-0"
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                    >
                      <option value="user">{lang === "fa" ? "👤 کاربر" : "👤 User"}</option>
                      <option value="judge">{lang === "fa" ? "⚖️ داور" : "⚖️ Judge"}</option>
                      <option value="admin">{lang === "fa" ? "👑 ادمین" : "👑 Admin"}</option>
                    </select>

                    {/* Verify */}
                    <button
                      onClick={() => toggleVerified(u.id, u.isVerified)}
                      className={`text-xs px-3 py-1.5 rounded-lg flex-shrink-0 ${
                        u.isVerified
                          ? "bg-neon-green/20 text-neon-green"
                          : "bg-dark-600 text-gray-500"
                      }`}
                    >
                      {u.isVerified
                        ? lang === "fa" ? "✓ تأیید شده" : "✓ Verified"
                        : lang === "fa" ? "تأیید نشده" : "Unverified"}
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
