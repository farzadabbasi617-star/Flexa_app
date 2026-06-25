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
