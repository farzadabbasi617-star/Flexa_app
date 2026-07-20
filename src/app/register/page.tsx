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
import { EMAIL_OTP_RESEND_COOLDOWN_SECONDS } from "@/lib/email-policy";
import { normalizePhoneNumber } from "@/lib/phone";
import { isPasswordStrong } from "@/lib/password-strength";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import JalaliDatePicker from "@/components/JalaliDatePicker";
import { isValidIranianNationalId } from "@/lib/validations";
import { calculateAgeYears, MIN_ADULT_AGE, parseBirthDate } from "@/lib/age-gate";

export default function RegisterPage() {
  const { t, lang } = useLanguage();
  const { register, verifyEmailOtp, resendEmailOtp } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    phoneNumber: "",
    email: "",
    username: "",
    firstName: "",
    lastName: "",
    birthDate: "",
    nationalId: "",
    password: "",
    confirmPassword: "",
    termsAccepted: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Step 2: email OTP confirmation, shown after a successful registration.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const phoneNumber = normalizePhoneNumber(form.phoneNumber);

    if (!/^09\d{9}$/.test(phoneNumber)) {
      setError(lang === "fa" ? "شماره موبایل معتبر نیست. مثال: 09123456789" : "Invalid mobile number. Example: 09123456789");
      return;
    }

    if (!form.email.trim()) {
      setError(lang === "fa" ? "ایمیل الزامی است" : "Email is required");
      return;
    }

    if (!form.firstName.trim()) {
      setError(lang === "fa" ? "نام الزامی است" : "First name is required");
      return;
    }

    if (!form.lastName.trim()) {
      setError(lang === "fa" ? "نام خانوادگی الزامی است" : "Last name is required");
      return;
    }

    // Birth date + national ID: required at signup so the paid flows
    // (wallet top-up, paid tournament registration) never need to
    // interrupt the user mid-payment to collect them later.
    // The picker gives us Gregorian ISO already; parseBirthDate simply
    // sanity-checks it.
    const parsedBirth = parseBirthDate(form.birthDate);
    if (!parsedBirth) {
      setError(
        lang === "fa"
          ? "لطفاً تاریخ تولد را از تقویم شمسی انتخاب کنید"
          : "Please pick your birth date from the Jalali calendar"
      );
      return;
    }
    if (!isValidIranianNationalId(form.nationalId)) {
      setError(lang === "fa" ? "کد ملی وارد شده معتبر نیست" : "National ID is not valid");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError(lang === "fa" ? "رمز عبور و تکرار آن یکسان نیستند" : "Passwords do not match");
      return;
    }

    if (!isPasswordStrong(form.password)) {
      setError(
        lang === "fa"
          ? "رمز عبور به اندازه کافی قوی نیست. شرایط زیر فرم را کامل کنید."
          : "Password is not strong enough. Please meet all the requirements below."
      );
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
      form.firstName.trim(),
      form.lastName.trim(),
      form.birthDate.trim(),
      form.nationalId.replace(/\D/g, ""),
      form.termsAccepted
    );

    if (result.success) {
      setPendingEmail(result.email || form.email.trim());
    } else {
      setError(result.error || (lang === "fa" ? "ثبت‌نام ناموفق بود" : "Registration failed"));
    }
    setLoading(false);
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingEmail) return;
    setOtpError("");

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setOtpError(lang === "fa" ? "کد تایید باید ۶ رقم باشد" : "Code must be 6 digits");
      return;
    }

    setOtpLoading(true);
    const result = await verifyEmailOtp(pendingEmail, otpCode.trim());
    setOtpLoading(false);

    if (result.success) {
      router.push("/");
    } else {
      setOtpError(result.error || (lang === "fa" ? "تایید کد ناموفق بود" : "Verification failed"));
    }
  }

  async function handleResend() {
    if (!pendingEmail || resendCooldown > 0) return;
    setResendMessage("");
    setOtpError("");
    const result = await resendEmailOtp(pendingEmail);
    if (result.success) {
      setResendMessage(lang === "fa" ? "کد جدید ارسال شد." : "A new code was sent.");
      setResendCooldown(EMAIL_OTP_RESEND_COOLDOWN_SECONDS);
      const timer = setInterval(() => {
        setResendCooldown((value) => {
          if (value <= 1) {
            clearInterval(timer);
            return 0;
          }
          return value - 1;
        });
      }, 1000);
    } else {
      setOtpError(result.error || (lang === "fa" ? "ارسال مجدد ناموفق بود" : "Resend failed"));
    }
  }

  if (pendingEmail) {
    return (
      <div className="min-h-screen bg-dark-900 relative overflow-hidden">
        <ParticleField count={34} className="opacity-50 z-0" />
        <div className="relative z-10">
          <Navbar />
          <div className="max-w-lg mx-auto px-4 py-6 sm:py-12" style={{ paddingBottom: "calc(24px + var(--safe-bottom))" }}>
            <TiltCard maxTilt={4} liftZ={10} glare={false} className="rounded-2xl">
              <div className="gaming-card p-5 sm:p-8">
                <div className="text-center mb-6 sm:mb-8">
                  <AnimatedGamentLogo size="lg" showLabel className="mb-6" />
                  <div className="text-4xl mb-3">📧</div>
                  <h1 className="text-2xl font-bold neon-text-purple">
                    {lang === "fa" ? "تایید ایمیل" : "Verify your email"}
                  </h1>
                  <p className="text-gray-400 mt-2 text-sm leading-7">
                    {lang === "fa"
                      ? <>کد ۶ رقمی تایید به آدرس <span dir="ltr" className="text-white font-bold">{pendingEmail}</span> ارسال شد. اگر در Inbox ندیدی، حتماً پوشه <b className="text-amber-300">Spam / Junk</b> را بررسی کن.</>
                      : <>A 6-digit code was sent to <span dir="ltr" className="text-white font-bold">{pendingEmail}</span>. If it is not in your inbox, check <b className="text-amber-300">Spam / Junk</b>.</>}
                  </p>
                </div>

                {otpError && (
                  <div className="bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg mb-6 text-sm">
                    {otpError}
                  </div>
                )}
                {resendMessage && (
                  <div className="bg-emerald-900/20 border border-emerald-500/40 text-emerald-400 px-4 py-3 rounded-lg mb-6 text-sm">
                    {resendMessage}
                  </div>
                )}

                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      {lang === "fa" ? "کد تایید" : "Verification code"} *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      dir="ltr"
                      maxLength={6}
                      className="gaming-input text-center tracking-[0.5em] text-xl font-black"
                      placeholder="------"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={otpLoading || otpCode.length !== 6}
                    className="gaming-btn w-full py-3 text-base disabled:opacity-50"
                  >
                    {otpLoading ? (lang === "fa" ? "در حال تایید..." : "Verifying...") : (lang === "fa" ? "تایید و ورود" : "Verify & Continue")}
                  </button>
                </form>

                <div className="text-center mt-6 text-sm text-gray-400">
                  {lang === "fa" ? "کدی دریافت نکردید؟" : "Didn't receive a code?"}{" "}
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCooldown > 0}
                    className="text-neon-blue hover:underline disabled:text-gray-600 disabled:no-underline"
                  >
                    {resendCooldown > 0
                      ? (lang === "fa" ? `ارسال مجدد (${resendCooldown})` : `Resend (${resendCooldown})`)
                      : (lang === "fa" ? "ارسال مجدد کد" : "Resend code")}
                  </button>
                </div>

                <div className="text-center mt-4 text-xs text-gray-600">
                  <button type="button" onClick={() => setPendingEmail(null)} className="hover:text-gray-400 hover:underline">
                    {lang === "fa" ? "بازگشت و اصلاح اطلاعات" : "Back and edit details"}
                  </button>
                </div>
              </div>
            </TiltCard>
          </div>
        </div>
      </div>
    );
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
              ? "برای تایید حساب، یک کد ۶ رقمی به ایمیل شما ارسال می‌شود. ممکن است پیام وارد پوشه Spam یا Junk شود؛ آن پوشه را هم بررسی کنید. شماره موبایل برای ارتباط و شناسایی ثبت می‌شود."
              : "A 6-digit code will be emailed to confirm your account. The message may arrive in Spam or Junk, so check those folders too. Your mobile number is also required for contact/identification."}
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
                {t.auth.email} *
              </label>
              <input
                type="email"
                required
                dir="ltr"
                className="gaming-input text-left"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <p className="text-[11px] text-gray-500 mt-1.5">
                {lang === "fa"
                  ? "کد تایید به این ایمیل ارسال می‌شود و ممکن است در Spam/Junk دیده شود. از ایمیل واقعی و همیشگی استفاده کنید؛ ایمیل موقت پذیرفته نمی‌شود."
                  : "The verification code is sent here and may appear in Spam/Junk. Use a real permanent email; temporary addresses are not accepted."}
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2 font-bold">
                {lang === "fa" ? "نام بازیکن در Gament" : "Gament gamer name"} *
              </label>
              <input
                type="text"
                required
                dir="ltr"
                className="gaming-input text-left"
                placeholder="Farzadov"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
              <p className="text-[11px] text-purple-300/80 mt-1.5 leading-5">
                {lang === "fa"
                  ? "این نام عمومی شما در پروفایل، مسابقات و بازی‌های Gament است و با نام واقعی پایین کاملاً جدا می‌ماند."
                  : "This is your public name in profiles and matches. It remains separate from your legal name below."}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === "fa" ? "نام واقعی (خصوصی)" : "Legal first name (private)"} *
                </label>
                <input
                  type="text"
                  required
                  className="gaming-input"
                  placeholder={lang === "fa" ? "مثلاً فرزاد" : "e.g., John"}
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === "fa" ? "نام خانوادگی واقعی (خصوصی)" : "Legal last name (private)"} *
                </label>
                <input
                  type="text"
                  required
                  className="gaming-input"
                  placeholder={lang === "fa" ? "مثلاً عباسی" : "e.g., Doe"}
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>

            {/* Age gate: birth date + Iranian national ID. Required at signup
                because paid tournament registration and wallet top-up need
                a verified 18+ user. Free features remain accessible either way. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === "fa" ? "تاریخ تولد (شمسی)" : "Birth date (Jalali/شمسی)"} *
                </label>
                <JalaliDatePicker
                  value={form.birthDate}
                  onChange={(iso) => setForm({ ...form, birthDate: iso })}
                />
                {(() => {
                  const parsed = parseBirthDate(form.birthDate);
                  if (!parsed) return null;
                  const age = calculateAgeYears(parsed);
                  const isAdult = age >= MIN_ADULT_AGE;
                  return (
                    <p className={`text-[11px] mt-1.5 leading-5 ${isAdult ? "text-emerald-400" : "text-amber-400"}`}>
                      {lang === "fa" ? (
                        <>
                          سن: <b>{age.toLocaleString("fa-IR")} سال</b>
                          {isAdult
                            ? " — امکان شرکت در تورنومنت‌های پولی و شارژ کیف پول را دارید."
                            : ` — تا رسیدن به ${MIN_ADULT_AGE} سالگی فقط می‌توانید در تورنومنت‌های رایگان شرکت کنید.`}
                        </>
                      ) : (
                        <>
                          Age: <b>{age}</b>
                          {isAdult
                            ? " — you can join paid tournaments and top up the wallet."
                            : ` — until ${MIN_ADULT_AGE}, only free tournaments are available.`}
                        </>
                      )}
                    </p>
                  );
                })()}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  {lang === "fa" ? "کد ملی" : "National ID (کد ملی)"} *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  dir="ltr"
                  maxLength={10}
                  className="gaming-input text-left"
                  placeholder="0012345678"
                  value={form.nationalId}
                  onChange={(e) =>
                    setForm({ ...form, nationalId: e.target.value.replace(/\D/g, "").slice(0, 10) })
                  }
                />
                <p className="text-[11px] text-gray-500 mt-1.5 leading-5">
                  {lang === "fa"
                    ? "برای احراز هویت مالی الزامی است. با شخص دیگری قابل اشتراک‌گذاری نیست."
                    : "Required for financial identity verification. Cannot be shared with anyone else."}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.password} *
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                className="gaming-input"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
              <PasswordStrengthMeter password={form.password} lang={lang} />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {t.auth.confirmPassword} *
              </label>
              <input
                type="password"
                required
                autoComplete="new-password"
                className="gaming-input"
                placeholder="••••••••"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              />
              {form.confirmPassword && form.confirmPassword !== form.password && (
                <p className="text-[11px] text-red-400 mt-1.5">
                  {lang === "fa" ? "رمز عبور و تکرار آن یکسان نیستند" : "Passwords do not match"}
                </p>
              )}
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
              disabled={
                loading ||
                !form.termsAccepted ||
                !isPasswordStrong(form.password) ||
                form.password !== form.confirmPassword
              }
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
