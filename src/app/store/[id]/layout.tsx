import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { absoluteUrl, cleanSeoText, createPageMetadata, gameNamesFa, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { getStoreListingSeoEntity } from "@/lib/seo-entities";
import { isIndexableStoreListing } from "@/lib/seo-quality";

function listingImages(images: unknown) {
  return Array.isArray(images)
    ? images.filter((image): image is string => typeof image === "string" && (image.startsWith("/") || image.startsWith("https://") || image.startsWith("http://")))
    : [];
}

function priceToman(priceRial: string) {
  try {
    return (BigInt(priceRial) / BigInt(10)).toLocaleString("fa-IR");
  } catch {
    return "نامشخص";
  }
}

function listingDescription(listing: {
  title: string;
  description: string | null;
  game: string | null;
  priceRial: string;
  source: string;
}) {
  const game = listing.game ? gameNamesFa[listing.game] || listing.game : "بازی";
  const prefix = listing.description?.trim()
    ? cleanSeoText(listing.description, 125)
    : `${listing.title} برای ${game}`;
  return `${prefix}؛ قیمت ${priceToman(listing.priceRial)} تومان، ${listing.source === "official" ? "عرضه رسمی گیمنت" : "پرداخت امانی و تحویل امن"}.`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await getStoreListingSeoEntity(id);

  if (result.state === "found" && result.data.status === "active") {
    const listing = result.data;
    const images = listingImages(listing.images);
    const gameName = listing.game ? gameNamesFa[listing.game] || listing.game : "بازی";
    return createPageMetadata({
      title: `${listing.title} | خرید امن ${gameName}`,
      description: listingDescription(listing),
      path: `/store/${id}`,
      image: images[0] || undefined,
      keywords: [listing.title, `خرید ${gameName}`, listing.currencyKind, "خرید امن اکانت بازی"].filter((value): value is string => Boolean(value)),
      noIndex: !isIndexableStoreListing(listing),
    });
  }

  return createPageMetadata({
    title: "جزئیات محصول فروشگاه گیمنت",
    description: "مشاهده مشخصات، قیمت، موجودی و شرایط خرید امن محصول در فروشگاه گیمنت.",
    path: `/store/${id}`,
    noIndex: true,
  });
}

export default async function Layout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getStoreListingSeoEntity(id);
  if (result.state === "missing") notFound();
  if (result.state === "unavailable") return children;
  if (result.data.status !== "active") notFound();

  const listing = result.data;
  const url = absoluteUrl(`/store/${id}`);
  const images = listingImages(listing.images).map(absoluteUrl);
  const gameName = listing.game ? gameNamesFa[listing.game] || listing.game : null;
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: listing.title,
    description: listingDescription(listing),
    sku: listing.id,
    url,
    ...(images.length ? { image: images } : {}),
    ...(gameName ? { category: `${gameName} / ${listing.kind}` } : { category: listing.kind }),
    brand: { "@type": "Brand", name: listing.source === "official" ? "Gament" : gameName || "Gaming" },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "IRR",
      price: listing.priceRial,
      availability: listing.status === "active" && listing.stock > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: listing.kind === "account"
        ? "https://schema.org/UsedCondition"
        : "https://schema.org/NewCondition",
      seller: listing.source === "official"
        ? { "@id": `${SITE_URL}/#organization` }
        : { "@type": "Person", name: listing.sellerName || "فروشنده تأییدشده گیمنت" },
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "موجودی", value: listing.stock },
      { "@type": "PropertyValue", name: "فروش موفق", value: listing.soldCount },
      ...(listing.warrantyDays > 0 ? [{ "@type": "PropertyValue", name: "گارانتی فروشنده", value: `${listing.warrantyDays} روز` }] : []),
      ...(listing.currencyAmount ? [{ "@type": "PropertyValue", name: "مقدار ارز بازی", value: listing.currencyAmount }] : []),
    ],
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "گیمنت", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "فروشگاه", item: absoluteUrl("/store") },
      ...(gameName ? [{ "@type": "ListItem", position: 3, name: gameName, item: absoluteUrl(`/store?game=${listing.game}`) }] : []),
      { "@type": "ListItem", position: gameName ? 4 : 3, name: listing.title, item: url },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      {children}
    </>
  );
}
