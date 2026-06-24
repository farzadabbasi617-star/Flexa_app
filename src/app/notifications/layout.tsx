import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "حساب کاربری گیمنت",
  description: "صفحه حساب کاربری و بخش خصوصی گیمنت.",
  path: "/notifications",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
