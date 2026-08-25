import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { absoluteUrl, cleanSeoText, createPageMetadata, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { getCodRoomSeoEntity } from "@/lib/seo-entities";
import { isIndexableCodRoom } from "@/lib/seo-quality";

function roomDescription(room: {
  title: string;
  description: string | null;
  region: string;
  map: string;
  teamMode: string;
  capacity: number;
}) {
  return room.description?.trim()
    ? cleanSeoText(room.description, 180)
    : `کاستوم‌روم ${room.title} کالاف موبایل؛ ریجن ${room.region.toUpperCase()}، مپ ${room.map}، حالت ${room.teamMode.toUpperCase()} و ظرفیت ${room.capacity.toLocaleString("fa-IR")} بازیکن.`;
}

function publicImage(image: string | null) {
  return image && (image.startsWith("/") || image.startsWith("https://") || image.startsWith("http://")) ? image : undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getCodRoomSeoEntity(id);

  if (result.state === "found" && result.data.isPublished) {
    const room = result.data;
    return createPageMetadata({
      title: `${room.title} | کاستوم‌روم کالاف موبایل`,
      description: roomDescription(room),
      path: `/cod-arena/${id}`,
      image: publicImage(room.bannerImageUrl),
      keywords: [room.title, "کاستوم روم کالاف", `کالاف ${room.teamMode}`, room.map, `COD Mobile ${room.region}`],
      noIndex: !isIndexableCodRoom(room),
    });
  }

  return createPageMetadata({
    title: "کاستوم‌روم کالاف موبایل",
    description: "جزئیات روم کالاف موبایل، ظرفیت، زمان Check-in، قوانین، جایزه و نتایج در COD Arena گیمنت.",
    path: `/cod-arena/${id}`,
    noIndex: true,
  });
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCodRoomSeoEntity(id);
  if (result.state === "missing") notFound();
  if (result.state === "unavailable" || !result.data.isPublished) return children;

  const room = result.data;
  const url = absoluteUrl(`/cod-arena/${id}`);
  const image = publicImage(room.bannerImageUrl);
  const eventStatus = room.status === "cancelled"
    ? "https://schema.org/EventCancelled"
    : room.status === "settled" || room.status === "completed"
      ? "https://schema.org/EventCompleted"
      : room.status === "live"
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventScheduled";
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": `${url}#event`,
    name: room.title,
    description: roomDescription(room),
    url,
    startDate: room.startsAt.toISOString(),
    ...(room.endsAt ? { endDate: room.endsAt.toISOString() } : {}),
    eventStatus,
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: { "@type": "VirtualLocation", url, name: "COD Arena گیمنت" },
    organizer: { "@id": `${SITE_URL}/#organization` },
    ...(image ? { image: [absoluteUrl(image)] } : {}),
    maximumAttendeeCapacity: room.capacity,
    sport: "Call of Duty Mobile",
    offers: {
      "@type": "Offer",
      url,
      price: room.entryFeeRial,
      priceCurrency: "IRR",
      availability: room.status === "registration" || room.status === "waiting"
        ? "https://schema.org/InStock"
        : "https://schema.org/SoldOut",
      validFrom: room.updatedAt.toISOString(),
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "گیمنت", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "COD Arena", item: absoluteUrl("/cod-arena") },
      { "@type": "ListItem", position: 3, name: room.title, item: url },
    ],
  };
  const faqEntries = Array.isArray(room.faq)
    ? room.faq.filter((item): item is { question: string; answer: string } => Boolean(
        item && typeof item === "object" && typeof (item as { question?: unknown }).question === "string" && typeof (item as { answer?: unknown }).answer === "string"
      )).slice(0, 10)
    : [];
  const faqJsonLd = faqEntries.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqEntries.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(eventJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqJsonLd) }} />}
      {children}
    </>
  );
}
