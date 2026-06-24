import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "قوانین گیمنت",
  description: "قوانین شرکت در تورنومنت‌های گیمنت، شرایط ثبت نتیجه، رفتار بازیکنان، اعتراض‌ها و داوری مسابقات.",
  path: "/rules",
  keywords: ['قوانین تورنومنت', 'قوانین گیمنت', 'قوانین مسابقات بازی'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
