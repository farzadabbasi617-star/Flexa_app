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
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleSection = (id: string) => {
    setActiveSection(activeSection === id ? null : id);
  };

  return (
    <>
      {/* Footer Trigger */}
      <div className="max-w-[480px] mx-auto px-6 pb-20 pt-8 text-center">
        <button
          onClick={() => setIsOpen(true)}
          className="text-[10px] text-white/40 hover:text-white/70 transition-colors flex items-center justify-center gap-1.5 mx-auto active:scale-95"
        >
          <span>اطلاعات قانونی و راهنما</span>
          <span className="text-lg leading-none">↑</span>
        </button>
      </div>

      {/* Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              setIsOpen(false);
              setActiveSection(null);
            }}
          />

          {/* Drawer Content */}
          <div className="relative w-full max-w-[480px] bg-[#0f0f14] rounded-t-3xl border-t border-white/10 shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
              <h3 className="font-black text-lg">اطلاعات و راهنما</h3>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setActiveSection(null);
                }}
                className="text-2xl text-white/50 hover:text-white active:scale-90 transition"
              >
                ✕
              </button>
            </div>

            {/* Sections */}
            <div className="overflow-y-auto flex-1 px-2 py-2 text-sm">
              {sections.map((section) => (
                <div key={section.id} className="border-b border-white/10 last:border-none">
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-right active:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{section.icon}</span>
                      <span className="font-bold">{section.title}</span>
                    </div>
                    <span className={`text-xl transition-transform ${activeSection === section.id ? "rotate-180" : ""}`}>
                      ⌄
                    </span>
                  </button>

                  {activeSection === section.id && (
                    <div className="px-5 pb-6 text-white/80 leading-relaxed">
                      {section.content}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="h-6 bg-[#0f0f14]" />
          </div>
        </div>
      )}
    </>
  );
}
