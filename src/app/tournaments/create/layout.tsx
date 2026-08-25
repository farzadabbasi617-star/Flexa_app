import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "ساخت تورنومنت",
  description: "فرم خصوصی ساخت و مدیریت تورنومنت در گیمنت.",
  path: "/tournaments/create",
  noIndex: true,
});

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
