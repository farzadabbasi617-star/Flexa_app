"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";

export default function RegisterPage() {
  const { t } = useLanguage();
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    username: "",
    displayName: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    const result = await register(form.email, form.username, form.password, form.displayName);

    if (result.success) {
      router.push("/");
    } else {
      setError(result.error || "Registration failed");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-md mx-auto px-4 py-12">
        <div className="gaming-card p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🎮</div>
            <h1 className="text-2xl font-bold neon-text-purple">{t.auth.registerTitle}</h1>
            <p className="text-gray-400 mt-1">{t.auth.registerSubtitle}</p>
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
                {t.auth.email} *
              </label>
              <input
                type="email"
                required
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
                className="gaming-input"
                placeholder="e.g., ShadowGamer"
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
                placeholder="e.g., Shadow Gamer"
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

            <button
              type="submit"
              disabled={loading}
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
      </div>
    </div>
  );
}
