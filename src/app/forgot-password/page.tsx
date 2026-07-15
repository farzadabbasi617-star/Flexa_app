"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ForgotPasswordPage() {
  const { lang } = useLanguage();
  const [step, setStep] = useState<"email" | "reset" | "success">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "ارسال کد انجام نشد");
      setMessage(data.message || "اگر حسابی وجود داشته باشد، کد ارسال می‌شود.");
      setStep("reset");
    } catch (err) {
      setError(err instanceof Error ? err.message : "ارسال کد انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError(lang === "fa" ? "تکرار رمز عبور مطابقت ندارد" : "Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تغییر رمز انجام نشد");
      setMessage(data.message || "رمز عبور تغییر کرد.");
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تغییر رمز انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-dark-900 text-white">
      <Navbar />
      <main className="max-w-md mx-auto px-4 py-10 sm:py-16">
        <div className="gaming-card p-6 sm:p-8">
          <div className="text-center mb-7">
            <div className="text-5xl mb-3">🔐</div>
            <h1 className="text-2xl font-black neon-text-purple">
              {lang === "fa" ? "بازیابی رمز عبور" : "Reset password"}
            </h1>
            <p className="text-sm text-gray-400 mt-2 leading-7">
              {step === "email"
                ? (lang === "fa" ? "ایمیل حساب را وارد کن تا کد یک‌بارمصرف دریافت کنی." : "Enter your account email to receive a one-time code.")
                : step === "reset"
                  ? (lang === "fa" ? "کد ایمیل و رمز عبور جدید را وارد کن." : "Enter the emailed code and your new password.")
                  : (lang === "fa" ? "بازیابی حساب کامل شد." : "Account recovery is complete.")}
            </p>
          </div>

          {error && <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
          {message && step !== "success" && <div className="mb-5 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs leading-6 text-blue-200">{message}</div>}

          {step === "email" && (
            <form onSubmit={requestCode} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{lang === "fa" ? "ایمیل حساب" : "Account email"}</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  dir="ltr"
                  className="gaming-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value.trim())}
                  placeholder="name@example.com"
                />
              </div>
              <button disabled={busy} className="gaming-btn w-full py-3 disabled:opacity-50">
                {busy ? "..." : (lang === "fa" ? "ارسال کد بازیابی" : "Send recovery code")}
              </button>
            </form>
          )}

          {step === "reset" && (
            <form onSubmit={resetPassword} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-2">{lang === "fa" ? "کد ۶ رقمی" : "6-digit code"}</label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={6}
                  className="gaming-input text-center text-xl tracking-[0.45em] font-black"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="------"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">{lang === "fa" ? "رمز عبور جدید" : "New password"}</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  className="gaming-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <PasswordStrengthMeter password={password} lang={lang} />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">{lang === "fa" ? "تکرار رمز جدید" : "Confirm new password"}</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  className="gaming-input"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
              <button disabled={busy || code.length !== 6} className="gaming-btn w-full py-3 disabled:opacity-50">
                {busy ? "..." : (lang === "fa" ? "تغییر رمز عبور" : "Change password")}
              </button>
              <button type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }} className="w-full text-xs text-neon-blue hover:underline">
                {lang === "fa" ? "ارسال دوباره کد یا تغییر ایمیل" : "Resend code or change email"}
              </button>
            </form>
          )}

          {step === "success" && (
            <div className="text-center space-y-5">
              <div className="text-5xl">✅</div>
              <p className="text-emerald-300 leading-7">{message}</p>
              <Link href="/login" className="gaming-btn block w-full py-3">
                {lang === "fa" ? "ورود با رمز جدید" : "Login with new password"}
              </Link>
            </div>
          )}

          {step !== "success" && (
            <div className="text-center mt-7 text-sm text-gray-500">
              <Link href="/login" className="text-neon-blue hover:underline">
                {lang === "fa" ? "بازگشت به صفحه ورود" : "Back to login"}
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
