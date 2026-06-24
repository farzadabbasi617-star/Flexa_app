import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "بازیکنان گیمنت",
  description: "پروفایل و آمار بازیکنان گیمنت، رتبه، برد و باخت و عملکرد در مسابقات گیمینگ آنلاین.",
  path: "/players",
  keywords: ['بازیکنان گیمنت', 'پروفایل گیمر', 'آمار بازیکنان'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
