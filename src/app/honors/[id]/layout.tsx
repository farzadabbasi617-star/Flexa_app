import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { absoluteUrl, createPageMetadata, gameNamesFa, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { honorNewsArticleJsonLd, honorParagraphs, lookupHonorArticleForSeo } from "@/lib/honor-article-seo";
import { isIndexableHonor } from "@/lib/seo-quality";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await lookupHonorArticleForSeo(id);

  if (result.state === "found") {
    const honor = result.data;
    const gameName = honor.game ? gameNamesFa[honor.game] || honor.game : "گیمینگ";
    return createPageMetadata({
      title: honor.title,
      description: honor.summary || honor.description,
      path: `/honors/${id}`,
      image: honor.imageUrl || undefined,
      keywords: [...honor.seoKeywords, honor.title, gameName, "تالار افتخارات گیمنت", "اخبار گیمینگ"],
      noIndex: !isIndexableHonor(honor),
    });
  }

  return createPageMetadata({
    title: "محتوای تالار افتخارات",
    description: "مشاهده خبر، افتخار یا قهرمان منتخب در تالار افتخارات گیمنت.",
    path: `/honors/${id}`,
    noIndex: true,
  });
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await lookupHonorArticleForSeo(id);
  if (result.state === "missing") notFound();
  if (result.state === "unavailable") return children;

  const article = result.data;
  const paragraphs = honorParagraphs(article.description);
  const articleJsonLd = honorNewsArticleJsonLd(article, SITE_URL);
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "گیمنت", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "تالار افتخارات", item: absoluteUrl("/honors") },
      { "@type": "ListItem", position: 3, name: article.title, item: absoluteUrl(`/honors/${id}`) },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <article className="sr-only" aria-hidden="true">
        <h1>{article.title}</h1>
        {article.summary && <p>{article.summary}</p>}
        {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </article>
      {children}
    </>
  );
}
