"use client";

import React, { memo } from "react";
import Link from "next/link";

interface Tournament {
  id: string;
  name: string;
  game: string;
  maxPlayers: number;
  registeredCount: number;
  prizePool: string | null;
  winnersCount?: number;
  entryFee: string | null;
  startDate: string | null;
  bannerUrl?: string | null;
}

const TournamentCardLuxury = ({ t }: { t: Tournament }) => {
  const spotsLeft = t.maxPlayers - (t.registeredCount || 0);
  
  // Format Date to "Today 15:00" style
  const formatTournamentDate = (dateStr: string | null) => {
    if (!dateStr) return "نامشخص";
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return isToday ? `امروز ساعت ${timeStr}` : `جمعه ۲۴ خرداد ساعت ${timeStr}`;
  };

  return (
    <div className="relative overflow-hidden rounded-[35px] bg-[#111115] border border-white/5 shadow-2xl mb-6">
      {/* Banner & Title Overlay */}
      <div className="relative h-44 w-full">
        <img 
          src={t.bannerUrl || "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800"} 
          className="w-full h-full object-cover opacity-60" 
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#111115] via-transparent to-transparent" />
        
        {/* Name Overlay */}
        <div className="absolute bottom-4 left-6 text-right">
            <h3 className="text-2xl font-black en-font tracking-tighter text-white drop-shadow-md">
                {t.name}
            </h3>
        </div>

        {/* Capacity Tag */}
        <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/10">
            <span className="text-[10px] font-black text-white">
                {spotsLeft === 0 ? "تکمیل ظرفیت" : `${spotsLeft} نفر باقی مانده`}
            </span>
        </div>
      </div>

      {/* Content Body */}
      <div className="p-6 pt-2 space-y-4">
        
        {/* Prize Box (Golden) */}
        <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl flex items-center justify-between">
            <div className="text-right">
                <p className="text-sm font-black text-yellow-500">
                   {t.prizePool} تومان جایزه نقدی برای {t.winnersCount || 30} نفر
                </p>
            </div>
            <span className="text-xl">🏆</span>
        </div>

        {/* Date Box */}
        <div className="bg-white/5 border border-white/5 p-3 rounded-2xl flex items-center justify-center gap-3">
            <span className="text-xs font-bold text-gray-300">
                {formatTournamentDate(t.startDate)}
            </span>
            <span className="opacity-40">📅</span>
        </div>

        {/* Footer: Price + Button */}
        <div className="flex items-center justify-between pt-2">
            <div className="text-right">
                <span className="text-lg font-black num-en">{t.entryFee}</span>
                <span className="text-[10px] font-bold text-gray-500 mr-1">تومان</span>
            </div>
            <Link href={`/tournaments/${t.id}`} className="bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-purple-500/20 active:scale-95 transition-all">
                مشاهده
                <span className="text-xs">❮</span>
            </Link>
        </div>

      </div>
    </div>
  );
};

export default memo(TournamentCardLuxury);
