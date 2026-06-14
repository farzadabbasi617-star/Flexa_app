"use client";
import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";

export default function ProfilePage() {
  const [balance, setBalance] = useState(0);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => setUser(d.user));
    fetch("/api/wallet/balance").then(r => r.json()).then(d => setBalance(d.balanceToman || 0));
  }, []);

  if (!user) return <div className="min-h-screen bg-[#050508] flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#050508] text-white relative overflow-x-hidden">
      <div className="relative z-10 max-w-[480px] mx-auto px-6 pb-28">
        <header className="pt-12 pb-8 text-center">
            <div className="relative inline-block mb-6">
                <div className="p-1 rounded-full bg-gradient-to-tr from-[#bc00ff] to-[#00d2ff] shadow-[0_0_30px_rgba(188,0,255,0.4)]">
                    <div className="w-28 h-28 rounded-full border-4 border-[#050508] overflow-hidden bg-gray-900">
                        <img src={user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`} className="w-full h-full object-cover" />
                    </div>
                </div>
                <div className="absolute -bottom-1 -right-1 bg-purple-600 border-4 border-[#050508] w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-black num-en">{user.level || 1}</div>
            </div>
            <h2 className="text-3xl font-black mb-1 uppercase" style={{ fontFamily: 'Orbitron' }}>{user.username}</h2>
            <div className="inline-flex items-center gap-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/5 mb-6">
                <span className="text-[9px] font-bold text-gray-500 uppercase">Flexa ID:</span>
                <span className="text-xs font-black text-purple-400" style={{ fontFamily: 'Orbitron' }}>{user.flexaId || 'N/A'}</span>
            </div>
        </header>
        <div className="mb-10">
            <div className="glass-panel p-8 rounded-[45px] border-purple-500/20 bg-gradient-to-br from-[#1a0033] to-[#0a0a0c]">
                <p className="text-[10px] font-black text-purple-300 uppercase mb-2 opacity-60">موجودی کیف پول</p>
                <div className="flex items-baseline gap-3 mb-8">
                    <span className="text-5xl font-black" style={{ fontFamily: 'Rajdhani' }}>{balance.toLocaleString()}</span>
                    <span className="text-xs font-bold text-purple-400 uppercase">Toman</span>
                </div>
                <div className="flex gap-3">
                    <button className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 py-4 rounded-[22px] font-black text-[10px] shadow-xl">شارژ حساب</button>
                    <button className="flex-1 glass-panel py-4 rounded-[22px] font-black text-[10px] text-gray-400">برداشت وجه</button>
                </div>
            </div>
        </div>
        <div className="mb-10 space-y-4">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mr-2">تیکت‌های پشتیبانی</h3>
            <div className="glass-panel p-5 rounded-[30px] flex items-center justify-between border-white/5">
                <div className="text-right">
                    <h4 className="text-xs font-black">خطا در ثبت آیدی فورتنایت</h4>
                    <p className="text-[8px] text-gray-500 uppercase">#TK-9021 • 2026.06.14</p>
                </div>
                <span className="bg-orange-500/10 text-orange-500 px-3 py-1 rounded-lg text-[8px] font-black uppercase">Pending</span>
            </div>
        </div>
        <button className="w-full glass-panel py-5 rounded-[30px] text-red-400 text-sm font-black border-red-500/10">خروج از حساب کاربری</button>
      </div>
      <BottomNav />
      <style jsx global>{` .glass-panel { background: rgba(20, 20, 25, 0.75); backdrop-filter: blur(25px); } .num-en { font-family: 'Rajdhani', sans-serif; } `}</style>
    </div>
  );
}
