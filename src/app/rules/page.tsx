"use client";

import Navbar from "@/components/Navbar";
import { useLanguage } from "@/contexts/LanguageContext";

export default function RulesPage() {
  const { lang } = useLanguage();

  const sections = lang === "fa" ? [
    {
      icon: "📜",
      title: "قوانین کلی پلتفرم",
      items: [
        "تمام بازیکنان باید آیدی واقعی بازی خود را وارد کنند",
        "هرگونه تقلب یا سوءاستفاده منجر به محرومیت دائم خواهد شد",
        "احترام به بازیکنان دیگر الزامی است",
        "استفاده از هک، چیت یا نرم‌افزارهای غیرمجاز ممنوع است",
        "جوایز فقط به آیدی‌های ثبت‌شده در پروفایل ارسال می‌شود",
      ],
    },
    {
      icon: "⚔️",
      title: "قوانین کلش رویال",
      items: [
        "مسابقات به صورت Friendly Battle برگزار می‌شود",
        "استفاده از هر دک آزاد است (مگر اینکه تورنومنت محدودیت داشته باشد)",
        "بهترین ۳ مسابقه از ۵ مسابقه تعیین‌کننده است",
        "تگ بازیکن (#) باید دقیق و صحیح باشد",
        "اسکرین‌شات از نتیجه الزامی است",
      ],
    },
    {
      icon: "🎯",
      title: "قوانین کالاف دیوتی موبایل",
      items: [
        "مسابقات در Private Room برگزار می‌شود",
        "مود مسابقه: Search & Destroy (مگر اینکه اعلام شود)",
        "بهترین ۳ مسابقه از ۵ مسابقه تعیین‌کننده است",
        "UID عددی باید صحیح باشد",
        "استفاده از کنترلر یا ابزار خارجی ممنوع است",
      ],
    },
    {
      icon: "🏗️",
      title: "قوانین فورتنایت",
      items: [
        "مسابقات در Creative Mode برگزار می‌شود",
        "امتیازدهی بر اساس حذف و رتبه نهایی",
        "آیدی Epic Games باید صحیح باشد",
        "استفاده از ایم‌بات یا هر نوع چیت ممنوع است",
        "نتایج باید از طریق اسکرین‌شات تأیید شود",
      ],
    },
    {
      icon: "⚖️",
      title: "سیستم داوری",
      items: [
        "تمام مسابقات توسط ترکیبی از هوش مصنوعی و داور انسانی بررسی می‌شود",
        "AI با اطمینان بالای ۷۰٪ نتیجه را تأیید می‌کند",
        "در موارد مشکوک، مسابقه به داور انسانی ارجاع داده می‌شود",
        "هر بازیکن حق اعتراض دارد و باید مدارک ارائه دهد",
        "تصمیم نهایی داور ارشد قابل تجدیدنظر نیست",
      ],
    },
    {
      icon: "💰",
      title: "قوانین جوایز",
      items: [
        "جوایز فقط به آیدی ثبت‌شده در پروفایل ارسال می‌شود",
        "اگر آیدی اشتباه باشد، Flexa مسئولیتی ندارد",
        "جوایز ظرف ۲۴ تا ۴۸ ساعت پس از پایان تورنومنت ارسال می‌شود",
        "بازیکنان متخلف از دریافت جایزه محروم خواهند شد",
      ],
    },
  ] : [
    {
      icon: "📜",
      title: "General Platform Rules",
      items: [
        "All players must enter their real game IDs",
        "Any cheating or abuse will result in permanent ban",
        "Respect for other players is mandatory",
        "Use of hacks, cheats, or unauthorized software is prohibited",
        "Prizes are only sent to registered game IDs in your profile",
      ],
    },
    {
      icon: "⚔️",
      title: "Clash Royale Rules",
      items: [
        "Matches are played via Friendly Battle",
        "Any deck is allowed (unless tournament has restrictions)",
        "Best of 5 matches determines the winner",
        "Player Tag (#) must be accurate",
        "Screenshot of result is mandatory",
      ],
    },
    {
      icon: "🎯",
      title: "COD Mobile Rules",
      items: [
        "Matches are played in Private Room",
        "Game mode: Search & Destroy (unless stated otherwise)",
        "Best of 5 matches determines the winner",
        "Numeric UID must be correct",
        "External controllers or tools are prohibited",
      ],
    },
    {
      icon: "🏗️",
      title: "Fortnite Rules",
      items: [
        "Matches are played in Creative Mode",
        "Scoring based on eliminations and final placement",
        "Epic Games ID must be correct",
        "Aim-bots or any cheats are prohibited",
        "Results must be confirmed via screenshot",
      ],
    },
    {
      icon: "⚖️",
      title: "Judging System",
      items: [
        "All matches are reviewed by a combination of AI and human judges",
        "AI auto-approves results with 70%+ confidence",
        "Suspicious matches are referred to human judges",
        "Every player has the right to dispute with evidence",
        "Head judge's final decision is not appealable",
      ],
    },
    {
      icon: "💰",
      title: "Prize Rules",
      items: [
        "Prizes are only sent to game IDs registered in your profile",
        "If the ID is incorrect, Flexa is not responsible",
        "Prizes are sent within 24-48 hours after tournament ends",
        "Violating players will be disqualified from prizes",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-dark-900">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">
            📜 <span className="neon-text-purple">
              {lang === "fa" ? "قوانین و مقررات" : "Rules & Regulations"}
            </span>
          </h1>
          <p className="text-gray-400">
            {lang === "fa"
              ? "لطفاً قبل از شرکت در تورنومنت‌ها، قوانین را مطالعه کنید"
              : "Please read the rules before joining tournaments"}
          </p>
        </div>

        <div className="space-y-6">
          {sections.map((section, idx) => (
            <div key={idx} className="gaming-card p-6 animate-slide-up" style={{ animationDelay: `${idx * 0.1}s` }}>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{section.icon}</span>
                <h2 className="text-lg font-bold text-neon-blue">{section.title}</h2>
              </div>
              <ul className="space-y-3">
                {section.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 text-gray-300 text-sm">
                    <span className="text-neon-purple mt-0.5 text-xs">▸</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Warning */}
        <div className="mt-8 bg-neon-pink/10 border border-neon-pink/30 rounded-xl p-5 text-center">
          <span className="text-2xl">⚠️</span>
          <p className="font-bold text-neon-pink mt-2">
            {lang === "fa"
              ? "نقض هر یک از قوانین فوق منجر به محرومیت از پلتفرم خواهد شد"
              : "Violation of any of the above rules will result in a platform ban"}
          </p>
        </div>
      </div>
    </div>
  );
}
