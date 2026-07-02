"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AnimatedGamentLogo from "@/components/AnimatedGamentLogo";
import TiltCard from "@/components/fx/TiltCard";
import ParticleField from "@/components/fx/ParticleField";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePhoneNumber } from "@/lib/phone";

export default function RegisterPage() {
  const { t, lang } = useLanguage();
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    phoneNumber: "",
    email: "",
    username: "",
    displayName: "",
    password: "",
    confirmPassword: "",
    termsAccepted: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const phoneNumber = normalizePhoneNumber(form.phoneNumber);

    if (!/^09\d{9}$/.test(phoneNumber)) {
      setError(lang === "fa" ? "شماره موبایل معتبر نیست. مثال: 09123456789" : "Invalid mobile number. Example: 09123456789");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(lang === "fa" ? "رمز عبور و تکرار آن یکسان نیستند" : "Passwords do not match");
      return;
    }

    if (form.password.length < 6) {
      setError(lang === "fa" ? "رمز عبور باید حداقل ۶ کاراکتر باشد" : "Password must be at least 6 characters");
      return;
    }

    if (!form.termsAccepted) {
      setError("برای ثبت‌نام، پذیرش قوانین و مقررات گیمنت الزامی است.");
      return;
    }

    setLoading(true);

    const result = await register(
      phoneNumber,
      form.email.trim(),
      form.username.trim(),
      form.password,
      form.displayName.trim(),
      form.termsAccepted
    );

    if (result.success) {
      router.push("/");
    } else {
      setError(result.error || (lang === "fa" ? "ثبت‌نام ناموفق بود" : "Registration failed"));
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-dark-900 relative overflow-hidden">
      <ParticleField count={34} className="opacity-50 z-0" />
      <div className="relative z-10">
      <Navbar />

      <div className="max-w-lg mx-auto px-4 py-6 sm:py-12" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <TiltCard maxTilt={4} liftZ={10} glare={false} className="rounded-2xl">
        <div className="gaming-card p-5 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <AnimatedGamentLogo size="lg" showLabel className="mb-6" />
            <h1 className="text-2xl font-bold neon-text-purple">{t.auth.registerTitle}</h1>
            <p className="text-gray-400 mt-1">
              {lang === "fa" ? "حساب گیمنت بسازید و وارد آرنا شوید" : "Create your Gament account and enter the arena"}
            </p>
          </div>

          <div className="bg-neon-blue/10 border border-neon-blue/30 text-neon-blue px-4 py-3 rounded-xl mb-6 text-xs leading-6">
            {lang === "fa"
              ? "فعلاً ورود با شماره موبایل/نام کاربری و رمز عبور انجام می‌شود. تأیید پیامکی بعد از خرید پنل SMS فعال خواهد شد."
              : "For now, login works with mobile/username and password. SMS verification can be enabled later after buying the SMS panel."}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {lang === "fa" ? "شماره موبایل" : "Mobile number"} *
              </label>
              <input
                type="tel"
                inputMode="numeric"
                required
                dir="ltr"
                className="gaming-input text-left"
                placeholder="09123456789"
                value={form.phoneNumber}
                onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                onBlur={() => setForm({ ...form, phoneNumber: normalizePhoneNumber(form.phoneNumber) })}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.email} <span className="text-gray-600">({lang === "fa" ? "اختیاری" : "optional"})</span>
              </label>
              <input
                type="email"
                className="gaming-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.username} *
              </label>
              <input
                type="text"
                required
                dir="ltr"
                className="gaming-input text-left"
                placeholder="ShadowGamer"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.displayName} *
              </label>
              <input
                type="text"
                required
                className="gaming-input"
                placeholder={lang === "fa" ? "مثلاً فرزاد" : "e.g., Shadow Gamer"}
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.password} *
              </label>
              <input
                type="password"
                required
                className="gaming-input"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.confirmPassword} *
              </label>
              <input
                type="password"
                required
                className="gaming-input"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />
            </div>

            <label className="flex items-start gap-3 bg-dark-800/70 border border-gaming-border rounded-2xl p-4 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-purple-600"
                checked={form.termsAccepted}
                onChange={(e) => setForm({ ...form, termsAccepted: e.target.checked })}
              />
              <span className="text-xs text-gray-300 leading-7">
                با ثبت‌نام تأیید می‌کنم که
                <Link href="/rules" target="_blank" className="text-neon-blue font-black mx-1 hover:underline">
                  قوانین، مقررات و شرایط استفاده گیمنت
                </Link>
                را کامل مطالعه کرده‌ام و همه بندهای آن، از جمله ماهیت مهارتی مسابقات، هزینه خدمات، شرایط جوایز، داوری، امنیت و پیگیری‌های قانونی را می‌پذیرم.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading || !form.termsAccepted}
              className="gaming-btn w-full py-3 text-base disabled:opacity-50 mt-6"
            >
              {loading ? t.auth.registering : t.auth.registerButton}
            </button>
          </form>

          {/* Login Link */}
          <div className="text-center mt-6 text-sm text-gray-400">
            {t.auth.haveAccount}{" "}
            <Link href="/login" className="text-neon-blue hover:underline">
              {t.auth.login}
            </Link>
          </div>
        </div>
        </TiltCard>
      </div>
      </div>
    </div>
  );
}
