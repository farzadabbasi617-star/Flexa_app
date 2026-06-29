"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface SiteImage {
  slug: string;
  url: string;
  category: string;
  altText?: string | null;
}

const navItems = [
  { id: "arena", label: "آرنا", icon: "🔥", path: "/" },
  { id: "rankings", label: "رتبه‌ها", icon: "👑", path: "/leaderboard" },
  { id: "store", label: "فروشگاه", icon: "🛒", path: "/store" },
  { id: "honors", label: "تالار", icon: "🏆", path: "/honors" },
  { id: "profile", label: "پروفایل", icon: "⚙️", path: "/profile" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [icons, setIcons] = useState<SiteImage[]>([]);

  useEffect(() => {
    fetch("/api/public/images?category=icon", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setIcons(Array.isArray(data) ? data : []))
      .catch(() => setIcons([]));
  }, []);

  const iconMap = useMemo(() => {
    const map: Record<string, SiteImage> = {};
    for (const image of icons) map[image.slug] = image;
    return map;
  }, [icons]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[520px] px-3 sm:px-6 pointer-events-none"
      style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
      aria-label="ناوبری اصلی موبایل"
    >
      <div className="glass-bottom pointer-events-auto rounded-[24px] px-1.5 py-2.5 flex justify-around items-center border border-white/10 shadow-[0_-12px_35px_rgba(0,0,0,0.7)]">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
          const imageIcon = iconMap[`icon-${item.id}`];
          const customIcons: Record<string, string> = {
            arena: "/icons/arena_icon.png",
            rankings: "/icons/rankings_icon.png",
            honors: "/icons/honors_icon.png",
            profile: "/icons/settings_icon.png",
          };
          const finalIconUrl = customIcons[item.id] || imageIcon?.url;

          return (
            <Link
              key={item.id}
              href={item.path}
              aria-current={isActive ? "page" : undefined}
              className={`min-w-[64px] min-h-[56px] rounded-2xl flex flex-col items-center justify-center gap-0.5 px-2 transition-all active:scale-95 ${
                isActive ? "text-purple-200 bg-purple-500/10" : "text-white/38 hover:text-white/70"
              }`}
            >
              {finalIconUrl ? (
                <img
                  src={finalIconUrl}
                  alt=""
                  aria-hidden="true"
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl object-contain ${isActive ? "drop-shadow-[0_0_12px_#bc00ff]" : "opacity-60"}`}
                />
              ) : (
                <div className={`text-[24px] ${isActive ? "drop-shadow-[0_0_12px_#bc00ff]" : ""}`}>{item.icon}</div>
              )}
              <span className="text-[9px] font-black leading-none mt-1 max-w-[58px] truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <style jsx>{`
        .glass-bottom {
          background: rgba(13, 13, 20, 0.9);
          backdrop-filter: blur(26px) saturate(1.15);
          -webkit-backdrop-filter: blur(26px) saturate(1.15);
        }
      `}</style>
    </nav>
  );
}
