import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { absoluteUrl, cleanSeoText, createPageMetadata, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { getTeamSeoEntity } from "@/lib/seo-entities";
import { isIndexableTeam } from "@/lib/seo-quality";

function teamDescription(team: { name: string; tag: string; description: string | null; memberCount: number }) {
  return team.description?.trim()
    ? `${cleanSeoText(team.description, 145)} — ${team.memberCount.toLocaleString("fa-IR")} عضو در گیمنت.`
    : `پروفایل تیم گیمینگ ${team.name} با تگ ${team.tag} و ${team.memberCount.toLocaleString("fa-IR")} عضو؛ اعضا و اطلاعات تیم را در گیمنت ببینید.`;
}

function publicImage(image: string | null) {
  return image && (image.startsWith("/") || image.startsWith("https://") || image.startsWith("http://")) ? image : undefined;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getTeamSeoEntity(id);

  if (result.state === "found") {
    const team = result.data;
    return createPageMetadata({
      title: `${team.name} [${team.tag}] | تیم گیمینگ`,
      description: teamDescription(team),
      path: `/teams/${id}`,
      image: publicImage(team.logoUrl),
      keywords: [team.name, team.tag, "تیم گیمینگ", "تیم ورزش الکترونیک"],
      noIndex: !isIndexableTeam(team),
    });
  }

  return createPageMetadata({
    title: "تیم گیمینگ",
    description: "مشاهده اعضا و اطلاعات تیم گیمینگ در گیمنت.",
    path: `/teams/${id}`,
    noIndex: true,
  });
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getTeamSeoEntity(id);
  if (result.state === "missing") notFound();
  if (result.state === "unavailable") return children;

  const team = result.data;
  const url = absoluteUrl(`/teams/${id}`);
  const image = publicImage(team.logoUrl);
  const teamJsonLd = {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    "@id": `${url}#team`,
    name: team.name,
    alternateName: team.tag,
    description: teamDescription(team),
    url,
    sport: "Esports",
    foundingDate: team.createdAt.toISOString(),
    ...(image ? { logo: absoluteUrl(image) } : {}),
    additionalProperty: {
      "@type": "PropertyValue",
      name: "تعداد اعضا",
      value: team.memberCount,
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "گیمنت", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "تیم‌ها", item: absoluteUrl("/teams") },
      { "@type": "ListItem", position: 3, name: team.name, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(teamJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {children}
    </>
  );
}
