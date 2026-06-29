"use client";

import dynamic from "next/dynamic";

const AvatarStage = dynamic(() => import("@/components/AvatarStage"), {
  ssr: false,
  loading: () => (
    <main className="grid min-h-[calc(100dvh-64px)] place-items-center bg-[#060610] px-6 text-center text-white">
      <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 h-14 w-14 animate-pulse rounded-3xl bg-purple-500/30" />
        <h1 className="text-2xl font-black">در حال آماده‌سازی گیم‌یار...</h1>
        <p className="mt-3 text-sm text-gray-400">مدل سه‌بعدی و موتور چت در حال بارگذاری است.</p>
      </div>
    </main>
  ),
});

export default function AiAvatarPage() {
  return <AvatarStage />;
}
