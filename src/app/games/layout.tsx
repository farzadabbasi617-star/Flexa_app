import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "مسابقات بازی‌های محبوب",
  description: "صفحات اختصاصی مسابقات و تورنومنت‌های کالاف دیوتی موبایل، فورتنایت و کلش رویال در گیمنت.",
  path: "/games",
  keywords: ["مسابقات گیمینگ", "تورنومنت بازی", "کالاف موبایل", "فورتنایت", "کلش رویال"],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
