import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { achievements, userAchievements } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth";

// Default achievements
const DEFAULT_ACHIEVEMENTS = [
  { name: "First Win", nameFA: "اولین برد", description: "Win your first match", descriptionFA: "اولین مسابقه خود را ببرید", icon: "🏆", category: "wins", requirement: 1, points: 10 },
  { name: "5 Wins", nameFA: "۵ برد", description: "Win 5 matches", descriptionFA: "۵ مسابقه ببرید", icon: "⭐", category: "wins", requirement: 5, points: 25 },
  { name: "10 Wins", nameFA: "۱۰ برد", description: "Win 10 matches", descriptionFA: "۱۰ مسابقه ببرید", icon: "🌟", category: "wins", requirement: 10, points: 50 },
  { name: "25 Wins", nameFA: "۲۵ برد", description: "Win 25 matches", descriptionFA: "۲۵ مسابقه ببرید", icon: "💫", category: "wins", requirement: 25, points: 100 },
  { name: "First Tournament", nameFA: "اولین تورنومنت", description: "Join your first tournament", descriptionFA: "در اولین تورنومنت شرکت کنید", icon: "🎮", category: "tournaments", requirement: 1, points: 15 },
  { name: "Tournament Champion", nameFA: "قهرمان تورنومنت", description: "Win a tournament", descriptionFA: "یک تورنومنت ببرید", icon: "👑", category: "tournaments", requirement: 1, points: 200 },
  { name: "Rating 1200", nameFA: "امتیاز ۱۲۰۰", description: "Reach 1200 rating", descriptionFA: "به امتیاز ۱۲۰۰ برسید", icon: "📈", category: "rating", requirement: 1200, points: 30 },
  { name: "Rating 1400", nameFA: "امتیاز ۱۴۰۰", description: "Reach 1400 rating", descriptionFA: "به امتیاز ۱۴۰۰ برسید", icon: "🚀", category: "rating", requirement: 1400, points: 75 },
  { name: "Rating 1600", nameFA: "امتیاز ۱۶۰۰", description: "Reach 1600 rating", descriptionFA: "به امتیاز ۱۶۰۰ برسید", icon: "💎", category: "rating", requirement: 1600, points: 150 },
  { name: "Win Streak 3", nameFA: "۳ برد متوالی", description: "Win 3 matches in a row", descriptionFA: "۳ مسابقه متوالی ببرید", icon: "🔥", category: "special", requirement: 3, points: 40 },
];

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("session")?.value;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
    const ua = request.headers.get('user-agent') || 'unknown';
    let userId: string | null = null;

    if (token) {
      const user = await validateSession(token, ip, ua, request);
      userId = user?.id || null;
    }

    // Get all achievements
    let allAchievements = await db.select().from(achievements);

    // If no achievements, seed them
    if (allAchievements.length === 0) {
      allAchievements = await db
        .insert(achievements)
        .values(DEFAULT_ACHIEVEMENTS)
        .returning();
    }

    // Get user's unlocked achievements
    let unlockedIds: string[] = [];
    if (userId) {
      const userUnlocked = await db
        .select()
        .from(userAchievements)
        .where(eq(userAchievements.visibleUserId, userId));
      unlockedIds = userUnlocked.map((u) => u.achievementId);
    }

    const result = allAchievements.map((a) => ({
      ...a,
      unlocked: unlockedIds.includes(a.id),
    }));

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch achievements" }, { status: 500 });
  }
}
