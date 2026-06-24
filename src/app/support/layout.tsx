import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "پشتیبانی گیمنت",
  description: "ارسال درخواست پشتیبانی و پیگیری مشکلات حساب، کیف پول، ثبت‌نام و مسابقات در گیمنت.",
  path: "/support",
  keywords: ['پشتیبانی گیمنت', 'مشکل حساب', 'پشتیبانی مسابقات'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
