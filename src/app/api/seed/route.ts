import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tournaments, players, registrations, judges, users } from "@/db/schema";
import { validateAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";


export async function POST(request: NextRequest) {
  // Seeding writes demo data straight into the database, so it must never be
  // open to the public. Require an authenticated admin.
  const { user, error, status } = await validateAdmin(request);
  if (!user) {
    return NextResponse.json({ error: error || "Unauthorized" }, { status: status || 401 });
  }
  try {
    // 1. Create sample users first (since registrations and players depend on them)
    const userNames = [
      "ShadowStrike", "BlazeFury", "FrostByte", "ThunderKing", "VortexGamer", 
      "NeonAssassin", "CyberWolf", "PhantomAce", "StormRider", "IronClaw", 
      "DarkMatter", "PixelKnight", "ZeroGravity", "EliteSniper", "GhostReaper", "MegaBlast"
    ];

    const sampleUsers = await db
      .insert(users)
      .values(userNames.map((name, i) => ({
        username: name.toLowerCase().replace(/\s+/g, ''),
        email: `${name.toLowerCase()}@example.com`,
        passwordHash: "hashed_password_here",
        displayName: name,
        phoneNumber: `09${Math.floor(100000000 + Math.random() * 900000000)}`, // فیلد اجباری موبایل
        flexaId: `FLX-SEED-${i + 1}`, // فیلد اجباری شناسه فلکسا
      })))
      .returning();

    // 2. Create sample judges
    const sampleJudges = await db
      .insert(judges)
      .values([
        { name: "Alex Morgan", email: "alex@gameforge.gg", role: "head_judge" },
        { name: "Sarah Chen", email: "sarah@gameforge.gg", role: "judge" },
        { name: "Marcus Williams", email: "marcus@gameforge.gg", role: "judge" },
      ])
      .returning();

    // 3. Create sample players linked to users
    const samplePlayers = await db
      .insert(players)
      .values([
        { username: "ShadowStrike", displayName: "Shadow Strike", rating: 1450, wins: 28, losses: 12, visibleUserId: sampleUsers[0].id },
        { username: "BlazeFury", displayName: "Blaze Fury", rating: 1380, wins: 22, losses: 15, visibleUserId: sampleUsers[1].id },
        { username: "FrostByte", displayName: "Frost Byte", rating: 1520, wins: 35, losses: 8, visibleUserId: sampleUsers[2].id },
        { username: "ThunderKing", displayName: "Thunder King", rating: 1290, wins: 18, losses: 20, visibleUserId: sampleUsers[3].id },
        { username: "VortexGamer", displayName: "Vortex Gamer", rating: 1410, wins: 25, losses: 14, visibleUserId: sampleUsers[4].id },
        { username: "NeonAssassin", displayName: "Neon Assassin", rating: 1350, wins: 20, losses: 16, visibleUserId: sampleUsers[5].id },
        { username: "CyberWolf", displayName: "Cyber Wolf", rating: 1480, wins: 30, losses: 10, visibleUserId: sampleUsers[6].id },
        { username: "PhantomAce", displayName: "Phantom Ace", rating: 1200, wins: 14, losses: 22, visibleUserId: sampleUsers[7].id },
        { username: "StormRider", displayName: "Storm Rider", rating: 1550, wins: 38, losses: 6, visibleUserId: sampleUsers[8].id },
        { username: "IronClaw", displayName: "Iron Claw", rating: 1320, wins: 19, losses: 18, visibleUserId: sampleUsers[9].id },
        { username: "DarkMatter", displayName: "Dark Matter", rating: 1440, wins: 27, losses: 13, visibleUserId: sampleUsers[10].id },
        { username: "PixelKnight", displayName: "Pixel Knight", rating: 1260, wins: 16, losses: 21, visibleUserId: sampleUsers[11].id },
        { username: "ZeroGravity", displayName: "Zero Gravity", rating: 1390, wins: 23, losses: 15, visibleUserId: sampleUsers[12].id },
        { username: "EliteSniper", displayName: "Elite Sniper", rating: 1500, wins: 32, losses: 9, visibleUserId: sampleUsers[13].id },
        { username: "GhostReaper", displayName: "Ghost Reaper", rating: 1340, wins: 21, losses: 17, visibleUserId: sampleUsers[14].id },
        { username: "MegaBlast", displayName: "Mega Blast", rating: 1180, wins: 12, losses: 24, visibleUserId: sampleUsers[15].id },
      ])
      .returning();

    // 4. Create sample tournaments
    const sampleTournaments = await db
      .insert(tournaments)
      .values([
        {
          name: "جام قهرمانان کلش رویال",
          game: "clash_royale" as const,
          format: "single_elimination",
          status: "registration",
          description: "بزرگترین تورنومنت کلش رویال! با بهترین بازیکنان رقابت کن و جایزه ببر.",
          maxPlayers: 16,
          prizePool: "۵ میلیون تومان",
          entryFee: "۵۰ هزار تومان",
          gameMode: "1v1 Friendly Battle",
          serverSlots: 16,
          prize1st: "۲.۵ میلیون",
          prize2nd: "۱ میلیون",
          prize3rd: "۵۰۰ هزار",
          prize4to10: "هر نفر ۱۰۰ هزار",
          rules: "۱. مسابقات به صورت ۱ در ۱ برگزار می‌شود\n۲. بهترین ۳ از ۵ مسابقه\n۳. استفاده از هر دک مجاز است\n۴. ارسال اسکرین‌شات نتیجه الزامی است\n۵. هرگونه تقلب = محرومیت دائم",
          startDate: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
        {
          name: "لیگ حرفه‌ای کالاف موبایل",
          game: "cod_mobile" as const,
          format: "single_elimination",
          status: "registration",
          description: "مسابقات حرفه‌ای COD Mobile - مهارت خودت رو نشون بده!",
          maxPlayers: 32,
          prizePool: "۱۰ میلیون تومان",
          entryFee: "۱۰۰ هزار تومان",
          gameMode: "Search & Destroy",
          mapName: "Nuketown",
          serverSlots: 32,
          prize1st: "۵ میلیون",
          prize2nd: "۲ میلیون",
          prize3rd: "۱ میلیون",
          prize4to10: "هر نفر ۲۰۰ هزار",
          rules: "۱. مود: Search & Destroy\n۲. مپ: Nuketown\n۳. بهترین ۵ از ۹ راند\n۴. استفاده از کنترلر ممنوع\n۵. UID باید صحیح باشد",
          startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        {
          name: "تورنومنت فورتنایت بتل رویال",
          game: "fortnite" as const,
          format: "single_elimination",
          status: "registration",
          description: "بتل رویال فورتنایت - بساز، بجنگ، ببر! 🏗️",
          maxPlayers: 64,
          prizePool: "۷ میلیون تومان",
          entryFee: "رایگان",
          gameMode: "Solo Battle Royale",
          mapName: "Chapter 5 Map",
          serverSlots: 100,
          prize1st: "۳ میلیون",
          prize2nd: "۱.۵ میلیون",
          prize3rd: "۱ میلیون",
          prize4to10: "هر نفر ۱۵۰ هزار",
          rules: "۱. مود: Solo Battle Royale\n۲. امتیازدهی: Kill Points + Placement\n۳. چیت = بن دائم\n۴. آیدی Epic Games الزامی\n۵. نتایج با اسکرین‌شات تأیید می‌شود",
          startDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
      ])
      .returning();

    // 5. Register some players to tournaments
    const regsData = [];
    // Register first 8 players to Clash Royale
    for (let i = 0; i < 8; i++) {
      regsData.push({
        tournamentId: sampleTournaments[0].id,
        playerId: samplePlayers[i].id,
        visibleUserId: sampleUsers[i].id,
      });
    }
    // Register next 8 to COD Mobile
    for (let i = 0; i < 8; i++) {
      regsData.push({
        tournamentId: sampleTournaments[1].id,
        playerId: samplePlayers[i + 4].id,
        visibleUserId: sampleUsers[i + 4].id,
      });
    }
    // Register 8 to Fortnite
    for (let i = 0; i < 8; i++) {
      regsData.push({
        tournamentId: sampleTournaments[2].id,
        playerId: samplePlayers[i + 8].id,
        visibleUserId: sampleUsers[i + 8].id,
      });
    }

    await db.insert(registrations).values(regsData);

    return NextResponse.json({
      message: "Seed data created successfully",
      judges: sampleJudges.length,
      players: samplePlayers.length,
      tournaments: sampleTournaments.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to seed data" }, { status: 500 });
  }
}
