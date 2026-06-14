"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { id: "arena", label: "آرنا", icon: "🔥", path: "/" },
  { id: "rankings", label: "رتبه‌ها", icon: "👑", path: "/leaderboard" },
  { id: "chat", label: "چت", icon: "💬", path: "/chat" },
  { id: "profile", label: "پروفایل", icon: "🚀", path: "/profile" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[480px] mx-auto p-6 z-50 pointer-events-none">
      <div className="glass-bottom rounded-[45px] py-7 px-2 flex justify-around items-center border border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,0.82)] pointer-events-auto">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? pathname === "/" : pathname.startsWith(item.path);
          return (
            <Link
              key={item.id}
              href={item.path}
              className={`relative min-w-16 flex flex-col items-center gap-1.5 transition-all active:scale-95 ${
                isActive ? "text-purple-300" : "text-white/30 hover:text-white/55"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && <div className="absolute -top-10 w-[35px] h-1 bg-purple-500 shadow-[0_0_18px_#bc00ff] rounded-full" />}
              <div className={`text-3xl ${isActive ? "drop-shadow-[0_0_14px_#bc00ff]" : ""}`}>{item.icon}</div>
              <span className="text-[9px] font-black uppercase">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <style jsx>{`
        .glass-bottom {
          background: rgba(20, 20, 25, 0.86);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
        }
      `}</style>
    </nav>
  );
}
