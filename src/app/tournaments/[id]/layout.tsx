import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { createPageMetadata, gameNamesFa, absoluteUrl, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { getTournamentSeoEntity } from "@/lib/seo-entities";
import { isIndexableTournament } from "@/lib/seo-quality";
import { parseTomanToRial } from "@/lib/money";

function publicImage(image: string | null) {
  return image && (image.startsWith("/") || image.startsWith("https://") || image.startsWith("http://")) ? image : undefined;
}

function tournamentDescription(tournament: {
  name: string;
  game: string;
  description: string | null;
  maxPlayers: number;
  prizePool: string | null;
}) {
  const gameName = gameNamesFa[tournament.game] || tournament.game;
  return tournament.description?.trim().slice(0, 170) ||
    `ثبت‌نام و مشاهده جزئیات تورنومنت ${tournament.name} در بازی ${gameName}؛ ظرفیت ${tournament.maxPlayers.toLocaleString("fa-IR")} بازیکن${tournament.prizePool ? ` و جایزه ${tournament.prizePool}` : ""}.`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getTournamentSeoEntity(id);

  if (result.state === "found") {
    const tournament = result.data;
    const gameName = gameNamesFa[tournament.game] || tournament.game;
    return createPageMetadata({
      title: `${tournament.name} | تورنومنت ${gameName}`,
      description: tournamentDescription(tournament),
      path: `/tournaments/${id}`,
      image: publicImage(tournament.bannerUrl),
      keywords: [tournament.name, `تورنومنت ${gameName}`, "ثبت نام مسابقه", tournament.gameMode, tournament.mapName].filter((value): value is string => Boolean(value)),
      noIndex: !isIndexableTournament(tournament),
    });
  }

  return createPageMetadata({
    title: "جزئیات تورنومنت",
    description: "مشاهده جزئیات تورنومنت، بازیکنان، قوانین، جوایز و ثبت‌نام در گیمنت.",
    path: `/tournaments/${id}`,
    noIndex: true,
  });
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getTournamentSeoEntity(id);
  if (result.state === "missing") notFound();
  if (result.state === "unavailable") return children;

  const tournament = result.data;
  const url = absoluteUrl(`/tournaments/${id}`);
  const gameName = gameNamesFa[tournament.game] || tournament.game;
  const image = publicImage(tournament.bannerUrl);
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "گیمنت", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "تورنومنت‌ها", item: absoluteUrl("/tournaments") },
      { "@type": "ListItem", position: 3, name: tournament.name, item: url },
    ],
  };

  const entryFeeRial = parseTomanToRial(tournament.entryFee);
  const eventStatus = tournament.status === "cancelled"
    ? "https://schema.org/EventCancelled"
    : tournament.status === "completed"
      ? "https://schema.org/EventCompleted"
      : tournament.status === "in_progress"
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventScheduled";
  const eventJsonLd = tournament.startDate ? {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${url}#event`,
    name: tournament.name,
    description: tournamentDescription(tournament),
    url,
    startDate: tournament.startDate.toISOString(),
    ...(tournament.endDate ? { endDate: tournament.endDate.toISOString() } : {}),
    eventStatus,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: {
      "@type": "VirtualLocation",
      url,
      name: `لابی آنلاین ${gameName} در گیمنت`,
    },
    organizer: { "@id": `${SITE_URL}/#organization` },
    ...(image ? { image: [absoluteUrl(image)] } : {}),
    offers: {
      "@type": "Offer",
      url,
      price: entryFeeRial.toString(),
      priceCurrency: "IRR",
      availability: tournament.status === "registration"
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut",
      validFrom: tournament.updatedAt.toISOString(),
    },
    maximumAttendeeCapacity: tournament.maxPlayers,
    sport: gameName,
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {eventJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(eventJsonLd) }} />}
      {children}
    </>
  );
}
