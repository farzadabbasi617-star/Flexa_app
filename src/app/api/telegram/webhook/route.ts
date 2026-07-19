import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { and, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { classifiedAds, classifiedScrapeLogs, clash1v1Entries, couponRedemptions, coupons, disputes, matchEvidence, matchResultClaims, matches, players, registrations, telegramAccounts, telegramCampaignEvents, telegramLinkCodes, telegramPreRegistrations, telegramReferrals, telegramSentNotifications, tickets, ticketMessages, tournamentWaitlist, tournaments, transactions, users, wallets, honors, honorLikes, honorViews } from "@/db/schema";
import { normalizeDigits, normalizePhoneNumber } from "@/lib/phone";
import { notifyLinkedUserOnTelegram, publishHonorToTelegramChannel, publishTournamentToTelegramChannel, telegramApi } from "@/lib/telegram";
import { getGameIdGuide, gameGuideKeyboard } from "./guide";
import { bigIntFromText, formatTomanFromRial, parseTomanToRial, rialToTomanNumber } from "@/lib/money";
import { getEntryFeeRial } from "@/lib/tournament-finance";
import { createWalletReference, sanitizeWalletNote, validateDepositAmountRial } from "@/lib/wallet-security";
import { evaluateUserAchievements, achievementProgressForUser } from "@/lib/achievement-service";
import { LevelingService } from "@/lib/leveling-service";
import { CLASH_1V1_CONFIG, ensureClash1v1Schema, finalizeMatchResult } from "@/lib/clash-1v1";
import { resolveMatchResultClaims, type MatchResultClaimValue } from "@/lib/match-result-policy";
import { CLASH_PRIVATE_DRAFT_CATEGORY } from "@/lib/clash-private-tournament";
import {
  ensurePrivateTournamentAttendanceSchema,
  privateCancellationKeepsEntryFee,
  PRIVATE_NO_SHOW_POLICY_TEXT,
} from "@/lib/private-tournament-attendance";
import {
  ClashRoyaleApiError,
  getClashRoyaleApiConfiguration,
  normalizeClashRoyaleTag,
  verifyClashRoyaleHeadToHead,
} from "@/lib/clash-royale-api";
import { rateLimit } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import type { SessionData, TelegramCallbackQuery, TelegramMessage, TelegramUpdate, TelegramUser } from "./types";
import { APP_URL, CANCEL_TEXT, CHANNEL_URL, DEFAULT_RULES, GAMENT_ID_REQUIRED, PLATFORM_OPTIONS, SKIP_TEXT } from "./config";
import { validateWebhookSecret } from "./security";
import { extractInviteReference, gameLabel, gamePrompt, generateLinkCode, html, isValidGamentId, linkCodeHash, normalizeGame, normalizeGamentId } from "./utils";
import { confirmKeyboard, gameKeyboard, mainMenuKeyboard, platformKeyboard, removeKeyboard, replyKeyboard, roomsKeyboard } from "./keyboards";
import { answerCallback, editMessage, sendDocument, sendMessage, sendPhoto } from "./transport";
import { clearSession, getSession, registrationSummary, setSession } from "./sessions";
import { ensureFeatureEnabled, telegramFeatureEnabled } from "./settings";
import { isChannelMember, promptChannelMembership } from "./membership";
import { getLinkedUserByTelegram } from "./user-service";
import { aiCommand } from "./commands/ai";
import {
  cancelClash1v1Queue,
  ensureClash1v1QueueTournament,
  openClash1v1Queue,
  promptClash1v1Qr,
  registerClash1v1Queue,
  markClash1v1Ready,
  showClash1v1ModeMenu,
  showClash1v1StakeMenu,
  sendClashFriendLinkGuide,
  submitClash1v1Qr,
} from "./commands/clash-1v1";
import { isSupportedClashInvite } from "./commands/clash-1v1-policy";
import {
  acceptFriendChallenge,
  closeFriendChallenge,
  counterFriendChallengeMode,
  createClashFriendChallenge,
  openClashFriendChallenge,
  showFriendChallengeModeMenu,
} from "./commands/clash-friend-duel";
import {
  clashBattleMatchesExpectedMode,
  clashDuelModeLabel,
  isClashDuelGameMode,
  isClashDuelOpponentType,
  isClashDuelStakeMode,
} from "@/lib/clash-duel-policy";
import { getAdminIds, hasAdminAccess } from "./admin-access";
import { downloadTelegramPhotoAsDataUrl, downloadTelegramQrPhoto } from "./files";
import { parseTelegramCommand } from "./command-router";
import {
  claimTelegramUpdate,
  completeTelegramUpdate,
  ensureTelegramReliabilitySchema,
  failTelegramUpdate,
  type TelegramUpdateClaim,
} from "@/lib/telegram-reliability";
import { shouldRetryTelegramUpdate } from "@/lib/telegram-reliability-policy";

export const dynamic = "force-dynamic";

function isFreeEntryFee(entryFee?: string | null) {
  const value = normalizeDigits(entryFee || "").trim().toLowerCase();
  if (!value || value === "0") return true;
  return ["رایگان", "free", "مجانی"].some((word) => value.includes(word));
}

async function getOrCreateUserPlayer(userId: string, fallbackName: string, username?: string | null) {
  const [existing] = await db.select().from(players).where(eq(players.visibleUserId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(players)
    .values({
      visibleUserId: userId,
      username: username || fallbackName || `player_${userId.slice(0, 6)}`,
      displayName: fallbackName || username || "Gament Player",
    })
    .returning();
  return created;
}

async function getOrCreateWallet(userId: string, tx: any = db) {
  const [existing] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(wallets).values({ userId, balance: "0", currency: "RIAL" }).returning();
  return created;
}


async function notifyAdminsOnWalletDeposit(user: TelegramUser, userId: string, amountRial: bigint, txId: string) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;
  const username = user.username ? `@${user.username}` : "—";
  const text = [
    "💳 <b>فیش واریز جدید از ربات</b>",
    "",
    `مبلغ: <b>${html(formatTomanFromRial(amountRial))}</b>`,
    `Telegram: <code>${html(user.id)}</code> | ${html(username)}`,
    `User ID: <code>${html(userId)}</code>`,
    `Transaction: <code>${html(txId)}</code>`,
    "",
    "برای مشاهده فیش و تأیید/رد وارد پنل کیف پول شو.",
  ].join("\n");
  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, { inline_keyboard: [[{ text: "پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
  }
}

async function startWalletDeposit(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت فیش واریز، اول حساب تلگرامت را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  await setSession(telegramId, "wallet_deposit_amount", {});
  await sendMessage(chatId, "💳 <b>ثبت فیش واریز کارت‌به‌کارت</b>\n\nمبلغ واریزی را به تومان وارد کن. مثال: <code>500000</code> یا <code>500,000</code>", replyKeyboard([[CANCEL_TEXT]]));
}

async function rewardUserXP(userId: string, amount: number, reason: string) {
  try {
    const result = await db.transaction(async (tx) => LevelingService.addXP(tx, userId, amount));
    return `\n🎁 +${amount} XP (${reason}) — Level ${result.level}`;
  } catch (err) {
    logger.warn({ err, userId, amount, reason }, "Failed to reward XP");
    return "";
  }
}

async function findLinkedUserId(gamentId: string | undefined, phoneNumber: string) {
  const conditions = [];
  if (gamentId) conditions.push(eq(users.gamentId, gamentId));
  if (/^09\d{9}$/.test(phoneNumber)) conditions.push(eq(users.phoneNumber, phoneNumber));
  if (!conditions.length) return null;

  const [linkedUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(conditions.length === 1 ? conditions[0] : or(...conditions))
    .limit(1);

  return linkedUser?.id || null;
}

async function savePreRegistration(user: TelegramUser, data: SessionData) {
  const phoneNumber = normalizePhoneNumber(data.phoneNumber || "");
  const gamentId = data.gamentId ? normalizeGamentId(data.gamentId) : null;
  const linkedUserId = await findLinkedUserId(gamentId || undefined, phoneNumber);
  const values = {
    telegramId: String(user.id),
    telegramUsername: user.username || null,
    telegramFirstName: user.first_name || null,
    telegramLastName: user.last_name || null,
    linkedUserId,
    gamentId,
    fullName: (data.fullName || "").slice(0, 100),
    phoneNumber,
    game: normalizeGame(data.game),
    platform: data.platform || null,
    gamerTag: (data.gamerTag || "").slice(0, 100),
    city: data.city || null,
    teamName: data.teamName || null,
    status: "new",
    source: "telegram_webhook",
    rawPayload: { source: "telegram_webhook", data, telegramUser: user },
    updatedAt: new Date(),
  };

  await db
    .insert(telegramPreRegistrations)
    .values(values)
    .onConflictDoUpdate({
      target: telegramPreRegistrations.telegramId,
      set: values,
    });

  await notifyAdminsOnPreRegistration(user, data, linkedUserId).catch((err) => {
    logger.warn({ err, telegramId: user.id }, "Failed to notify Telegram admins about pre-registration");
  });
}

async function recordReferralIfNeeded(user: TelegramUser, startPayload?: string) {
  if (!startPayload) return;
  const payload = startPayload.trim().slice(0, 100);
  const referredTelegramId = String(user.id);

  if (payload.startsWith("ref_")) {
    const referrerTelegramId = payload.replace("ref_", "").trim();
    if (/^\d+$/.test(referrerTelegramId) && referrerTelegramId !== referredTelegramId) {
      const [created] = await db
        .insert(telegramReferrals)
        .values({
          referrerTelegramId,
          referredTelegramId,
          referredUsername: user.username || null,
        })
        .onConflictDoNothing({ target: telegramReferrals.referredTelegramId })
        .returning({ id: telegramReferrals.id });
      if (created) {
        const referrer = await getLinkedUserByTelegram(referrerTelegramId);
        if (referrer?.userId) {
          const key = `referral:first:${referrerTelegramId}:${referredTelegramId}`;
          const [existingReward] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
          if (!existingReward) {
            await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId: referrerTelegramId, type: "referral_reward" });
            const xpText = await rewardUserXP(referrer.userId, 30, "دعوت کاربر جدید");
            const chatId = Number(referrerTelegramId);
            if (Number.isFinite(chatId)) await sendMessage(chatId, `🎉 یک نفر با لینک دعوت شما وارد ربات شد.${xpText}`);
          }
        }
      }
    }
    return;
  }

  if (payload.startsWith("campaign_") || payload.startsWith("streamer_") || payload.startsWith("utm_")) {
    await db.insert(telegramCampaignEvents).values({
      campaign: payload,
      telegramId: referredTelegramId,
      telegramUsername: user.username || null,
      eventType: "start",
      rawPayload: { firstName: user.first_name || null, lastName: user.last_name || null },
    });
  }
}


function normalizeStartPayload(value?: string) {
  return decodeURIComponent(value || "").trim().slice(0, 120).replace(/\s+/g, "_");
}

function deepLinkKeyboard(url: string, label = "باز کردن در Gament") {
  return {
    inline_keyboard: [
      [{ text: label, web_app: { url } }],
      [{ text: "باز کردن در مرورگر", url }],
      [{ text: "منوی اصلی ربات", callback_data: "menu:home" }],
    ],
  };
}

async function handleStartPayload(chatId: number, telegramId: string, user: TelegramUser, rawPayload?: string) {
  const payload = normalizeStartPayload(rawPayload);
  if (!payload || payload.startsWith("ref_") || payload.startsWith("campaign_") || payload.startsWith("streamer_") || payload.startsWith("utm_")) return false;

  if (["wallet", "wallet_deposit", "deposit", "charge"].includes(payload)) {
    if (payload === "deposit" || payload === "wallet_deposit" || payload === "charge") {
      await startWalletDeposit(chatId, telegramId);
      return true;
    }
    await walletCommand(chatId, telegramId);
    return true;
  }

  if (payload === "profile") {
    await profileCommand(chatId, telegramId);
    return true;
  }
  if (payload === "register") {
    await registerStart(chatId, telegramId);
    return true;
  }
  if (payload === "rooms" || payload === "tournaments") {
    await roomsCommand(chatId);
    return true;
  }
  if (payload === "missions") {
    await missionsCommand(chatId, telegramId);
    return true;
  }
  if (payload === "invite") {
    await inviteCommand(chatId, telegramId);
    return true;
  }

  if (payload === "honors" || payload === "honor_latest") {
    const [latest] = await db.select({ id: honors.id, title: honors.title, type: honors.type }).from(honors).where(eq(honors.status, "approved")).orderBy(desc(honors.publishedAt), desc(honors.createdAt)).limit(1);
    const url = latest ? `${APP_URL}/honors/${latest.id}` : `${APP_URL}/honors`;
    await sendMessage(
      chatId,
      latest ? `🏛 <b>آخرین خبر/افتخار Gament</b>\n\n${html(latest.title)}` : "🏛 تالار افتخارات Gament",
      deepLinkKeyboard(url, latest ? "مشاهده آخرین خبر" : "مشاهده تالار افتخارات")
    );
    return true;
  }

  if (payload === "link") {
    await linkCommand(chatId, user);
    return true;
  }

  const friendDuelToken = payload.match(/^duel_([A-Za-z0-9_-]{20,40})$/)?.[1];
  if (friendDuelToken) {
    await openClashFriendChallenge(chatId, telegramId, friendDuelToken);
    return true;
  }

  const qrTournamentId = payload.match(/^qr_([0-9a-f-]{36})$/i)?.[1];
  if (qrTournamentId) {
    await startClashQrSubmission(chatId, telegramId, qrTournamentId);
    return true;
  }

  const tournamentId = payload.match(/^(?:tournament|t)_([0-9a-f-]{36})$/i)?.[1];
  if (tournamentId) {
    const [tournament] = await db.select({ id: tournaments.id, name: tournaments.name, game: tournaments.game, status: tournaments.status, entryFee: tournaments.entryFee, startDate: tournaments.startDate }).from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
    const url = `${APP_URL}/tournaments/${tournamentId}`;
    await sendMessage(
      chatId,
      tournament
        ? `🏆 <b>${html(tournament.name)}</b>\n\n🎮 ${html(gameLabel(tournament.game))}\nوضعیت: <b>${html(tournament.status)}</b>\nورودی: <b>${html(tournament.entryFee || "رایگان")}</b>${tournament.startDate ? `\nشروع: <b>${new Date(tournament.startDate).toLocaleString("fa-IR")}</b>` : ""}`
        : "🏆 این تورنومنت در Gament باز می‌شود.",
      deepLinkKeyboard(url, tournament?.status === "registration" ? "ثبت‌نام / مشاهده تورنومنت" : "مشاهده تورنومنت")
    );
    return true;
  }

  const honorId = payload.match(/^(?:honor|h)_([a-zA-Z0-9-]{3,80})$/)?.[1];
  if (honorId) {
    const uuidLike = /^[0-9a-f-]{36}$/i.test(honorId);
    const row = uuidLike ? (await db.select({ id: honors.id, title: honors.title, type: honors.type, game: honors.game }).from(honors).where(eq(honors.id, honorId)).limit(1))[0] : null;
    const url = `${APP_URL}/honors/${honorId}`;
    await sendMessage(
      chatId,
      row
        ? `🏛 <b>${html(row.title)}</b>\n\nنوع: <b>${html(row.type)}</b>${row.game ? `\nبازی: <b>${html(row.game)}</b>` : ""}\n\nبرای خواندن کامل، لایک و مشاهده آمار وارد Gament شو.`
        : "🏛 این خبر/افتخار در تالار افتخارات Gament باز می‌شود.",
      deepLinkKeyboard(url, "مشاهده خبر / افتخار")
    );
    return true;
  }

  await sendMessage(chatId, "لینک ورودی را متوجه نشدم؛ منوی اصلی را باز کردم.", mainMenuKeyboard());
  return true;
}

function telegramStartLink(payload: string) {
  const username = process.env.TELEGRAM_BOT_USERNAME || "FlexaTournamentBot";
  return `https://t.me/${username}?start=${encodeURIComponent(payload)}`;
}

async function deepLinksCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = [
    ["کیف پول", telegramStartLink("wallet")],
    ["ثبت فیش", telegramStartLink("deposit")],
    ["تورنومنت‌ها", telegramStartLink("tournaments")],
    ["تالار افتخارات", telegramStartLink("honor_latest")],
    ["مأموریت‌ها", telegramStartLink("missions")],
    ["اتصال حساب", telegramStartLink("link")],
  ];
  await sendMessage(chatId, ["🔗 <b>Deep Linkهای آماده ربات</b>", "", ...rows.map(([label, link]) => `<b>${label}</b>\n<code>${html(link)}</code>`)].join("\n\n"));
}

async function startCommand(chatId: number) {
  await sendMessage(
    chatId,
    `سلام 👋\nبه <b>Gament — پلتفرم تورنومنت گیمینگ</b> خوش آمدی.\n\nاز اینجا می‌تونی روم‌های فعال رو ببینی، پیش‌ثبت‌نام کنی و لینک‌های مهم گیمنت رو دریافت کنی.\n\nثبت‌نام قطعی، پرداخت ورودی احتمالی، مشاهده لابی و داوری نهایی از داخل وب‌اپ انجام می‌شود.`,
    mainMenuKeyboard()
  );
}

async function linksCommand(chatId: number) {
  const rows: Array<Array<Record<string, string>>> = [
    [{ text: "⚡ وب‌اپ Gament", url: APP_URL }],
    [{ text: "🏟 تورنومنت‌ها", url: `${APP_URL}/tournaments` }],
    [{ text: "🆕 ساخت حساب", url: `${APP_URL}/register` }],
    [{ text: "👤 پروفایل", url: `${APP_URL}/profile` }],
  ];
  if (CHANNEL_URL) rows.push([{ text: "📣 کانال Gament Games", url: CHANNEL_URL }]);
  await sendMessage(chatId, "🔗 لینک‌های مهم Gament:", { inline_keyboard: rows });
}

async function channelCommand(chatId: number) {
  if (!CHANNEL_URL) {
    await sendMessage(chatId, "لینک کانال هنوز تنظیم نشده است.", mainMenuKeyboard());
    return;
  }
  await sendMessage(chatId, "📣 کانال رسمی Gament Games:", {
    inline_keyboard: [[{ text: "ورود به کانال", url: CHANNEL_URL }]],
  });
}

async function rulesCommand(chatId: number) {
  await sendMessage(chatId, html(DEFAULT_RULES) + `\n\n🏟 روم‌ها: ${html(`${APP_URL}/tournaments`)}`, mainMenuKeyboard());
}

async function registerStart(chatId: number, telegramId: string) {
  if (!(await isChannelMember(telegramId))) {
    await promptChannelMembership(chatId);
    return;
  }
  await setSession(telegramId, "idle", {});
  await sendMessage(
    chatId,
    "🎮 <b>پیش‌ثبت‌نام تلگرامی Gament</b>\n\nبازی موردنظر را انتخاب کن.\n\nنکته: ثبت‌نام قطعی و پرداخت ورودی احتمالی از داخل وب‌اپ انجام می‌شود.",
    gameKeyboard()
  );
}

async function roomsCommand(chatId: number, gameFilter?: string) {
  const game = normalizeGame(gameFilter);
  const where = game ? and(eq(tournaments.status, "registration"), eq(tournaments.game, game as "cod_mobile" | "fortnite" | "clash_royale")) : eq(tournaments.status, "registration");
  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      game: tournaments.game,
      gameMode: tournaments.gameMode,
      maxPlayers: tournaments.maxPlayers,
      prizePool: tournaments.prizePool,
      entryFee: tournaments.entryFee,
      status: tournaments.status,
      categoryLabel: tournaments.categoryLabel,
      registeredCount: count(registrations.id),
    })
    .from(tournaments)
    .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
    .where(where)
    .groupBy(tournaments.id)
    .orderBy(desc(tournaments.createdAt))
    .limit(10);

  const visibleRows = rows.filter((row) => row.categoryLabel !== CLASH_1V1_CONFIG.categoryLabel);
  if (!visibleRows.length) {
    await sendMessage(chatId, "فعلاً روم فعالی پیدا نشد. از وب‌اپ هم می‌تونی آخرین وضعیت رو ببینی:", {
      inline_keyboard: [[{ text: "🏟 مشاهده روم‌ها", url: `${APP_URL}/tournaments` }]],
    });
    return;
  }

  const text = [
    "🏟 <b>روم‌های فعال Gament</b>",
    "",
    ...visibleRows.map((row, index) => [
      `<b>${index + 1}. ${html(row.name || "روم Gament")}</b>`,
      `🎮 ${html(gameLabel(row.game))} | ${html(row.gameMode || "مود اعلام نشده")}`,
      `👥 ظرفیت: <b>${row.registeredCount}/${row.maxPlayers}</b>`,
      `💳 ورودی: <b>${html(row.entryFee || "رایگان")}</b>`,
      `🏆 جایزه: <b>${html(row.prizePool || "اعلام نشده")}</b>`,
    ].join("\n")),
    "",
    "برای ثبت‌نام قطعی وارد وب‌اپ شو.",
  ].join("\n\n");

  await sendMessage(chatId, text, roomsKeyboard(visibleRows));
}

async function clashPrivateTournamentsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  const rows = await db
    .select({
      id: tournaments.id,
      name: tournaments.name,
      status: tournaments.status,
      maxPlayers: tournaments.maxPlayers,
      entryFee: tournaments.entryFee,
      prizePool: tournaments.prizePool,
      gameMode: tournaments.gameMode,
      startDate: tournaments.startDate,
      registeredCount: count(registrations.id),
    })
    .from(tournaments)
    .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
    .where(and(
      eq(tournaments.categoryLabel, CLASH_PRIVATE_DRAFT_CATEGORY),
      inArray(tournaments.status, ["registration", "in_progress"]),
    ))
    .groupBy(tournaments.id)
    .orderBy(desc(tournaments.createdAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "فعلاً مسابقه چندنفره فعال کلش رویال نداریم.", {
      inline_keyboard: [[{ text: "🌐 مشاهده تورنمنت‌ها", url: `${APP_URL}/tournaments?game=clash_royale` }]],
    });
    return;
  }

  const myRegistrations = linked?.userId
    ? await db.select({ tournamentId: registrations.tournamentId, id: registrations.id, checkedInAt: registrations.checkedInAt })
        .from(registrations).where(eq(registrations.visibleUserId, linked.userId))
    : [];
  const registrationByTournament = new Map(myRegistrations.map((registration) => [registration.tournamentId, registration]));

  const text = [
    "🏅 <b>مسابقات چندنفره کلش رویال</b>",
    "",
    "🃏 مود: انتخاب کارت (Draft)",
    "⚖️ سطح کارت‌ها: Tournament Standard و برابر برای همه",
    "🏆 رتبه‌بندی: Leaderboard داخل Clash Royale",
    "",
    ...rows.map((row, index) => {
      const registration = registrationByTournament.get(row.id);
      const state = registration ? (registration.checkedInAt ? "✅ چک‌این‌شده" : "🎟 ثبت‌نام‌شده")
        : Number(row.registeredCount) >= row.maxPlayers ? "🔴 تکمیل ظرفیت" : "🟢 ثبت‌نام باز";
      return [
        `<b>${index + 1}) ${html(row.name)}</b>`,
        `👥 ${Number(row.registeredCount).toLocaleString("fa-IR")}/${row.maxPlayers.toLocaleString("fa-IR")} | ${state}`,
        `💳 ورودی: <b>${html(row.entryFee || "رایگان")}</b>`,
        `🎁 جایزه: <b>${html(row.prizePool || "طبق تعداد ثبت‌نام")}</b>`,
        row.startDate ? `⏰ شروع: <b>${html(new Date(row.startDate).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }))}</b>` : "⏰ زمان شروع: اعلام می‌شود",
      ].join("\n");
    }),
  ].join("\n\n");

  const keyboard: Array<Array<Record<string, string>>> = [];
  for (const row of rows) {
    const registration = registrationByTournament.get(row.id);
    const title = row.name.slice(0, 28);
    if (registration) {
      keyboard.push([
        { text: registration.checkedInAt ? `✅ ${title}` : `✅ چک‌این: ${title}`, callback_data: `checkin:${registration.id}` },
        { text: "🏟 ورود/رمز", callback_data: `mylobby:${row.id}` },
      ]);
    } else if (row.status === "registration" && Number(row.registeredCount) < row.maxPlayers) {
      keyboard.push([{ text: `🎟 ثبت‌نام: ${title}`, callback_data: `join:${row.id}` }]);
    }
    keyboard.push([{ text: `جزئیات: ${title}`, url: `${APP_URL}/tournaments/${row.id}` }]);
  }
  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function joinTournamentFromTelegram(chatId: number, telegramId: string, tournamentId: string, privatePolicyAccepted = false) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت‌نام مستقیم، اول حساب تلگرامت را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }], [{ text: "ورود به پروفایل", url: `${APP_URL}/profile` }]],
    });
    return;
  }

  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد یا حذف شده است.");
    return;
  }

  // Legacy room/channel buttons for the system Clash queue used `join:<id>`.
  // Route them into the dedicated atomic queue instead of the generic
  // tournament/coupon registration path.
  if (
    tournament.game === CLASH_1V1_CONFIG.game &&
    (tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel || tournament.name === CLASH_1V1_CONFIG.name)
  ) {
    await openClash1v1Queue(chatId, telegramId);
    return;
  }

  if (tournament.status !== "registration") {
    await sendMessage(chatId, "ثبت‌نام این تورنومنت در حال حاضر باز نیست.");
    return;
  }
  if (
    tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY &&
    (!linked.clashRoyaleId || linked.clashRoyaleStatus !== "verified")
  ) {
    await sendMessage(chatId, "برای مسابقه چندنفره کلش باید Player Tag شما توسط Supercell API تأیید شده باشد.", {
      inline_keyboard: [[{ text: "⚔️ ثبت و تأیید Player Tag", url: `${APP_URL}/profile/edit` }]],
    });
    return;
  }
  if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && !privatePolicyAccepted) {
    await sendMessage(chatId, `⚠️ <b>تأیید قانون مالی مسابقه</b>\n\n${html(PRIVATE_NO_SHOW_POLICY_TEXT)}`, {
      inline_keyboard: [
        [{ text: "✅ می‌پذیرم و ثبت‌نام می‌کنم", callback_data: `joinprivate:confirm:${tournament.id}` }],
        [{ text: "انصراف", callback_data: "menu:clash_private" }],
      ],
    });
    return;
  }

  await ensurePrivateTournamentAttendanceSchema();
  const entryFeeRial = getEntryFeeRial(tournament.entryFee);
  const isPaid = entryFeeRial > BigInt(0);
  const player = await getOrCreateUserPlayer(linked.userId, linked.displayName || linked.username || "Gament Player", linked.username);

  const result = await db.transaction(async (tx) => {
    const [{ value: registeredCount }] = await tx.select({ value: count() }).from(registrations).where(eq(registrations.tournamentId, tournamentId));
    if (registeredCount >= tournament.maxPlayers) return { ok: false as const, code: "FULL" };

    const [existing] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(and(eq(registrations.tournamentId, tournamentId), eq(registrations.visibleUserId, linked.userId)))
      .limit(1);
    if (existing) return { ok: false as const, code: "DUPLICATE" };

    let paymentText = "";
    let finalEntryFeeRial = entryFeeRial;
    let couponRedemptionId: string | null = null;
    let couponId: string | null = null;
    let discountRial = BigInt(0);

      if (isPaid) {
        const [activeCoupon] = await tx
          .select({
            redemptionId: couponRedemptions.id,
            couponId: coupons.id,
            code: coupons.code,
            discountPercent: coupons.discountPercent,
            expiresAt: coupons.expiresAt,
            game: coupons.game,
            couponTournamentId: coupons.tournamentId,
            maxUses: coupons.maxUses,
            usedCount: coupons.usedCount,
          })
          .from(couponRedemptions)
          .innerJoin(coupons, eq(couponRedemptions.couponId, coupons.id))
          .where(and(eq(couponRedemptions.userId, linked.userId), eq(couponRedemptions.status, "active"), eq(coupons.isActive, true)))
          .orderBy(desc(couponRedemptions.createdAt))
          .limit(1);

        const couponValid = activeCoupon
          && (!activeCoupon.expiresAt || new Date(activeCoupon.expiresAt) > new Date())
          && (!activeCoupon.game || activeCoupon.game === tournament.game)
          && (!activeCoupon.couponTournamentId || activeCoupon.couponTournamentId === tournament.id)
          && (!activeCoupon.maxUses || activeCoupon.usedCount < activeCoupon.maxUses)
          && activeCoupon.discountPercent > 0;

        if (couponValid) {
          couponRedemptionId = activeCoupon.redemptionId;
          couponId = activeCoupon.couponId;
          discountRial = (entryFeeRial * BigInt(activeCoupon.discountPercent)) / BigInt(100);
          finalEntryFeeRial = entryFeeRial - discountRial;
          paymentText += `\n🎟 کوپن <code>${html(activeCoupon.code)}</code>: <b>${activeCoupon.discountPercent}% تخفیف</b>`;
        }

        const wallet = await getOrCreateWallet(linked.userId, tx);
        
        // ATOMIC UPDATE: Use WHERE balance >= finalEntryFeeRial to prevent over-spending
        const updateResult = await tx.update(wallets)
          .set({ 
            balance: sql`${wallets.balance} - ${finalEntryFeeRial.toString()}`, 
            updatedAt: new Date() 
          })
          .where(and(
            eq(wallets.id, wallet.id),
            sql`${wallets.balance} >= ${finalEntryFeeRial.toString()}`
          ));

        if (updateResult.rowCount === 0) {
          // Fetch actual balance only on failure to show the user
          const [currentWallet] = await tx.select().from(wallets).where(eq(wallets.id, wallet.id)).limit(1);
          const actualBalance = currentWallet ? bigIntFromText(currentWallet.balance) : BigInt(0);
          
          return { 
            ok: false as const, 
            code: "INSUFFICIENT", 
            balance: actualBalance, 
            finalEntryFeeRial 
          };
        }

        if (couponRedemptionId && couponId) {
          await tx.update(couponRedemptions).set({ status: "used", tournamentId: tournament.id, discountRial: discountRial.toString(), usedAt: new Date() }).where(eq(couponRedemptions.id, couponRedemptionId));
          await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, couponId));
        }
        await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: finalEntryFeeRial.toString(),
          type: "entry_fee",
          status: "completed",
          referenceId: `telegram-entry-${tournamentId}-${linked.userId}-${Date.now()}`,
          metadata: {
            kind: "telegram_entry_fee",
            tournamentId,
            tournamentName: tournament.name,
            playerId: player.id,
            playerName: player.displayName,
            userId: linked.userId,
            telegramId,
            originalEntryFeeRial: entryFeeRial.toString(),
            discountRial: discountRial.toString(),
            couponRedemptionId,
          },
        });
        paymentText += `\n💳 ورودی از کیف پول کسر شد: <b>${html(formatTomanFromRial(finalEntryFeeRial))}</b>`;
      }

    const [registration] = await tx.insert(registrations).values({
      tournamentId,
      playerId: player.id,
      visibleUserId: linked.userId,
      attendanceStatus: "registered",
      cancellationPolicyAcceptedAt: tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? new Date() : null,
    }).returning();
    return { ok: true as const, paymentText, registrationId: registration.id };
  });

  if (!result.ok) {
    if (result.code === "FULL") {
      if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
        return sendMessage(chatId, "ظرفیت این مسابقه چندنفره تکمیل شده است. طبق قانون این مود، جایگزینی پس از غیبت انجام نمی‌شود.");
      }
      return sendMessage(chatId, "ظرفیت این تورنومنت تکمیل شده است. می‌خواهی در لیست انتظار قرار بگیری؟", {
        inline_keyboard: [[{ text: "🕒 ورود به لیست انتظار", callback_data: `waitlist:${tournament.id}` }]],
      });
    }
    if (result.code === "DUPLICATE") {
      if (tournament.game === "clash_royale" && tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel) {
        await sendMessage(chatId, "✅ شما قبلاً در 1V1 کلش رویال ثبت‌نام کرده‌اید. حالا پیوند دوستی را می‌گیریم تا حریف پیدا شود.");
        return startClashQrSubmission(chatId, telegramId, tournament.id);
      }
      return sendMessage(chatId, "شما قبلاً در این تورنومنت ثبت‌نام کرده‌اید.", {
        inline_keyboard: [[{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
      });
    }
    if (result.code === "INSUFFICIENT") {
      return sendMessage(chatId, `موجودی کیف پول کافی نیست.\nمبلغ لازم: <b>${html(formatTomanFromRial(result.finalEntryFeeRial || entryFeeRial))}</b>\nموجودی شما: <b>${html(formatTomanFromRial(result.balance || BigInt(0)))}</b>`, {
        inline_keyboard: [
          [{ text: "💳 ثبت فیش شارژ از همین بات", callback_data: "wallet:deposit" }],
          [{ text: "شارژ کیف پول در وب‌اپ", url: `${APP_URL}/wallet` }],
          [{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }],
        ],
      });
    }
    return sendMessage(chatId, "ثبت‌نام انجام نشد.");
  }

  await evaluateUserAchievements(linked.userId).catch(() => undefined);
  const xpText = await rewardUserXP(linked.userId, isPaid ? 25 : 15, isPaid ? "ثبت‌نام پولی" : "ثبت‌نام تورنومنت");

  const needsClashQr = tournament.game === "clash_royale"
    && tournament.categoryLabel === CLASH_1V1_CONFIG.categoryLabel
    && isPaid;
  const qrLine = needsClashQr ? "\n\n⚔️ مرحله بعد: از Clash Royale روی «اشتراک‌گذاری پیوند» بزن و پیوند دوستی را برای بات بفرست." : "";
  await sendMessage(chatId, `✅ ثبت‌نام شما در تورنومنت انجام شد.

🏆 <b>${html(tournament.name)}</b>
🎮 ${html(gameLabel(tournament.game))}${result.paymentText}${xpText}${qrLine}`, {
    inline_keyboard: [
      ...(needsClashQr ? [[{ text: "⚔️ 1V1 کلش رویال", callback_data: `qr:${tournament.id}` }]] : []),
      [{ text: "مشاهده تورنومنت", url: `${APP_URL}/tournaments/${tournament.id}` }],
    ],
  });

  if (needsClashQr) {
    await startClashQrSubmission(chatId, telegramId, tournament.id, result.registrationId);
  }
}

async function joinWaitlist(chatId: number, telegramId: string, tournamentId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای لیست انتظار، اول حساب را با /link وصل کن.");
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) return sendMessage(chatId, "تورنومنت پیدا نشد.");
  if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
    return sendMessage(chatId, "برای مسابقات چندنفره کلش جایگزینی پس از غیبت انجام نمی‌شود؛ لیست انتظار این مود غیرفعال است.");
  }
  const [existing] = await db
    .select({ id: tournamentWaitlist.id })
    .from(tournamentWaitlist)
    .where(and(eq(tournamentWaitlist.tournamentId, tournamentId), eq(tournamentWaitlist.userId, linked.userId), eq(tournamentWaitlist.status, "waiting")))
    .limit(1);
  if (!existing) {
    await db.insert(tournamentWaitlist).values({ tournamentId, userId: linked.userId, telegramId, status: "waiting" });
  }
  await sendMessage(chatId, `✅ شما در لیست انتظار <b>${html(tournament.name)}</b> قرار گرفتید. اگر ظرفیت آزاد شود اطلاع می‌دهیم.`);
}

async function notifyWaitlistSpot(tournamentId: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament || tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) return;
  const [{ value }] = await db.select({ value: count() }).from(registrations).where(eq(registrations.tournamentId, tournamentId));
  if (value >= tournament.maxPlayers) return;
  const [waiting] = await db
    .select()
    .from(tournamentWaitlist)
    .where(and(eq(tournamentWaitlist.tournamentId, tournamentId), eq(tournamentWaitlist.status, "waiting")))
    .orderBy(tournamentWaitlist.createdAt)
    .limit(1);
  if (!waiting?.telegramId) return;
  await db.update(tournamentWaitlist).set({ status: "notified", notifiedAt: new Date() }).where(eq(tournamentWaitlist.id, waiting.id));
  await sendMessage(Number(waiting.telegramId), `🎟 یک ظرفیت در تورنومنت <b>${html(tournament.name)}</b> آزاد شد.`, {
    inline_keyboard: [[{ text: "ثبت‌نام سریع", callback_data: `join:${tournament.id}` }]],
  });
}

async function statusCommand(chatId: number, telegramId: string) {
  const [row] = await db
    .select()
    .from(telegramPreRegistrations)
    .where(eq(telegramPreRegistrations.telegramId, telegramId))
    .limit(1);

  if (!row) {
    await sendMessage(chatId, "هنوز پیش‌ثبت‌نامی برای شما ثبت نشده است.", mainMenuKeyboard());
    return;
  }

  await sendMessage(
    chatId,
    [
      "👤 <b>وضعیت پیش‌ثبت‌نام شما</b>",
      "",
      `نام: <b>${html(row.fullName)}</b>`,
      `بازی: <b>${html(gameLabel(row.game))}</b>`,
      `آیدی بازی: <b>${html(row.gamerTag)}</b>`,
      row.gamentId ? `Gament ID: <code>${html(row.gamentId)}</code>` : "Gament ID: ثبت نشده",
      `وضعیت پیگیری: <b>${html(row.status)}</b>`,
    ].join("\n"),
    mainMenuKeyboard()
  );
}

async function linkCommand(chatId: number, user: TelegramUser) {
  const telegramId = String(user.id);
  const [existing] = await db
    .select({
      telegramId: telegramAccounts.telegramId,
      telegramUsername: telegramAccounts.telegramUsername,
      linkedAt: telegramAccounts.linkedAt,
      displayName: users.displayName,
      gamentId: users.gamentId,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(telegramLinkCodes).values({
    telegramId,
    codeHash: linkCodeHash(code),
    telegramUsername: user.username || null,
    telegramFirstName: user.first_name || null,
    telegramLastName: user.last_name || null,
    expiresAt,
  });

  const alreadyLinked = existing?.gamentId
    ? `\n\nاکنون به حساب <b>${html(existing.displayName || "Gament")}</b> با Gament ID <code>${html(existing.gamentId)}</code> لینک هستی. اگر کد جدید را در حساب دیگری وارد کنی، اتصال منتقل می‌شود.`
    : "";

  await sendMessage(
    chatId,
    [
      "🔗 <b>اتصال حساب تلگرام به Gament</b>",
      "",
      "کد زیر را داخل سایت Gament، صفحه پروفایل، بخش «اتصال تلگرام» وارد کن:",
      "",
      `<code>${code}</code>`,
      "",
      "⏳ اعتبار کد: ۱۰ دقیقه",
      alreadyLinked,
      "",
      "اگر هنوز حساب Gament نداری، اول ثبت‌نام کن و بعد همین کد را وارد کن.",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "👤 ورود به پروفایل و وارد کردن کد", url: `${APP_URL}/profile` }],
        [{ text: "🆕 ساخت حساب Gament", url: `${APP_URL}/register` }],
      ],
    }
  );
}

async function profileCommand(chatId: number, telegramId: string) {
  const [linked] = await db
    .select({
      telegramUsername: telegramAccounts.telegramUsername,
      linkedAt: telegramAccounts.linkedAt,
      displayName: users.displayName,
      username: users.username,
      userGamentId: users.gamentId,
      level: users.level,
      rankPoints: users.rankPoints,
      clashRoyaleUsername: users.clashRoyaleUsername,
      codMobileUsername: users.codMobileUsername,
      fortniteUsername: users.fortniteUsername,
    })
    .from(telegramAccounts)
    .leftJoin(users, eq(telegramAccounts.userId, users.id))
    .where(eq(telegramAccounts.telegramId, telegramId))
    .limit(1);

  if (linked?.userGamentId) {
    const lines = [
      "👤 <b>پروفایل Gament شما</b>",
      "",
      "✅ حساب تلگرام به حساب وب‌اپ لینک شده است.",
      `نام: <b>${html(linked.displayName || "—")}</b>`,
      `Username: <b>${html(linked.username || "—")}</b>`,
      `Gament ID: <code>${html(linked.userGamentId)}</code>`,
      `Level: <b>${linked.level}</b> | RP: <b>${linked.rankPoints}</b>`,
      linked.codMobileUsername ? `COD: <b>${html(linked.codMobileUsername)}</b>` : "",
      linked.clashRoyaleUsername ? `Clash Royale: <b>${html(linked.clashRoyaleUsername)}</b>` : "",
      linked.fortniteUsername ? `Fortnite: <b>${html(linked.fortniteUsername)}</b>` : "",
      "",
      "برای انتقال اتصال به حساب دیگر، در آن حساب وب‌اپ کد جدید /link را وارد کن.",
    ].filter(Boolean).join("\n");

    await sendMessage(chatId, lines, {
      inline_keyboard: [
        [{ text: "👤 باز کردن پروفایل در وب‌اپ", url: `${APP_URL}/profile` }],
        [{ text: "🏟 روم‌های فعال", url: `${APP_URL}/tournaments` }],
      ],
    });
    return;
  }

  const [row] = await db
    .select({
      preFullName: telegramPreRegistrations.fullName,
      preGame: telegramPreRegistrations.game,
      preGamerTag: telegramPreRegistrations.gamerTag,
      preGamentId: telegramPreRegistrations.gamentId,
      preStatus: telegramPreRegistrations.status,
      linkedUserId: telegramPreRegistrations.linkedUserId,
      displayName: users.displayName,
      username: users.username,
      userGamentId: users.gamentId,
      level: users.level,
      rankPoints: users.rankPoints,
      clashRoyaleUsername: users.clashRoyaleUsername,
      codMobileUsername: users.codMobileUsername,
      fortniteUsername: users.fortniteUsername,
    })
    .from(telegramPreRegistrations)
    .leftJoin(users, eq(telegramPreRegistrations.linkedUserId, users.id))
    .where(eq(telegramPreRegistrations.telegramId, telegramId))
    .limit(1);

  if (!row) {
    await sendMessage(
      chatId,
      "هنوز حساب تلگرام شما در Gament شناسایی نشده است. اول /register را بزن یا در وب‌اپ حساب بساز.",
      mainMenuKeyboard()
    );
    return;
  }

  const lines = [
    "👤 <b>پروفایل Gament شما</b>",
    "",
    row.linkedUserId ? "✅ حساب تلگرام به حساب وب‌اپ لینک شده است." : "⚠️ حساب وب‌اپ هنوز کامل لینک نشده؛ با Gament ID/شماره مشابه در سایت ثبت‌نام کن.",
    `نام: <b>${html(row.displayName || row.preFullName)}</b>`,
    `Username: <b>${html(row.username || "—")}</b>`,
    `Gament ID: <code>${html(row.userGamentId || row.preGamentId || "—")}</code>`,
    row.linkedUserId ? `Level: <b>${row.level}</b> | RP: <b>${row.rankPoints}</b>` : "",
    "",
    `آخرین بازی ثبت‌شده: <b>${html(gameLabel(row.preGame))}</b>`,
    `آیدی بازی: <b>${html(row.preGamerTag)}</b>`,
    `وضعیت پیش‌ثبت‌نام: <b>${html(row.preStatus)}</b>`,
    row.codMobileUsername ? `COD: <b>${html(row.codMobileUsername)}</b>` : "",
    row.clashRoyaleUsername ? `Clash Royale: <b>${html(row.clashRoyaleUsername)}</b>` : "",
    row.fortniteUsername ? `Fortnite: <b>${html(row.fortniteUsername)}</b>` : "",
  ].filter(Boolean).join("\n");

  const keyboardRows: Array<Array<Record<string, string>>> = [
    [{ text: "👤 باز کردن پروفایل در وب‌اپ", url: `${APP_URL}/profile` }],
    [{ text: "🏟 روم‌های فعال", url: `${APP_URL}/tournaments` }],
  ];
  if (CHANNEL_URL) keyboardRows.push([{ text: "📣 کانال Gament Games", url: CHANNEL_URL }]);
  await sendMessage(chatId, lines, { inline_keyboard: keyboardRows });
}

async function unregisterCommand(chatId: number, telegramId: string) {
  await db
    .update(telegramPreRegistrations)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(telegramPreRegistrations.telegramId, telegramId));
  await clearSession(telegramId);
  await sendMessage(chatId, "پیش‌ثبت‌نام تلگرامی شما لغو/آرشیو شد.", mainMenuKeyboard());
}

async function notifyAdminsOnPreRegistration(user: TelegramUser, data: SessionData, linkedUserId: string | null) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;

  const username = user.username ? `@${user.username}` : "—";
  const text = [
    "🆕 <b>پیش‌ثبت‌نام جدید Gament</b>",
    "",
    registrationSummary(data),
    "",
    `Telegram: <code>${html(user.id)}</code> | ${html(username)}`,
    linkedUserId ? "✅ حساب وب‌اپ شناسایی/لینک شد" : "⚠️ حساب وب‌اپ هنوز لینک نشده",
  ].join("\n");

  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, {
      inline_keyboard: [[{ text: "مشاهده پنل ادمین", url: `${APP_URL}/admin` }]],
    });
  }
}


async function notifyAdminsOnSupportTicket(telegramUser: TelegramUser, userId: string, ticketId: string, subject: string, message: string) {
  const adminIds = getAdminIds();
  if (!adminIds.length) return;
  const username = telegramUser.username ? `@${telegramUser.username}` : "—";
  const text = [
    "🎧 <b>تیکت پشتیبانی جدید از تلگرام</b>",
    "",
    `موضوع: <b>${html(subject)}</b>`,
    `Telegram: <code>${html(telegramUser.id)}</code> | ${html(username)}`,
    `User ID: <code>${html(userId)}</code>`,
    "",
    `پیام: ${html(message.slice(0, 700))}`,
  ].join("\n");
  for (const adminId of adminIds) {
    const numericId = Number(adminId);
    if (!Number.isFinite(numericId)) continue;
    await sendMessage(numericId, text, { inline_keyboard: [[{ text: "مشاهده تیکت", url: `${APP_URL}/admin/support?ticketId=${ticketId}` }]] });
  }
}

async function adminCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const [total] = await db.select({ value: count() }).from(telegramPreRegistrations);
  const [newItems] = await db.select({ value: count() }).from(telegramPreRegistrations).where(eq(telegramPreRegistrations.status, "new"));
  const [walletPending] = await db.select({ value: count() }).from(transactions).where(and(inArray(transactions.type, ["deposit", "withdrawal"]), eq(transactions.status, "pending")));
  const [openDisputes] = await db.select({ value: count() }).from(disputes).where(eq(disputes.status, "open"));
  const [pendingHonors] = await db.select({ value: count() }).from(honors).where(eq(honors.status, "pending"));
  const [openSupport] = await db.select({ value: count() }).from(tickets).where(eq(tickets.status, "open"));
  const [activeTournaments] = await db.select({ value: count() }).from(tournaments).where(inArray(tournaments.status, ["registration", "in_progress"]));

  await sendMessage(
    chatId,
    [
      "🛠 <b>داشبورد ادمین Gament</b>",
      "",
      `تورنومنت‌های فعال: <b>${activeTournaments.value}</b>`,
      `کیف پول pending: <b>${walletPending.value}</b>`,
      `اعتراض‌های باز: <b>${openDisputes.value}</b>`,
      `تیکت‌های باز: <b>${openSupport.value}</b>`,
      `افتخارات pending: <b>${pendingHonors.value}</b>`,
      `پیش‌ثبت‌نام تلگرام: <b>${total.value}</b> | جدید: <b>${newItems.value}</b>`,
      "",
      "/players — آخرین پیش‌ثبت‌نام‌ها",
      "/pending_wallets — شارژ/برداشت‌های در انتظار",
      "/pending_disputes — اعتراض‌های باز",
      "/pending_support — تیکت‌های باز پشتیبانی",
      "/pending_honors — محتوای تالار افتخارات در انتظار",
      "/honor_stats — آمار بازدید و لایک خبرها",
      "/manage — مدیریت سریع تورنومنت‌ها",
      "/announce متن — ارسال اطلاعیه به کاربران ربات",
      "/post_latest — انتشار آخرین تورنومنت فعال در کانال",
      "/deep_links — لینک‌های آماده برای کانال/کمپین",
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "💳 کیف پول‌ها", callback_data: "admin:wallets" }, { text: "🚨 اعتراض‌ها", callback_data: "admin:disputes" }],
        [{ text: "🎧 پشتیبانی", callback_data: "admin:support" }],
        [{ text: "🏛 افتخارات", callback_data: "admin:honors" }, { text: "📊 آمار خبرها", callback_data: "admin:honor_stats" }],
        [{ text: "🧩 تورنومنت‌ها", callback_data: "admin:tournaments" }],
        [{ text: "ورود به پنل ادمین", url: `${APP_URL}/admin` }],
      ],
    }
  );
}

async function pendingWalletsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const rows = await db
    .select({
      id: transactions.id,
      type: transactions.type,
      amount: transactions.amount,
      status: transactions.status,
      createdAt: transactions.createdAt,
      displayName: users.displayName,
      username: users.username,
      phoneNumber: users.phoneNumber,
    })
    .from(transactions)
    .innerJoin(wallets, eq(transactions.walletId, wallets.id))
    .leftJoin(users, eq(wallets.userId, users.id))
    .where(and(inArray(transactions.type, ["deposit", "withdrawal"]), eq(transactions.status, "pending")))
    .orderBy(desc(transactions.createdAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "✅ درخواست pending کیف پول وجود ندارد.", { inline_keyboard: [[{ text: "پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
    return;
  }

  const text = [
    "💳 <b>درخواست‌های pending کیف پول</b>",
    "",
    ...rows.map((row, index) => {
      const type = row.type === "deposit" ? "شارژ" : "برداشت";
      return `${index + 1}) <b>${type}</b> — <b>${html(formatTomanFromRial(bigIntFromText(row.amount)))}</b>\n👤 ${html(row.displayName || "—")} ${row.username ? `(@${html(row.username)})` : ""}\n📞 ${html(row.phoneNumber || "—")} | ${new Date(row.createdAt).toLocaleString("fa-IR")}`;
    }),
  ].join("\n\n");

  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "بررسی در پنل کیف پول", url: `${APP_URL}/admin/wallets` }]] });
}



async function pendingSupportCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db
    .select({ id: tickets.id, subject: tickets.subject, status: tickets.status, createdAt: tickets.createdAt, displayName: users.displayName, username: users.username, phoneNumber: users.phoneNumber })
    .from(tickets)
    .leftJoin(users, eq(tickets.userId, users.id))
    .where(eq(tickets.status, "open"))
    .orderBy(desc(tickets.createdAt))
    .limit(10);

  if (!rows.length) return sendMessage(chatId, "✅ تیکت باز وجود ندارد.", { inline_keyboard: [[{ text: "پنل پشتیبانی", url: `${APP_URL}/admin/support` }]] });
  const text = [
    "🎧 <b>تیکت‌های باز پشتیبانی</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.subject)}</b>\n👤 ${html(row.displayName || row.username || "—")} | 📞 ${html(row.phoneNumber || "—")}\n⏱ ${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => [{ text: `مشاهده تیکت ${i + 1}`, url: `${APP_URL}/admin/support?ticketId=${row.id}` }]),
      [{ text: "پنل پشتیبانی", url: `${APP_URL}/admin/support` }],
    ],
  });
}

async function myTicketsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای مشاهده تیکت‌ها، اول حساب را با /link وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
  const rows = await db.select().from(tickets).where(eq(tickets.userId, linked.userId)).orderBy(desc(tickets.createdAt)).limit(8);
  if (!rows.length) return sendMessage(chatId, "هنوز تیکتی ثبت نکرده‌ای. برای ساخت تیکت /support را بزن.");
  await sendMessage(chatId, [
    "🎧 <b>تیکت‌های من</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.subject)}</b> — ${html(row.status || "open")}\n${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n"), { inline_keyboard: [[{ text: "مرکز پشتیبانی", url: `${APP_URL}/support` }]] });
}

async function pendingDisputesCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db
    .select({
      id: disputes.id,
      reason: disputes.reason,
      status: disputes.status,
      createdAt: disputes.createdAt,
      matchId: matches.id,
      round: matches.round,
      matchNumber: matches.matchNumber,
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      playerName: players.displayName,
      playerUsername: players.username,
    })
    .from(disputes)
    .innerJoin(matches, eq(disputes.matchId, matches.id))
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .leftJoin(players, eq(disputes.raisedById, players.id))
    .where(eq(disputes.status, "open"))
    .orderBy(desc(disputes.createdAt))
    .limit(10);

  if (!rows.length) return sendMessage(chatId, "✅ اعتراض باز وجود ندارد.", { inline_keyboard: [[{ text: "پنل اعتراض‌ها", url: `${APP_URL}/admin/disputes` }]] });
  const text = [
    "🚨 <b>اعتراض‌های باز</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.tournamentName || "تورنومنت")}</b> | R${row.round}-${row.matchNumber}\n👤 ${html(row.playerName || row.playerUsername || "بازیکن")}\n📝 ${html(row.reason.slice(0, 160))}\n⏱ ${new Date(row.createdAt).toLocaleString("fa-IR")}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => [{ text: `مشاهده اعتراض ${i + 1}`, url: `${APP_URL}/admin/disputes?matchId=${row.matchId}` }]),
      [{ text: "پنل اعتراض‌ها", url: `${APP_URL}/admin/disputes` }],
    ],
  });
}

async function honorStatsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");

  const topViews = await db
    .select({ title: honors.title, id: honors.id, count: sql<number>`count(${honorViews.id})::int` })
    .from(honorViews)
    .innerJoin(honors, eq(honorViews.honorId, honors.id))
    .where(eq(honors.status, "approved"))
    .groupBy(honors.id, honors.title)
    .orderBy(desc(sql`count(${honorViews.id})`))
    .limit(5);
  const topLikes = await db
    .select({ title: honors.title, id: honors.id, count: sql<number>`count(${honorLikes.id})::int` })
    .from(honorLikes)
    .innerJoin(honors, eq(honorLikes.honorId, honors.id))
    .where(eq(honors.status, "approved"))
    .groupBy(honors.id, honors.title)
    .orderBy(desc(sql`count(${honorLikes.id})`))
    .limit(5);

  const views = topViews.length ? topViews.map((row, i) => `${i + 1}) <b>${html(row.title)}</b> — ${Number(row.count).toLocaleString("fa-IR")} سین`).join("\n") : "داده‌ای ثبت نشده.";
  const likes = topLikes.length ? topLikes.map((row, i) => `${i + 1}) <b>${html(row.title)}</b> — ${Number(row.count).toLocaleString("fa-IR")} لایک`).join("\n") : "داده‌ای ثبت نشده.";
  await sendMessage(chatId, ["🏛 <b>آمار تالار افتخارات</b>", "", "👁 پربازدیدترین‌ها", views, "", "♥️ محبوب‌ترین‌ها", likes].join("\n"), {
    inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]],
  });
}

async function pendingHonorsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db.select().from(honors).where(eq(honors.status, "pending")).orderBy(desc(honors.createdAt)).limit(10);
  if (!rows.length) return sendMessage(chatId, "✅ محتوای pending تالار افتخارات وجود ندارد.", { inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]] });
  const text = [
    "🏛 <b>تالار افتخارات — در انتظار بررسی</b>",
    "",
    ...rows.map((row, i) => `${i + 1}) <b>${html(row.title)}</b>\nنوع: <b>${html(row.type)}</b> | بازی: <b>${html(row.game || "عمومی")}</b>\n${html(row.description.slice(0, 180))}`),
  ].join("\n\n");
  await sendMessage(chatId, text, {
    inline_keyboard: [
      ...rows.slice(0, 5).map((row, i) => ([
        { text: `✅ تأیید ${i + 1}`, callback_data: `honor:approve:${row.id}` },
        { text: `❌ رد ${i + 1}`, callback_data: `honor:reject:${row.id}` },
      ])),
      [{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }],
    ],
  });
}

async function reviewHonorFromTelegram(chatId: number, telegramId: string, honorId: string, decision: "approve" | "reject") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const status = decision === "approve" ? "approved" : "rejected";
  const [updated] = await db.update(honors).set({ status, publishedAt: status === "approved" ? new Date() : null, updatedAt: new Date() }).where(eq(honors.id, honorId)).returning();
  if (!updated) return sendMessage(chatId, "محتوا پیدا نشد.");
  if (status === "approved") {
    await publishHonorToTelegramChannel({ id: updated.id, title: updated.title, description: updated.description, type: updated.type, game: updated.game, imageUrl: updated.imageUrl, highlight: updated.highlight }).catch(() => undefined);
  }
  await sendMessage(chatId, status === "approved" ? `✅ منتشر شد: <b>${html(updated.title)}</b>` : `❌ رد شد: <b>${html(updated.title)}</b>`, { inline_keyboard: [[{ text: "پنل تالار افتخارات", url: `${APP_URL}/admin/honors` }]] });
}

async function playersCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const rows = await db
    .select({
      fullName: telegramPreRegistrations.fullName,
      game: telegramPreRegistrations.game,
      gamerTag: telegramPreRegistrations.gamerTag,
      gamentId: telegramPreRegistrations.gamentId,
      telegramUsername: telegramPreRegistrations.telegramUsername,
      status: telegramPreRegistrations.status,
      updatedAt: telegramPreRegistrations.updatedAt,
    })
    .from(telegramPreRegistrations)
    .orderBy(desc(telegramPreRegistrations.updatedAt))
    .limit(12);

  if (!rows.length) {
    await sendMessage(chatId, "هنوز پیش‌ثبت‌نامی ثبت نشده است.");
    return;
  }

  const text = [
    "👥 <b>آخرین پیش‌ثبت‌نام‌های تلگرام</b>",
    "",
    ...rows.map((row, index) => {
      const username = row.telegramUsername ? `@${row.telegramUsername}` : "—";
      return `${index + 1}) <b>${html(row.fullName)}</b> | ${html(gameLabel(row.game))}\n🏷 ${html(row.gamerTag)} | 🆔 ${html(row.gamentId || "—")} | ${html(username)} | ${html(row.status)}`;
    }),
  ].join("\n\n");

  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "پنل کامل", url: `${APP_URL}/admin` }]] });
}

async function announceCommand(chatId: number, telegramId: string, text: string, gameFilter?: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const message = text.trim();
  if (!message) {
    await sendMessage(chatId, "متن اطلاعیه را وارد کن. مثال:\n<code>/announce امشب روم کلش ساعت ۹ فعال است.</code>");
    return;
  }

  const normalizedGame = gameFilter ? normalizeGame(gameFilter) : "";
  const rows = await db
    .select({ telegramId: telegramPreRegistrations.telegramId, status: telegramPreRegistrations.status, game: telegramPreRegistrations.game })
    .from(telegramPreRegistrations)
    .orderBy(desc(telegramPreRegistrations.updatedAt))
    .limit(500);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.status === "archived") {
      skipped += 1;
      continue;
    }
    if (normalizedGame && normalizeGame(row.game) !== normalizedGame) {
      skipped += 1;
      continue;
    }
    const numericId = Number(row.telegramId);
    if (!Number.isFinite(numericId)) {
      failed += 1;
      continue;
    }
    try {
      await sendMessage(numericId, `📢 <b>اطلاعیه Gament</b>\n\n${html(message)}`, mainMenuKeyboard());
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  await sendMessage(chatId, `ارسال اطلاعیه تمام شد.\n✅ موفق: ${sent}\n⏭ ردشده: ${skipped}\n❌ ناموفق: ${failed}`);
}

async function postLatestTournamentCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }

  const [latest] = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.status, "registration"))
    .orderBy(desc(tournaments.createdAt))
    .limit(1);

  if (!latest) {
    await sendMessage(chatId, "تورنومنت فعالی برای انتشار در کانال پیدا نشد.");
    return;
  }

  const result = await publishTournamentToTelegramChannel(latest);
  if (result.ok) {
    await sendMessage(chatId, `✅ آخرین تورنومنت در کانال منتشر شد:\n<b>${html(latest.name)}</b>`);
  } else {
    await sendMessage(chatId, `❌ انتشار در کانال انجام نشد.\n${html(result.description || "خطای نامشخص")}`);
  }
}

async function myTournamentsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده تورنومنت‌های خودت، اول حساب را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const rows = await db
    .select({
      registrationId: registrations.id,
      checkedInAt: registrations.checkedInAt,
      tournamentId: tournaments.id,
      name: tournaments.name,
      game: tournaments.game,
      status: tournaments.status,
      entryFee: tournaments.entryFee,
      categoryLabel: tournaments.categoryLabel,
      startDate: tournaments.startDate,
      roomId: tournaments.roomId,
      roomVisibleAt: tournaments.roomVisibleAt,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(eq(registrations.visibleUserId, linked.userId))
    .orderBy(desc(registrations.registeredAt))
    .limit(10);

  if (!rows.length) {
    await sendMessage(chatId, "هنوز در تورنومنتی ثبت‌نام نکرده‌ای.", {
      inline_keyboard: [[{ text: "🏟 مشاهده روم‌ها", callback_data: "menu:rooms" }]],
    });
    return;
  }

  const text = [
    "🎮 <b>تورنومنت‌های من</b>",
    "",
    ...rows.map((row, index) => `${index + 1}) <b>${html(row.name)}</b>\n🎮 ${html(gameLabel(row.game))} | وضعیت: <b>${html(row.status)}</b> | چک‌این: ${row.checkedInAt ? "✅" : "⬜"}`),
  ].join("\n\n");
  const keyboard = rows.flatMap((row) => {
    const result: Array<Array<Record<string, string>>> = [
      [{ text: `جزئیات: ${row.name.slice(0, 28)}`, url: `${APP_URL}/tournaments/${row.tournamentId}` }],
      [
        { text: "✅ چک‌این", callback_data: `checkin:${row.registrationId}` },
        { text: "🏟 لابی", callback_data: `mylobby:${row.tournamentId}` },
        { text: "لغو", callback_data: `cancelreg:${row.registrationId}` },
      ],
    ];
    if (row.game === "clash_royale" && row.categoryLabel === CLASH_1V1_CONFIG.categoryLabel && !isFreeEntryFee(row.entryFee)) {
      result.push([{ text: "⚔️ 1V1 کلش رویال", callback_data: `qr:${row.tournamentId}` }]);
    }
    return result;
  });
  await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function showMyLobby(chatId: number, telegramId: string, tournamentId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "حساب لینک نیست.");
  const [row] = await db
    .select({
      roomId: tournaments.roomId,
      roomPassword: tournaments.roomPassword,
      lobbyNotes: tournaments.lobbyNotes,
      roomVisibleAt: tournaments.roomVisibleAt,
      startDate: tournaments.startDate,
      categoryLabel: tournaments.categoryLabel,
      checkedInAt: registrations.checkedInAt,
      name: tournaments.name,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.visibleUserId, linked.userId), eq(tournaments.id, tournamentId)))
    .limit(1);
  if (!row) return sendMessage(chatId, "شما در این تورنومنت ثبت‌نام نکرده‌اید.");
  if (row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && !row.checkedInAt) {
    return sendMessage(chatId, "برای دریافت نام و رمز مسابقه خصوصی، ابتدا باید چک‌این کنی.");
  }
  const revealAt = row.roomVisibleAt
    ? new Date(row.roomVisibleAt).getTime()
    : row.startDate ? new Date(row.startDate).getTime() - 30 * 60 * 1000 : Number.POSITIVE_INFINITY;
  if (!row.roomId || Date.now() < revealAt) {
    return sendMessage(chatId, "اطلاعات ورود هنوز منتشر نشده است؛ حداکثر ۳۰ دقیقه قبل از شروع نمایش داده می‌شود.");
  }
  const roomLabel = row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? "نام/برچسب مسابقه" : "Room ID";
  await sendMessage(chatId, `🏟 <b>ورود به ${html(row.name)}</b>\n\n${roomLabel}: <code>${html(row.roomId)}</code>\nPassword: <code>${html(row.roomPassword || "بدون رمز")}</code>\n\n${html(row.lobbyNotes || "به‌موقع وارد شوید.")}`);
}

async function cancelRegistrationCommand(chatId: number, telegramId: string, registrationId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "حساب لینک نیست.");
  const [row] = await db
    .select({
      registrationId: registrations.id,
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      status: tournaments.status,
      categoryLabel: tournaments.categoryLabel,
      startDate: tournaments.startDate,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.id, registrationId), eq(registrations.visibleUserId, linked.userId)))
    .limit(1);
  if (!row) return sendMessage(chatId, "ثبت‌نام پیدا نشد.");
  if (row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY && privateCancellationKeepsEntryFee(row.startDate)) {
    await ensurePrivateTournamentAttendanceSchema();
    await db.update(registrations).set({ attendanceStatus: "no_show", noShowAt: new Date() }).where(eq(registrations.id, registrationId));
    await sendMessage(chatId, "⚠️ انصراف شما بعد از بازشدن چک‌این به‌عنوان No-show ثبت شد. طبق قانونی که هنگام پرداخت پذیرفتی، ورودی بازگردانده نمی‌شود و داخل استخر جایزه باقی می‌ماند.");
    return;
  }
  if (row.status === "in_progress" || row.status === "completed") return sendMessage(chatId, "بعد از شروع/پایان تورنومنت امکان لغو از ربات نیست.");

  const refundText = await db.transaction(async (tx) => {
    await tx.delete(registrations).where(eq(registrations.id, registrationId));
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, linked.userId)).limit(1);
    if (!wallet) return "";
    const [entry] = await tx
      .select({ id: transactions.id, amount: transactions.amount })
      .from(transactions)
      .where(sql`${transactions.type} = 'entry_fee' AND ${transactions.status} = 'completed' AND ${transactions.metadata}->>'tournamentId' = ${row.tournamentId} AND ${transactions.metadata}->>'userId' = ${linked.userId}`)
      .limit(1);
    if (!entry) return "";
    const [existingRefund] = await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.referenceId, `telegram-cancel-refund-${entry.id}`)).limit(1);
    if (existingRefund) return "";
    const amount = bigIntFromText(entry.amount);
    if (amount <= BigInt(0)) return "";
        await tx.update(wallets).set({ balance: sql`${wallets.balance} + ${amount.toString()}`, updatedAt: new Date() }).where(eq(wallets.id, wallet.id));
    await tx.insert(transactions).values({
      walletId: wallet.id,
      amount: amount.toString(),
      type: "refund",
      status: "completed",
      referenceId: `telegram-cancel-refund-${entry.id}`,
      metadata: { kind: "telegram_cancel_refund", tournamentId: row.tournamentId, userId: linked.userId, originalTransactionId: entry.id },
    });
    return `\n💳 مبلغ ${html(formatTomanFromRial(amount))} به کیف پول برگشت.`;
  });

  await sendMessage(chatId, `✅ ثبت‌نام شما در <b>${html(row.tournamentName)}</b> لغو شد.${refundText}`);
  await notifyWaitlistSpot(row.tournamentId).catch(() => undefined);
}

async function walletCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده کیف پول، اول حساب تلگرامت را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const wallet = await getOrCreateWallet(linked.userId);
  const balance = bigIntFromText(wallet.balance);
  const txRows = await db.select().from(transactions).where(eq(transactions.walletId, wallet.id)).orderBy(desc(transactions.createdAt)).limit(5);
  const recent = txRows.length
    ? txRows.map((tx) => `• ${html(tx.type)}: <b>${html(formatTomanFromRial(bigIntFromText(tx.amount)))}</b> — ${html(tx.status)}`).join("\n")
    : "هنوز تراکنشی ندارید.";
  await sendMessage(chatId, `💳 <b>کیف پول Gament</b>\n\nموجودی: <b>${html(formatTomanFromRial(balance))}</b>\n\nآخرین تراکنش‌ها:\n${recent}`, {
    inline_keyboard: [[{ text: "شارژ کیف پول", url: `${APP_URL}/wallet` }], [{ text: "تراکنش‌ها", url: `${APP_URL}/wallet` }]],
  });
}

async function achievementsCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای مشاهده دستاوردها، اول حساب را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  const progress = await achievementProgressForUser(linked.userId);
  type AchievementProgressItem = Awaited<ReturnType<typeof achievementProgressForUser>>[number];
  const unlocked = progress.filter((item: AchievementProgressItem) => item.unlocked).slice(0, 8);
  const locked = progress.filter((item: AchievementProgressItem) => !item.unlocked).slice(0, 5);
  const text = [
    "🏅 <b>دستاوردهای Gament</b>",
    "",
    unlocked.length ? "✅ بازشده:" : "هنوز دستاوردی باز نشده.",
    ...unlocked.map((item: AchievementProgressItem) => `${item.icon} <b>${html(item.nameFA)}</b> — +${item.points} XP`),
    "",
    locked.length ? "⬜ بعدی‌ها:" : "",
    ...locked.map((item: AchievementProgressItem) => `${item.icon} ${html(item.nameFA)} — ${item.progress}/${item.requirement}`),
  ].filter(Boolean).join("\n");
  await sendMessage(chatId, text, { inline_keyboard: [[{ text: "مشاهده در وب‌اپ", url: `${APP_URL}/achievements` }]] });
}

async function supportStartCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت تیکت پشتیبانی، اول حساب تلگرامت را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  await setSession(telegramId, "support_subject", {});
  await sendMessage(chatId, "🎧 موضوع تیکت پشتیبانی را بنویس:", replyKeyboard([[CANCEL_TEXT]]));
}

async function userMatchRows(telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return { linked: null, rows: [] as Array<{ id: string; status: string; round: number; matchNumber: number; tournamentName: string | null; playerId: string | null }> };
  const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
  const playerIds = myPlayers.map((p) => p.id);
  if (!playerIds.length) return { linked, rows: [] };
  const rows = await db
    .select({
      id: matches.id,
      status: matches.status,
      round: matches.round,
      matchNumber: matches.matchNumber,
      tournamentName: tournaments.name,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(or(inArray(matches.player1Id, playerIds), inArray(matches.player2Id, playerIds)))
    .orderBy(desc(matches.createdAt))
    .limit(10);
  return { linked, rows: rows.map((row) => ({ ...row, playerId: playerIds.includes(row.player1Id || "") ? row.player1Id : row.player2Id })) };
}

interface MatchResultParticipantContext {
  id: string;
  userId: string | null;
  name: string | null;
  username: string | null;
  clashRoyaleTag: string | null;
}

async function loadMatchResultContext(matchId: string, client: any = db) {
  const [match] = await client
    .select({
      id: matches.id,
      tournamentId: matches.tournamentId,
      tournamentName: tournaments.name,
      player1Id: matches.player1Id,
      player2Id: matches.player2Id,
      winnerId: matches.winnerId,
      status: matches.status,
      scheduledAt: matches.scheduledAt,
      createdAt: matches.createdAt,
    })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  if (!match?.player1Id || !match.player2Id) return null;

  const participantRows = await client
    .select({
      id: players.id,
      userId: players.visibleUserId,
      name: players.displayName,
      username: players.username,
      clashRoyaleTag: users.clashRoyaleId,
    })
    .from(players)
    .leftJoin(users, eq(players.visibleUserId, users.id))
    .where(inArray(players.id, [match.player1Id, match.player2Id]));
  const byId = new Map<string, MatchResultParticipantContext>(
    (participantRows as MatchResultParticipantContext[]).map((player) => [player.id, player]),
  );
  const player1 = byId.get(match.player1Id);
  const player2 = byId.get(match.player2Id);
  if (!player1?.userId || !player2?.userId) return null;
  const [duelEntry] = await client
    .select({
      stakeMode: clash1v1Entries.stakeMode,
      gameMode: clash1v1Entries.gameMode,
      opponentType: clash1v1Entries.opponentType,
      prizeRial: clash1v1Entries.prizeRial,
    })
    .from(clash1v1Entries)
    .where(eq(clash1v1Entries.matchedMatchId, matchId))
    .limit(1);
  return {
    ...match,
    player1,
    player2,
    duel: duelEntry || { stakeMode: "paid", gameMode: "normal", opponentType: "random", prizeRial: "800000" },
  };
}

function resultClaimLabel(claim?: string | null) {
  return claim === "win" ? "برد" : claim === "lose" ? "باخت" : "ثبت نشده";
}

async function notifyResultAdmins(matchId: string, message: string) {
  const keyboard = {
    inline_keyboard: [[
      { text: "⚖️ مشاهده ادعا و مدارک", callback_data: `judge:info:${matchId}` },
      { text: "🏆 بازیکن ۱ برنده", callback_data: `judge:p1:${matchId}` },
      { text: "🏆 بازیکن ۲ برنده", callback_data: `judge:p2:${matchId}` },
    ]],
  };
  const roleRecipients = await db
    .select({ telegramId: telegramAccounts.telegramId })
    .from(telegramAccounts)
    .innerJoin(users, eq(telegramAccounts.userId, users.id))
    .where(inArray(users.role, ["judge", "moderator", "admin", "super_admin"]));
  const recipients = new Set([
    ...getAdminIds(),
    ...roleRecipients.map((row) => row.telegramId).filter(Boolean),
  ]);
  await Promise.allSettled([...recipients].map((adminId) => {
    const chatId = Number(adminId);
    return Number.isFinite(chatId) ? sendMessage(chatId, message, keyboard) : Promise.resolve();
  }));
}

async function notifyFinalMatchResult(matchId: string, winnerId: string, prizePaid: boolean) {
  const context = await loadMatchResultContext(matchId);
  if (!context) return;
  const winner = context.player1.id === winnerId ? context.player1 : context.player2;
  const loser = winner === context.player1 ? context.player2 : context.player1;
  const prizeLine = context.duel.stakeMode === "free"
    ? "\n🆓 این رقابت رایگان بود و جایزه مالی ندارد."
    : prizePaid
      ? `\n💰 جایزه <b>${html(CLASH_1V1_CONFIG.prize1st)}</b> به کیف پول شما واریز شد.`
      : "\n💰 وضعیت جایزه در سوابق کیف پول قابل پیگیری است.";

  await Promise.allSettled([
    evaluateUserAchievements(winner.userId),
    evaluateUserAchievements(loser.userId),
    notifyLinkedUserOnTelegram(winner.userId, [
      "🏆 <b>نتیجه نهایی مسابقه</b>",
      `شما برنده مسابقه مقابل <b>${html(loser.name || loser.username || "حریف")}</b> شدی.${prizeLine}`,
    ].join("\n\n"), {
      inline_keyboard: [[{ text: "💳 مشاهده کیف پول", url: `${APP_URL}/wallet` }]],
    }),
    notifyLinkedUserOnTelegram(loser.userId, [
      "🎮 <b>نتیجه نهایی مسابقه</b>",
      `برنده مسابقه: <b>${html(winner.name || winner.username || "حریف")}</b>`,
      "برای مسابقه بعدی آماده باش 💪",
    ].join("\n\n"), {
      inline_keyboard: [[{ text: "⚔️ مسابقات من", callback_data: "menu:matches" }]],
    }),
  ]);
}

type ClashApiSettlementResult =
  | { state: "completed"; winnerId: string; prizePaid: boolean }
  | { state: "pending_api" }
  | { state: "missing_tags" }
  | { state: "api_error"; reason: string }
  | { state: "disputed"; reason: string }
  | { state: "replay_required"; reason: string }
  | { state: "no_consensus" };

async function verifyAndFinalizeAgreedMatch(matchId: string): Promise<ClashApiSettlementResult> {
  const context = await loadMatchResultContext(matchId);
  if (!context) return { state: "no_consensus" };
  const claimRows = await db
    .select({ playerId: matchResultClaims.playerId, claim: matchResultClaims.claim })
    .from(matchResultClaims)
    .where(eq(matchResultClaims.matchId, matchId));
  const claims = claimRows
    .filter((claim) => claim.claim === "win" || claim.claim === "lose")
    .map((claim) => ({ playerId: claim.playerId, claim: claim.claim as MatchResultClaimValue }));
  const resolution = resolveMatchResultClaims(context.player1.id, context.player2.id, claims);
  if (resolution.state !== "agreed") return { state: "no_consensus" };

  const apiConfig = getClashRoyaleApiConfiguration();
  if (!apiConfig.configured) return { state: "api_error", reason: "not_configured" };
  const player1Tag = normalizeClashRoyaleTag(context.player1.clashRoyaleTag);
  const player2Tag = normalizeClashRoyaleTag(context.player2.clashRoyaleTag);
  if (!player1Tag || !player2Tag) return { state: "missing_tags" };

  try {
    const battle = await verifyClashRoyaleHeadToHead({
      player1Tag,
      player2Tag,
      notBefore: new Date(new Date(context.scheduledAt || context.createdAt).getTime() - 30_000),
    });
    if (!battle) return { state: "pending_api" };
    const expectedMode = context.duel.gameMode || "normal";
    if (isClashDuelGameMode(expectedMode) && !clashBattleMatchesExpectedMode(expectedMode, battle)) {
      const evidence = {
        source: "clash_api_mode_mismatch",
        expectedGameMode: expectedMode,
        actualGameMode: battle.gameMode,
        actualBattleType: battle.battleType,
        actualDeckSelection: battle.raw.deckSelection || null,
        battleTime: battle.battleTime.toISOString(),
      };
      if (context.duel.stakeMode === "free") {
        await db.transaction(async (tx) => {
          await tx.update(matches).set({ status: "pending", scheduledAt: null, evidence: { ...evidence, action: "replay_required" } }).where(eq(matches.id, matchId));
          await tx.delete(matchResultClaims).where(eq(matchResultClaims.matchId, matchId));
          await tx.update(clash1v1Entries).set({ readyAt: null, updatedAt: new Date() }).where(eq(clash1v1Entries.matchedMatchId, matchId));
        });
        return { state: "replay_required", reason: "api_mode_mismatch" };
      }
      await db.update(matches).set({ status: "disputed", evidence }).where(eq(matches.id, matchId));
      return { state: "disputed", reason: "api_mode_mismatch" };
    }
    const claimedWinner = resolution.winnerId === context.player1.id ? player1Tag : player2Tag;
    if (!battle.winnerTag || battle.winnerTag !== claimedWinner) {
      await db.update(matches).set({
        status: "disputed",
        evidence: {
          source: "clash_api_mismatch",
          claimedWinnerId: resolution.winnerId,
          apiWinnerTag: battle.winnerTag,
          battleTime: battle.battleTime.toISOString(),
          player1Crowns: battle.player1Crowns,
          player2Crowns: battle.player2Crowns,
        },
      }).where(eq(matches.id, matchId));
      return { state: "disputed", reason: "api_result_mismatch" };
    }

    const finalized = await db.transaction(async (tx) => finalizeMatchResult(tx, matchId, resolution.winnerId));
    if (!finalized.completed) return { state: "api_error", reason: finalized.reason };
    return {
      state: "completed",
      winnerId: finalized.winnerId,
      prizePaid: Boolean(finalized.prize?.paid),
    };
  } catch (error) {
    const reason = error instanceof ClashRoyaleApiError ? error.reason || error.message : "network_error";
    logger.warn({ error, matchId, reason }, "Clash API result verification failed");
    return { state: "api_error", reason };
  }
}

async function notifyApiVerificationPending(matchId: string, context: Awaited<ReturnType<typeof loadMatchResultContext>>) {
  if (!context) return;
  const text = "⏳ گزارش‌های دو طرف با هم موافق است، اما Battle Log هنوز در Clash Royale API دیده نشد. کمی بعد دوباره بررسی کن؛ تا زمان تأیید API جایزه پرداخت نمی‌شود.";
  const keyboard = { inline_keyboard: [[{ text: "🔄 بررسی دوباره نتیجه", callback_data: `result:verify:${matchId}` }]] };
  await Promise.allSettled([
    notifyLinkedUserOnTelegram(context.player1.userId, text, keyboard),
    notifyLinkedUserOnTelegram(context.player2.userId, text, keyboard),
  ]);
}

async function matchesCommand(chatId: number, telegramId: string) {
  const { linked, rows } = await userMatchRows(telegramId);
  if (!linked) {
    await sendMessage(chatId, "برای مشاهده مسابقات، اول حساب تلگرامت را با /link وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }
  if (!rows.length) {
    await sendMessage(chatId, "فعلاً مسابقه‌ای برای حساب شما پیدا نشد.", mainMenuKeyboard());
    return;
  }
  const keyboard = rows.slice(0, 6).flatMap((match, index) => [
    [{ text: `${index + 1}) ${match.tournamentName || "مسابقه"} | R${match.round}-${match.matchNumber}`, callback_data: `match:${match.id}` }],
  ]);
  await sendMessage(chatId, "⚔️ مسابقات اخیر شما؛ یکی را انتخاب کن:", { inline_keyboard: keyboard });
}

async function handleMatchAction(chatId: number, telegramId: string, matchId: string) {
  const { linked, rows } = await userMatchRows(telegramId);
  const match = rows.find((row) => row.id === matchId);
  if (!linked || !match) {
    await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
    return;
  }
  await sendMessage(chatId, `⚔️ <b>${html(match.tournamentName || "مسابقه")}</b>\nوضعیت: <b>${html(match.status)}</b>\n\nنتیجه یا عملیات را انتخاب کن:`, {
    inline_keyboard: [
      [{ text: "✅ بردم", callback_data: `result:win:${matchId}` }, { text: "❌ باختم", callback_data: `result:lose:${matchId}` }],
      [{ text: "📎 ارسال اسکرین‌شات", callback_data: `evidence:${matchId}` }],
      [{ text: "🚨 اعتراض دارم", callback_data: `dispute:${matchId}` }],
    ],
  });
}

async function submitTelegramResult(chatId: number, telegramId: string, matchId: string, action: MatchResultClaimValue) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای ثبت نتیجه، ابتدا حساب تلگرام را به Gament وصل کن.");
    return;
  }

  await ensureClash1v1Schema();
  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`match-result:${matchId}`}))`);
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).limit(1);
    if (!match?.player1Id || !match.player2Id) return { kind: "missing" as const };
    if (match.status === "completed") return { kind: "completed" as const, winnerId: match.winnerId };
    if (match.status === "pending") return { kind: "not_started" as const };

    const participants = await tx
      .select({ id: players.id, userId: players.visibleUserId })
      .from(players)
      .where(inArray(players.id, [match.player1Id, match.player2Id]));
    const reporter = participants.find((player: { userId: string | null }) => player.userId === linked.userId);
    if (!reporter) return { kind: "forbidden" as const };

    await tx
      .insert(matchResultClaims)
      .values({
        matchId,
        playerId: reporter.id,
        userId: linked.userId,
        telegramId,
        claim: action,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [matchResultClaims.matchId, matchResultClaims.playerId],
        set: { claim: action, telegramId, updatedAt: new Date() },
      });

    const claimRows = await tx
      .select({ playerId: matchResultClaims.playerId, claim: matchResultClaims.claim })
      .from(matchResultClaims)
      .where(eq(matchResultClaims.matchId, matchId));
    const claims = claimRows
      .filter((claim: { claim: string }) => claim.claim === "win" || claim.claim === "lose")
      .map((claim: { playerId: string; claim: string }) => ({
        playerId: claim.playerId,
        claim: claim.claim as MatchResultClaimValue,
      }));
    const resolution = resolveMatchResultClaims(match.player1Id, match.player2Id, claims);
    const evidenceSummary = {
      source: "telegram_claims_v2",
      claims,
      resolution,
      updatedAt: new Date().toISOString(),
    };

    if (resolution.state === "pending") {
      // One report alone is not a judging case. Keep the match active and wait
      // for the opponent's independent claim.
      await tx.update(matches).set({ status: "in_progress", evidence: evidenceSummary }).where(eq(matches.id, matchId));
      return { kind: "pending" as const, reporterPlayerId: reporter.id, claims, match };
    }
    if (resolution.state === "conflict") {
      await tx.update(matches).set({ status: "disputed", evidence: evidenceSummary }).where(eq(matches.id, matchId));
      return { kind: "conflict" as const, reason: resolution.reason, claims, match };
    }

    await tx.update(matches).set({ status: "in_progress", evidence: evidenceSummary }).where(eq(matches.id, matchId));
    return { kind: "agreed" as const, resolution, claims, match };
  });

  if (outcome.kind === "missing" || outcome.kind === "forbidden") {
    await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
    return;
  }
  if (outcome.kind === "completed") {
    await sendMessage(chatId, "✅ نتیجه این مسابقه قبلاً نهایی شده است.");
    return;
  }
  if (outcome.kind === "not_started") {
    await sendMessage(chatId, "ثبت نتیجه هنوز فعال نیست. هر دو بازیکن باید ابتدا دکمه «آماده‌ام» را بزنند تا Match رسمی شروع شود.");
    return;
  }

  const context = await loadMatchResultContext(matchId);
  const claimsText = context
    ? [
        `بازیکن ۱: <b>${html(resultClaimLabel(outcome.claims.find((c) => c.playerId === context.player1.id)?.claim))}</b>`,
        `بازیکن ۲: <b>${html(resultClaimLabel(outcome.claims.find((c) => c.playerId === context.player2.id)?.claim))}</b>`,
      ].join("\n")
    : "";

  if (outcome.kind === "pending") {
    await sendMessage(chatId, [
      "✅ نتیجه شما مستقل ثبت شد.",
      "منتظر گزارش حریف هستیم. برای بررسی بهتر می‌توانی اسکرین‌شات نتیجه را هم ارسال کنی.",
    ].join("\n"), {
      inline_keyboard: [[{ text: "📎 ارسال اسکرین‌شات", callback_data: `evidence:${matchId}` }]],
    });
    if (context) {
      const opponent = context.player1.id === outcome.reporterPlayerId ? context.player2 : context.player1;
      await notifyLinkedUserOnTelegram(opponent.userId, "⚔️ حریف نتیجه مسابقه را ثبت کرده است. لطفاً نتیجه خودت را مستقل اعلام کن.", {
        inline_keyboard: [[
          { text: "✅ بردم", callback_data: `result:win:${matchId}` },
          { text: "❌ باختم", callback_data: `result:lose:${matchId}` },
        ], [{ text: "🚨 اعتراض", callback_data: `dispute:${matchId}` }]],
      }).catch(() => undefined);
    }
    return;
  }

  if (outcome.kind === "conflict") {
    await sendMessage(chatId, "🚨 گزارش دو بازیکن با هم سازگار نیست. مسابقه برای داوری انسانی ارسال شد.");
    if (context) {
      await Promise.allSettled([
        notifyLinkedUserOnTelegram(context.player1.userId, "🚨 گزارش‌های مسابقه با هم اختلاف دارند و برای داوری انسانی ارسال شدند."),
        notifyLinkedUserOnTelegram(context.player2.userId, "🚨 گزارش‌های مسابقه با هم اختلاف دارند و برای داوری انسانی ارسال شدند."),
      ]);
    }
    await notifyResultAdmins(matchId, `🚨 <b>اختلاف نتیجه 1V1</b>\nMatch: <code>${html(matchId.slice(0, 8))}</code>\n${claimsText}`);
    return;
  }

  const settlement = await verifyAndFinalizeAgreedMatch(matchId);
  if (settlement.state === "completed") {
    // Complementary claims settle privately after the Battle Log confirms the
    // same winner. No judge/admin notification is created.
    await notifyFinalMatchResult(matchId, settlement.winnerId, settlement.prizePaid);
    return;
  }
  if (settlement.state === "replay_required") {
    const replayText = `⚠️ مود مسابقه رایگان با مود توافق‌شده «${html(clashDuelModeLabel(context?.duel.gameMode || "normal"))}» یکسان نبود. نتیجه ثبت نشد؛ لطفاً Match را با مود درست تکرار کنید و دوباره «آماده‌ام» بزنید.`;
    if (context) {
      await Promise.allSettled([
        notifyLinkedUserOnTelegram(context.player1.userId, replayText, { inline_keyboard: [[{ text: "🎮 شروع دوباره", callback_data: "clash1v1:status" }]] }),
        notifyLinkedUserOnTelegram(context.player2.userId, replayText, { inline_keyboard: [[{ text: "🎮 شروع دوباره", callback_data: "clash1v1:status" }]] }),
      ]);
    }
    return;
  }
  if (settlement.state === "disputed") {
    const mismatchText = settlement.reason === "api_mode_mismatch"
      ? `🚨 مود بازی انجام‌شده با مود توافق‌شده «${html(clashDuelModeLabel(context?.duel.gameMode || "normal"))}» مطابقت ندارد و برای داوری ارسال شد.`
      : "🚨 نتیجه ثبت‌شده با Battle Log کلش رویال مطابقت ندارد و برای داوری ارسال شد.";
    if (context) {
      await Promise.allSettled([
        notifyLinkedUserOnTelegram(context.player1.userId, mismatchText),
        notifyLinkedUserOnTelegram(context.player2.userId, mismatchText),
      ]);
    }
    await notifyResultAdmins(matchId, `🚨 <b>اختلاف با Clash Royale API</b>\nMatch: <code>${html(matchId.slice(0, 8))}</code>\nReason: <code>${html(settlement.reason)}</code>`);
    return;
  }
  if (settlement.state === "missing_tags") {
    if (context) {
      const text = `⚠️ برای بررسی خودکار، هر دو بازیکن باید Player Tag تأییدشده داشته باشند. از پروفایل Gament ثبتش کنید: ${html(`${APP_URL}/profile/edit`)}`;
      await Promise.allSettled([
        notifyLinkedUserOnTelegram(context.player1.userId, text),
        notifyLinkedUserOnTelegram(context.player2.userId, text),
      ]);
    }
    return;
  }
  // Battle logs can appear with a short delay, and proxy/network failures are
  // transient. Keep the match active and expose an idempotent retry button.
  await notifyApiVerificationPending(matchId, context);
}

async function startDispute(chatId: number, telegramId: string, matchId: string) {
  await setSession(telegramId, "dispute_reason", { disputeMatchId: matchId });
  await sendMessage(chatId, "🚨 دلیل اعتراض را بنویس. اگر مدرک داری، توضیح بده کجا قابل بررسی است:", replyKeyboard([[CANCEL_TEXT]]));
}

async function startEvidenceUpload(chatId: number, telegramId: string, matchId: string) {
  await setSession(telegramId, "evidence_upload", { evidenceMatchId: matchId });
  await sendMessage(chatId, "📎 لطفاً اسکرین‌شات نتیجه را به‌صورت عکس ارسال کن. کپشن اختیاری است.", replyKeyboard([[CANCEL_TEXT]]));
}

async function inviteCommand(chatId: number, telegramId: string) {
  const username = process.env.TELEGRAM_BOT_USERNAME || "FlexaTournamentBot";
  const link = `https://t.me/${username}?start=ref_${telegramId}`;
  const [{ value }] = await db.select({ value: count() }).from(telegramReferrals).where(eq(telegramReferrals.referrerTelegramId, telegramId));
  await sendMessage(chatId, `🎁 <b>لینک دعوت اختصاصی شما</b>\n\n${html(link)}\n\nدعوت‌های ثبت‌شده: <b>${value}</b>\n\nاین لینک را برای دوستات بفرست؛ در فاز جایزه، دعوت‌های معتبر امتیاز می‌گیرند.`, {
    inline_keyboard: [[{ text: "اشتراک‌گذاری", url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("به Gament بپیوند و توی تورنومنت‌های گیمینگ شرکت کن!")}` }]],
  });
}


type ClashPairParticipant = {
  registrationId: string;
  playerId: string;
  userId: string;
  playerName: string | null;
  playerUsername: string | null;
  playerGameId: string | null;
  telegramId: string;
  inviteLink: string | null;
  clashRoyaleId: string | null;
  clashRoyaleUsername: string | null;
};

type CreatedClashPair = {
  matchId: string;
  matchNumber: number;
  tournamentId: string;
  tournamentName: string;
  tournamentStartDate: Date | null;
  player1: ClashPairParticipant;
  player2: ClashPairParticipant;
};

function clashParticipantDisplayName(player: ClashPairParticipant) {
  return player.playerName || player.playerUsername || player.clashRoyaleUsername || "Gament Player";
}

function clashParticipantTag(player: ClashPairParticipant) {
  return player.clashRoyaleId || player.playerGameId || player.clashRoyaleUsername || "ثبت نشده";
}

function clashQrPromptText(tournamentName: string, existing = false) {
  return [
    `⚔️ <b>${existing ? "به‌روزرسانی" : "شروع"} 1V1 کلش رویال</b>`,
    "",
    `تورنومنت: <b>${html(tournamentName)}</b>`,
    "",
    "1) در Clash Royale وارد <b>اجتماعی (Social)</b> شو.",
    "2) روی <b>افزودن دوست (+)</b> بزن.",
    "3) زیر QR روی <b>اشتراک‌گذاری پیوند</b> بزن.",
    "4) پیوند را برای همین بات Share کن یا اینجا Paste کن.",
    "",
    "پیوند باید با این آدرس شروع شود:",
    "<code>https://link.clashroyale.com/invite/friend/...</code>",
    "⚠️ عکس QR پذیرفته نمی‌شود.",
  ].join("\n");
}

async function startClashQrSubmission(chatId: number, telegramId: string, tournamentId?: string, registrationId?: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای شروع 1V1 کلش رویال، اول حساب تلگرام را با /link به Gament وصل کن.", {
      inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]],
    });
    return;
  }

  const conditions = [
    eq(registrations.visibleUserId, linked.userId),
    eq(tournaments.game, "clash_royale"),
    eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel),
    inArray(tournaments.status, ["registration", "in_progress"]),
  ];
  if (tournamentId) conditions.push(eq(tournaments.id, tournamentId));
  if (registrationId) conditions.push(eq(registrations.id, registrationId));

  const rows = await db
    .select({
      registrationId: registrations.id,
      tournamentId: tournaments.id,
      tournamentName: tournaments.name,
      tournamentStatus: tournaments.status,
      entryFee: tournaments.entryFee,
      submittedAt: registrations.gameInviteSubmittedAt,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(...conditions))
    .orderBy(desc(registrations.registeredAt))
    .limit(8);

  const eligible = rows.filter((row) => !isFreeEntryFee(row.entryFee));
  if (!eligible.length) {
    const activeClashRooms = await db
      .select({
        id: tournaments.id,
        name: tournaments.name,
        entryFee: tournaments.entryFee,
        maxPlayers: tournaments.maxPlayers,
        registeredCount: count(registrations.id),
      })
      .from(tournaments)
      .leftJoin(registrations, eq(registrations.tournamentId, tournaments.id))
      .where(and(
        eq(tournaments.game, "clash_royale"),
        eq(tournaments.categoryLabel, CLASH_1V1_CONFIG.categoryLabel),
        eq(tournaments.status, "registration")
      ))
      .groupBy(tournaments.id)
      .orderBy(desc(tournaments.createdAt))
      .limit(6);

    const paidRooms = activeClashRooms.filter((room) => !isFreeEntryFee(room.entryFee));
    const keyboard: Array<Array<Record<string, string>>> = paidRooms.flatMap((room) => {
      const title = room.name.slice(0, 32);
      const isFull = Number(room.registeredCount || 0) >= Number(room.maxPlayers || 0);
      return [
        [{ text: isFull ? `ظرفیت تکمیل: ${title}` : `ثبت‌نام 1V1: ${title}`, callback_data: `join:${room.id}` }],
        [{ text: `جزئیات: ${title}`, url: `${APP_URL}/tournaments/${room.id}` }],
      ];
    });
    keyboard.push([{ text: "🏟 همه روم‌های کلش", url: `${APP_URL}/tournaments?game=clash_royale` }]);

    await sendMessage(
      chatId,
      "⚔️ <b>1V1 کلش رویال</b>\n\nبرای واقعی شدن مچ‌میکینگ، اول باید در یک تورنومنت <b>پولی کلش رویال</b> ثبت‌نام کرده باشی و ورودی پرداخت شده باشد.\n\nبعد از ثبت‌نام، «پیوند دوستی» را از گزینه اشتراک‌گذاری پیوند در Clash Royale برای بات بفرست تا حریف را اتوماتیک وصل کنم.",
      { inline_keyboard: keyboard }
    );
    return;
  }

  if (!tournamentId && !registrationId && eligible.length > 1) {
    await sendMessage(chatId, "برای کدام تورنومنت، 1V1 کلش رویال را شروع می‌کنی؟", {
      inline_keyboard: eligible.map((row) => [{ text: `${row.submittedAt ? "🔁" : "📲"} ${row.tournamentName.slice(0, 42)}`, callback_data: `qr:${row.tournamentId}` }]),
    });
    return;
  }

  const row = eligible[0];
  await setSession(telegramId, "clash_qr_submission", {
    qrTournamentId: row.tournamentId,
    qrRegistrationId: row.registrationId,
  });
  await sendMessage(chatId, clashQrPromptText(row.tournamentName, Boolean(row.submittedAt)), replyKeyboard([[CANCEL_TEXT]]));
  await sendClashFriendLinkGuide(chatId);
}

async function tryAutoPairClashTournament(tournamentId: string): Promise<CreatedClashPair[]> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM tournaments WHERE id = ${tournamentId} FOR UPDATE`);

    const [tournament] = await tx
      .select({ id: tournaments.id, name: tournaments.name, game: tournaments.game, status: tournaments.status, startDate: tournaments.startDate })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId))
      .limit(1);

    if (!tournament || tournament.game !== "clash_royale" || !["registration", "in_progress"].includes(tournament.status)) {
      return [];
    }

    const existingMatches = await tx
      .select({ player1Id: matches.player1Id, player2Id: matches.player2Id })
      .from(matches)
      .where(eq(matches.tournamentId, tournamentId));

    const busyPlayerIds = new Set<string>();
    for (const match of existingMatches) {
      if (match.player1Id) busyPlayerIds.add(match.player1Id);
      if (match.player2Id) busyPlayerIds.add(match.player2Id);
    }

    const queued = await tx
      .select({
        registrationId: registrations.id,
        playerId: registrations.playerId,
        userId: registrations.visibleUserId,
        inviteLink: registrations.gameInviteLink,
        playerName: players.displayName,
        playerUsername: players.username,
        playerGameId: players.gameId,
        telegramId: telegramAccounts.telegramId,
        clashRoyaleId: users.clashRoyaleId,
        clashRoyaleUsername: users.clashRoyaleUsername,
        submittedAt: registrations.gameInviteSubmittedAt,
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
      .leftJoin(users, eq(registrations.visibleUserId, users.id))
      .where(and(
        eq(registrations.tournamentId, tournamentId),
        sql`${registrations.gameInviteSubmittedAt} IS NOT NULL`,
        sql`${registrations.gameInviteLink} IS NOT NULL`
      ))
      .orderBy(registrations.gameInviteSubmittedAt, registrations.registeredAt);

    const eligible = queued
      .filter((row) => row.playerId && !busyPlayerIds.has(row.playerId) && isSupportedClashInvite(row.inviteLink))
      .map((row) => ({
        registrationId: row.registrationId,
        playerId: row.playerId,
        userId: row.userId,
        playerName: row.playerName,
        playerUsername: row.playerUsername,
        playerGameId: row.playerGameId,
        telegramId: row.telegramId,
        inviteLink: row.inviteLink,
        clashRoyaleId: row.clashRoyaleId,
        clashRoyaleUsername: row.clashRoyaleUsername,
      } satisfies ClashPairParticipant));

    if (eligible.length < 2) return [];

    const [{ value: existingMatchCount }] = await tx.select({ value: count() }).from(matches).where(eq(matches.tournamentId, tournamentId));
    let nextMatchNumber = Number(existingMatchCount || 0) + 1;
    const createdPairs: CreatedClashPair[] = [];

    while (eligible.length >= 2) {
      const player1 = eligible.shift()!;
      const player2 = eligible.shift()!;
      const [match] = await tx
        .insert(matches)
        .values({
          tournamentId,
          round: 1,
          matchNumber: nextMatchNumber,
          player1Id: player1.playerId,
          player2Id: player2.playerId,
          status: "pending",
          scheduledAt: tournament.startDate || null,
        })
        .returning({ id: matches.id, matchNumber: matches.matchNumber });

      createdPairs.push({
        matchId: match.id,
        matchNumber: match.matchNumber,
        tournamentId,
        tournamentName: tournament.name,
        tournamentStartDate: tournament.startDate,
        player1,
        player2,
      });
      nextMatchNumber += 1;
      busyPlayerIds.add(player1.playerId);
      busyPlayerIds.add(player2.playerId);
    }

    return createdPairs;
  });
}

async function notifyClashPairSide(pair: CreatedClashPair, me: ClashPairParticipant, opponent: ClashPairParticipant) {
  const chatId = Number(me.telegramId);
  if (!Number.isFinite(chatId)) return;
  const opponentLink = opponent.inviteLink;
  const startLine = pair.tournamentStartDate
    ? `⏰ زمان پیشنهادی/شروع: <b>${html(new Date(pair.tournamentStartDate).toLocaleString("fa-IR"))}</b>`
    : "";

  const lines = [
    "⚔️ <b>حریف 1V1 کلش رویال شما پیدا شد</b>",
    "",
    `🏆 تورنومنت: <b>${html(pair.tournamentName)}</b>`,
    `⚔️ مسابقه: <b>#${pair.matchNumber}</b>`,
    startLine,
    "",
    `👤 حریف: <b>${html(clashParticipantDisplayName(opponent))}</b>`,
    `🏷 Player Tag / ID: <code>${html(clashParticipantTag(opponent))}</code>`,
    opponent.clashRoyaleUsername ? `👑 Username: <b>${html(opponent.clashRoyaleUsername)}</b>` : "",
    `🔗 پیوند دوستی حریف: <code>${html(opponentLink || "ثبت نشده")}</code>`,
    "",
    "قدم بعدی:",
    "1) دکمه «باز کردن پیوند دوستی حریف» را بزن.",
    "2) او را Add Friend کن و Friendly Battle را شروع کنید.",
    "3) بعد از بازی نتیجه را با /matches ثبت کن.",
  ].filter(Boolean).join("\n");

  const keyboard: Array<Array<Record<string, string>>> = [];
  if (isSupportedClashInvite(opponentLink)) keyboard.push([{ text: "🔗 باز کردن پیوند دوستی حریف", url: opponentLink! }]);
  keyboard.push([
    { text: "⚔️ ثبت نتیجه", callback_data: `match:${pair.matchId}` },
    { text: "🏆 تورنومنت", url: `${APP_URL}/tournaments/${pair.tournamentId}` },
  ]);

  await sendMessage(chatId, lines, { inline_keyboard: keyboard });
}

async function notifyClashPairs(pairs: CreatedClashPair[]) {
  for (const pair of pairs) {
    await notifyClashPairSide(pair, pair.player1, pair.player2).catch((err) => logger.warn({ err, matchId: pair.matchId }, "Failed to notify Clash pair player1"));
    await notifyClashPairSide(pair, pair.player2, pair.player1).catch((err) => logger.warn({ err, matchId: pair.matchId }, "Failed to notify Clash pair player2"));
  }
}

function missionsKeyboard(status: { channelMember: boolean; linked: boolean; preReg: boolean; invites: number }) {
  const rows: Array<Array<Record<string, string>>> = [];
  if (status.channelMember) rows.push([{ text: "🎁 دریافت پاداش عضویت کانال", callback_data: "mission:claim:channel" }]);
  if (status.linked) rows.push([{ text: "🎁 دریافت پاداش اتصال حساب", callback_data: "mission:claim:link" }]);
  if (status.preReg) rows.push([{ text: "🎁 دریافت پاداش پیش‌ثبت‌نام", callback_data: "mission:claim:prereg" }]);
  if (status.invites > 0) rows.push([{ text: "🎁 دریافت پاداش دعوت", callback_data: "mission:claim:invite" }]);
  rows.push([{ text: "🔗 لینک دعوت من", callback_data: "mission:invite" }, { text: "اتصال حساب", callback_data: "menu:link" }]);
  return { inline_keyboard: rows };
}

async function getMissionStatus(telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  const [preReg] = await db.select({ id: telegramPreRegistrations.id }).from(telegramPreRegistrations).where(eq(telegramPreRegistrations.telegramId, telegramId)).limit(1);
  const [{ value: invites }] = await db.select({ value: count() }).from(telegramReferrals).where(eq(telegramReferrals.referrerTelegramId, telegramId));
  const channelMember = await isChannelMember(telegramId);
  return { linked, preReg: Boolean(preReg), invites, channelMember };
}

async function missionsCommand(chatId: number, telegramId: string) {
  const status = await getMissionStatus(telegramId);
  await sendMessage(chatId, [
    "🎯 <b>مأموریت‌های رشد Gament</b>",
    "",
    `${status.channelMember ? "✅" : "⬜"} عضویت در کانال Gament Games — <b>10 XP</b>`,
    `${status.linked ? "✅" : "⬜"} اتصال حساب با /link — <b>30 XP</b>`,
    `${status.preReg ? "✅" : "⬜"} پیش‌ثبت‌نام در ربات — <b>20 XP</b>`,
    `${status.invites > 0 ? "✅" : "⬜"} دعوت حداقل یک نفر با /invite — <b>50 XP</b>`,
    "",
    "اگر مأموریت انجام شده باشد، دکمه دریافت پاداش را بزن. هر پاداش فقط یک‌بار قابل دریافت است.",
  ].join("\n"), missionsKeyboard({ channelMember: status.channelMember, linked: Boolean(status.linked), preReg: status.preReg, invites: status.invites }));
}

async function claimMissionReward(chatId: number, telegramId: string, mission: string) {
  const status = await getMissionStatus(telegramId);
  if (!status.linked?.userId) {
    await sendMessage(chatId, "برای دریافت پاداش XP، اول حساب تلگرام را با /link به Gament وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
    return;
  }

  const missions: Record<string, { ok: boolean; xp: number; title: string }> = {
    channel: { ok: status.channelMember, xp: 10, title: "عضویت در کانال" },
    link: { ok: Boolean(status.linked), xp: 30, title: "اتصال حساب" },
    prereg: { ok: status.preReg, xp: 20, title: "پیش‌ثبت‌نام" },
    invite: { ok: status.invites > 0, xp: 50, title: "دعوت دوست" },
  };
  const item = missions[mission];
  if (!item) return sendMessage(chatId, "این مأموریت معتبر نیست.");
  if (!item.ok) return sendMessage(chatId, "این مأموریت هنوز کامل نشده است. /missions را ببین.");

  const key = `mission:${mission}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) return sendMessage(chatId, `✅ پاداش مأموریت «${html(item.title)}» قبلاً دریافت شده است.`);

  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "mission_reward" });
  const xpText = await rewardUserXP(status.linked.userId, item.xp, item.title);
  await sendMessage(chatId, `🎁 <b>پاداش مأموریت دریافت شد</b>\n\n${html(item.title)}${xpText}`);
}


async function sendLobbyToRegisteredUsers(chatId: number, tournamentId: string) {
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد.");
    return;
  }
  if (!tournament.roomId) {
    await sendMessage(chatId, "برای این تورنومنت هنوز Room ID ثبت نشده است.");
    return;
  }
  const recipients = await db
    .select({ telegramId: telegramAccounts.telegramId })
    .from(registrations)
    .innerJoin(telegramAccounts, eq(registrations.visibleUserId, telegramAccounts.userId))
    .where(and(
      eq(registrations.tournamentId, tournamentId),
      ...(tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? [sql`${registrations.checkedInAt} IS NOT NULL`] : []),
    ));
  let sent = 0;
  for (const row of recipients) {
    await sendMessage(Number(row.telegramId), `🏟 <b>اطلاعات ورود آماده شد</b>\n\n🏆 ${html(tournament.name)}\n${tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY ? "نام/برچسب مسابقه" : "Room ID"}: <code>${html(tournament.roomId)}</code>\nPassword: <code>${html(tournament.roomPassword || "بدون رمز")}</code>\n\n${html(tournament.lobbyNotes || "لطفاً به‌موقع وارد شوید.")}`);
    sent += 1;
  }
  await sendMessage(chatId, `✅ اطلاعات لابی برای ${sent} نفر ارسال شد.`);
}

async function checkInCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "برای چک‌این، اول حساب را با /link وصل کن.", { inline_keyboard: [[{ text: "🔗 اتصال حساب", callback_data: "menu:link" }]] });
    return;
  }
  const rows = await db
    .select({ id: registrations.id, checkedInAt: registrations.checkedInAt, tournamentId: tournaments.id, name: tournaments.name, status: tournaments.status })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.visibleUserId, linked.userId), inArray(tournaments.status, ["registration", "in_progress"])))
    .orderBy(desc(registrations.registeredAt))
    .limit(8);
  if (!rows.length) {
    await sendMessage(chatId, "ثبت‌نام فعالی برای چک‌این پیدا نشد.");
    return;
  }
  await sendMessage(chatId, "✅ برای کدام تورنومنت حضور داری؟", {
    inline_keyboard: rows.map((row) => [{ text: `${row.checkedInAt ? "✅" : "⬜"} ${row.name.slice(0, 35)}`, callback_data: `checkin:${row.id}` }]),
  });
}

async function handleCheckIn(chatId: number, telegramId: string, registrationId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) {
    await sendMessage(chatId, "حساب شما لینک نیست.");
    return;
  }
  const [row] = await db
    .select({
      id: registrations.id,
      tournamentId: tournaments.id,
      checkedInAt: registrations.checkedInAt,
      tournamentName: tournaments.name,
      tournamentStatus: tournaments.status,
      categoryLabel: tournaments.categoryLabel,
      startDate: tournaments.startDate,
    })
    .from(registrations)
    .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
    .where(and(eq(registrations.id, registrationId), eq(registrations.visibleUserId, linked.userId)))
    .limit(1);
  if (!row) {
    await sendMessage(chatId, "این ثبت‌نام برای شما پیدا نشد.");
    return;
  }
  if (row.checkedInAt) {
    await sendMessage(chatId, `✅ چک‌این شما برای <b>${html(row.tournamentName)}</b> قبلاً ثبت شده است.`);
    return;
  }
  if (row.tournamentStatus === "completed" || row.tournamentStatus === "cancelled") {
    await sendMessage(chatId, "چک‌این این تورنومنت بسته شده است.");
    return;
  }
  if (row.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
    if (!row.startDate) {
      await sendMessage(chatId, "زمان شروع این مسابقه هنوز مشخص نشده و چک‌این باز نیست.");
      return;
    }
    const now = Date.now();
    const start = new Date(row.startDate).getTime();
    const opensAt = start - 30 * 60 * 1000;
    const closesAt = start + 15 * 60 * 1000;
    if (now < opensAt) {
      await sendMessage(chatId, `چک‌این ۳۰ دقیقه قبل از شروع باز می‌شود.\nزمان شروع: <b>${html(new Date(row.startDate).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }))}</b>`);
      return;
    }
    if (now > closesAt) {
      await sendMessage(chatId, "مهلت چک‌این این مسابقه تمام شده است.");
      return;
    }
  }
  await ensurePrivateTournamentAttendanceSchema();
  await db.update(registrations).set({ checkedInAt: new Date(), attendanceStatus: "checked_in", noShowAt: null }).where(eq(registrations.id, registrationId));
  await sendMessage(chatId, `✅ حضور شما برای تورنومنت <b>${html(row.tournamentName)}</b> ثبت شد.`, {
    inline_keyboard: [[{ text: "🏟 دریافت نام/رمز مسابقه", callback_data: `mylobby:${row.tournamentId}` }]],
  });
}

async function adminTournamentsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const rows = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt)).limit(8);
  if (!rows.length) {
    await sendMessage(chatId, "تورنومنتی پیدا نشد.");
    return;
  }
  const keyboard = rows.flatMap((tournament, index) => [
    [{ text: `${index + 1}) ${tournament.name.slice(0, 28)} | ${tournament.status}`, callback_data: `adm:info:${tournament.id}` }],
    [
      { text: "📣 کانال", callback_data: `adm:post:${tournament.id}` },
      { text: "🏟 لابی", callback_data: `adm:lobby:${tournament.id}` },
      { text: "▶️ شروع", callback_data: `adm:start:${tournament.id}` },
      { text: "⛔ بستن", callback_data: `adm:close:${tournament.id}` },
    ],
  ]);
  await sendMessage(chatId, "🧩 مدیریت سریع تورنومنت‌ها:", { inline_keyboard: keyboard });
}

async function handleAdminTournamentAction(chatId: number, telegramId: string, action: string, tournamentId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!tournament) {
    await sendMessage(chatId, "تورنومنت پیدا نشد.");
    return;
  }
  if (action === "post") {
    const result = await publishTournamentToTelegramChannel(tournament);
    await sendMessage(chatId, result.ok ? "✅ در کانال منتشر شد." : `❌ انتشار انجام نشد: ${html(result.description || "خطا")}`);
    return;
  }
  if (action === "lobby") return sendLobbyToRegisteredUsers(chatId, tournamentId);
  if (action === "start") {
    if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
      if (!tournament.roomId || !tournament.roomPassword) {
        await sendMessage(chatId, "قبل از شروع، نام/برچسب مسابقه خصوصی و Password را در پنل تورنومنت ثبت کن.");
        return;
      }
      const [checked] = await db.select({ value: count() }).from(registrations)
        .where(and(eq(registrations.tournamentId, tournamentId), sql`${registrations.checkedInAt} IS NOT NULL`));
      if (Number(checked?.value || 0) < 2) {
        await sendMessage(chatId, "برای شروع حداقل دو بازیکن باید چک‌این کرده باشند.");
        return;
      }
    }
    await db.update(tournaments).set({ status: "in_progress", updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
    await sendMessage(chatId, "▶️ وضعیت تورنومنت به in_progress تغییر کرد.");
    if (tournament.categoryLabel === CLASH_PRIVATE_DRAFT_CATEGORY) {
      await sendLobbyToRegisteredUsers(chatId, tournamentId);
    }
    return;
  }
  if (action === "close") {
    await db.update(tournaments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(tournaments.id, tournamentId));
    await sendMessage(chatId, "⛔ تورنومنت لغو/بسته شد.");
    return;
  }
  await sendMessage(chatId, `🏆 <b>${html(tournament.name)}</b>\n🎮 ${html(gameLabel(tournament.game))}\nوضعیت: <b>${html(tournament.status)}</b>\nورودی: <b>${html(tournament.entryFee || "رایگان")}</b>`, {
    inline_keyboard: [[{ text: "مشاهده در سایت", url: `${APP_URL}/tournaments/${tournament.id}` }]],
  });
}

async function leaderboardCommand(chatId: number) {
  const rows = await db
    .select({ displayName: users.displayName, username: users.username, gamentId: users.gamentId, rankPoints: users.rankPoints, level: users.level })
    .from(users)
    .orderBy(desc(users.rankPoints))
    .limit(10);
  const text = [
    "🏆 <b>لیدربورد Gament</b>",
    "",
    ...rows.map((row, index) => `${index + 1}) <b>${html(row.displayName || row.username)}</b> — RP <b>${row.rankPoints}</b> | Lv ${row.level}\n<code>${html(row.gamentId)}</code>`),
  ].join("\n\n");
  await sendMessage(chatId, text);
}

async function dailyCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای دریافت جایزه روزانه، اول /link را انجام بده.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
  const key = `daily:${today}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) return sendMessage(chatId, "🎁 جایزه روزانه امروز را قبلاً گرفتی. فردا دوباره بیا!");
  const xp = crypto.randomInt(15, 76);
  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "daily" });
  const xpText = await rewardUserXP(linked.userId, xp, "جایزه روزانه");
  await sendMessage(chatId, `🎁 <b>جایزه روزانه Gament</b>\n\nامروز گرفتی:${xpText}`);
}

const QUIZ_QUESTIONS = [
  {
    question: "برای شرکت معتبر در تورنومنت، مهم‌ترین مورد چیست؟",
    options: ["آیدی بازی صحیح", "چند اکانت همزمان", "ارسال نتیجه جعلی"],
    correct: 0,
    explain: "آیدی بازی باید با پروفایل Gament و روز مسابقه یکی باشد.",
  },
  {
    question: "اگر نتیجه مسابقه مورد اختلاف باشد، بهترین کار چیست؟",
    options: ["ثبت اعتراض با مدرک", "دعوا در چت", "خروج از تورنومنت"],
    correct: 0,
    explain: "اعتراض همراه با اسکرین‌شات/مدرک مسیر درست داوری است.",
  },
  {
    question: "شارژ کیف پول کارت‌به‌کارت چه زمانی قابل استفاده می‌شود؟",
    options: ["بعد از تأیید ادمین", "بلافاصله بدون فیش", "بعد از حذف حساب"],
    correct: 0,
    explain: "فیش واریز باید بررسی شود و بعد موجودی داخل سایت فعال می‌شود.",
  },
  {
    question: "استفاده از چیت یا ابزار غیرمجاز چه نتیجه‌ای دارد؟",
    options: ["حذف/بن طبق قوانین", "امتیاز اضافه", "برد خودکار"],
    correct: 0,
    explain: "Gament روی بازی جوانمردانه و داوری معتبر حساس است.",
  },
];

function todayTehranKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tehran" }).format(new Date());
}

function dailyQuizIndex() {
  const today = todayTehranKey();
  let hash = 0;
  for (const ch of today) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % QUIZ_QUESTIONS.length;
}

async function quizCommand(chatId: number, telegramId?: string) {
  const today = todayTehranKey();
  const questionIndex = dailyQuizIndex();
  const q = QUIZ_QUESTIONS[questionIndex];
  const alreadyAnswered = telegramId
    ? await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, `quiz:${today}:${telegramId}`)).limit(1)
    : [];

  await sendMessage(chatId, [
    "🧠 <b>کوییز روزانه Gament</b>",
    "",
    q.question,
    "",
    alreadyAnswered.length ? "✅ امروز قبلاً امتیاز کوییز را گرفته‌ای؛ باز هم می‌توانی جواب را ببینی." : "جواب درست، XP روزانه می‌دهد.",
  ].join("\n"), {
    inline_keyboard: q.options.map((option, index) => ([{ text: option, callback_data: `quiz:ans:${questionIndex}:${index}` }])),
  });
}

async function handleQuizAnswer(chatId: number, telegramId: string, questionIndex: number, answerIndex: number) {
  const q = QUIZ_QUESTIONS[questionIndex] || QUIZ_QUESTIONS[dailyQuizIndex()];
  const correct = answerIndex === q.correct;
  if (!correct) {
    await sendMessage(chatId, `❌ جواب درست نبود.\n\n✅ پاسخ صحیح: <b>${html(q.options[q.correct])}</b>\n${html(q.explain)}`);
    return;
  }

  const linked = await getLinkedUserByTelegram(telegramId);
  const today = todayTehranKey();
  const key = `quiz:${today}:${telegramId}`;
  const [existing] = await db.select({ id: telegramSentNotifications.id }).from(telegramSentNotifications).where(eq(telegramSentNotifications.dedupeKey, key)).limit(1);
  if (existing) {
    await sendMessage(chatId, `✅ درست بود!\n\nامتیاز امروز را قبلاً گرفته‌ای.\n${html(q.explain)}`);
    return;
  }

  await db.insert(telegramSentNotifications).values({ dedupeKey: key, telegramId, type: "quiz" });
  const xpText = linked?.userId ? await rewardUserXP(linked.userId, 20, "کوییز روزانه") : "\nبرای دریافت XP، حساب را با /link وصل کن.";
  await sendMessage(chatId, `✅ درست بود!\n${html(q.explain)}${xpText || ""}`);
}

async function healthCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const started = Date.now();
  let dbStatus = "OK";
  try { await db.select({ value: count() }).from(users); } catch { dbStatus = "ERROR"; }
  const webhook = await telegramApi("getWebhookInfo", {});
  const ms = Date.now() - started;
  await sendMessage(chatId, `🩺 <b>Health Gament</b>\n\nDB: <b>${dbStatus}</b>\nTelegram Webhook: <b>${webhook?.ok ? "OK" : "ERROR"}</b>\nAI Keys: <b>${process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY ? "Configured" : "Local fallback"}</b>\nLatency: <b>${ms}ms</b>`);
}

async function exportTelegramCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const rows = await db.select().from(telegramPreRegistrations).orderBy(desc(telegramPreRegistrations.updatedAt)).limit(1000);
  const headers = ["telegramId", "username", "fullName", "phone", "gamentId", "game", "platform", "gamerTag", "status", "createdAt"];
  const csv = [headers.join(","), ...rows.map((r) => [r.telegramId, r.telegramUsername || "", r.fullName, r.phoneNumber, r.gamentId || "", r.game, r.platform || "", r.gamerTag, r.status, r.createdAt.toISOString()].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
  await sendDocument(chatId, "\ufeff" + csv, `telegram_registrations_${Date.now()}.csv`, "خروجی پیش‌ثبت‌نام‌های تلگرام");
}

async function couponCommand(chatId: number, telegramId: string, code: string) {
  const value = code.trim().toUpperCase();
  if (!value) return sendMessage(chatId, "کد تخفیف را بعد از دستور وارد کن. مثال: <code>/coupon GAMENT50</code>");
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!linked?.userId) return sendMessage(chatId, "برای استفاده از کوپن، اول حساب را با /link وصل کن.");

  const [coupon] = await db.select().from(coupons).where(eq(coupons.code, value)).limit(1);
  if (!coupon || !coupon.isActive || (coupon.expiresAt && new Date(coupon.expiresAt) < new Date())) {
    return sendMessage(chatId, "این کد معتبر نیست یا منقضی شده است.");
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return sendMessage(chatId, "ظرفیت استفاده از این کد تمام شده است.");

  await db.insert(couponRedemptions).values({
    couponId: coupon.id,
    userId: linked.userId,
    telegramId,
    status: "active",
  });
  const xpText = await rewardUserXP(linked.userId, 10, `کد ${value}`);
  await sendMessage(chatId, `🎟 کد <code>${html(value)}</code> فعال شد.\nتخفیف: <b>${coupon.discountPercent}%</b>\nدر ثبت‌نام پولی بعدی از تلگرام اعمال می‌شود.${xpText}`);
}

async function pollCommand(chatId: number, telegramId: string, question: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const q = question.trim() || "تورنومنت بعدی کدام بازی باشد؟";
  await telegramApi("sendPoll", {
    chat_id: process.env.TELEGRAM_CHANNEL_ID || "@Gament_games",
    question: q,
    options: ["COD Mobile", "Clash Royale", "Fortnite"],
    is_anonymous: false,
  });
  await sendMessage(chatId, "✅ نظرسنجی در کانال ارسال شد.");
}

async function shopCommand(chatId: number) {
  await sendMessage(chatId, "🛒 فروشگاه Gament\n\nفعلاً خرید از داخل وب‌اپ انجام می‌شود. آیتم‌های پیشنهادی: بلیت تورنومنت، Badge، بسته XP و آیتم‌های ویژه.", {
    inline_keyboard: [[{ text: "باز کردن فروشگاه/کیف پول", url: `${APP_URL}/wallet` }]],
  });
}

async function judgeCommand(chatId: number, telegramId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!hasAdminAccess(telegramId) && !["judge", "moderator", "admin", "super_admin"].includes(String(linked?.role || ""))) {
    return sendMessage(chatId, "شما دسترسی داوری ندارید.");
  }
  const rows = await db
    .select({ id: matches.id, status: matches.status, tournamentName: tournaments.name, round: matches.round, matchNumber: matches.matchNumber })
    .from(matches)
    .leftJoin(tournaments, eq(matches.tournamentId, tournaments.id))
    .where(inArray(matches.status, ["awaiting_judgment", "disputed"]))
    .orderBy(desc(matches.createdAt))
    .limit(10);
  if (!rows.length) return sendMessage(chatId, "مسابقه‌ای در صف داوری نیست.");
  await sendMessage(chatId, "⚖️ صف داوری:", {
    inline_keyboard: rows.flatMap((m, i) => [
      [{ text: `${i + 1}) ${m.tournamentName || "Match"} | ${m.status}`, callback_data: `judge:info:${m.id}` }],
      [{ text: "🏆 بازیکن ۱", callback_data: `judge:p1:${m.id}` }, { text: "🏆 بازیکن ۲", callback_data: `judge:p2:${m.id}` }],
      [{ text: "✅ تأیید نتیجه موافق", callback_data: `judge:approve:${m.id}` }, { text: "🚨 بررسی بیشتر", callback_data: `judge:review:${m.id}` }],
    ]),
  });
}

async function handleJudgeAction(chatId: number, telegramId: string, action: string, matchId: string) {
  const linked = await getLinkedUserByTelegram(telegramId);
  if (!hasAdminAccess(telegramId) && !["judge", "moderator", "admin", "super_admin"].includes(String(linked?.role || ""))) {
    return sendMessage(chatId, "شما دسترسی داوری ندارید.");
  }
  await ensureClash1v1Schema();
  const context = await loadMatchResultContext(matchId);
  if (!context) return sendMessage(chatId, "مسابقه پیدا نشد.");

  const claimRows = await db
    .select({ playerId: matchResultClaims.playerId, claim: matchResultClaims.claim, updatedAt: matchResultClaims.updatedAt })
    .from(matchResultClaims)
    .where(eq(matchResultClaims.matchId, matchId));
  const claims = claimRows
    .filter((claim) => claim.claim === "win" || claim.claim === "lose")
    .map((claim) => ({ playerId: claim.playerId, claim: claim.claim as MatchResultClaimValue }));
  const resolution = resolveMatchResultClaims(context.player1.id, context.player2.id, claims);

  if (action === "info") {
    const evidenceRows = await db
      .select()
      .from(matchEvidence)
      .where(eq(matchEvidence.matchId, matchId))
      .orderBy(desc(matchEvidence.createdAt));
    await sendMessage(chatId, [
      "⚖️ <b>جزئیات داوری مسابقه</b>",
      `Match: <code>${html(matchId)}</code>`,
      `وضعیت: <b>${html(context.status)}</b>`,
      "",
      `1) ${html(context.player1.name || context.player1.username || "بازیکن ۱")}: <b>${html(resultClaimLabel(claims.find((c) => c.playerId === context.player1.id)?.claim))}</b>`,
      `2) ${html(context.player2.name || context.player2.username || "بازیکن ۲")}: <b>${html(resultClaimLabel(claims.find((c) => c.playerId === context.player2.id)?.claim))}</b>`,
      `مدارک: <b>${evidenceRows.length.toLocaleString("fa-IR")}</b>`,
    ].join("\n"), {
      inline_keyboard: [[
        { text: "🏆 بازیکن ۱ برنده", callback_data: `judge:p1:${matchId}` },
        { text: "🏆 بازیکن ۲ برنده", callback_data: `judge:p2:${matchId}` },
      ], [{ text: "🚨 بررسی بیشتر", callback_data: `judge:review:${matchId}` }]],
    });

    for (const evidence of evidenceRows.slice(0, 10)) {
      const caption = `📎 مدرک مسابقه ${html(matchId.slice(0, 8))}\n${html(evidence.description || "بدون توضیح")}`;
      if (evidence.fileUrl.startsWith("telegram_file:")) {
        await sendPhoto(chatId, evidence.fileUrl.replace("telegram_file:", ""), caption).catch(() => undefined);
      } else {
        await sendMessage(chatId, `${caption}\n${html(evidence.fileUrl)}`).catch(() => undefined);
      }
    }
    return;
  }

  if (action === "review") {
    await db.update(matches).set({ status: "disputed" }).where(eq(matches.id, matchId));
    return sendMessage(chatId, "🚨 مسابقه برای بررسی بیشتر علامت‌گذاری شد.");
  }

  let winnerId: string | null = null;
  if (action === "p1") winnerId = context.player1.id;
  if (action === "p2") winnerId = context.player2.id;
  if (action === "approve" && resolution.state === "agreed") winnerId = resolution.winnerId;
  if (action === "approve" && !winnerId) {
    return sendMessage(chatId, "نتیجه دو طرف موافق نیست؛ لطفاً صریحاً «بازیکن ۱» یا «بازیکن ۲» را به‌عنوان برنده انتخاب کن.");
  }
  if (!winnerId) return sendMessage(chatId, "عملیات داوری نامعتبر است.");

  const finalized = await db.transaction(async (tx) => finalizeMatchResult(tx, matchId, winnerId!));
  if (!finalized.completed) return sendMessage(chatId, `تکمیل مسابقه انجام نشد: <code>${html(finalized.reason)}</code>`);

  const prizePaid = Boolean(finalized.prize?.paid);
  await notifyFinalMatchResult(matchId, finalized.winnerId, prizePaid);
  await db
    .update(disputes)
    .set({ status: "resolved", resolution: `winner:${finalized.winnerId}`, resolvedAt: new Date() })
    .where(eq(disputes.matchId, matchId));
  return sendMessage(chatId, [
    "✅ نتیجه مسابقه نهایی شد.",
    prizePaid ? `💰 جایزه ${CLASH_1V1_CONFIG.prize1st} به کیف پول برنده واریز شد.` : "💰 پرداخت جایزه قبلاً انجام شده یا برای این مسابقه لازم نبود.",
    "📣 نتیجه برای هر دو بازیکن ارسال شد.",
  ].join("\n"));
}

const OUTREACH_MESSAGE_TEMPLATE = `سلام 👋\n\nمن از تیم Gament هستم، پلتفرم برگزاری تورنومنت‌های گیمینگ (Call of Duty Mobile, Clash Royale, Fortnite).\n\nاگر به مسابقات گیمینگ، تورنومنت‌های پولی یا جامعهٔ بازیکنان علاقه‌مند هستی، به ما سر بزن:\n\n🔗 https://www.gament1.ir\n\nثبت‌نام اولیه از طریق ربات تلگرام هم امکان‌پذیره: @FlexaTournamentBot`;

async function classifiedAdsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  await clearSession(telegramId);
  const rows = await db
    .select()
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);

  if (!rows.length) {
    await sendMessage(chatId, "🔍 آگهی جدیدی یافت نشد.\n\nبرای اسکن دستور زیر را بزن:\n<code>/ads_scan</code>\nیا برای اسکن کل کشور:\n<code>/ads_allcities</code>", mainMenuKeyboard());
    return;
  }

  await sendMessage(chatId, `📋 <b>${rows.length} آگهی گیمینگ جدید</b>.\n\nبرای انتخاب گروهی، روی دکمه‌های ✅/⬜ کلیک کن. سپس عملیات گروهی را انتخاب کن:`, {
    inline_keyboard: rows.flatMap((ad) => [
      [{ text: `⬜ ${ad.platform} | ${ad.title.slice(0, 40)}`, callback_data: `ad:select:${ad.id}` }],
    ]),
  });
  await sendMessage(chatId, "عملیات گروهی:", {
    inline_keyboard: [
      [{ text: "📋 انتخاب همه", callback_data: "ad:bulk:select_all" }],
      [{ text: "✅ علامت‌گذاری انتخاب‌شده‌ها", callback_data: "ad:bulk:contact" }, { text: "❌ نادیده انتخاب‌شده‌ها", callback_data: "ad:bulk:ignore" }],
      [{ text: "📤 خروجی CSV انتخاب‌شده‌ها", callback_data: "ad:bulk:export" }],
      [{ text: "🔗 باز کردن همه انتخاب‌شده‌ها", callback_data: "ad:bulk:open" }],
    ],
  });
}

async function toggleAdSelection(chatId: number, telegramId: string, adId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const selected = new Set(session.data.selectedAdIds || []);
  if (selected.has(adId)) selected.delete(adId);
  else selected.add(adId);
  await setSession(telegramId, session.state, { ...session.data, selectedAdIds: Array.from(selected) });

  // Refresh list if possible
  await refreshAdsList(chatId, telegramId, messageId);
}

async function refreshAdsList(chatId: number, telegramId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return;
  const session = await getSession(telegramId);
  const selected = new Set(session.data.selectedAdIds || []);
  const rows = await db
    .select()
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);

  const keyboard = rows.flatMap((ad) => {
    const isSelected = selected.has(ad.id);
    return [
      [{ text: `${isSelected ? "✅" : "⬜"} ${ad.platform} | ${ad.title.slice(0, 40)}`, callback_data: `ad:select:${ad.id}` }],
      [{ text: "👁 مشاهده", callback_data: `ad:view:${ad.id}` }, { text: "🔗 باز کردن", url: ad.url }],
    ];
  });

  const text = `📋 <b>${rows.length} آگهی گیمینگ جدید</b>. انتخاب‌شده: <b>${selected.size}</b>`;
  if (messageId) await editMessage(chatId, messageId, text, { inline_keyboard: keyboard });
  else await sendMessage(chatId, text, { inline_keyboard: keyboard });
}

async function selectAllAds(chatId: number, telegramId: string, messageId?: number) {
  if (!hasAdminAccess(telegramId)) return;
  const rows = await db
    .select({ id: classifiedAds.id })
    .from(classifiedAds)
    .where(eq(classifiedAds.status, "new"))
    .orderBy(desc(classifiedAds.createdAt))
    .limit(20);
  await setSession(telegramId, "idle", { selectedAdIds: rows.map((r) => r.id) });
  await refreshAdsList(chatId, telegramId, messageId);
}

async function bulkMarkAds(chatId: number, telegramId: string, mode: "contacted" | "ignored") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده. اول /ads را بزن و آگهی‌ها را انتخاب کن.");

  for (const id of ids) {
    await db.delete(classifiedAds).where(eq(classifiedAds.id, id));
  }
  await clearSession(telegramId);
  await sendMessage(chatId, `🗑 ${ids.length} آگهی ${mode === "contacted" ? "تماس‌گرفته‌شده" : "نادیده"} از لیست حذف شد.`, mainMenuKeyboard());
}

async function bulkExportAds(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده.");

  const rows = await db.select().from(classifiedAds).where(inArray(classifiedAds.id, ids));
  const headers = ["platform", "city", "title", "price", "url", "keywords", "status"];
  const csv = [headers.join(","), ...rows.map((r) => [
    r.platform, r.city || "", r.title, r.price || "", r.url, (r.keywords as string[]).join("|"), r.status,
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");

  await sendDocument(chatId, "\ufeff" + csv, `selected_ads_${Date.now()}.csv`, `${rows.length} آگهی انتخاب‌شده`);
  await clearSession(telegramId);
}

async function bulkOpenAds(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const session = await getSession(telegramId);
  const ids = session.data.selectedAdIds || [];
  if (!ids.length) return sendMessage(chatId, "هیچ آگهی انتخاب نشده.");
  const rows = await db.select({ url: classifiedAds.url, title: classifiedAds.title }).from(classifiedAds).where(inArray(classifiedAds.id, ids));
  const links = rows.map((r, i) => `${i + 1}. <a href="${r.url}">${r.title.slice(0, 30)}</a>`).join("\n");
  await sendMessage(chatId, `🔗 <b>آگهی‌های انتخاب‌شده</b>\n\n${links}\n\nروی هر لینک کلیک کن و در دیوار/شیپور پیام بده.`, mainMenuKeyboard());
}

async function classifiedAdsScanCommand(chatId: number, telegramId: string, allCities = false) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  await sendMessage(chatId, `🔍 در حال اسکن ${allCities ? "کل کشور" : "تهران"} ... این فرایند چند دقیقه طول می‌کشد.`);
  const { runClassifiedScrape } = await import("@/lib/classified-scraper");
  const results = await runClassifiedScrape({ allCities, limitPerCity: 5 });
  const totalFound = results.reduce((sum, r) => sum + r.found, 0);
  const totalNew = results.reduce((sum, r) => sum + r.new, 0);
  const summary = results.filter((r) => r.found > 0 || r.status === "error").map((r) => `${r.platform} ${r.city}: ${r.found} یافت، ${r.new} جدید${r.error ? " (خطا)" : ""}`).join("\n");
  await sendMessage(chatId, `✅ اسکن تمام شد.\n\n<b>کل یافت: ${totalFound}</b>\n<b>کل جدید: ${totalNew}</b>\n\n${html(summary)}\n\nبرای مشاهده: /ads`, mainMenuKeyboard());
}

async function classifiedAdsStatsCommand(chatId: number, telegramId: string) {
  if (!hasAdminAccess(telegramId)) {
    await sendMessage(chatId, "شما دسترسی ادمین ندارید.");
    return;
  }
  const allAds = await db.select({ status: classifiedAds.status, platform: classifiedAds.platform }).from(classifiedAds);
  const byStatus: Record<string, number> = {};
  const byPlatform: Record<string, number> = {};
  for (const ad of allAds) {
    byStatus[ad.status] = (byStatus[ad.status] || 0) + 1;
    byPlatform[ad.platform] = (byPlatform[ad.platform] || 0) + 1;
  }

  const [lastLog] = await db.select().from(classifiedScrapeLogs).orderBy(desc(classifiedScrapeLogs.createdAt)).limit(1);

  const text = [
    "📊 <b>آمار آگهی‌های گیمینگ</b>",
    "",
    "📁 کل آگهی‌ها: <b>" + allAds.length + "</b>",
    "🆕 جدید: <b>" + (byStatus.new || 0) + "</b>",
    "✅ تماس گرفته شده: <b>" + (byStatus.contacted || 0) + "</b>",
    "❌ نادیده: <b>" + (byStatus.ignored || 0) + "</b>",
    "",
    "🏪 دیوار: <b>" + (byPlatform.divar || 0) + "</b>",
    "🏪 شیپور: <b>" + (byPlatform.sheypoor || 0) + "</b>",
    "",
    lastLog
      ? `آخرین اسکن: <b>${lastLog.platform}</b> | ${lastLog.status} | ${lastLog.itemsFound} یافت، ${lastLog.itemsNew} جدید`
      : "هنوز اسکنی ثبت نشده.",
  ].join("\n");

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "🔍 مشاهده آگهی‌های جدید", callback_data: "menu:ads" }],
      [{ text: "🚀 اسکن تهران", callback_data: "menu:ads_scan" }, { text: "🇮🇷 اسکن کل کشور", callback_data: "menu:ads_scan_all" }],
    ],
  });
}

async function viewClassifiedAd(chatId: number, telegramId: string, adId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  if (!ad) return sendMessage(chatId, "آگهی پیدا نشد.");

  const text = [
    `📌 <b>${html(ad.title)}</b>`,
    `🏪 پلتفرم: <b>${html(ad.platform)}</b>`,
    ad.city ? `📍 شهر: <b>${html(ad.city)}</b>` : "",
    ad.price ? `💰 قیمت: <b>${html(ad.price)}</b>` : "",
    ad.keywords && (ad.keywords as string[]).length ? `🏷 کلمات: <b>${(ad.keywords as string[]).join(", ")}</b>` : "",
    "",
    `📝 ${html(ad.description || "بدون توضیحات")}`,
  ].filter(Boolean).join("\n");

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "🔗 باز کردن آگهی", url: ad.url }],
      [
        { text: "✅ تماس گرفتم", callback_data: `ad:contact:${ad.id}` },
        { text: "❌ نادیده", callback_data: `ad:ignore:${ad.id}` },
      ],
      [
        { text: "📋 کپی متن پیام", callback_data: `ad:copy:${ad.id}` },
        { text: "🗑 حذف از لیست", callback_data: `ad:delete:${ad.id}` },
      ],
      [{ text: "🔙 لیست آگهی‌ها", callback_data: "menu:ads" }],
    ],
  });
}

async function contactClassifiedAd(chatId: number, telegramId: string, adId: string, method: "contact" | "ignore" | "delete") {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  if (!ad) return sendMessage(chatId, "آگهی پیدا نشد.");

  if (method === "delete") {
    await db.delete(classifiedAds).where(eq(classifiedAds.id, adId));
    await sendMessage(chatId, "🗑 آگهی از لیست حذف شد.", mainMenuKeyboard());
    return;
  }

  const status = method === "contact" ? "contacted" : "ignored";
  await db
    .update(classifiedAds)
    .set({ status, contactedAt: method === "contact" ? new Date() : null, contactMethod: "telegram_admin", updatedAt: new Date() })
    .where(eq(classifiedAds.id, adId));

  if (method === "contact") {
    await sendMessage(chatId, `✅ آگهی <b>${html(ad.title)}</b> به عنوان «تماس گرفته شده» ثبت شد.\n\nمتن پیشنهادی برای ارسال دستی در دیوار/شیپور:\n\n<pre>${html(OUTREACH_MESSAGE_TEMPLATE)}</pre>`, {
      inline_keyboard: [[{ text: "🔗 باز کردن آگهی", url: ad.url }], [{ text: "🔙 لیست آگهی‌ها", callback_data: "menu:ads" }]],
    });
  } else {
    await sendMessage(chatId, "آگهی نادیده گرفته شد. از لیست حذف شد.", mainMenuKeyboard());
  }
}

async function copyOutreachMessage(chatId: number, telegramId: string, adId: string) {
  if (!hasAdminAccess(telegramId)) return sendMessage(chatId, "شما دسترسی ادمین ندارید.");
  const [ad] = await db.select().from(classifiedAds).where(eq(classifiedAds.id, adId)).limit(1);
  await sendMessage(chatId, `📋 متن آماده برای ارسال دستی به آگهی <b>${html(ad?.title || "")}</b>:\n\n<pre>${html(OUTREACH_MESSAGE_TEMPLATE)}</pre>\n\nبرای ارسال، روی لینک آگهی کلیک کن و در دیوار/شیپور پیام را بچسبان.`, {
    inline_keyboard: [[{ text: "🔗 باز کردن آگهی", url: ad?.url || APP_URL }], [{ text: "✅ تماس گرفتم", callback_data: `ad:contact:${adId}` }]],
  });
}

async function handleCommand(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const telegramId = String(user.id);
  const parsed = parseTelegramCommand(text);
  if (!parsed) return;
  const { command: normalizedCommand, args } = parsed;

  if (normalizedCommand === "/start") {
    const payload = args[0];
    await recordReferralIfNeeded(user, payload);
    if (await handleStartPayload(chatId, telegramId, user, payload)) return;
    return startCommand(chatId);
  }
  if (normalizedCommand === "/help") return startCommand(chatId);
  if (normalizedCommand === "/links") return linksCommand(chatId);
  if (normalizedCommand === "/deep_links") return deepLinksCommand(chatId, telegramId);
  if (normalizedCommand === "/channel") return channelCommand(chatId);
  if (normalizedCommand === "/link") return linkCommand(chatId, user);
  if (normalizedCommand === "/profile") return profileCommand(chatId, telegramId);
  if (normalizedCommand === "/wallet") return walletCommand(chatId, telegramId);
  if (normalizedCommand === "/deposit" || normalizedCommand === "/wallet_deposit") { if (!(await ensureFeatureEnabled(chatId, "telegram_wallet_deposit_enabled", "ثبت فیش از ربات"))) return; return startWalletDeposit(chatId, telegramId); }
  if (normalizedCommand === "/achievements") return achievementsCommand(chatId, telegramId);
  if (normalizedCommand === "/my_tournaments") return myTournamentsCommand(chatId, telegramId);
  if (normalizedCommand === "/daily") return dailyCommand(chatId, telegramId);
  if (normalizedCommand === "/quiz" || normalizedCommand === "/challenge") { if (!(await ensureFeatureEnabled(chatId, "telegram_quiz_enabled", "کوییز روزانه"))) return; return quizCommand(chatId, telegramId); }
  if (normalizedCommand === "/coupon") return couponCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/shop") return shopCommand(chatId);
  if (normalizedCommand === "/invite") return inviteCommand(chatId, telegramId);
  if (normalizedCommand === "/missions") { if (!(await ensureFeatureEnabled(chatId, "telegram_missions_enabled", "مأموریت‌ها"))) return; return missionsCommand(chatId, telegramId); }
  if (normalizedCommand === "/claim_missions") return missionsCommand(chatId, telegramId);
  if (normalizedCommand === "/leaderboard") return leaderboardCommand(chatId);
  if (normalizedCommand === "/ai") { if (!(await ensureFeatureEnabled(chatId, "telegram_ai_enabled", "دستیار AI"))) return; return aiCommand(chatId, args.join(" "), telegramId); }
  if (normalizedCommand === "/support") { if (!(await ensureFeatureEnabled(chatId, "telegram_support_enabled", "پشتیبانی"))) return; return supportStartCommand(chatId, telegramId); }
  if (normalizedCommand === "/my_tickets") return myTicketsCommand(chatId, telegramId);
  if (normalizedCommand === "/matches") return matchesCommand(chatId, telegramId);
  if (["/clash_tournament", "/clash_multi"].includes(normalizedCommand)) return clashPrivateTournamentsCommand(chatId, telegramId);
  if (["/qr", "/clash_qr", "/clash_link", "/clash", "/clash_1v1", "/1v1"].includes(normalizedCommand)) {
    const tournamentId = args.join(" ").match(/[0-9a-f-]{36}/i)?.[0];
    return tournamentId ? startClashQrSubmission(chatId, telegramId, tournamentId) : openClash1v1Queue(chatId, telegramId);
  }
  if (normalizedCommand === "/checkin") return checkInCommand(chatId, telegramId);
  if (normalizedCommand === "/judge") return judgeCommand(chatId, telegramId);
  if (normalizedCommand === "/health") return healthCommand(chatId, telegramId);
  if (normalizedCommand === "/export_telegram") return exportTelegramCommand(chatId, telegramId);
  if (normalizedCommand === "/poll") return pollCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/ads") return classifiedAdsCommand(chatId, telegramId);
  if (normalizedCommand === "/ads_scan") return classifiedAdsScanCommand(chatId, telegramId, false);
  if (normalizedCommand === "/ads_allcities") return classifiedAdsScanCommand(chatId, telegramId, true);
  if (normalizedCommand === "/ads_stats") return classifiedAdsStatsCommand(chatId, telegramId);
  if (normalizedCommand === "/rules") return rulesCommand(chatId);
  if (normalizedCommand === "/howto" || normalizedCommand === "/guide") {
    const game = normalizeGame(args.join(" "));
    if (game && ["cod_mobile", "clash_royale", "fortnite"].includes(game)) {
      const guide = getGameIdGuide(game);
      return sendMessage(chatId, [`<b>${guide.title}</b>`, "", ...guide.steps].join("\n"));
    }
    return sendMessage(chatId, "🎮 برای کدام بازی آیدی را پیدا می‌کنی؟", gameGuideKeyboard());
  }
  if (normalizedCommand === "/rooms") return roomsCommand(chatId, args.join(" "));
  if (normalizedCommand === "/register") return registerStart(chatId, telegramId);
  if (normalizedCommand === "/status") return statusCommand(chatId, telegramId);
  if (normalizedCommand === "/unregister") return unregisterCommand(chatId, telegramId);
  if (normalizedCommand === "/admin" || normalizedCommand === "/stats") return adminCommand(chatId, telegramId);
  if (normalizedCommand === "/players") return playersCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_wallets") return pendingWalletsCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_disputes") return pendingDisputesCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_support") return pendingSupportCommand(chatId, telegramId);
  if (normalizedCommand === "/pending_honors") return pendingHonorsCommand(chatId, telegramId);
  if (normalizedCommand === "/honor_stats") return honorStatsCommand(chatId, telegramId);
  if (normalizedCommand === "/ops") return adminCommand(chatId, telegramId);
  if (normalizedCommand === "/manage" || normalizedCommand === "/tournaments_admin") return adminTournamentsCommand(chatId, telegramId);
  if (normalizedCommand === "/post_latest") return postLatestTournamentCommand(chatId, telegramId);
  if (normalizedCommand === "/announce") return announceCommand(chatId, telegramId, args.join(" "));
  if (normalizedCommand === "/announce_game") {
    const [game, ...messageParts] = args;
    return announceCommand(chatId, telegramId, messageParts.join(" "), game);
  }

  return sendMessage(chatId, "دستور را متوجه نشدم. از /start استفاده کن.", mainMenuKeyboard());
}

async function handleConversationMessage(message: TelegramMessage) {
  const chatId = message.chat.id;
  const user = message.from;
  if (!user) return;
  const telegramId = String(user.id);
  const text = normalizeDigits(message.text || "").trim();
  const session = await getSession(telegramId);

  if (text === CANCEL_TEXT) {
    if (session.state === "clash_1v1_qr_submission" && session.data.clash1v1EntryId) {
      await cancelClash1v1Queue(chatId, telegramId, session.data.clash1v1EntryId);
      return;
    }
    await clearSession(telegramId);
    await sendMessage(chatId, "عملیات لغو شد.", removeKeyboard());
    await startCommand(chatId);
    return;
  }

  const data = { ...session.data };

  if (session.state === "clash_1v1_qr_submission") {
    if (!data.clash1v1EntryId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات صف ناقص است. دوباره /qr را بزن.", removeKeyboard());
      return;
    }
    const bestQrPhoto = message.photo?.[message.photo.length - 1];
    let qrPhoto: { buffer: Buffer; contentType: string; fileId: string } | undefined;
    if (bestQrPhoto) {
      try {
        const file = await downloadTelegramQrPhoto(bestQrPhoto.file_id);
        qrPhoto = { buffer: file.buffer, contentType: file.contentType, fileId: bestQrPhoto.file_id };
      } catch (err) {
        logger.warn({ err, telegramId }, "Failed to download Clash 1V1 QR photo");
        await sendMessage(chatId, "عکس QR قابل دریافت نیست؛ عکس واضح‌تری بفرست یا Share Link را Paste کن.");
        return;
      }
    }
    await submitClash1v1Qr({ chatId, telegramId, entryId: data.clash1v1EntryId, text: message.caption || message.text || "", qrPhoto });
    return;
  }

  if (session.state === "clash_qr_submission") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.qrRegistrationId || !data.qrTournamentId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات پیوند دوستی ناقص است. دوباره /qr یا /clash_link را بزن.", removeKeyboard());
      return;
    }

    const [registration] = await db
      .select({
        registrationId: registrations.id,
        tournamentId: registrations.tournamentId,
        tournamentName: tournaments.name,
        game: tournaments.game,
        entryFee: tournaments.entryFee,
        categoryLabel: tournaments.categoryLabel,
      })
      .from(registrations)
      .innerJoin(tournaments, eq(registrations.tournamentId, tournaments.id))
      .where(and(eq(registrations.id, data.qrRegistrationId), eq(registrations.visibleUserId, linked.userId)))
      .limit(1);

    if (
      !registration ||
      registration.game !== "clash_royale" ||
      registration.categoryLabel !== CLASH_1V1_CONFIG.categoryLabel ||
      isFreeEntryFee(registration.entryFee)
    ) {
      await clearSession(telegramId);
      await sendMessage(chatId, "این ثبت‌نام برای 1V1 کلش رویال معتبر نیست یا تورنومنت پولی کلش نیست.", removeKeyboard());
      return;
    }

    const rawInput = normalizeDigits(message.caption || message.text || "").trim();
    const extractedInvite = extractInviteReference(rawInput);
    const inviteLink = isSupportedClashInvite(extractedInvite) ? extractedInvite : null;

    if (!inviteLink) {
      await sendMessage(chatId, [
        "❌ پیوند دوستی معتبر پیدا نشد.",
        "",
        "در Clash Royale برو به:",
        "<code>اجتماعی → افزودن دوست (+) → اشتراک‌گذاری پیوند</code>",
        "سپس پیوند رسمی <code>link.clashroyale.com/invite/friend</code> را بفرست.",
        "⚠️ عکس QR پذیرفته نمی‌شود.",
        "",
        "برای لغو، «لغو» را بزن.",
      ].join("\n"));
      return;
    }

    await db
      .update(registrations)
      .set({
        gameInviteLink: inviteLink,
        gameInviteQrFileId: null,
        gameInviteSubmittedAt: new Date(),
      })
      .where(eq(registrations.id, registration.registrationId));

    await clearSession(telegramId);
    await sendMessage(
      chatId,
      [
        "✅ پیوند دوستی 1V1 کلش رویال شما ثبت شد.",
        "",
        "اکنون در صف هستی. هر وقت یک بازیکن دیگر آماده شود، بات پیوند دوستی شما را برای یکدیگر می‌فرستد.",
      ].join("\n"),
      removeKeyboard()
    );

    const pairs = await tryAutoPairClashTournament(registration.tournamentId);
    await notifyClashPairs(pairs);
    return;
  }


  if (session.state === "wallet_deposit_amount") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "حساب شما لینک نیست. اول /link را انجام بده.", removeKeyboard());
      return;
    }
    const amountRial = parseTomanToRial(text);
    const validation = validateDepositAmountRial(amountRial);
    if (!validation.ok) {
      await sendMessage(chatId, `${html(validation.error)}\n\nمبلغ را دوباره به تومان وارد کن:`);
      return;
    }
    data.walletDepositAmountToman = rialToTomanNumber(amountRial).toString();
    await setSession(telegramId, "wallet_deposit_tracking", data);
    await sendMessage(chatId, `مبلغ ثبت شد: <b>${html(formatTomanFromRial(amountRial))}</b>\n\nشماره پیگیری یا ۴ رقم آخر کارت مبدأ را بفرست. اگر نداری «رد کردن» را بزن.`, replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "wallet_deposit_tracking") {
    data.walletDepositTracking = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "wallet_deposit_receipt", data);
    await sendMessage(chatId, "حالا تصویر فیش واریز را به‌صورت عکس ارسال کن.\n\nحداکثر حجم قابل قبول ۱.۲ مگابایت است.", replyKeyboard([[CANCEL_TEXT]]));
    return;
  }

  if (session.state === "wallet_deposit_receipt") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.walletDepositAmountToman) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات واریز ناقص است. دوباره /deposit را شروع کن.", removeKeyboard());
      return;
    }
    const photos = message.photo || [];
    const bestPhoto = photos[photos.length - 1];
    if (!bestPhoto) {
      await sendMessage(chatId, "لطفاً فیش را به‌صورت عکس ارسال کن، نه متن یا فایل دیگر.");
      return;
    }

    try {
      const amountRial = parseTomanToRial(data.walletDepositAmountToman);
      const receipt = await downloadTelegramPhotoAsDataUrl(bestPhoto.file_id);
      const wallet = await getOrCreateWallet(linked.userId);
      const [tx] = await db.insert(transactions).values({
        walletId: wallet.id,
        amount: amountRial.toString(),
        type: "deposit",
        status: "pending",
        referenceId: createWalletReference("deposit"),
        metadata: {
          kind: "manual_deposit_request",
          provider: "telegram_bot_card_transfer",
          withdrawable: false,
          userId: linked.userId,
          telegramId,
          displayName: linked.displayName,
          trackingNumber: data.walletDepositTracking || null,
          note: sanitizeWalletNote(message.caption || "ثبت از ربات تلگرام"),
          receiptUploaded: true,
          receiptUrl: receipt.dataUrl,
          receiptFileName: receipt.fileName,
          receiptFileType: receipt.contentType,
          receiptFileSize: receipt.size,
          telegramFileId: bestPhoto.file_id,
          telegramFileUniqueId: bestPhoto.file_unique_id,
        },
      }).returning();

      await clearSession(telegramId);
      await sendMessage(chatId, `✅ فیش واریز ثبت شد.\n\nمبلغ: <b>${html(formatTomanFromRial(amountRial))}</b>\nوضعیت: <b>در انتظار بررسی ادمین</b>\n\nبعد از تأیید مدیریت، موجودی کیف پولت افزایش پیدا می‌کند.`, {
        inline_keyboard: [[{ text: "مشاهده کیف پول", url: `${APP_URL}/wallet` }]],
      });
      await notifyAdminsOnWalletDeposit(user, linked.userId, amountRial, tx.id).catch((err) => logger.warn({ err }, "Failed to notify admins on Telegram wallet deposit"));
    } catch (err) {
      const messageText = err instanceof Error && err.message === "RECEIPT_TOO_LARGE"
        ? "حجم تصویر فیش بیشتر از ۱.۲ مگابایت است. لطفاً تصویر سبک‌تر ارسال کن."
        : "ثبت فیش انجام نشد. لطفاً دوباره عکس فیش را ارسال کن یا بعداً از سایت اقدام کن.";
      await sendMessage(chatId, messageText);
    }
    return;
  }

  if (session.state === "evidence_upload") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.evidenceMatchId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات ارسال مدرک ناقص است. دوباره /matches را بزن.");
      return;
    }
    const photos = message.photo || [];
    const bestPhoto = photos[photos.length - 1];
    if (!bestPhoto) {
      await sendMessage(chatId, "لطفاً مدرک را به‌صورت عکس ارسال کن.");
      return;
    }
    const [match] = await db.select().from(matches).where(eq(matches.id, data.evidenceMatchId)).limit(1);
    const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
    const isMyMatch = myPlayers.some((p) => p.id === match?.player1Id || p.id === match?.player2Id);
    if (!match || !isMyMatch) {
      await clearSession(telegramId);
      await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
      return;
    }
    if (match.status === "completed") {
      await clearSession(telegramId);
      await sendMessage(chatId, "نتیجه این مسابقه قبلاً نهایی شده است.", removeKeyboard());
      return;
    }
    await db.insert(matchEvidence).values({
      matchId: match.id,
      uploadedById: linked.userId,
      fileUrl: `telegram_file:${bestPhoto.file_id}`,
      fileType: "photo",
      description: message.caption || "Telegram screenshot evidence",
    });
    await clearSession(telegramId);
    await sendMessage(
      chatId,
      match.status === "disputed"
        ? "✅ اسکرین‌شات ثبت و به پرونده داوری اضافه شد."
        : "✅ اسکرین‌شات ثبت شد؛ فقط در صورت اختلاف برای داور نمایش داده می‌شود.",
      removeKeyboard(),
    );
    if (match.status === "disputed") {
      await notifyResultAdmins(match.id, `📎 <b>مدرک جدید اختلاف</b>\nMatch: <code>${html(match.id.slice(0, 8))}</code>\nارسال‌کننده: <code>${html(telegramId)}</code>`);
    }
    return;
  }

  if (session.state === "support_subject") {
    if (text.length < 3 || text.length > 120) {
      await sendMessage(chatId, "موضوع باید بین ۳ تا ۱۲۰ کاراکتر باشد. دوباره بنویس:");
      return;
    }
    data.supportSubject = text;
    await setSession(telegramId, "support_message", data);
    await sendMessage(chatId, "متن پیام پشتیبانی را بنویس:");
    return;
  }

  if (session.state === "support_message") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "حساب شما لینک نیست. اول /link را انجام بده.");
      return;
    }
    if (text.length < 5 || text.length > 2000) {
      await sendMessage(chatId, "متن پیام باید بین ۵ تا ۲۰۰۰ کاراکتر باشد. دوباره بنویس:");
      return;
    }
    const [ticket] = await db.insert(tickets).values({ userId: linked.userId, subject: data.supportSubject || "پشتیبانی تلگرام" }).returning();
    await db.insert(ticketMessages).values({ ticketId: ticket.id, senderId: linked.userId, message: text });
    await clearSession(telegramId);
    await sendMessage(chatId, "✅ تیکت پشتیبانی شما ثبت شد. از داخل سایت هم می‌توانید پیگیری کنید.", {
      inline_keyboard: [[{ text: "مرکز پشتیبانی", url: `${APP_URL}/support` }], [{ text: "تیکت‌های من", callback_data: "support:mine" }]],
    });
    await notifyAdminsOnSupportTicket(user, linked.userId, ticket.id, data.supportSubject || "پشتیبانی تلگرام", text).catch((err) => logger.warn({ err, ticketId: ticket.id }, "Failed to notify admins on Telegram support ticket"));
    return;
  }

  if (session.state === "dispute_reason") {
    const linked = await getLinkedUserByTelegram(telegramId);
    if (!linked?.userId || !data.disputeMatchId) {
      await clearSession(telegramId);
      await sendMessage(chatId, "اطلاعات اعتراض ناقص است. دوباره /matches را بزن.");
      return;
    }
    const myPlayers = await db.select({ id: players.id }).from(players).where(eq(players.visibleUserId, linked.userId));
    const playerIds = myPlayers.map((p) => p.id);
    const [match] = await db.select().from(matches).where(eq(matches.id, data.disputeMatchId)).limit(1);
    const raisedById = playerIds.find((id) => id === match?.player1Id || id === match?.player2Id);
    if (!match || !raisedById) {
      await clearSession(telegramId);
      await sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
      return;
    }
    await db.insert(disputes).values({ matchId: match.id, raisedById, reason: text, evidenceUrls: [] });
    await db.update(matches).set({ status: "disputed" }).where(eq(matches.id, match.id));
    await clearSession(telegramId);
    await sendMessage(chatId, "✅ اعتراض شما ثبت شد و در پنل داوری بررسی می‌شود.");
    await notifyResultAdmins(match.id, `🚨 <b>اعتراض جدید مسابقه</b>\nMatch: <code>${html(match.id.slice(0, 8))}</code>\nدلیل: ${html(text.slice(0, 500))}`);
    return;
  }

  if (session.state === "full_name") {
    if (text.length < 2 || text.length > 80) {
      await sendMessage(chatId, "نام معتبر نیست. لطفاً نام نمایشی یا نام کامل را دوباره وارد کن:");
      return;
    }
    data.fullName = text;
    await setSession(telegramId, "gamer_tag", data);
    await sendMessage(chatId, gamePrompt(data.game));
    return;
  }

  if (session.state === "gamer_tag") {
    if (text.length < 2 || text.length > 80) {
      await sendMessage(chatId, "آیدی بازی معتبر نیست. دوباره وارد کن:");
      return;
    }
    data.gamerTag = text;
    await setSession(telegramId, "phone", data);
    await sendMessage(chatId, "شماره تماس خودت را وارد کن یا دکمه ارسال شماره را بزن:", {
      keyboard: [[{ text: "📱 ارسال شماره من", request_contact: true }], [CANCEL_TEXT]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
    return;
  }

  if (session.state === "phone") {
    const phone = message.contact?.phone_number ? normalizePhoneNumber(message.contact.phone_number) : normalizePhoneNumber(text);
    if (!/^09\d{9}$/.test(phone)) {
      await sendMessage(chatId, "شماره تماس معتبر نیست. نمونه درست: 09123456789");
      return;
    }
    if (message.contact?.user_id && message.contact.user_id !== user.id) {
      await sendMessage(chatId, "لطفاً شماره تماس خودت را ارسال کن، نه مخاطب دیگران.");
      return;
    }
    data.phoneNumber = phone;
    await setSession(telegramId, "gament_id", data);
    await sendMessage(
      chatId,
      GAMENT_ID_REQUIRED
        ? `Gament ID خودت را وارد کن؛ مثل <code>FLX-1234</code>. اگر حساب نداری اول از وب‌اپ بساز: ${html(`${APP_URL}/register`)}`
        : `اگر در وب‌اپ Gament حساب داری، Gament ID خودت را وارد کن؛ مثل <code>FLX-1234</code>. اگر هنوز حساب نداری، «رد کردن» را بزن.`,
      GAMENT_ID_REQUIRED ? removeKeyboard() : replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]])
    );
    return;
  }

  if (session.state === "gament_id") {
    if (text === SKIP_TEXT && !GAMENT_ID_REQUIRED) {
      data.gamentId = "";
    } else if (!isValidGamentId(text)) {
      await sendMessage(chatId, "Gament ID معتبر نیست. نمونه درست: <code>FLX-1234</code>", GAMENT_ID_REQUIRED ? undefined : replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
      return;
    } else {
      data.gamentId = normalizeGamentId(text);
    }
    await setSession(telegramId, "city", data);
    await sendMessage(chatId, "شهر محل سکونت را بنویس. اگر لازم نیست، «رد کردن» را بزن:", replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "city") {
    data.city = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "team", data);
    await sendMessage(chatId, "نام تیم/کلن را بنویس. اگر انفرادی هستی، «رد کردن» را بزن:", replyKeyboard([[SKIP_TEXT], [CANCEL_TEXT]]));
    return;
  }

  if (session.state === "team") {
    data.teamName = text === SKIP_TEXT ? "" : text.slice(0, 80);
    await setSession(telegramId, "confirm", data);
    await sendMessage(chatId, "✅ اطلاعات دریافت شد.", removeKeyboard());
    await sendMessage(chatId, `${registrationSummary(data)}\n\nاگر اطلاعات درست است، ثبت نهایی را بزن.`, confirmKeyboard());
    return;
  }

  await sendMessage(chatId, "متوجه نشدم. از /start استفاده کن.", mainMenuKeyboard());
}

async function handleCallback(callback: TelegramCallbackQuery) {
  const chatId = callback.message?.chat.id;
  const messageId = callback.message?.message_id;
  const telegramId = String(callback.from.id);
  const data = callback.data || "";

  // A stale/expired Telegram callback acknowledgement must not prevent the
  // underlying action (notably the 1V1 button) from running.
  await answerCallback(callback.id).catch((err) => {
    logger.warn({ err, callbackData: data, telegramId }, "Telegram callback acknowledgement failed");
  });
  if (!chatId) return;

  if (data === "support:mine") return myTicketsCommand(chatId, telegramId);
  if (data === "menu:home") return startCommand(chatId);
  if (data === "mission:invite") return inviteCommand(chatId, telegramId);
  if (data.startsWith("mission:claim:")) return claimMissionReward(chatId, telegramId, data.replace("mission:claim:", ""));
  if (data === "admin:wallets") return pendingWalletsCommand(chatId, telegramId);
  if (data === "admin:disputes") return pendingDisputesCommand(chatId, telegramId);
  if (data === "admin:support") return pendingSupportCommand(chatId, telegramId);
  if (data === "admin:honors") return pendingHonorsCommand(chatId, telegramId);
  if (data === "admin:honor_stats") return honorStatsCommand(chatId, telegramId);
  if (data === "admin:tournaments") return adminTournamentsCommand(chatId, telegramId);
  if (data.startsWith("honor:")) {
    const [, action, honorId] = data.split(":");
    if ((action === "approve" || action === "reject") && honorId) return reviewHonorFromTelegram(chatId, telegramId, honorId, action);
  }
  if (data === "menu:rooms") return roomsCommand(chatId);
  if (data === "menu:register") return registerStart(chatId, telegramId);
  if (data === "menu:ads") return classifiedAdsCommand(chatId, telegramId);
  if (data === "menu:ads_scan") return classifiedAdsScanCommand(chatId, telegramId, false);
  if (data === "menu:ads_scan_all") return classifiedAdsScanCommand(chatId, telegramId, true);
  if (data.startsWith("howto:")) {
    const game = data.replace("howto:", "");
    const guide = getGameIdGuide(game);
    return sendMessage(chatId, [`<b>${guide.title}</b>`, "", ...guide.steps].join("\n"));
  }
  if (data.startsWith("ad:select:")) return toggleAdSelection(chatId, telegramId, data.replace("ad:select:", ""), messageId);
  if (data === "ad:bulk:select_all") return selectAllAds(chatId, telegramId, messageId);
  if (data === "ad:bulk:contact") return bulkMarkAds(chatId, telegramId, "contacted");
  if (data === "ad:bulk:ignore") return bulkMarkAds(chatId, telegramId, "ignored");
  if (data === "ad:bulk:export") return bulkExportAds(chatId, telegramId);
  if (data === "ad:bulk:open") return bulkOpenAds(chatId, telegramId);
  if (data.startsWith("ad:view:")) return viewClassifiedAd(chatId, telegramId, data.replace("ad:view:", ""));
  if (data.startsWith("ad:contact:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:contact:", ""), "contact");
  if (data.startsWith("ad:ignore:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:ignore:", ""), "ignore");
  if (data.startsWith("ad:delete:")) return contactClassifiedAd(chatId, telegramId, data.replace("ad:delete:", ""), "delete");
  if (data.startsWith("ad:copy:")) return copyOutreachMessage(chatId, telegramId, data.replace("ad:copy:", ""));
  if (data.startsWith("joinprivate:confirm:")) return joinTournamentFromTelegram(chatId, telegramId, data.replace("joinprivate:confirm:", ""), true);
  if (data.startsWith("join:")) return joinTournamentFromTelegram(chatId, telegramId, data.replace("join:", ""));
  if (data.startsWith("waitlist:")) return joinWaitlist(chatId, telegramId, data.replace("waitlist:", ""));
  if (data === "menu:rules") return rulesCommand(chatId);
  if (data === "menu:status") return statusCommand(chatId, telegramId);
  if (data === "menu:link") return linkCommand(chatId, callback.from);
  if (data === "menu:profile") return profileCommand(chatId, telegramId);
  if (data === "menu:wallet") return walletCommand(chatId, telegramId);
  if (data === "menu:my_tournaments") return myTournamentsCommand(chatId, telegramId);
  if (data === "menu:matches") return matchesCommand(chatId, telegramId);
  if (data === "menu:clash_private") return clashPrivateTournamentsCommand(chatId, telegramId);
  if (data.startsWith("clash1v1:opponent:")) {
    const opponentType = data.replace("clash1v1:opponent:", "");
    if (isClashDuelOpponentType(opponentType)) return showClash1v1StakeMenu(chatId, opponentType);
  }
  if (data.startsWith("clash1v1:stake:")) {
    const [, , opponentType, stakeMode] = data.split(":");
    if (isClashDuelOpponentType(opponentType) && isClashDuelStakeMode(stakeMode)) {
      return showClash1v1ModeMenu(chatId, opponentType, stakeMode);
    }
  }
  if (data.startsWith("clash1v1:mode:")) {
    const [, , opponentType, stakeMode, gameMode] = data.split(":");
    if (isClashDuelOpponentType(opponentType) && isClashDuelStakeMode(stakeMode) && isClashDuelGameMode(gameMode)) {
      return opponentType === "random"
        ? registerClash1v1Queue(chatId, telegramId, { stakeMode, gameMode })
        : createClashFriendChallenge(chatId, telegramId, stakeMode, gameMode);
    }
  }
  if (data.startsWith("c1f:")) {
    const [, action, value, challengeIdMaybe] = data.split(":");
    if (action === "accept" && value) return acceptFriendChallenge(chatId, telegramId, value);
    if (action === "modes" && value) return showFriendChallengeModeMenu(chatId, telegramId, value);
    if (action === "mode" && value && challengeIdMaybe) return counterFriendChallengeMode(chatId, telegramId, challengeIdMaybe, value);
    if (action === "cancel" && value) return closeFriendChallenge(chatId, telegramId, value, "cancel");
    if (action === "reject" && value) return closeFriendChallenge(chatId, telegramId, value, "reject");
  }
  if (data === "menu:clash_qr" || data === "clash1v1:status") return openClash1v1Queue(chatId, telegramId);
  if (data === "clash1v1:register") return openClash1v1Queue(chatId, telegramId);
  if (data.startsWith("clash1v1:qr:")) return promptClash1v1Qr(chatId, telegramId, data.replace("clash1v1:qr:", ""));
  if (data.startsWith("clash1v1:ready:")) return markClash1v1Ready(chatId, telegramId, data.replace("clash1v1:ready:", ""));
  if (data.startsWith("clash1v1:cancel:")) return cancelClash1v1Queue(chatId, telegramId, data.replace("clash1v1:cancel:", ""));
  if (data.startsWith("qr:")) return startClashQrSubmission(chatId, telegramId, data.replace("qr:", ""));
  if (data === "menu:checkin") return checkInCommand(chatId, telegramId);
  if (data === "menu:missions") { if (!(await ensureFeatureEnabled(chatId, "telegram_missions_enabled", "مأموریت‌ها"))) return; return missionsCommand(chatId, telegramId); }
  if (data === "menu:quiz") { if (!(await ensureFeatureEnabled(chatId, "telegram_quiz_enabled", "کوییز روزانه"))) return; return quizCommand(chatId, telegramId); }
  if (data === "menu:support") { if (!(await ensureFeatureEnabled(chatId, "telegram_support_enabled", "پشتیبانی"))) return; return supportStartCommand(chatId, telegramId); }
  if (data === "wallet:deposit") { if (!(await ensureFeatureEnabled(chatId, "telegram_wallet_deposit_enabled", "ثبت فیش از ربات"))) return; return startWalletDeposit(chatId, telegramId); }
  if (data.startsWith("match:")) return handleMatchAction(chatId, telegramId, data.replace("match:", ""));
  if (data.startsWith("result:")) {
    const [, action, matchId] = data.split(":");
    if ((action === "win" || action === "lose") && matchId) return submitTelegramResult(chatId, telegramId, matchId, action);
    if (action === "verify" && matchId) {
      const { linked, rows } = await userMatchRows(telegramId);
      if (!linked || !rows.some((match) => match.id === matchId)) return sendMessage(chatId, "این مسابقه برای حساب شما پیدا نشد.");
      const settlement = await verifyAndFinalizeAgreedMatch(matchId);
      if (settlement.state === "completed") {
        await notifyFinalMatchResult(matchId, settlement.winnerId, settlement.prizePaid);
        return sendMessage(chatId, "✅ Battle Log تأیید شد و نتیجه/جایزه نهایی شد.");
      }
      if (settlement.state === "replay_required") {
        return sendMessage(chatId, "⚠️ مود بازی رایگان با مود توافق‌شده یکی نبود. نتیجه حذف شد؛ از وضعیت 1V1 مسابقه را با مود درست دوباره شروع کنید.", {
          inline_keyboard: [[{ text: "🎮 شروع دوباره", callback_data: "clash1v1:status" }]],
        });
      }
      if (settlement.state === "disputed") {
        await notifyResultAdmins(matchId, `🚨 <b>اختلاف با Clash Royale API</b>\nMatch: <code>${html(matchId.slice(0, 8))}</code>`);
        return sendMessage(chatId, "🚨 نتیجه با Battle Log مطابقت ندارد و برای داوری ارسال شد.");
      }
      if (settlement.state === "missing_tags") return sendMessage(chatId, "هر دو بازیکن باید Player Tag تأییدشده را در پروفایل ثبت کنند.");
      return sendMessage(chatId, "⏳ Battle Log هنوز در API دیده نمی‌شود. یک دقیقه دیگر دوباره تلاش کن.");
    }
  }
  if (data.startsWith("dispute:")) return startDispute(chatId, telegramId, data.replace("dispute:", ""));
  if (data.startsWith("evidence:")) return startEvidenceUpload(chatId, telegramId, data.replace("evidence:", ""));
  if (data.startsWith("judge:")) {
    const [, action, matchId] = data.split(":");
    if (action && matchId) return handleJudgeAction(chatId, telegramId, action, matchId);
  }
  if (data.startsWith("quiz:ans:")) {
    const [, , qIndex, aIndex] = data.split(":");
    return handleQuizAnswer(chatId, telegramId, Number(qIndex), Number(aIndex));
  }
  if (data.startsWith("adm:")) {
    const [, action, tournamentId] = data.split(":");
    if (action && tournamentId) return handleAdminTournamentAction(chatId, telegramId, action, tournamentId);
  }
  if (data.startsWith("checkin:")) return handleCheckIn(chatId, telegramId, data.replace("checkin:", ""));
  if (data.startsWith("mylobby:")) return showMyLobby(chatId, telegramId, data.replace("mylobby:", ""));
  if (data.startsWith("cancelreg:")) return cancelRegistrationCommand(chatId, telegramId, data.replace("cancelreg:", ""));

  if (data === "reg:abort") {
    await clearSession(telegramId);
    if (messageId) await editMessage(chatId, messageId, "عملیات پیش‌ثبت‌نام لغو شد.", mainMenuKeyboard());
    else await sendMessage(chatId, "عملیات پیش‌ثبت‌نام لغو شد.", mainMenuKeyboard());
    return;
  }

  if (data === "reg:restart") {
    await setSession(telegramId, "idle", {});
    if (messageId) await editMessage(chatId, messageId, "پیش‌ثبت‌نام از اول شروع شد. بازی را انتخاب کن:", gameKeyboard());
    else await sendMessage(chatId, "بازی را انتخاب کن:", gameKeyboard());
    return;
  }

  if (data.startsWith("reg:game:")) {
    const game = normalizeGame(data.replace("reg:game:", ""));
    await setSession(telegramId, "idle", { game });
    if (messageId) await editMessage(chatId, messageId, `بازی انتخاب شد: <b>${html(gameLabel(game))}</b>\n\nحالا پلتفرم را انتخاب کن:`, platformKeyboard());
    else await sendMessage(chatId, "حالا پلتفرم را انتخاب کن:", platformKeyboard());
    return;
  }

  if (data.startsWith("reg:platform:")) {
    const index = Number(data.replace("reg:platform:", ""));
    const platform = PLATFORM_OPTIONS[index] || "Other";
    const session = await getSession(telegramId);
    await setSession(telegramId, "full_name", { ...session.data, platform });
    if (messageId) await editMessage(chatId, messageId, `پلتفرم انتخاب شد: <b>${html(platform)}</b>\n\nنام نمایشی Gament یا نام و نام‌خانوادگی خودت را بنویس:`);
    else await sendMessage(chatId, "نام نمایشی Gament یا نام و نام‌خانوادگی خودت را بنویس:");
    return;
  }

  if (data === "reg:confirm") {
    const session = await getSession(telegramId);
    const required = [session.data.game, session.data.platform, session.data.fullName, session.data.gamerTag, session.data.phoneNumber];
    if (GAMENT_ID_REQUIRED) required.push(session.data.gamentId);
    if (session.state !== "confirm" || required.some((value) => !value)) {
      await sendMessage(chatId, "بخشی از اطلاعات ناقص است. لطفاً /register را دوباره شروع کن.", mainMenuKeyboard());
      return;
    }

    await savePreRegistration(callback.from, session.data);
    await clearSession(telegramId);
    const text = `✅ پیش‌ثبت‌نام شما با موفقیت داخل پنل Gament ثبت شد.\n\n${registrationSummary(session.data)}\n\nبرای ثبت‌نام قطعی در روم، پرداخت ورودی احتمالی و مشاهده لابی وارد وب‌اپ شو.`;
    if (messageId) await editMessage(chatId, messageId, text, {
      inline_keyboard: [
        [{ text: "🏆 تکمیل ثبت‌نام در وب‌اپ", url: `${APP_URL}/tournaments` }],
        [{ text: "👤 پروفایل Gament", url: `${APP_URL}/profile` }],
      ],
    });
    else await sendMessage(chatId, text, mainMenuKeyboard());
    return;
  }

  await sendMessage(chatId, "این دکمه قدیمی یا نامعتبر است. منوی جدید را باز کردم؛ برای 1V1 کلش رویال روی دکمه ⚔️ بزن یا دستور /qr را ارسال کن.", mainMenuKeyboard());
}

async function handleUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    try {
      await handleCallback(update.callback_query);
    } catch (err) {
      logger.error({ err, callbackData: update.callback_query.data, telegramId: update.callback_query.from.id }, "Telegram callback failed");
      await answerCallback(update.callback_query.id, "خطای موقت در اجرای دکمه. لطفاً /qr را بزن یا دوباره تلاش کن.", true).catch(() => undefined);
      const chatId = update.callback_query.message?.chat.id;
      if (chatId) {
        await sendMessage(chatId, "⚠️ اجرای دکمه با خطا مواجه شد. سیستم را آماده‌سازی کردم؛ لطفاً دوباره /qr را بزن یا روی 1V1 کلش رویال بزن.", mainMenuKeyboard()).catch(() => undefined);
      }
    }
    return;
  }

  const message = update.message;
  if (!message?.from) return;
  const text = message.text || "";

  if (!(await telegramFeatureEnabled("telegram_bot_enabled", true)) && !text.trim().startsWith("/admin")) {
    await sendMessage(message.chat.id, "ربات Gament فعلاً در حالت تعمیرات است. لطفاً کمی بعد دوباره تلاش کن.");
    return;
  }

  if (text.trim().startsWith("/")) {
    await handleCommand(message, text);
    return;
  }

  await handleConversationMessage(message);
}

export async function POST(request: NextRequest) {
  const auth = validateWebhookSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let update: TelegramUpdate | undefined;
  let claim: TelegramUpdateClaim | undefined;

  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 1_000_000) {
      logger.warn({ contentLength }, "Rejected oversized Telegram webhook payload");
      return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
    }

    update = await request.json() as TelegramUpdate;
    if (!Number.isSafeInteger(update.update_id) || update.update_id < 0) {
      return NextResponse.json({ ok: false, error: "Invalid update_id" }, { status: 400 });
    }

    claim = await claimTelegramUpdate(update.update_id);
    if (!claim.claimed) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        updateStatus: claim.status,
        attempts: claim.attempts,
      });
    }

    const actorId = update.callback_query?.from.id || update.message?.from?.id;
    if (actorId) {
      const actorKey = String(actorId);
      const actorLimit = hasAdminAccess(actorKey) ? 180 : 60;
      const allowed = await rateLimit(`telegram-webhook:${actorKey}`, actorLimit, 60_000);
      if (!allowed.success) {
        logger.warn({ actorId }, "Telegram user update rate limit exceeded");
        if (!claim.degraded) await completeTelegramUpdate(update.update_id);
        return NextResponse.json({ ok: true, rateLimited: true });
      }
    }

    await handleUpdate(update);
    if (!claim.degraded) await completeTelegramUpdate(update.update_id);
    return NextResponse.json({ ok: true, idempotent: !claim.degraded });
  } catch (err) {
    logger.error({ err, updateId: update?.update_id }, "Telegram webhook failed");
    if (update && claim?.claimed && !claim.degraded) {
      await failTelegramUpdate(update.update_id, err);
    }

    // Idempotency makes Telegram retries safe. Retry transient failures up to
    // the bounded attempt limit, then acknowledge to stop a permanent storm.
    const shouldRetry = Boolean(
      update && claim?.claimed && shouldRetryTelegramUpdate(claim.attempts, claim.degraded)
    );
    return NextResponse.json(
      { ok: false, retrying: shouldRetry },
      { status: shouldRetry ? 500 : 200 }
    );
  }
}

export async function GET() {
  try {
    await Promise.all([ensureClash1v1Schema(), ensureTelegramReliabilitySchema()]);
    const tournament = await ensureClash1v1QueueTournament();
    return NextResponse.json({
      ok: true,
      webhook: "Gament Telegram webhook",
      reliabilityReady: true,
      clash1v1Ready: true,
      clash1v1TournamentId: tournament.id,
      setWebhookUrl: `https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=${APP_URL}/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>`,
    });
  } catch (err) {
    logger.error({ err }, "Telegram webhook health/repair failed");
    return NextResponse.json({
      ok: false,
      webhook: "Gament Telegram webhook",
      reliabilityReady: false,
      clash1v1Ready: false,
      error: err instanceof Error ? err.message : "unknown",
    }, { status: 500 });
  }
}

