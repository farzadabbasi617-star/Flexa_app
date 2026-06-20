"use client";

import { useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsPage() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || "");
  const [bio, setBio] = useState("عاشق کلش رویال و کالاف!");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentAvatar = user?.avatarUrl || "/icons/profile_icon.png";

  const handleSaveProfile = async () => {
    setSaving(true);
    await new Promise(resolve => setTimeout(resolve, 800));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-dark-900 flex items-center justify-center text-white">
        <div>لطفاً وارد شوید</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        
        <div className="mb-8">
          <h1 className="text-3xl font-black">تنظیمات</h1>
          <p className="text-gray-400 mt-1">مدیریت حساب و اطلاعات شخصی</p>
        </div>

        {/* === بخش پروفایل (جدید) === */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl mb-8 border border-white/10">
          <h2 className="text-xl font-black mb-6 flex items-center gap-3">
            👤 پروفایل
          </h2>

          {/* Avatar */}
          <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-purple-500/40">
                <img 
                  src={currentAvatar} 
                  alt="آواتار" 
                  className="w-full h-full object-cover"
                  onError={(e) => (e.target as HTMLImageElement).src = "/icons/profile_icon.png"}
                />
              </div>
            </div>
            <div className="flex-1 text-center sm:text-right">
              <div className="font-black text-2xl">{displayName}</div>
              <div className="text-gray-400">@{user.username}</div>
              <Link 
                href="/profile/avatar" 
                className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-sm font-bold active:scale-[0.985]"
              >
                🖼️ تغییر آواتار
              </Link>
            </div>
          </div>

          {/* Personal Info */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">نام نمایشی</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-dark-800 border border-white/10 rounded-2xl px-5 py-3.5 text-lg focus:outline-none focus:border-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">نام کاربری</label>
              <div className="bg-dark-800 border border-white/10 rounded-2xl px-5 py-3.5 text-lg text-gray-400">
                @{user.username}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">بیوگرافی</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full bg-dark-800 border border-white/10 rounded-3xl px-5 py-4 text-lg focus:outline-none focus:border-purple-500 resize-none"
                placeholder="چند کلمه درباره خودت..."
              />
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="px-8 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 font-bold disabled:opacity-70 active:scale-[0.985]"
            >
              {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
              {saved && <span className="ml-2 text-emerald-400">✓</span>}
            </button>
          </div>
        </div>

        {/* امنیت */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl mb-8 border border-white/10">
          <h2 className="text-xl font-black mb-6 flex items-center gap-3">
            🔐 امنیت
          </h2>
          <div className="space-y-4">
            <Link href="/profile/security" className="flex items-center justify-between p-5 rounded-2xl bg-dark-800 hover:bg-dark-700 border border-white/10">
              <div>
                <div className="font-bold">تغییر رمز عبور</div>
                <div className="text-sm text-gray-400">آخرین تغییر: ۳ ماه پیش</div>
              </div>
              <span className="text-purple-400">→</span>
            </Link>
            <Link href="/profile/security" className="flex items-center justify-between p-5 rounded-2xl bg-dark-800 hover:bg-dark-700 border border-white/10">
              <div>
                <div className="font-bold">احراز هویت دو مرحله‌ای</div>
                <div className="text-sm text-emerald-400">فعال</div>
              </div>
              <span className="text-purple-400">→</span>
            </Link>
          </div>
        </div>

        {/* حریم خصوصی */}
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/10">
          <h2 className="text-xl font-black mb-6 flex items-center gap-3">
            🛡️ حریم خصوصی
          </h2>
          <div className="space-y-4">
            <Link href="/profile/privacy" className="flex items-center justify-between p-5 rounded-2xl bg-dark-800 hover:bg-dark-700 border border-white/10">
              <div>نمایش پروفایل به دیگران</div>
              <span className="text-emerald-400 font-bold">عمومی</span>
            </Link>
            <Link href="/profile/privacy" className="flex items-center justify-between p-5 rounded-2xl bg-dark-800 hover:bg-dark-700 border border-white/10">
              <div>نمایش آمار بازی</div>
              <span className="text-emerald-400 font-bold">عمومی</span>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
