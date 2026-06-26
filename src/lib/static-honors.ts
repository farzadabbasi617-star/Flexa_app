export type StaticHonor = {
  id: string;
  type: string;
  icon: string;
  title: string;
  description: string;
  time?: string;
  prize?: string;
  username?: string;
  level?: number;
  highlight?: boolean;
  image?: string;
  imageAlt?: string;
  summary?: string;
  seoKeywords?: string[];
  readTimeMinutes?: number;
  sources?: Array<{ title: string; link: string; source: string; pubDate?: string | null }>;
  game?: string;
  publishedAt?: string;
  createdAt?: string;
  htmlUrl?: string;
};

export const STATIC_HONORS: StaticHonor[] = [
  {
    id: "supercell-store-free-goblin-emote-2026-fa",
    type: "news",
    icon: "📰",
    title: "ایموت گابلین رایگان در Supercell Store؛ فرصت محدود برای دریافت جایزه",
    description:
      "سوپرسل یک ایموت گابلین رایگان و محدود به زمان را از طریق Supercell Store در دسترس قرار داده است. کاربران بازی‌های سوپرسل می‌توانند با ورود به فروشگاه رسمی سوپرسل و بررسی بخش پیشنهادها، این جایزه رایگان را دریافت کنند. این نوع هدیه‌ها معمولاً برای مدت کوتاهی فعال هستند و بهتر است بازیکنان کلش رویال، کلش آو کلنز و دیگر بازی‌های Supercell سریع‌تر وضعیت حساب خود را در فروشگاه رسمی بررسی کنند. برای امنیت حساب، فقط از دامنه رسمی store.supercell.com استفاده کنید و از وارد کردن اطلاعات در لینک‌های ناشناس یا مشابه خودداری کنید.",
    summary:
      "یک Goblin Emote رایگان به‌صورت محدود در فروشگاه رسمی Supercell Store فعال شده است؛ کاربران باید از دامنه رسمی store.supercell.com برای دریافت آن اقدام کنند.",
    highlight: true,
    image: "/news/supercell-store-goblin-emote-freebie.jpg",
    imageAlt: "هدیه رایگان ایموت گابلین در Supercell Store با تصویر شخصیت‌های کلش رویال",
    seoKeywords: [
      "ایموت گابلین رایگان",
      "Supercell Store",
      "سوپرسل استور",
      "Goblin Emote",
      "کلش رویال",
      "هدیه رایگان سوپرسل",
      "Gament اخبار گیمینگ",
    ],
    readTimeMinutes: 3,
    game: "clash_royale",
    publishedAt: "2026-06-26T13:10:00+03:30",
    createdAt: "2026-06-26T13:10:00+03:30",
    sources: [
      {
        title: "Supercell Store — Goblin Emote freebie",
        link: "https://store.supercell.com/en?boost=Biscotti",
        source: "Supercell Store",
        pubDate: "2026-06-26",
      },
    ],
  },
  {
    id: "merge-tactics-season-9-balance-changes-fa",
    type: "news",
    icon: "📰",
    title: "تغییرات بالانس فصل ۹ Merge Tactics کلش رویال",
    description:
      "بسته خبری کامل تغییرات بالانس فصل ۹ تاکتیک‌های ادغام کلش رویال؛ شامل nerf و buffهای مهم مینی‌پکا، ویژگی Boss، حاکمان و سربازها همراه با جدول تغییرات و تحلیل فارسی.",
    summary:
      "بررسی کامل آپدیت بالانس Season 9 Merge Tactics کلش رویال؛ از کاهش شدید HP مینی‌پکا و تضعیف Boss Trait تا تقویت نگهبان بزرگ، جادوگر، اژدهای اسکلتی و تغییرات مأموریت‌های حاکمان.",
    highlight: true,
    image: "https://clashroyale.inbox.supercell.com/9jtsgmsiuthj/6RiSIAymrumYiP7YvqvrPN/f15b9acaca486955a753d634ca2fb3d5/March_Balance_changes.jpg",
    imageAlt: "تغییرات بالانس فصل ۹ کلش رویال Merge Tactics",
    seoKeywords: ["کلش رویال", "Merge Tactics", "تغییرات بالانس", "فصل ۹", "مینی پکا", "Boss Trait"],
    readTimeMinutes: 9,
    game: "clash_royale",
    publishedAt: "2026-06-25T12:00:00+03:30",
    createdAt: "2026-06-25T12:00:00+03:30",
    htmlUrl: "/news/merge-tactics-season-9-balance-changes-fa.html",
    sources: [
      {
        title: "Merge Tactics Season 9 Balance Changes",
        link: "https://supercell.com/en/games/clashroyale/blog/release-notes/merge-tactics-season-9-balance-changes/",
        source: "Supercell / Clash Royale",
        pubDate: "2026-06-01",
      },
    ],
  },
];

export function getStaticHonorById(id: string) {
  return STATIC_HONORS.find((item) => item.id === id) || null;
}
