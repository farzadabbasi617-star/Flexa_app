import Link from "next/link";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import { gameLandings } from "@/lib/game-landing";

export default function GamesPage() {
  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 pb-28" dir="rtl">
        <header className="text-right mb-8">
          <h1 className="text-3xl sm:text-5xl font-black mb-4">مسابقات بازی‌های محبوب</h1>
          <p className="text-gray-300 leading-8 max-w-3xl">
            صفحه‌های اختصاصی تورنومنت‌های گیمنت برای کالاف دیوتی موبایل، فورتنایت و کلش رویال؛ هر صفحه شامل راهنمای شرکت، سوالات پرتکرار و لینک مستقیم مسابقات فعال است.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {gameLandings.map((game) => (
            <Link key={game.slug} href={`/games/${game.slug}`} className="gaming-card p-6 rounded-3xl border border-white/5 hover:border-purple-400/30 transition block text-right">
              <img src={game.icon} alt={game.title} className="w-16 h-16 object-contain mb-5" />
              <h2 className="text-xl font-black mb-3">{game.title}</h2>
              <p className="text-sm text-gray-400 leading-7">{game.shortDescription}</p>
            </Link>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
