import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "اچیومنت‌ها و دستاوردها",
  description: "دستاوردها و افتخارات قابل دریافت در گیمنت برای بازیکنان فعال و برندگان مسابقات.",
  path: "/achievements",
  keywords: ['اچیومنت گیمینگ', 'دستاورد بازیکن', 'افتخارات گیمنت'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
