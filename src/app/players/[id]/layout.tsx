import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createPageMetadata, absoluteUrl, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { getPlayerSeoEntity } from "@/lib/seo-entities";
import { isIndexablePlayerProfile } from "@/lib/seo-quality";

function publicImage(image: string | null) {
  return image && (image.startsWith("/") || image.startsWith("https://") || image.startsWith("http://")) ? image : undefined;
}

function playerDescription(player: {
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  bio: string | null;
}) {
  const stats = `امتیاز ${player.rating.toLocaleString("fa-IR")}، ${player.wins.toLocaleString("fa-IR")} برد و ${player.losses.toLocaleString("fa-IR")} باخت`;
  return player.bio?.trim()
    ? `${player.bio.trim().slice(0, 105)} — ${stats} در گیمنت.`
    : `پروفایل ${player.displayName} در گیمنت؛ ${stats} در مسابقات گیمینگ آنلاین.`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getPlayerSeoEntity(id);

  if (result.state === "found") {
    const player = result.data;
    const indexable = isIndexablePlayerProfile(player);
    return createPageMetadata({
      title: `${player.displayName} | پروفایل و آمار بازیکن`,
      description: playerDescription(player),
      path: `/players/${id}`,
      image: publicImage(player.avatarUrl),
      keywords: [player.displayName, player.username, "پروفایل گیمر", "بازیکن گیمنت"],
      noIndex: !indexable,
    });
  }

  return createPageMetadata({
    title: "پروفایل بازیکن",
    description: "مشاهده پروفایل بازیکن، آمار، رتبه و مسابقات اخیر در گیمنت.",
    path: `/players/${id}`,
    noIndex: true,
  });
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getPlayerSeoEntity(id);
  if (result.state === "missing") notFound();
  if (result.state === "unavailable") return children;

  const player = result.data;
  const url = absoluteUrl(`/players/${id}`);
  const image = publicImage(player.avatarUrl);
  const games = [
    player.hasClashRoyale ? "Clash Royale" : null,
    player.hasCodMobile ? "Call of Duty Mobile" : null,
    player.hasFortnite ? "Fortnite" : null,
  ].filter((value): value is string => Boolean(value));

  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${url}#profile`,
    url,
    name: `پروفایل ${player.displayName} در گیمنت`,
    dateCreated: player.createdAt.toISOString(),
    mainEntity: {
      "@type": "Person",
      "@id": `${url}#player`,
      name: player.displayName,
      alternateName: player.username,
      ...(player.gamentId ? { identifier: player.gamentId } : {}),
      ...(image ? { image: absoluteUrl(image) } : {}),
      description: playerDescription(player),
      knowsAbout: games,
      additionalProperty: [
        { "@type": "PropertyValue", name: "Rating", value: player.rating },
        { "@type": "PropertyValue", name: "Wins", value: player.wins },
        { "@type": "PropertyValue", name: "Losses", value: player.losses },
      ],
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "گیمنت", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "بازیکنان", item: absoluteUrl("/players") },
      { "@type": "ListItem", position: 3, name: player.displayName, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(profileJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {children}
    </>
  );
}
