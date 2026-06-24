import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "راهنمای شرکت در تورنومنت‌ها",
  description: "آموزش مرحله‌به‌مرحله شرکت در تورنومنت‌های گیمنت؛ انتخاب بازی، ثبت‌نام، ورود به لابی و ثبت نتیجه.",
  path: "/guide/tournaments",
  keywords: ['راهنمای تورنومنت', 'آموزش ثبت نام مسابقه', 'گیمنت'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
