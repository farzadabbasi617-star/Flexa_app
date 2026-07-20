import type { ReactNode } from "react";
import { createPageMetadata } from "@/lib/seo";
export const metadata = createPageMetadata({ title: "درآمد از معرفی کاربران Gament", description: "لینک معرفی، کمیسیون Matchهای پولی و موجودی درآمد معرفی Gament", path: "/referrals", noIndex: true });
export default function Layout({ children }: { children: ReactNode }) { return children; }
