"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AnimatedGamentLogo from "@/components/AnimatedGamentLogo";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { t, lang } = useLanguage();
  const { login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(form.identifier.trim(), form.password);

    if (result.success) {
      router.push("/");
    } else {
      setError(result.error || (lang === "fa" ? "ورود ناموفق بود" : "Login failed"));
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-lg mx-auto px-4 py-8 sm:py-16" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
        <div className="gaming-card p-5 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            <AnimatedGamentLogo size="lg" showLabel className="mb-6" />
            <h1 className="text-2xl font-bold neon-text-purple">{t.auth.loginTitle}</h1>
            <p className="text-gray-400 mt-1">{t.auth.loginSubtitle}</p>
          </div>

          <div className="bg-neon-blue/10 border border-neon-blue/30 text-neon-blue px-4 py-3 rounded-xl mb-6 text-xs leading-6">
            {lang === "fa"
              ? "تا وقتی پنل پیامک تهیه نشده، ورود با رمز عبور فعال است. بعداً OTP را روی همین شماره موبایل اضافه می‌کنیم."
              : "Until the SMS panel is ready, password login is enabled. OTP can be added later on the same mobile number."}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {lang === "fa" ? "شماره موبایل، ایمیل یا نام کاربری" : "Mobile, email or username"}
              </label>
              <input
                type="text"
                required
                className="gaming-input"
                placeholder={lang === "fa" ? "مثلاً 09123456789 یا ShadowGamer" : "09123456789 or ShadowGamer"}
                value={form.identifier}
                onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.password}
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

            <button
              type="submit"
              disabled={loading}
              className="gaming-btn w-full py-3 text-base disabled:opacity-50"
            >
              {loading ? t.auth.loggingIn : t.auth.loginButton}
            </button>
          </form>

          {/* Register Link */}
          <div className="text-center mt-6 text-sm text-gray-400">
            {t.auth.noAccount}{" "}
            <Link href="/register" className="text-neon-blue hover:underline">
              {t.auth.register}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
