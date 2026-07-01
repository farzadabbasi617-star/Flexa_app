import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "فروشگاه و خرید و فروش اکانت بازی | گیمنت",
  description:
    "فروشگاه امن گیمنت برای خرید و فروش اکانت بازی، ارز درون‌بازی و آیتم؛ خرید امانی (اسکرو)، احراز هویت فروشنده، گارانتی و امکان پیشنهاد قیمت برای کالاف موبایل، فورتنایت و کلش رویال.",
  path: "/store",
  keywords: [
    "خرید و فروش اکانت بازی",
    "فروشگاه اکانت گیمینگ",
    "خرید اکانت کالاف موبایل",
    "خرید اکانت فورتنایت",
    "خرید اکانت کلش رویال",
    "خرید ارز بازی",
    "فروش اکانت با اسکرو",
    "معامله امن اکانت بازی",
  ],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
