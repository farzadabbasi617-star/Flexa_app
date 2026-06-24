import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "تماس با گیمنت",
  description: "راه‌های ارتباط با تیم گیمنت برای پشتیبانی، همکاری، گزارش مشکل و سوالات مربوط به مسابقات.",
  path: "/contact",
  keywords: ['تماس با گیمنت', 'پشتیبانی گیمنت', 'ارتباط با گیمنت'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
