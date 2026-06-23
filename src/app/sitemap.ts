import { MetadataRoute } from 'next';
import { db } from '@/db';
import { 
  tournaments, 
  users, 
  teams, 
  achievements, 
  honors, 
  matches 
} from '@/db/schema';
import { eq, or, inArray, desc } from 'drizzle-orm';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://gament1.ir';

  // ==================== صفحات ثابت ====================
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/tournaments`, lastModified: new Date(), changeFrequency: 'hourly', priority: 0.95 },
    { url: `${baseUrl}/leaderboard`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/judging`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.85 },
    { url: `${baseUrl}/teams`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/profile`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.75 },
    { url: `${baseUrl}/wallet`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/achievements`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/honors`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.65 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/faq`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${baseUrl}/rules`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.55 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/guide`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/players`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.65 },
  ];

  const allRoutes: MetadataRoute.Sitemap = [...staticRoutes];

  try {
    // ==================== تورنمنت‌ها (داینامیک) ====================
    const activeTournaments = await db
      .select({ id: tournaments.id, updatedAt: tournaments.updatedAt, status: tournaments.status })
      .from(tournaments)
      .where(or(eq(tournaments.status, 'registration'), eq(tournaments.status, 'in_progress')))
      .limit(150);

    const completedTournaments = await db
      .select({ id: tournaments.id, updatedAt: tournaments.updatedAt })
      .from(tournaments)
      .where(eq(tournaments.status, 'completed'))
      .orderBy(desc(tournaments.updatedAt))
      .limit(100);

    activeTournaments.forEach(t => {
      allRoutes.push({
        url: `${baseUrl}/tournaments/${t.id}`,
        lastModified: t.updatedAt || new Date(),
        changeFrequency: 'hourly',
        priority: 0.92,
      });
    });

    completedTournaments.forEach(t => {
      allRoutes.push({
        url: `${baseUrl}/tournaments/${t.id}`,
        lastModified: t.updatedAt || new Date(),
        changeFrequency: 'weekly',
        priority: 0.75,
      });
    });

    // ==================== تیم‌ها ====================
    const activeTeams = await db
      .select({ id: teams.id, updatedAt: teams.updatedAt })
      .from(teams)
      .limit(80);

    activeTeams.forEach(team => {
      allRoutes.push({
        url: `${baseUrl}/teams/${team.id}`,
        lastModified: team.updatedAt || new Date(),
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    });

    // ==================== دستاوردها ====================
    const publicAchievements = await db
      .select({ id: achievements.id, updatedAt: achievements.updatedAt })
      .from(achievements)
      .limit(60);

    publicAchievements.forEach(ach => {
      allRoutes.push({
        url: `${baseUrl}/achievements/${ach.id}`,
        lastModified: ach.updatedAt || new Date(),
        changeFrequency: 'weekly',
        priority: 0.65,
      });
    });

    // ==================== افتخارات (Honors) ====================
    const publicHonors = await db
      .select({ id: honors.id, updatedAt: honors.updatedAt })
      .from(honors)
      .where(eq(honors.status, 'approved'))
      .limit(50);

    publicHonors.forEach(honor => {
      allRoutes.push({
        url: `${baseUrl}/honors/${honor.id}`,
        lastModified: honor.updatedAt || new Date(),
        changeFrequency: 'weekly',
        priority: 0.6,
      });
    });

    // ==================== مسابقه‌ها (Matches) ====================
    const recentMatches = await db
      .select({ id: matches.id, updatedAt: matches.updatedAt })
      .from(matches)
      .where(eq(matches.status, 'completed'))
      .orderBy(desc(matches.updatedAt))
      .limit(80);

    recentMatches.forEach(match => {
      allRoutes.push({
        url: `${baseUrl}/matches/${match.id}`,
        lastModified: match.updatedAt || new Date(),
        changeFrequency: 'weekly',
        priority: 0.55,
      });
    });

  } catch (error) {
    console.error('Error generating full dynamic sitemap:', error);
  }

  return allRoutes;
}
