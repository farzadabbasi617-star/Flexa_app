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
  { id: "honors", label: "تالار افتخارات", icon: "🏆", path: "/honors" },
  { id: "profile", label: "تنظیمات", icon: "⚙️", path: "/profile" },
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
    <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto px-6 pb-5 z-50">
      <div className="glass-bottom rounded-[22px] py-3.5 px-2 flex justify-around items-center border border-white/10 shadow-[0_-12px_35px_rgba(0,0,0,0.7)]">
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
              className={`flex flex-col items-center gap-0.5 px-3 py-1 transition-all active:scale-95 ${
                isActive ? "text-purple-300" : "text-white/35 hover:text-white/70"
              }`}
            >
              {finalIconUrl ? (
                <img
                  src={finalIconUrl}
                  alt={item.label}
                  className={`w-8 h-8 rounded-xl object-contain ${isActive ? "drop-shadow-[0_0_12px_#bc00ff]" : "opacity-60"}`}
                />
              ) : (
                <div className={`text-[26px] ${isActive ? "drop-shadow-[0_0_12px_#bc00ff]" : ""}`}>{item.icon}</div>
              )}
              <span className="text-[8px] font-black uppercase tracking-wider mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <style jsx>{`
        .glass-bottom {
          background: rgba(20, 20, 25, 0.92);
          backdrop-filter: blur(26px);
          -webkit-backdrop-filter: blur(26px);
        }
      `}</style>
    </nav>
  );
}