import { MetadataRoute } from 'next';
import { db } from '@/db';
import { tournaments } from '@/db/schema';
import { eq, or, inArray } from 'drizzle-orm';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://gament1.ir';

  // ==================== صفحات ثابت ====================
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/tournaments`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 0.95,
    },
    {
      url: `${baseUrl}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/judging`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${baseUrl}/teams`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/profile`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    {
      url: `${baseUrl}/wallet`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/achievements`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/honors`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.65,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${baseUrl}/rules`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.55,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/guide`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // ==================== تورنمنت‌های داینامیک ====================
  let dynamicRoutes: MetadataRoute.Sitemap = [];

  try {
    // فقط تورنمنت‌های فعال و در حال ثبت‌نام
    const activeTournaments = await db
      .select({
        id: tournaments.id,
        updatedAt: tournaments.updatedAt,
        status: tournaments.status,
      })
      .from(tournaments)
      .where(
        or(
          eq(tournaments.status, 'registration'),
          eq(tournaments.status, 'in_progress')
        )
      )
      .limit(100); // محدود کردن برای عملکرد بهتر

    dynamicRoutes = activeTournaments.map((tournament) => ({
      url: `${baseUrl}/tournaments/${tournament.id}`,
      lastModified: tournament.updatedAt || new Date(),
      changeFrequency: 'hourly' as const,
      priority: 0.9,
    }));

    // اضافه کردن تورنمنت‌های تمام‌شده (با اولویت کمتر)
    const completedTournaments = await db
      .select({
        id: tournaments.id,
        updatedAt: tournaments.updatedAt,
      })
      .from(tournaments)
      .where(eq(tournaments.status, 'completed'))
      .limit(50);

    const completedRoutes = completedTournaments.map((tournament) => ({
      url: `${baseUrl}/tournaments/${tournament.id}`,
      lastModified: tournament.updatedAt || new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }));

    dynamicRoutes = [...dynamicRoutes, ...completedRoutes];
  } catch (error) {
    console.error('Error generating dynamic sitemap:', error);
    // در صورت خطا، فقط صفحات ثابت برگردانده می‌شود
  }

  return [...staticRoutes, ...dynamicRoutes];
}
