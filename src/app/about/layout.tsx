import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "درباره گیمنت",
  description: "درباره گیمنت؛ پلتفرم ایرانی برگزاری تورنومنت‌های آنلاین با داوری هوشمند، کیف پول و جامعه رقابتی گیمرها.",
  path: "/about",
  keywords: ['درباره گیمنت', 'پلتفرم تورنومنت', 'گیمینگ ایران'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
