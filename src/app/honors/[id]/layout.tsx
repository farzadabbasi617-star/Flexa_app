import type { Metadata } from "next";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { honors } from "@/db/schema";
import { createPageMetadata, gameNamesFa } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;

  try {
    const [honor] = await db
      .select({
        id: honors.id,
        title: honors.title,
        description: honors.description,
        imageUrl: honors.imageUrl,
        game: honors.game,
      })
      .from(honors)
      .where(eq(honors.id, id))
      .limit(1);

    if (honor) {
      const gameName = honor.game ? gameNamesFa[honor.game] || honor.game : "گیمینگ";
      return createPageMetadata({
        title: honor.title,
        description: honor.description.slice(0, 155),
        path: `/honors/${id}`,
        image: honor.imageUrl || undefined,
        keywords: [honor.title, gameName, "افتخارات گیمنت", "قهرمانان گیمینگ"],
      });
    }
  } catch {
    // Keep a safe fallback if database metadata is temporarily unavailable.
  }

  return createPageMetadata({
    title: "افتخار گیمنت",
    description: "مشاهده خبر، افتخار یا قهرمان منتخب در تالار افتخارات گیمنت.",
    path: `/honors/${id}`,
  });
}

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
