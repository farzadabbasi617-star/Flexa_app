import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "تورنومنت‌های گیمینگ آنلاین",
  description: "لیست تورنومنت‌های فعال کالاف دیوتی موبایل، فورتنایت و کلش رویال در گیمنت؛ ثبت‌نام، مشاهده جوایز، ظرفیت و زمان شروع مسابقات.",
  path: "/tournaments",
  keywords: ['تورنومنت گیمینگ', 'مسابقات کالاف موبایل', 'مسابقات فورتنایت', 'مسابقات کلش رویال'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
