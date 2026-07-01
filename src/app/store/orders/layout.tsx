import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

// Private user page — kept out of the search index.
export const metadata = createPageMetadata({
  title: "سفارش‌های من | فروشگاه گیمنت",
  description: "پیگیری سفارش‌ها و پیشنهادهای قیمت در فروشگاه گیمنت.",
  path: "/store/orders",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
