import { MetadataRoute } from 'next';
import { db } from '@/db';
import { tournaments, teams } from '@/db/schema';
import { eq, or, desc } from 'drizzle-orm';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://gament1.ir';
  const now = new Date();

  const routes: MetadataRoute.Sitemap = [];

  // ==================== صفحات ثابت ====================
  const staticPages = [
    { path: '', priority: 1.0, freq: 'daily' as const },
    { path: '/tournaments', priority: 0.95, freq: 'hourly' as const },
    { path: '/leaderboard', priority: 0.92, freq: 'daily' as const },
    { path: '/judging', priority: 0.88, freq: 'daily' as const },
    { path: '/teams', priority: 0.82, freq: 'weekly' as const },
    { path: '/achievements', priority: 0.78, freq: 'weekly' as const },
    { path: '/honors', priority: 0.75, freq: 'weekly' as const },
    { path: '/players', priority: 0.72, freq: 'weekly' as const },
    { path: '/profile', priority: 0.7, freq: 'weekly' as const },
    { path: '/wallet', priority: 0.65, freq: 'weekly' as const },
    { path: '/about', priority: 0.6, freq: 'monthly' as const },
    { path: '/faq', priority: 0.6, freq: 'monthly' as const },
    { path: '/rules', priority: 0.55, freq: 'monthly' as const },
    { path: '/contact', priority: 0.5, freq: 'monthly' as const },
    { path: '/guide', priority: 0.5, freq: 'monthly' as const },
  ];

  staticPages.forEach(page => {
    routes.push({
      url: `${baseUrl}${page.path}`,
      lastModified: now,
      changeFrequency: page.freq,
      priority: page.priority,
    });
  });

  try {
    // ==================== تورنمنت‌ها ====================
    const activeTournaments = await db
      .select({ id: tournaments.id, updatedAt: tournaments.updatedAt })
      .from(tournaments)
      .where(or(eq(tournaments.status, 'registration'), eq(tournaments.status, 'in_progress')))
      .limit(200);

    activeTournaments.forEach(t => {
      routes.push({
        url: `${baseUrl}/tournaments/${t.id}`,
        lastModified: t.updatedAt || now,
        changeFrequency: 'hourly',
        priority: 0.93,
      });
    });

    const completedTournaments = await db
      .select({ id: tournaments.id, updatedAt: tournaments.updatedAt })
      .from(tournaments)
      .where(eq(tournaments.status, 'completed'))
      .orderBy(desc(tournaments.updatedAt))
      .limit(150);

    completedTournaments.forEach(t => {
      routes.push({
        url: `${baseUrl}/tournaments/${t.id}`,
        lastModified: t.updatedAt || now,
        changeFrequency: 'weekly',
        priority: 0.78,
      });
    });

    // ==================== تیم‌ها (createdAt دارد) ====================
    const teamList = await db
      .select({ id: teams.id, createdAt: teams.createdAt })
      .from(teams)
      .limit(100);

    teamList.forEach(team => {
      routes.push({
        url: `${baseUrl}/teams/${team.id}`,
        lastModified: team.createdAt || now,
        changeFrequency: 'weekly',
        priority: 0.72,
      });
    });

  } catch (error) {
    console.error('[SITEMAP] Error generating dynamic routes:', error);
  }

  return routes;
}
