import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "تالار افتخارات گیمنت",
  description: "اخبار، افتخارات، قهرمانان و برندگان برتر تورنومنت‌های گیمنت در بازی‌های مختلف.",
  path: "/honors",
  keywords: ['تالار افتخارات', 'قهرمانان گیمینگ', 'برندگان تورنومنت'],
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
