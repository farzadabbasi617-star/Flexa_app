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
      <div className="glass-panel rounded-[45px] py-8 flex justify-around items-center border-white/10 shadow-[0_-20px_50px_rgba(0,0,0,0.8)] pointer-events-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link key={item.id} href={item.path} className={`relative flex flex-col items-center gap-1.5 transition-all ${isActive ? 'text-purple-400' : 'opacity-30'}`}>
              {isActive && <div className="absolute -top-12 width-[35px] h-1 bg-purple-500 shadow-[0_0_15px_#bc00ff] rounded-full"></div>}
              <div className={`text-3xl ${isActive ? 'drop-shadow-[0_0_10px_#bc00ff]' : ''}`}>{item.icon}</div>
              <span className="text-[9px] font-black uppercase">{item.label}</span>
            </Link>
          );
        })}
      </div>
      <style jsx>{`
        .glass-panel {
          background: rgba(20, 20, 25, 0.85);
          backdrop-filter: blur(25px);
        }
      `}</style>
    </nav>
  );
}
