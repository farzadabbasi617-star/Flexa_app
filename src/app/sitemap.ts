import { MetadataRoute } from 'next';
import { db } from '@/db';
import { tournaments, teams, players, honors } from '@/db/schema';
import { eq, or, desc } from 'drizzle-orm';

import { SITE_URL } from '@/lib/seo';
import { gameLandings } from '@/lib/game-landing';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;
  const now = new Date();

  const routes: MetadataRoute.Sitemap = [];

  // ==================== صفحات ثابت ====================
  const staticPages = [
    { path: '', priority: 1.0, freq: 'daily' as const },
    { path: '/tournaments', priority: 0.95, freq: 'hourly' as const },
    { path: '/games', priority: 0.88, freq: 'weekly' as const },
    { path: '/leaderboard', priority: 0.92, freq: 'daily' as const },
    { path: '/judging', priority: 0.88, freq: 'daily' as const },
    { path: '/teams', priority: 0.82, freq: 'weekly' as const },
    { path: '/achievements', priority: 0.78, freq: 'weekly' as const },
    { path: '/honors', priority: 0.75, freq: 'weekly' as const },
    { path: '/players', priority: 0.72, freq: 'weekly' as const },
    { path: '/about', priority: 0.6, freq: 'monthly' as const },
    { path: '/faq', priority: 0.6, freq: 'monthly' as const },
    { path: '/rules', priority: 0.55, freq: 'monthly' as const },
    { path: '/contact', priority: 0.5, freq: 'monthly' as const },
    { path: '/support', priority: 0.45, freq: 'monthly' as const },
    { path: '/guide/tournaments', priority: 0.5, freq: 'monthly' as const },
    { path: '/guide/wallet', priority: 0.45, freq: 'monthly' as const },
  ];

  staticPages.forEach(page => {
    routes.push({
      url: `${baseUrl}${page.path}`,
      lastModified: now,
      changeFrequency: page.freq,
      priority: page.priority,
    });
  });

  gameLandings.forEach(game => {
    routes.push({
      url: `${baseUrl}/games/${game.slug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.86,
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

    // ==================== بازیکنان عمومی ====================
    const playerList = await db
      .select({ id: players.id, createdAt: players.createdAt })
      .from(players)
      .orderBy(desc(players.createdAt))
      .limit(200);

    playerList.forEach(player => {
      routes.push({
        url: `${baseUrl}/players/${player.id}`,
        lastModified: player.createdAt || now,
        changeFrequency: 'weekly',
        priority: 0.62,
      });
    });

    // ==================== تالار افتخارات / اخبار منتشرشده ====================
    const honorList = await db
      .select({ id: honors.id, updatedAt: honors.updatedAt })
      .from(honors)
      .where(eq(honors.status, 'published'))
      .orderBy(desc(honors.updatedAt))
      .limit(100);

    honorList.forEach(honor => {
      routes.push({
        url: `${baseUrl}/honors/${honor.id}`,
        lastModified: honor.updatedAt || now,
        changeFrequency: 'weekly',
        priority: 0.66,
      });
    });

  } catch (error) {
    console.error('[SITEMAP] Error generating dynamic routes:', error);
  }

  return routes;
}
