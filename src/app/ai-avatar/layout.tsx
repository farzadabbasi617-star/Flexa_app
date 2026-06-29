import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "گیم‌یار زنده | گیمنت",
  description: "آواتار سه‌بعدی هوشمند گیمنت برای راهنمایی تورنومنت‌ها، قوانین، کیف پول و داوری.",
};

export default function AiAvatarLayout({ children }: { children: ReactNode }) {
  return children;
}
