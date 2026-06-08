"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  match_start: "⚔️",
  tournament_update: "🏆",
  chat: "💬",
  achievement: "🏅",
  system: "📢",
};

export default function NotificationsPage() {
  const { t, lang } = useLanguage();
  const { user, loading } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingNotifs, setLoadingNotifs] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [loading, user, router]);

  const fetchNotifications = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      const res = await fetch("/api/notifications");
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      setNotifications([]);
    }
    setLoadingNotifs(false);
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  async function markAllRead() {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // handle error
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-4xl animate-neon-pulse">🔔</div>
        </div>
      </div>
    );
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              🔔 <span className="neon-text-purple">{t.notif.title}</span>
            </h1>
            {unreadCount > 0 && (
              <p className="text-gray-400 mt-1">
                {unreadCount} {lang === "fa" ? "اعلان خوانده نشده" : "unread"}
              </p>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-sm text-neon-blue hover:underline">
              {t.notif.markAllRead}
            </button>
          )}
        </div>

        {/* Notifications List */}
        {loadingNotifs ? (
          <div className="text-center py-20">
            <div className="text-4xl animate-neon-pulse mb-4">🔔</div>
            <p className="text-gray-400">{lang === "fa" ? "در حال بارگذاری..." : "Loading..."}</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="gaming-card p-12 text-center">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-xl font-bold mb-2">{t.notif.noNotifications}</h3>
            <p className="text-gray-400">
              {lang === "fa"
                ? "هنوز اعلانی ندارید"
                : "You don't have any notifications yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`gaming-card p-4 flex items-start gap-4 ${
                  !notif.isRead ? "border-s-4 border-neon-blue" : ""
                }`}
              >
                <div className="text-2xl">{TYPE_ICONS[notif.type] || "📢"}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm">{notif.title}</h3>
                    {!notif.isRead && (
                      <span className="w-2 h-2 bg-neon-blue rounded-full" />
                    )}
                  </div>
                  <p className="text-gray-400 text-sm mt-1">{notif.message}</p>
                  <p className="text-gray-600 text-xs mt-2">
                    {new Date(notif.createdAt).toLocaleString(
                      lang === "fa" ? "fa-IR" : "en-US"
                    )}
                  </p>
                </div>
                {notif.link && (
                  <Link
                    href={notif.link}
                    className="text-neon-blue text-sm hover:underline whitespace-nowrap"
                  >
                    {lang === "fa" ? "مشاهده" : "View"} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
