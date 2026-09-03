import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createPageMetadata } from "@/lib/seo";
import { validateSession } from "@/lib/auth";

export const metadata = createPageMetadata({
  title: "حساب کاربری گیمنت",
  description: "صفحه حساب کاربری و بخش خصوصی گیمنت.",
  path: "/admin",
  noIndex: true,
});

/**
 * Server-side gate for every /admin/* page.
 *
 * The client pages bounce non-admins after hydration and the /api/admin/*
 * routes return 401, but until now the shell itself was served to anyone.
 * This runs before the page renders: no session, wrong role → redirect home.
 */
export default async function Layout({ children }: { children: ReactNode }) {
  const store = await cookies();
  const token = store.get("session")?.value ?? "";
  const user = token
    ? await validateSession(token, "admin-layout", "admin-layout").catch(() => null)
    : null;

  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    redirect("/");
  }

  return children;
}
