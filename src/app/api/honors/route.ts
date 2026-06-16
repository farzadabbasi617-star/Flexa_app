import { NextResponse } from "next/server";

interface Honor {
  id: number;
  type: "winner" | "levelup" | "news";
  icon: string;
  title: string;
  description: string;
  time: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight?: boolean;
}

// موقتاً داده‌های استاتیک. بعداً از دیتابیس خوانده می‌شود.
const honors: Honor[] = [
  {
    id: 1,
    type: "winner",
    icon: "🏆",
    title: "قهرمان تورنومنت کالاف موبایل",
    description: "علی رضایی با عملکرد درخشان در فینال، عنوان قهرمانی را از آن خود کرد.",
    time: "۲ ساعت پیش",
    prize: "۵۰۰٬۰۰۰ تومان",
    username: "alireza_pro",
    highlight: true,
  },
  {
    id: 2,
    type: "levelup",
    icon: "⚡",
    title: "سارا محمدی به سطح ۴۲ رسید",
    description: "با کسب ۱۲٬۴۰۰ امتیاز تجربه، سارا به سطح جدیدی از مهارت دست یافت.",
    time: "۵ ساعت پیش",
    username: "sara_gamer",
    level: 42,
  },
  {
    id: 3,
    type: "winner",
    icon: "🏆",
    title: "امیرحسین کریمی قهرمان فورتنایت شد",
    description: "در رقابتی نفس‌گیر، امیرحسین با ۲۴ کیل، رتبه اول را کسب کرد.",
    time: "دیروز",
    prize: "۱٬۲۰۰٬۰۰۰ تومان",
    username: "amir_king",
    highlight: true,
  },
  {
    id: 4,
    type: "news",
    icon: "📰",
    title: "به‌روزرسانی بزرگ سیستم داوری هوش مصنوعی",
    description: "دقت موتور AI فلکسا به ۹۷٪ رسید. این به‌روزرسانی شامل بهبود تشخیص تقلب و سرعت پردازش است.",
    time: "۲ روز پیش",
    highlight: true,
  },
  {
    id: 5,
    type: "levelup",
    icon: "⚡",
    title: "محمد حسینی به سطح ۳۸ رسید",
    description: "محمد با ۸ برد پیاپی در تورنومنت‌ها، سطح خود را ارتقا داد.",
    time: "۳ روز پیش",
    username: "mohammad_h",
    level: 38,
  },
  {
    id: 6,
    type: "winner",
    icon: "🏆",
    title: "زهرا کریمی قهرمان کلش رویال",
    description: "زهرا با استراتژی هوشمندانه در فینال، جایزه را به خانه برد.",
    time: "۴ روز پیش",
    prize: "۳۵۰٬۰۰۰ تومان",
    username: "zahra_cr",
  },
];

export async function GET() {
  return NextResponse.json(honors);
}
