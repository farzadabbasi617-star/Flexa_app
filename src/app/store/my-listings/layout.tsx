import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "آگهی‌های من | فروشگاه گیمنت",
  description: "مدیریت آگهی‌ها و موجودی فروشنده در حساب خصوصی گیمنت.",
  path: "/store/my-listings",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
