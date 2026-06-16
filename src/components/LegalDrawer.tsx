"use client";

import { useState } from "react";

const sections = [
  {
    id: "about",
    title: "درباره ما",
    icon: "🏢",
    content: (
      <>
        <p className="mb-3">
          فلکسا (Flexa) یک پلتفرم حرفه‌ای تورنومنت گیمینگ است که با تمرکز بر بازی‌های محبوب موبایل و PC، تجربه‌ای عادلانه، سریع و هوشمند را برای گیمرها فراهم می‌کند.
        </p>
        <p>
          ما با استفاده از هوش مصنوعی برای داوری، سیستم کیف پول امن و جوایز واقعی، بستری ایجاد کرده‌ایم که بازیکنان بتوانند با خیال راحت در مسابقات شرکت کنند و مهارت خود را به نمایش بگذارند.
        </p>
      </>
    ),
  },
  {
    id: "contact",
    title: "تماس با ما",
    icon: "📬",
    content: (
      <>
        <p className="mb-4">برای هرگونه سوال، پیشنهاد یا گزارش مشکل می‌توانید از راه‌های زیر با ما در ارتباط باشید:</p>
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-purple-400">✉️</span>
            <span>support@flexa.app</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-purple-400">📱</span>
            <span>تلگرام: @flexa_support</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-purple-400">💬</span>
            <span>چت داخل اپلیکیشن (بخش پشتیبانی)</span>
          </div>
        </div>
      </>
    ),
  },
  {
    id: "privacy",
    title: "حریم خصوصی",
    icon: "🔒",
    content: (
      <>
        <p className="mb-3">ما به حریم خصوصی کاربران اهمیت ویژه‌ای می‌دهیم. اطلاعات شخصی شما:</p>
        <ul className="list-disc pr-5 space-y-1 text-sm">
          <li>فقط برای ارائه خدمات و احراز هویت استفاده می‌شود</li>
          <li>با هیچ شخص ثالثی به اشتراک گذاشته نمی‌شود</li>
          <li>در صورت درخواست کاربر، قابل حذف است</li>
          <li>با رمزنگاری امن ذخیره می‌شود</li>
        </ul>
      </>
    ),
  },
  {
    id: "faq",
    title: "سوالات متداول",
    icon: "❓",
    content: (
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-bold text-purple-300 mb-1">چگونه در تورنومنت شرکت کنم؟</p>
          <p>از صفحه تورنومنت‌ها، روم مورد نظر را انتخاب و روی «شرکت در مسابقه» کلیک کنید.</p>
        </div>
        <div>
          <p className="font-bold text-purple-300 mb-1">جوایز چطور پرداخت می‌شود؟</p>
          <p>جوایز به کیف پول داخل اپلیکیشن واریز می‌شود و قابل برداشت به حساب بانکی است.</p>
        </div>
        <div>
          <p className="font-bold text-purple-300 mb-1">داوری چطور انجام می‌شود؟</p>
          <p>ترکیبی از داوری هوش مصنوعی و بررسی انسانی برای اطمینان از عدالت.</p>
        </div>
      </div>
    ),
  },
  {
    id: "tournament-guide",
    title: "راهنمای شرکت در تورنومنت",
    icon: "🎮",
    content: (
      <>
        <ol className="list-decimal pr-5 space-y-2 text-sm">
          <li>بازی مورد نظر خود را انتخاب کنید</li>
          <li>از لیست روم‌ها، تورنومنت مناسب سطح خود را پیدا کنید</li>
          <li>هزینه ورودی را پرداخت کنید</li>
          <li>در زمان مشخص شده در روم حضور داشته باشید</li>
          <li>نتایج را آپلود کنید و منتظر داوری باشید</li>
        </ol>
      </>
    ),
  },
  {
    id: "wallet-guide",
    title: "راهنمای کیف پول و جوایز",
    icon: "💰",
    content: (
      <>
        <p className="mb-3">کیف پول فلکسا امکان مدیریت موجودی و جوایز را فراهم می‌کند:</p>
        <ul className="list-disc pr-5 space-y-1 text-sm">
          <li>شارژ کیف پول از طریق درگاه‌های امن</li>
          <li>برداشت جوایز به حساب بانکی (حداقل ۵۰٬۰۰۰ تومان)</li>
          <li>مشاهده تاریخچه تمام تراکنش‌ها</li>
          <li>جوایز به‌صورت خودکار به کیف پول اضافه می‌شوند</li>
        </ul>
      </>
    ),
  },
];

export default function LegalDrawer() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setActiveSection(activeSection === id ? null : id);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[480px] mx-auto">
      {/* Collapsible Bar */}
      <div className="bg-[#0f0f14] border-t border-white/10 shadow-xl rounded-t-2xl overflow-hidden mx-2">
        {/* Header Bar */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-4 py-3 active:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-white/80">
            <span>اطلاعات قانونی و راهنما</span>
          </div>
          <span className={`text-lg transition-transform ${isOpen ? "rotate-180" : ""}`}>
            ⌄
          </span>
        </button>

        {/* Content */}
        {isOpen && (
          <div className="px-2 pb-2 text-sm max-h-[55vh] overflow-y-auto border-t border-white/10">
            {sections.map((section) => (
              <div key={section.id} className="border-b border-white/10 last:border-none">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 text-right active:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{section.icon}</span>
                    <span className="font-bold text-sm">{section.title}</span>
                  </div>
                  <span className={`text-lg transition-transform ${activeSection === section.id ? "rotate-180" : ""}`}>
                    ⌄
                  </span>
                </button>

                {activeSection === section.id && (
                  <div className="px-4 pb-5 text-white/75 text-[13px] leading-relaxed">
                    {section.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
