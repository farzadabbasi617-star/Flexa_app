"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

type GameId = "clash_royale" | "cod_mobile" | "fortnite";
type TournamentFormat = "single_elimination" | "double_elimination" | "round_robin";

interface FormatOption {
  id: TournamentFormat;
  icon: string;
  name: string;
  hint: string;
}

interface SiteImage {
  id: string;
  slug: string;
  title: string;
  url: string;
  category: string;
  altText?: string | null;
}

interface GameConfig {
  id: GameId;
  icon: string;
  name: string;
  formats: FormatOption[];
  defaultFormat: TournamentFormat;
  defaultMode: string;
  defaultMap: string;
  defaultServerSlots: number;
  defaultMaxPlayers: number;
  serverSlots: number[];
  maxPlayers: number[];
  entryFeePlaceholder: string;
  rulesPlaceholder: string;
}

const GAME_CONFIG: Record<GameId, GameConfig> = {
  clash_royale: {
    id: "clash_royale",
    icon: "⚔️",
    name: "کلش رویال",
    defaultFormat: "single_elimination",
    defaultMode: "1v1 Best of 3",
    defaultMap: "Arena",
    defaultServerSlots: 8,
    defaultMaxPlayers: 16,
    serverSlots: [4, 8, 16, 32, 64],
    maxPlayers: [4, 8, 16, 32, 64],
    entryFeePlaceholder: "مثال: رایگان / ۵۰ هزار تومان",
    rulesPlaceholder: "مثال: هر مسابقه Best of 3، ارسال اسکرین‌شات نتیجه الزامی است...",
    formats: [
      { id: "single_elimination", icon: "🏆", name: "دوئل حذفی ۱v۱", hint: "بازنده حذف می‌شود؛ مناسب جام سریع" },
      { id: "round_robin", icon: "🔁", name: "لیگ گروهی کلش", hint: "همه با هم بازی می‌کنند؛ مناسب رتبه‌بندی" },
      { id: "double_elimination", icon: "🔄", name: "دو شانسه کلش", hint: "هر بازیکن با دو باخت حذف می‌شود" },
    ],
  },
  cod_mobile: {
    id: "cod_mobile",
    icon: "🎯",
    name: "کالاف موبایل",
    defaultFormat: "single_elimination",
    defaultMode: "Search & Destroy",
    defaultMap: "Nuketown",
    defaultServerSlots: 10,
    defaultMaxPlayers: 16,
    serverSlots: [2, 4, 5, 8, 10, 16, 32, 64, 100],
    maxPlayers: [4, 8, 10, 16, 32, 64, 100],
    entryFeePlaceholder: "مثال: رایگان / ۱۰۰ هزار تومان",
    rulesPlaceholder: "مثال: استفاده از چیت ممنوع، نتیجه با اسکرین‌شات ثبت شود، تأخیر بیش از ۱۰ دقیقه باخت محسوب می‌شود...",
    formats: [
      { id: "single_elimination", icon: "🏆", name: "حذفی روم کالاف", hint: "مناسب S&D، 1v1، 2v2 یا تیمی" },
      { id: "round_robin", icon: "📊", name: "اسکریم / لیگ امتیازی", hint: "مناسب چند روم و جمع امتیاز" },
      { id: "double_elimination", icon: "🔄", name: "دو شانسه کالاف", hint: "برای تورنومنت‌های جدی‌تر" },
    ],
  },
  fortnite: {
    id: "fortnite",
    icon: "🏗️",
    name: "فورتنایت",
    defaultFormat: "round_robin",
    defaultMode: "Battle Royale",
    defaultMap: "Creative / BR Island",
    defaultServerSlots: 32,
    defaultMaxPlayers: 32,
    serverSlots: [2, 4, 8, 16, 32, 64, 100],
    maxPlayers: [8, 16, 32, 64, 100],
    entryFeePlaceholder: "مثال: رایگان / ۷۵ هزار تومان",
    rulesPlaceholder: "مثال: امتیاز براساس Placement و Kill، مدرک نتیجه الزامی، teaming ممنوع...",
    formats: [
      { id: "round_robin", icon: "🔥", name: "بتل رویال امتیازی", hint: "جمع امتیاز چند راند؛ بهترین گزینه فورتنایت" },
      { id: "single_elimination", icon: "🏆", name: "Build Fight حذفی", hint: "برای 1v1 یا Creative Fight" },
      { id: "double_elimination", icon: "🔄", name: "دو شانسه فورتنایت", hint: "حذفی با فرصت برگشت" },
    ],
  },
};

interface FormState {
  name: string;
  game: GameId;
  format: TournamentFormat;
  description: string;
  maxPlayers: number;
  entryFee: string;
  prizePool: string;
  prize1st: string;
  prize2nd: string;
  prize3rd: string;
  prize4to10: string;
  gameMode: string;
  mapName: string;
  serverSlots: number;
  rules: string;
  bannerUrl: string;
  startDate: string;
}

const initialGame = GAME_CONFIG.clash_royale;

const initialForm: FormState = {
  name: "",
  game: initialGame.id,
  format: initialGame.defaultFormat,
  description: "",
  maxPlayers: initialGame.defaultMaxPlayers,
  entryFee: "رایگان",
  prizePool: "",
  prize1st: "",
  prize2nd: "",
  prize3rd: "",
  prize4to10: "",
  gameMode: initialGame.defaultMode,
  mapName: initialGame.defaultMap,
  serverSlots: initialGame.defaultServerSlots,
  rules: "",
  bannerUrl: "",
  startDate: "",
};

export default function CreateTournamentPage() {
  const router = useRouter();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<FormState>(initialForm);
  const [imageOptions, setImageOptions] = useState<SiteImage[]>([]);

  const selectedGame = GAME_CONFIG[form.game];
  const selectedFormat = useMemo(
    () => selectedGame.formats.find((format) => format.id === form.format) ?? selectedGame.formats[0],
    [form.format, selectedGame]
  );
  const canCreateTournament = user?.role === "admin" || user?.role === "super_admin";

  useEffect(() => {
    refreshUser().catch(() => undefined);
  }, [refreshUser]);

  useEffect(() => {
    Promise.all([
      fetch("/api/public/images?category=tournament", { cache: "no-store" }).then((res) => res.json()).catch(() => []),
      fetch(`/api/public/images?category=${form.game}`, { cache: "no-store" }).then((res) => res.json()).catch(() => []),
    ]).then(([tournamentImages, gameImages]) => {
      const all = [...(Array.isArray(tournamentImages) ? tournamentImages : []), ...(Array.isArray(gameImages) ? gameImages : [])];
      const unique = new Map<string, SiteImage>();
      for (const image of all) unique.set(image.id || image.url, image);
      setImageOptions(Array.from(unique.values()));
    });
  }, [form.game]);

  function chooseGame(gameId: GameId) {
    const config = GAME_CONFIG[gameId];
    setFieldErrors({});
    setForm((prev) => ({
      ...prev,
      game: gameId,
      format: config.defaultFormat,
      gameMode: config.defaultMode,
      mapName: config.defaultMap,
      serverSlots: config.defaultServerSlots,
      maxPlayers: config.defaultMaxPlayers,
      rules: prev.rules || config.rulesPlaceholder,
    }));
  }

  function validateForm() {
    const errors: Record<string, string> = {};

    if (!form.name.trim()) errors.name = "نام تورنومنت را وارد کن.";
    if (!form.gameMode.trim()) errors.gameMode = "مود بازی را وارد کن.";
    if (!form.mapName.trim()) errors.mapName = "مپ یا محل برگزاری را وارد کن.";
    if (!form.maxPlayers || form.maxPlayers < 2) errors.maxPlayers = "حداکثر بازیکنان را انتخاب کن.";
    if (!form.serverSlots || form.serverSlots < 2) errors.serverSlots = "ظرفیت سرور را انتخاب کن.";

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setError(Object.values(errors)[0]);
      return false;
    }

    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!canCreateTournament) {
      setError("فقط مدیر و ادمین‌های منتخب مدیر می‌توانند تورنومنت بسازند.");
      return;
    }

    if (!validateForm()) return;

    setLoading(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        gameMode: form.gameMode.trim(),
        mapName: form.mapName.trim(),
        description: form.description.trim(),
        rules: form.rules.trim(),
        startDate: form.startDate || null,
      };

      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "ساخت تورنومنت با خطا مواجه شد.");
        return;
      }

      router.push(`/tournaments/${data.id}`);
      router.refresh();
    } catch {
      setError("خطای ارتباط با سرور. لطفاً دوباره تلاش کن.");
    } finally {
      setLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="text-4xl animate-neon-pulse">⚡</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="gaming-card p-8">
            <div className="text-5xl mb-4">🔐</div>
            <h1 className="text-xl font-black mb-3">اول وارد حساب شو</h1>
            <p className="text-gray-400 text-sm leading-7 mb-6">برای دسترسی به بخش مدیریت تورنومنت باید وارد حساب شوی.</p>
            <Link href="/login" className="gaming-btn w-full">ورود</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!canCreateTournament) {
    return (
      <div className="min-h-screen bg-dark-900">
        <Navbar />
        <div className="max-w-md mx-auto px-4 py-20 text-center">
          <div className="gaming-card p-8">
            <div className="text-5xl mb-4">🚫</div>
            <h1 className="text-xl font-black mb-3 neon-text-pink">دسترسی محدود</h1>
            <p className="text-gray-400 text-sm leading-7 mb-6">
              ساخت تورنومنت فقط برای مدیر اصلی و ادمین‌هایی که مدیر انتخاب می‌کند فعال است. اگر همین الان مدیر شدی، یک بار دسترسی را تازه‌سازی کن.
            </p>
            <div className="grid gap-3">
              <button onClick={() => refreshUser()} className="gaming-btn w-full">بررسی مجدد دسترسی</button>
              <Link href="/tournaments" className="px-5 py-3 rounded-xl bg-dark-700 text-gray-300 text-sm font-bold">بازگشت به تورنومنت‌ها</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 pb-28">
        <h1 className="text-2xl font-bold mb-1">
          🏆 <span className="neon-text-purple">ساخت تورنومنت</span>
        </h1>
        <p className="text-gray-400 text-sm mb-8">
          اول بازی را انتخاب کن؛ فرمت، مود، مپ و ظرفیت مناسب همان بازی به‌صورت خودکار تنظیم می‌شود.
        </p>

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 text-red-300 px-4 py-3 rounded-xl mb-6 text-sm leading-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">نام تورنومنت *</label>
            <input
              type="text"
              className={`gaming-input ${fieldErrors.name ? "border-red-500/70" : ""}`}
              placeholder={`مثال: جام ${selectedGame.name} فلکسا`}
              value={form.name}
              onChange={(e) => {
                setFieldErrors((prev) => ({ ...prev, name: "" }));
                setForm({ ...form, name: e.target.value });
              }}
            />
            {fieldErrors.name && <p className="text-red-400 text-xs mt-2">{fieldErrors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">بازی *</label>
            <div className="grid grid-cols-3 gap-3">
              {Object.values(GAME_CONFIG).map((game) => (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => chooseGame(game.id)}
                  className={`p-4 rounded-xl border text-center transition-all ${
                    form.game === game.id
                      ? "border-neon-purple bg-neon-purple/10 shadow-[0_0_24px_rgba(168,85,247,0.18)]"
                      : "border-gaming-border bg-dark-700 hover:border-neon-purple/30"
                  }`}
                >
                  <div className="text-3xl mb-2">{game.icon}</div>
                  <div className="text-xs font-bold">{game.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="gaming-card p-5 border-neon-blue/20">
            <h3 className="font-black text-neon-blue mb-4">🖼️ تصویر تورنومنت</h3>
            <input
              type="text"
              className="gaming-input mb-4"
              placeholder="لینک تصویر بنر تورنومنت یا انتخاب از تصاویر زیر"
              value={form.bannerUrl}
              onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })}
            />
            {imageOptions.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {imageOptions.slice(0, 9).map((image) => (
                  <button
                    key={image.id || image.url}
                    type="button"
                    onClick={() => setForm({ ...form, bannerUrl: image.url })}
                    className={`relative h-24 rounded-2xl overflow-hidden border transition-all ${
                      form.bannerUrl === image.url ? "border-neon-purple ring-2 ring-purple-500/30" : "border-gaming-border"
                    }`}
                  >
                    <img src={image.url} alt={image.altText || image.title} className="w-full h-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 text-[10px] p-1 truncate">{image.title}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 leading-6">هنوز تصویری در پنل رسانه ثبت نشده. از /admin/images می‌توانی تصویرهای دسته tournament یا کارت همان بازی اضافه کنی.</p>
            )}
            {form.bannerUrl && <img src={form.bannerUrl} alt="پیش‌نمایش" className="mt-4 h-36 w-full object-cover rounded-2xl border border-white/10" />}
          </div>

          <div className="gaming-card p-5 border-neon-purple/20">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{selectedGame.icon}</span>
              <div>
                <h3 className="font-black text-neon-purple">فرمت‌های مخصوص {selectedGame.name}</h3>
                <p className="text-xs text-gray-500 mt-1">با تغییر بازی، این گزینه‌ها هم تغییر می‌کنند.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {selectedGame.formats.map((format) => (
                <button
                  key={format.id}
                  type="button"
                  onClick={() => setForm({ ...form, format: format.id })}
                  className={`p-4 rounded-2xl border text-right transition-all ${
                    form.format === format.id
                      ? "border-neon-purple bg-neon-purple/10"
                      : "border-gaming-border bg-dark-700/70 hover:border-neon-purple/30"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{format.icon}</span>
                    <div>
                      <div className="text-sm font-black">{format.name}</div>
                      <div className="text-[11px] text-gray-500 mt-1 leading-5">{format.hint}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">مود بازی *</label>
              <input
                type="text"
                className={`gaming-input ${fieldErrors.gameMode ? "border-red-500/70" : ""}`}
                value={form.gameMode}
                onChange={(e) => {
                  setFieldErrors((prev) => ({ ...prev, gameMode: "" }));
                  setForm({ ...form, gameMode: e.target.value });
                }}
              />
              {fieldErrors.gameMode && <p className="text-red-400 text-xs mt-2">{fieldErrors.gameMode}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">مپ / محل برگزاری *</label>
              <input
                type="text"
                className={`gaming-input ${fieldErrors.mapName ? "border-red-500/70" : ""}`}
                value={form.mapName}
                onChange={(e) => {
                  setFieldErrors((prev) => ({ ...prev, mapName: "" }));
                  setForm({ ...form, mapName: e.target.value });
                }}
              />
              {fieldErrors.mapName && <p className="text-red-400 text-xs mt-2">{fieldErrors.mapName}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">ظرفیت سرور *</label>
              <select className="gaming-select" value={form.serverSlots} onChange={(e) => setForm({ ...form, serverSlots: Number(e.target.value) })}>
                {selectedGame.serverSlots.map((n) => (
                  <option key={n} value={n}>{n} نفر</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">حداکثر بازیکنان *</label>
              <select className="gaming-select" value={form.maxPlayers} onChange={(e) => setForm({ ...form, maxPlayers: Number(e.target.value) })}>
                {selectedGame.maxPlayers.map((n) => (
                  <option key={n} value={n}>{n} بازیکن</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">⏰ زمان شروع</label>
            <input type="datetime-local" className="gaming-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">💳 مبلغ ورودی</label>
            <input
              type="text"
              className="gaming-input"
              placeholder={selectedGame.entryFeePlaceholder}
              value={form.entryFee}
              onChange={(e) => setForm({ ...form, entryFee: e.target.value })}
            />
          </div>

          <div className="gaming-card p-5">
            <h3 className="font-bold text-neon-yellow mb-4">🏆 جوایز</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">🏆 کل جایزه</label>
                <input type="text" className="gaming-input text-sm" placeholder="مثال: ۱ میلیون تومان" value={form.prizePool} onChange={(e) => setForm({ ...form, prizePool: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🥇 نفر اول</label>
                <input type="text" className="gaming-input text-sm" placeholder="مثال: ۵۰۰ هزار" value={form.prize1st} onChange={(e) => setForm({ ...form, prize1st: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🥈 نفر دوم</label>
                <input type="text" className="gaming-input text-sm" value={form.prize2nd} onChange={(e) => setForm({ ...form, prize2nd: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">🥉 نفر سوم</label>
                <input type="text" className="gaming-input text-sm" value={form.prize3rd} onChange={(e) => setForm({ ...form, prize3rd: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">🏅 نفرات ۴ تا ۱۰</label>
                <input type="text" className="gaming-input text-sm" value={form.prize4to10} onChange={(e) => setForm({ ...form, prize4to10: e.target.value })} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">توضیحات</label>
            <textarea className="gaming-input min-h-[80px] resize-y" placeholder={`توضیح تورنومنت ${selectedGame.name}...`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">📜 قوانین</label>
            <textarea className="gaming-input min-h-[100px] resize-y" placeholder={selectedGame.rulesPlaceholder} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
            <p className="text-[11px] text-gray-600 mt-2">فرمت انتخاب‌شده: {selectedFormat.name}</p>
          </div>

          <div className="flex gap-4">
            <button type="submit" disabled={loading} className="gaming-btn flex-1 py-3 disabled:opacity-50">
              {loading ? "⏳ در حال ساخت..." : "🏆 ساخت تورنومنت"}
            </button>
            <button type="button" onClick={() => router.back()} className="px-6 py-3 rounded-lg border border-gaming-border text-gray-400 hover:text-white transition-all">
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
