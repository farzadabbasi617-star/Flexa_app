import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import {
  getProgrammaticSeoPage,
  getRelatedProgrammaticPages,
  programmaticCanonical,
  programmaticPath,
  programmaticStaticParams,
  scoreProgrammaticPage,
} from "@/lib/programmatic-seo";
import { loadProgrammaticLiveData } from "@/lib/programmatic-seo-data";
import { absoluteUrl, createPageMetadata, serializeJsonLd, SITE_NAME, SITE_URL } from "@/lib/seo";

export const revalidate = 1800;
export const dynamicParams = false;

export function generateStaticParams() {
  return programmaticStaticParams();
}

type PageParams = Promise<{ slug: string; cluster: string; facet: string }>;

const CLUSTER_LABELS = {
  tournaments: "مسابقات",
  store: "فروشگاه",
  guides: "راهنماها",
  leaderboards: "رتبه‌بندی",
} as const;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug, cluster, facet } = await params;
  const pageDefinition = getProgrammaticSeoPage(slug, cluster, facet);
  if (!pageDefinition) {
    return createPageMetadata({
      title: "صفحه پیدا نشد",
      description: "این صفحه در راهنمای بازی‌های گیمنت وجود ندارد.",
      path: `/games/${slug}/${cluster}/${facet}`,
      noIndex: true,
    });
  }

  const quality = scoreProgrammaticPage(pageDefinition);
  return createPageMetadata({
    title: pageDefinition.metaTitle,
    description: pageDefinition.description,
    path: programmaticPath(pageDefinition),
    image: pageDefinition.icon,
    keywords: pageDefinition.keywords,
    noIndex: !quality.indexable,
  });
}

export default async function ProgrammaticLandingPage({ params }: { params: PageParams }) {
  const { slug, cluster, facet } = await params;
  const pageDefinition = getProgrammaticSeoPage(slug, cluster, facet);
  if (!pageDefinition) notFound();

  const [liveData] = await Promise.all([loadProgrammaticLiveData(pageDefinition)]);
  const relatedPages = getRelatedProgrammaticPages(pageDefinition, 6);
  const quality = scoreProgrammaticPage(pageDefinition);
  const canonical = programmaticCanonical(pageDefinition);
  const clusterLabel = CLUSTER_LABELS[pageDefinition.cluster];

  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: pageDefinition.title,
      description: pageDefinition.description,
      inLanguage: "fa-IR",
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: {
        "@type": "VideoGame",
        name: pageDefinition.gameName,
        alternateName: pageDefinition.gameEnglishName,
      },
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "گیمنت", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "بازی‌ها", item: absoluteUrl("/games") },
        { "@type": "ListItem", position: 3, name: pageDefinition.gameName, item: absoluteUrl(`/games/${pageDefinition.gameSlug}`) },
        { "@type": "ListItem", position: 4, name: pageDefinition.label, item: canonical },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      mainEntity: pageDefinition.faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
  ];

  if (liveData.items.length) {
    graph.push({
      "@type": "ItemList",
      "@id": `${canonical}#results`,
      name: `نتایج به‌روز ${pageDefinition.label}`,
      numberOfItems: liveData.items.length,
      itemListElement: liveData.items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.title,
        url: absoluteUrl(item.href),
      })),
    });
  }

  const structuredData = { "@context": "https://schema.org", "@graph": graph };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#050508] text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <Navbar />

      <main className="pb-28" dir="rtl">
        <section className="relative overflow-hidden border-b border-white/[.06]">
          <div className={`absolute inset-0 bg-gradient-to-br ${pageDefinition.accent} opacity-[.13]`} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,.16),transparent_24%),radial-gradient(circle_at_82%_5%,rgba(168,85,247,.22),transparent_30%)]" />
          <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
            <nav aria-label="مسیر صفحه" className="mb-6 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
              <Link href="/" className="hover:text-white">گیمنت</Link>
              <span aria-hidden="true">/</span>
              <Link href="/games" className="hover:text-white">بازی‌ها</Link>
              <span aria-hidden="true">/</span>
              <Link href={`/games/${pageDefinition.gameSlug}`} className="hover:text-white">{pageDefinition.gameName}</Link>
              <span aria-hidden="true">/</span>
              <span className="text-purple-200">{clusterLabel}</span>
            </nav>

            <div className="grid items-center gap-9 lg:grid-cols-[1fr_300px]">
              <div className="text-right">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-purple-300/20 bg-purple-500/10 px-3 py-1 text-[10px] font-black text-purple-200">
                    {clusterLabel} · {pageDefinition.gameName}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1 text-[10px] font-bold text-gray-400">
                    محتوای داده‌محور گیمنت
                  </span>
                </div>
                <h1 className="max-w-4xl text-3xl font-black leading-[1.55] sm:text-5xl">
                  {pageDefinition.title}
                </h1>
                <p className="mt-5 max-w-4xl text-sm leading-8 text-gray-300 sm:text-base">
                  {pageDefinition.intro}
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link href={pageDefinition.primaryCta.href} className={`gaming-btn bg-gradient-to-r ${pageDefinition.accent}`}>
                    {pageDefinition.primaryCta.label}
                  </Link>
                  <Link href={`/games/${pageDefinition.gameSlug}`} className="rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm font-black hover:bg-white/[.08]">
                    صفحه اصلی {pageDefinition.gameName}
                  </Link>
                </div>
              </div>

              <div className="mx-auto grid h-56 w-56 place-items-center rounded-[3rem] border border-white/10 bg-black/25 shadow-[0_0_80px_rgba(168,85,247,.15)] sm:h-64 sm:w-64">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pageDefinition.icon} alt={`آیکن ${pageDefinition.gameName}`} className="h-36 w-36 object-contain drop-shadow-[0_24px_45px_rgba(0,0,0,.45)] sm:h-44 sm:w-44" />
              </div>
            </div>
          </div>
        </section>

        {liveData.available && (
          <section className="border-b border-white/[.05] bg-white/[.018]">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-[10px] text-gray-500 sm:px-6">
              <span>داده زنده: {liveData.total.toLocaleString("fa-IR")} رکورد منتخب مرتبط</span>
              {liveData.fetchedAt && (
                <time dateTime={liveData.fetchedAt.toISOString()}>
                  آخرین واکشی: {liveData.fetchedAt.toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })}
                </time>
              )}
            </div>
          </section>
        )}

        <div className="mx-auto max-w-7xl px-4 py-11 sm:px-6">
          {liveData.items.length > 0 ? (
            <section aria-labelledby="live-results-title" className="mb-12">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black tracking-[.2em] text-cyan-300">LIVE DATA</span>
                  <h2 id="live-results-title" className="mt-1 text-2xl font-black">نتایج مرتبط و به‌روز</h2>
                </div>
                <span className="text-xs text-gray-500">از دیتابیس اصلی گیمنت</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {liveData.items.map((item) => (
                  <Link key={`${item.href}-${item.id}`} href={item.href} className="group overflow-hidden rounded-[26px] border border-white/[.08] bg-white/[.028] transition hover:-translate-y-0.5 hover:border-purple-300/25 hover:bg-white/[.045]">
                    {item.image && (
                      <div className="h-36 overflow-hidden bg-black/30">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" decoding="async" />
                      </div>
                    )}
                    <article className="p-5">
                      <div className="text-[10px] font-black text-purple-300">{item.eyebrow}</div>
                      <h3 className="mt-2 line-clamp-2 text-base font-black leading-7">{item.title}</h3>
                      <p className="mt-2 line-clamp-3 text-xs leading-6 text-gray-500">{item.description}</p>
                      {item.metric && <div className="mt-4 border-t border-white/[.06] pt-3 text-xs font-black text-cyan-200">{item.metric}</div>}
                    </article>
                  </Link>
                ))}
              </div>
            </section>
          ) : (
            <section className="mb-12 rounded-[26px] border border-dashed border-white/10 bg-white/[.018] p-6 text-right">
              <h2 className="font-black">فعلاً رکورد زنده‌ای در این دسته منتشر نشده است</h2>
              <p className="mt-2 text-xs leading-7 text-gray-500">
                برای پرکردن صفحه، مسابقه، محصول یا بازیکن فرضی ساخته نمی‌شود. محتوای راهنما همیشه در دسترس است و به‌محض انتشار رکورد واجد شرایط، این بخش خودکار به‌روزرسانی خواهد شد.
              </p>
            </section>
          )}

          <section className="grid gap-5 lg:grid-cols-3" aria-label="راهنمای کامل">
            {pageDefinition.sections.map((section, index) => (
              <article key={section.heading} className="rounded-[26px] border border-white/[.08] bg-white/[.028] p-6 text-right">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-purple-500/10 text-xs font-black text-purple-200">
                  {(index + 1).toLocaleString("fa-IR")}
                </span>
                <h2 className="mt-4 text-lg font-black leading-8">{section.heading}</h2>
                <p className="mt-3 text-sm leading-8 text-gray-400">{section.body}</p>
              </article>
            ))}
          </section>

          <section className="mt-10 grid items-start gap-6 lg:grid-cols-[.8fr_1.2fr]">
            <aside className="rounded-[26px] border border-cyan-300/15 bg-cyan-500/[.045] p-6">
              <h2 className="text-lg font-black text-cyan-100">چک‌لیست سریع</h2>
              <ul className="mt-5 space-y-3">
                {pageDefinition.checklist.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm leading-7 text-gray-300">
                    <span aria-hidden="true" className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-400/15 text-[10px] text-cyan-200">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </aside>

            <section className="rounded-[26px] border border-white/[.08] bg-white/[.028] p-6" aria-labelledby="faq-title">
              <h2 id="faq-title" className="text-xl font-black">پرسش‌های رایج</h2>
              <div className="mt-5 space-y-4">
                {pageDefinition.faqs.map((faq) => (
                  <article key={faq.question} className="rounded-2xl border border-white/[.06] bg-black/20 p-5">
                    <h3 className="font-black leading-7 text-white">{faq.question}</h3>
                    <p className="mt-2 text-sm leading-8 text-gray-400">{faq.answer}</p>
                  </article>
                ))}
              </div>
            </section>
          </section>

          <section className="mt-12 border-t border-white/[.07] pt-9" aria-labelledby="related-title">
            <div className="mb-5 flex items-end justify-between gap-3">
              <div>
                <span className="text-[10px] font-black tracking-[.2em] text-purple-300">RELATED</span>
                <h2 id="related-title" className="mt-1 text-xl font-black">مسیرهای مرتبط</h2>
              </div>
              <Link href="/games" className="text-xs font-black text-purple-300">همه بازی‌ها ←</Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPages.map((related) => (
                <Link key={programmaticPath(related)} href={programmaticPath(related)} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-purple-300/20 hover:bg-white/[.045]">
                  <div className="text-[10px] text-gray-500">{CLUSTER_LABELS[related.cluster]} · {related.gameName}</div>
                  <div className="mt-2 text-sm font-black leading-7">{related.label}</div>
                </Link>
              ))}
            </div>
          </section>

          {!quality.indexable && process.env.NODE_ENV !== "production" && (
            <div className="mt-8 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs text-yellow-200">
              این صفحه به‌دلیل Quality Gate فعلاً noindex است: {quality.reasons.join("، ")}
            </div>
          )}

          <footer className="mt-10 text-center text-[10px] text-gray-700">
            {SITE_NAME} · اطلاعات عمومی و قابل مشاهده؛ داده خصوصی حساب، لابی یا تحویل در این صفحه منتشر نمی‌شود.
          </footer>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
