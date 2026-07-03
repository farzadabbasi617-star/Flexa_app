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

// Arena sits in the MIDDLE on purpose and is rendered as a raised, bold,
// highlighted button. The other four flank it (two on each side).
const navItems = [
  { id: "rankings", label: "رتبه‌ها", icon: "👑", path: "/leaderboard" },
  { id: "store", label: "فروشگاه", icon: "🛒", path: "/store" },
  { id: "arena", label: "آرنا", icon: "🔥", path: "/", center: true },
  { id: "honors", label: "تالار", icon: "🏆", path: "/honors" },
  { id: "profile", label: "پروفایل", icon: "⚙️", path: "/profile" },
];

const customIcons: Record<string, string> = {
  rankings: "/icons/rankings_icon.png",
  honors: "/icons/honors_icon.png",
  profile: "/icons/settings_icon.png",
};

export default function BottomNav() {
  const pathname = usePathname();
  const [icons, setIcons] = useState<SiteImage[]>([]);

  useEffect(() => {
    // Was `cache: "no-store"`, which bypassed the server's Cache-Control
    // (see /api/public/images) on every mount. BottomNav is rendered on
    // nearly every page, so this needlessly forced a fresh fetch (and, when
    // the in-memory TTL cache missed, a DB query) site-wide instead of
    // letting the browser reuse the cached response.
    fetch("/api/public/images?category=icon")
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
      {/* Extra top padding so the raised center (Arena) button can overflow above the bar. */}
      <div className="glass-bottom pointer-events-auto relative flex items-end justify-around rounded-[24px] border border-white/10 px-1.5 pt-2.5 pb-2.5 shadow-[0_-12px_35px_rgba(0,0,0,0.7)]">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
          const imageIcon = iconMap[`icon-${item.id}`];
          const finalIconUrl = customIcons[item.id] || imageIcon?.url;

          // ----- Center (Arena): raised, bold, highlighted -----
          if (item.center) {
            return (
              <Link
                key={item.id}
                href={item.path}
                aria-current={isActive ? "page" : undefined}
                className="group relative -mt-8 flex min-w-[72px] flex-col items-center justify-center"
              >
                <span
                  className={`flex h-16 w-16 items-center justify-center rounded-full border-4 border-[#0d0d14] bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-[0_8px_28px_rgba(168,85,247,0.55)] transition-all group-active:scale-95 ${
                    isActive ? "ring-2 ring-purple-300/70" : ""
                  }`}
                >
                  {finalIconUrl ? (
                    <img
                      src={finalIconUrl}
                      alt=""
                      aria-hidden="true"
                      className="h-9 w-9 rounded-xl object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]"
                    />
                  ) : (
                    <span className="text-[30px] drop-shadow-[0_0_10px_rgba(255,255,255,0.45)]">{item.icon}</span>
                  )}
                </span>
                <span
                  className={`mt-1 text-[11px] font-black leading-none ${
                    isActive ? "text-purple-100" : "text-purple-200/90"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          }

          // ----- Regular tabs -----
          return (
            <Link
              key={item.id}
              href={item.path}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-[56px] min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-2xl px-2 transition-all active:scale-95 ${
                isActive ? "bg-purple-500/10 text-purple-200" : "text-white/38 hover:text-white/70"
              }`}
            >
              {finalIconUrl ? (
                <img
                  src={finalIconUrl}
                  alt=""
                  aria-hidden="true"
                  className={`h-7 w-7 rounded-xl object-contain sm:h-8 sm:w-8 ${isActive ? "drop-shadow-[0_0_12px_#bc00ff]" : "opacity-60"}`}
                />
              ) : (
                <div className={`text-[24px] ${isActive ? "drop-shadow-[0_0_12px_#bc00ff]" : ""}`}>{item.icon}</div>
              )}
              <span className="mt-1 max-w-[58px] truncate text-[9px] font-black leading-none">{item.label}</span>
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
