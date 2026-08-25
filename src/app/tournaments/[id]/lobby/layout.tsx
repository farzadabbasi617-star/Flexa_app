import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "لابی خصوصی تورنومنت",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
