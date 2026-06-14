"use client";
import { useEffect, useState } from "react";
import BottomNav from "@/components/BottomNav";

export default function ChatPage() {
  const [strikes, setStrikes] = useState(0);
  return (
    <div className="min-h-screen bg-[#050508] text-white flex flex-col">
      <header className="pt-12 pb-6 px-6 border-b border-white/5 flex justify-between items-center glass-panel">
        <div>
          <h1 className="text-3xl font-black italic tracking-tighter" style={{ fontFamily: 'Orbitron' }}>CHAT</h1>
          <p className="text-[10px] font-bold text-purple-400 uppercase opacity-60">Global Arena Chat</p>
        </div>
        <div className="px-4 py-1.5 rounded-full text-[10px] font-black border bg-green-500/10 border-green-500 text-green-500">
          اخطار: {strikes} / 3
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] w-full text-center p-3 rounded-2xl">
          🤖 ناظر هوشمند فلکسا فعال است. رعایت ادب الزامی است.
        </div>
        <div className="flex flex-col items-end gap-1">
            <span className="text-[9px] font-black text-gray-500">ShadowNinja</span>
            <div className="bg-white/5 p-4 rounded-2xl rounded-br-none text-xs border border-white/5">کسی برای تورنمنت کالاف آماده هست؟</div>
        </div>
      </div>
      <div className="fixed bottom-32 left-0 right-0 max-w-[480px] mx-auto px-6">
        <div className="glass-panel p-2 rounded-full flex gap-3 border-white/10 shadow-2xl">
          <input placeholder="چیزی بنویسید..." className="flex-1 bg-transparent outline-none px-5 text-sm" />
          <button className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-xl shadow-lg">🚀</button>
        </div>
      </div>
      <BottomNav />
      <style jsx global>{` .glass-panel { background: rgba(20, 20, 25, 0.85); backdrop-filter: blur(25px); } `}</style>
    </div>
  );
}
