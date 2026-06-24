import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "جدول رتبه‌بندی گیمرها",
  description: "مشاهده رتبه‌بندی بازیکنان گیمنت بر اساس امتیاز، برد، باخت و عملکرد در تورنومنت‌های آنلاین.",
  path: "/leaderboard",
  keywords: ['لیدربورد گیمینگ', 'رتبه بندی گیمرها', 'بازیکنان برتر'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
