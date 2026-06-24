"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";

interface HonorDetail {
  id: string;
  type: string;
  icon: string;
  title: string;
  description: string;
  time: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight?: boolean;
  image?: string;
  imageAlt?: string;
  summary?: string;
  seoKeywords?: string[];
  readTimeMinutes?: number;
  sources?: Array<{ title: string; link: string; source: string; pubDate?: string | null }>;
  game?: string;
  publishedAt?: string | null;
}

const GAME_LABELS: Record<string, string> = {
  clash_royale: "کلش رویال",
  cod_mobile: "کالاف موبایل",
  fortnite: "فورتنایت",
};

const TYPE_LABELS: Record<string, string> = {
  winner: "قهرمان",
  runner_up: "نایب‌قهرمان",
  levelup: "لول‌آپ",
  rankup: "ارتقای رتبه",
  record: "رکورد",
  fairplay: "بازیکن اخلاق",
  team: "افتخار تیمی",
  news: "خبر",
  event: "رویداد",
};

export default function HonorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [honor, setHonor] = useState<HonorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/honors/${id}`, { cache: "no-store" })
      .then((res) => res.json().then((data) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "افتخار پیدا نشد");
        setHonor(data);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : "افتخار پیدا نشد"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function shareHonor() {
    if (!honor) return;
    const url = `${window.location.origin}/honors/${honor.id}`;
    const text = `${honor.icon} ${honor.title}\n${honor.description}\n${url}`;
    if (navigator.share) {
      await navigator.share({ title: honor.title, text, url }).catch(() => undefined);
    } else {
      await navigator.clipboard?.writeText(text).catch(() => undefined);
      alert("متن افتخار کپی شد.");
    }
  }

  return (
    <div className="min-h-screen bg-[#050508] text-white pb-28">
      <div className="relative min-h-[300px] overflow-hidden">
        {honor?.image ? (
          <img src={honor.image} alt={honor.imageAlt || honor.title} className="absolute inset-0 w-full h-full object-cover opacity-80" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-purple-950 via-[#050508] to-cyan-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050508] via-[#050508]/65 to-black/20" />
        
        {/* Added pb-16 to ensure title never overlaps with the content card on multiline wrapping! */}
        <div className="relative max-w-[560px] mx-auto px-5 pt-8 pb-16">
          <Link href="/honors" className="inline-flex text-xs text-purple-200 bg-white/5 border border-white/10 rounded-full px-4 py-2 mb-10">
            ← بازگشت به تالار افتخارات
          </Link>
          <div className="text-6xl mb-4">{honor?.icon || "🏆"}</div>
          <div className="inline-flex items-center gap-2 text-[10px] font-black text-purple-200 bg-purple-500/15 border border-purple-500/20 rounded-full px-3 py-1 mb-3">
            {honor ? TYPE_LABELS[honor.type] || honor.type : "افتخار"}
            {honor?.game && <span>• {GAME_LABELS[honor.game] || honor.game}</span>}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black leading-tight">{loading ? "در حال بارگذاری..." : honor?.title || "افتخار پیدا نشد"}</h1>
          {honor?.summary && <p className="mt-4 text-sm leading-7 text-white/75 max-w-xl">{honor.summary}</p>}
          {honor?.readTimeMinutes && <div className="mt-4 inline-flex text-[10px] font-black text-cyan-200 bg-cyan-500/10 border border-cyan-400/20 rounded-full px-3 py-1">زمان مطالعه: {honor.readTimeMinutes.toLocaleString("fa-IR")} دقیقه</div>}
        </div>
      </div>

      {/* Adjusted margin to -mt-8 to pull the glass panel card beautifully over the gradient header */}
      <main className="max-w-[560px] mx-auto px-5 -mt-8 relative z-10">
        {error ? (
          <div className="glass-panel rounded-3xl border border-red-500/20 p-6 text-red-300">{error}</div>
        ) : honor ? (
          <div className="space-y-5">
            <section className="glass-panel rounded-[34px] border border-white/10 p-6">
              <article className="space-y-5">
                {honor.description.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
                  <p key={index} className={`leading-8 whitespace-pre-wrap ${index === 0 ? "text-base text-white font-medium" : "text-sm text-gray-200"}`}>{paragraph}</p>
                ))}
              </article>

              {honor.seoKeywords?.length ? (
                <div className="flex flex-wrap gap-2 mt-6 pt-5 border-t border-white/10">
                  {honor.seoKeywords.map((tag) => <span key={tag} className="text-[10px] px-3 py-1.5 rounded-full bg-purple-500/10 text-purple-200 border border-purple-400/20">#{tag}</span>)}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 mt-6">
                {honor.username && <div className="stat-box"><span>بازیکن</span><b dir="ltr">@{honor.username}</b></div>}
                {honor.level && <div className="stat-box"><span>سطح</span><b>{honor.level.toLocaleString("fa-IR")}</b></div>}
                {honor.prize && <div className="stat-box col-span-2"><span>جایزه</span><b className="text-yellow-300">{honor.prize}</b></div>}
                <div className="stat-box col-span-2"><span>زمان انتشار</span><b>{honor.time}</b></div>
              </div>
            </section>

            {honor.sources?.length ? (
              <section className="glass-panel rounded-[28px] border border-white/10 p-5">
                <h2 className="font-black text-sm mb-3 text-cyan-200">منابع و ردپای خبر</h2>
                <div className="space-y-2">
                  {honor.sources.slice(0, 4).map((source, index) => (
                    <a key={`${source.link}-${index}`} href={source.link} target="_blank" rel="noopener noreferrer" className="block bg-black/20 rounded-2xl p-3 border border-white/5 hover:border-cyan-400/30">
                      <div className="text-xs font-bold line-clamp-1">{source.title}</div>
                      <div className="text-[10px] text-gray-500 mt-1">{source.source}</div>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            <button onClick={shareHonor} className="w-full rounded-[28px] bg-gradient-to-r from-purple-600 to-cyan-600 py-4 text-sm font-black shadow-[0_0_30px_rgba(168,85,247,.25)]">
              اشتراک‌گذاری خبر
            </button>
          </div>
        ) : (
          <div className="glass-panel rounded-3xl border border-white/10 p-6 text-gray-400">در حال دریافت اطلاعات...</div>
        )}
      </main>

      <BottomNav />
      <style jsx global>{`
        .glass-panel { background: rgba(20, 20, 25, 0.76); backdrop-filter: blur(24px); }
        .stat-box { border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.22); border-radius: 24px; padding: 14px; }
        .stat-box span { display: block; font-size: 10px; color: rgb(107,114,128); margin-bottom: 6px; }
        .stat-box b { font-size: 13px; }
      `}</style>
    </div>
  );
}
