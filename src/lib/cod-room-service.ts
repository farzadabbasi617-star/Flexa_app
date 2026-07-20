import { and, count, desc, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  affiliateAttributions,
  affiliateCommissionEvents,
  affiliateCommissionShares,
  codPlayerRanks,
  codRoomAuditEvents,
  codRoomEntries,
  codRoomEvidence,
  codRooms,
  codRoomSettlements,
  codRoomStaff,
  mediaPartners,
  players,
  transactions,
  users,
  wallets,
} from "@/db/schema";
import {
  COD_BR_TEAM_MODES,
  COD_REGIONS,
  COD_ROOM_STATUSES,
  calculateCodEntryReward,
  canTransitionCodRoomStatus,
  codRankPointsForResult,
  codRankTier,
  codReferralCommissionRial,
  estimateCodRoomMaximumLiability,
  isOfficialCodMobileInviteUrl,
  normalizeCodRewardConfig,
  shouldRevealCodRoomCredentials,
  type CodBrTeamMode,
  type CodRegion,
  type CodRoomStatus,
} from "@/lib/cod-room-policy";
import { checkAgeGate } from "@/lib/age-gate";
import { affiliateProgramLive, ensureAffiliateSchema, AFFILIATE_HOLD_HOURS } from "@/lib/affiliate-service";
import { ensureWalletMoneySchema, updateWalletBalanceSafely } from "@/lib/wallet-balance-service";
import { bigIntFromText } from "@/lib/money";

export const COD_ARENA_REFERRAL_DEFAULT_BPS = 2000;
export const COD_ARENA_DAILY_REFERRAL_ENTRY_CAP = 3;

export function codArenaLive() {
  // Two independent switches prevent an accidental Render toggle from moving
  // private-beta entries or rewards. Legal/finance approval must be explicit.
  return process.env.COD_ARENA_LIVE === "true" && process.env.COD_ARENA_FINANCE_APPROVED === "true";
}

let codSchemaPromise: Promise<void> | null = null;

async function createCodArenaSchema(client: any) {
  await ensureAffiliateSchema(client);
  await client.execute(sql.raw(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cod_mobile_region varchar(16) NOT NULL DEFAULT 'global'`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(180) NOT NULL, description text,
    region varchar(16) NOT NULL DEFAULT 'global', map varchar(40) NOT NULL DEFAULT 'isolated',
    team_mode varchar(16) NOT NULL DEFAULT 'solo', perspective varchar(8) NOT NULL DEFAULT 'tpp',
    status varchar(24) NOT NULL DEFAULT 'draft', is_published boolean NOT NULL DEFAULT false,
    capacity integer NOT NULL DEFAULT 40, entry_fee_rial numeric(20,0) NOT NULL DEFAULT 0,
    service_fee_rial numeric(20,0) NOT NULL DEFAULT 0, prize_budget_rial numeric(20,0) NOT NULL DEFAULT 0,
    referral_rate_bps integer NOT NULL DEFAULT 2000, reward_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    min_rank_points integer NOT NULL DEFAULT 0, rules text, rules_version varchar(40) NOT NULL DEFAULT 'cod-beta-1',
    requires_recording boolean NOT NULL DEFAULT true, room_code varchar(100), room_password varchar(100),
    official_join_url text, check_in_opens_at timestamp, check_in_closes_at timestamp,
    credentials_reveal_at timestamp, starts_at timestamp NOT NULL, ends_at timestamp,
    created_by_id uuid REFERENCES users(id), created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
  )`));
  const constraints = [
    `DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_cod_mobile_region_check CHECK (cod_mobile_region IN ('global','garena')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_region_check CHECK (region IN ('global','garena')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_team_mode_check CHECK (team_mode IN ('solo','duo','squad')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_perspective_check CHECK (perspective IN ('fpp','tpp')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_capacity_check CHECK (capacity BETWEEN 2 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_money_check CHECK (entry_fee_rial >= 0 AND service_fee_rial >= 0 AND prize_budget_rial >= 0 AND service_fee_rial <= entry_fee_rial); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cod_rooms ADD CONSTRAINT cod_rooms_referral_bps_check CHECK (referral_rate_bps BETWEEN 0 AND 10000); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ];
  for (const statement of constraints) await client.execute(sql.raw(statement));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_rooms_status_start_idx ON cod_rooms(status,starts_at)`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_rooms_region_published_idx ON cod_rooms(region,is_published)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_staff (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    user_id uuid NOT NULL REFERENCES users(id), role varchar(20) NOT NULL, assigned_at timestamp NOT NULL DEFAULT now(),
    UNIQUE(room_id,user_id,role)
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_staff ADD CONSTRAINT cod_room_staff_role_check CHECK (role IN ('roomer','spectator','judge')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_staff_user_idx ON cod_room_staff(user_id)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    user_id uuid NOT NULL REFERENCES users(id), player_id uuid REFERENCES players(id), team_id uuid REFERENCES teams(id),
    cod_uid_snapshot varchar(100) NOT NULL, cod_username_snapshot varchar(100) NOT NULL, region varchar(16) NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'registered', payment_mode varchar(16) NOT NULL DEFAULT 'shadow',
    entry_fee_rial numeric(20,0) NOT NULL DEFAULT 0, service_fee_rial numeric(20,0) NOT NULL DEFAULT 0,
    payment_transaction_id uuid REFERENCES transactions(id), rules_version varchar(40) NOT NULL,
    rules_accepted_at timestamp NOT NULL, checked_in_at timestamp, joined_at timestamp, kills integer, placement integer,
    reward_rial numeric(20,0) NOT NULL DEFAULT 0, result_status varchar(24) NOT NULL DEFAULT 'pending',
    settled_at timestamp, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
    UNIQUE(room_id,user_id)
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_entries ADD CONSTRAINT cod_room_entries_region_check CHECK (region IN ('global','garena')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_entries ADD CONSTRAINT cod_room_entries_money_check CHECK (entry_fee_rial >= 0 AND service_fee_rial >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_entries_room_status_idx ON cod_room_entries(room_id,status)`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_entries_user_created_idx ON cod_room_entries(user_id,created_at)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    entry_id uuid REFERENCES cod_room_entries(id), uploaded_by_id uuid NOT NULL REFERENCES users(id),
    kind varchar(24) NOT NULL, file_url text NOT NULL, content_hash varchar(64),
    status varchar(20) NOT NULL DEFAULT 'pending', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`DO $$ BEGIN ALTER TABLE cod_room_evidence ADD CONSTRAINT cod_room_evidence_kind_check CHECK (kind IN ('profile','scoreboard','recording','lobby_recording','dispute')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_evidence_room_kind_idx ON cod_room_evidence(room_id,kind)`));
  await client.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS cod_room_evidence_room_hash_unique ON cod_room_evidence(room_id,content_hash) WHERE content_hash IS NOT NULL`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_settlements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    entry_id uuid NOT NULL REFERENCES cod_room_entries(id), kills integer NOT NULL DEFAULT 0, placement integer,
    kill_reward_rial numeric(20,0) NOT NULL DEFAULT 0, placement_reward_rial numeric(20,0) NOT NULL DEFAULT 0,
    participation_reward_rial numeric(20,0) NOT NULL DEFAULT 0, total_reward_rial numeric(20,0) NOT NULL DEFAULT 0,
    status varchar(20) NOT NULL DEFAULT 'shadow', reward_transaction_id uuid REFERENCES transactions(id),
    verified_by_id uuid REFERENCES users(id), verified_at timestamp, created_at timestamp NOT NULL DEFAULT now(),
    updated_at timestamp NOT NULL DEFAULT now(), UNIQUE(room_id,entry_id)
  )`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_settlements_status_idx ON cod_room_settlements(status)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_player_ranks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), region varchar(16) NOT NULL,
    points integer NOT NULL DEFAULT 0, tier varchar(20) NOT NULL DEFAULT 'rookie', verified_rooms integer NOT NULL DEFAULT 0,
    total_kills integer NOT NULL DEFAULT 0, wins integer NOT NULL DEFAULT 0, updated_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now(), UNIQUE(user_id,region)
  )`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_player_ranks_region_points_idx ON cod_player_ranks(region,points DESC)`));
  await client.execute(sql.raw(`CREATE TABLE IF NOT EXISTS cod_room_audit_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid NOT NULL REFERENCES cod_rooms(id),
    actor_id uuid REFERENCES users(id), event_type varchar(40) NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamp NOT NULL DEFAULT now()
  )`));
  await client.execute(sql.raw(`CREATE INDEX IF NOT EXISTS cod_room_audit_room_created_idx ON cod_room_audit_events(room_id,created_at)`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ALTER COLUMN match_id DROP NOT NULL`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ADD COLUMN IF NOT EXISTS source_type varchar(30) NOT NULL DEFAULT 'clash_match'`));
  await client.execute(sql.raw(`ALTER TABLE affiliate_commission_events ADD COLUMN IF NOT EXISTS source_id varchar(100)`));
  await client.execute(sql.raw(`UPDATE affiliate_commission_events SET source_type='clash_match',source_id=match_id::text WHERE source_id IS NULL AND match_id IS NOT NULL`));
  await client.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commission_events_source_unique_idx ON affiliate_commission_events(source_type,source_id) WHERE source_id IS NOT NULL`));
}

export function ensureCodArenaSchema(client: any = db) {
  if (client !== db) return createCodArenaSchema(client);
  if (!codSchemaPromise) {
    codSchemaPromise = createCodArenaSchema(client).catch((error) => {
      codSchemaPromise = null;
      throw error;
    });
  }
  return codSchemaPromise;
}

function moneyString(value: unknown, field: string) {
  const text = String(value ?? "0").trim();
  if (!/^\d+$/.test(text)) throw new Error(`${field} باید مبلغ صحیح و غیرمنفی باشد`);
  return BigInt(text).toString();
}

function dateValue(value: unknown, field: string, required = false) {
  if (!value) {
    if (required) throw new Error(`${field} الزامی است`);
    return null;
  }
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${field} معتبر نیست`);
  return date;
}

export function normalizeCodRoomInput(raw: Record<string, unknown>) {
  const title = String(raw.title || "").trim();
  if (title.length < 3 || title.length > 180) throw new Error("عنوان روم باید بین ۳ تا ۱۸۰ کاراکتر باشد");
  const region = String(raw.region || "global") as CodRegion;
  const teamMode = String(raw.teamMode || "solo") as CodBrTeamMode;
  const status = String(raw.status || "draft") as CodRoomStatus;
  if (!(COD_REGIONS as readonly string[]).includes(region)) throw new Error("ریجن کالاف معتبر نیست");
  if (!(COD_BR_TEAM_MODES as readonly string[]).includes(teamMode)) throw new Error("حالت تیم معتبر نیست");
  if (!(COD_ROOM_STATUSES as readonly string[]).includes(status)) throw new Error("وضعیت روم معتبر نیست");
  const capacity = Number(raw.capacity ?? 40);
  if (!Number.isInteger(capacity) || capacity < 2 || capacity > 100) throw new Error("ظرفیت روم باید بین ۲ تا ۱۰۰ باشد");
  const perspective = String(raw.perspective || "tpp").toLowerCase();
  if (!["fpp", "tpp"].includes(perspective)) throw new Error("زاویه دید معتبر نیست");
  const entryFeeRial = moneyString(raw.entryFeeRial, "ورودی");
  const serviceFeeRial = moneyString(raw.serviceFeeRial, "کارمزد خدمات");
  const prizeBudgetRial = moneyString(raw.prizeBudgetRial, "بودجه جایزه");
  if (BigInt(serviceFeeRial) > BigInt(entryFeeRial)) throw new Error("کارمزد خدمات نمی‌تواند از ورودی بیشتر باشد");
  const referralRateBps = Number(raw.referralRateBps ?? COD_ARENA_REFERRAL_DEFAULT_BPS);
  if (!Number.isInteger(referralRateBps) || referralRateBps < 0 || referralRateBps > 10_000) throw new Error("درصد معرفی معتبر نیست");
  const minRankPoints = Number(raw.minRankPoints || 0);
  if (!Number.isInteger(minRankPoints) || minRankPoints < 0 || minRankPoints > 1_000_000) throw new Error("حداقل امتیاز رنک معتبر نیست");
  const startsAt = dateValue(raw.startsAt, "زمان شروع", true)!;
  const checkInOpensAt = dateValue(raw.checkInOpensAt, "شروع Check-in") || new Date(startsAt.getTime() - 45 * 60_000);
  const checkInClosesAt = dateValue(raw.checkInClosesAt, "پایان Check-in") || new Date(startsAt.getTime() + 5 * 60_000);
  const credentialsRevealAt = dateValue(raw.credentialsRevealAt, "زمان نمایش اطلاعات") || new Date(startsAt.getTime() - 15 * 60_000);
  const endsAt = dateValue(raw.endsAt, "زمان پایان");
  if (checkInOpensAt >= checkInClosesAt) throw new Error("بازه Check-in معتبر نیست");
  if (credentialsRevealAt > startsAt) throw new Error("اطلاعات ورود باید قبل از شروع روم منتشر شود");
  if (endsAt && endsAt <= startsAt) throw new Error("زمان پایان باید بعد از شروع باشد");
  const rewardConfig = normalizeCodRewardConfig(raw.rewardConfig);
  const maximumLiability = estimateCodRoomMaximumLiability(rewardConfig, capacity, teamMode);
  const isPublished = Boolean(raw.isPublished);
  if (isPublished && status === "draft") throw new Error("روم Draft قبل از انتشار باید وارد وضعیت ثبت‌نام شود");
  if (isPublished && maximumLiability > BigInt(prizeBudgetRial)) {
    throw new Error(`بودجه جایزه برای حداکثر تعهد کافی نیست؛ حداقل ${maximumLiability.toString()} ریال لازم است`);
  }
  const officialJoinUrl = raw.officialJoinUrl ? String(raw.officialJoinUrl).trim() : null;
  if (officialJoinUrl && !isOfficialCodMobileInviteUrl(officialJoinUrl)) throw new Error("فقط لینک رسمی دعوت Call of Duty Mobile پذیرفته می‌شود");
  return {
    title,
    description: raw.description ? String(raw.description).trim().slice(0, 3000) : null,
    region,
    map: String(raw.map || "isolated").trim().slice(0, 40),
    teamMode,
    perspective,
    status,
    isPublished,
    capacity,
    entryFeeRial,
    serviceFeeRial,
    prizeBudgetRial,
    referralRateBps,
    rewardConfig,
    minRankPoints,
    rules: raw.rules ? String(raw.rules).trim().slice(0, 12_000) : null,
    rulesVersion: String(raw.rulesVersion || "cod-beta-1").trim().slice(0, 40),
    requiresRecording: raw.requiresRecording !== false,
    roomCode: raw.roomCode ? String(raw.roomCode).trim().slice(0, 100) : null,
    roomPassword: raw.roomPassword ? String(raw.roomPassword).trim().slice(0, 100) : null,
    officialJoinUrl,
    checkInOpensAt,
    checkInClosesAt,
    credentialsRevealAt,
    startsAt,
    endsAt,
    maximumLiabilityRial: maximumLiability.toString(),
  };
}

export async function listCodRooms(input: { includeUnpublished?: boolean; region?: string | null; limit?: number } = {}) {
  await ensureCodArenaSchema();
  const conditions = [];
  if (!input.includeUnpublished) {
    conditions.push(eq(codRooms.isPublished, true));
    conditions.push(inArray(codRooms.status, ["registration", "check_in", "lobby_open", "in_progress", "settling"]));
  }
  if (input.region && (COD_REGIONS as readonly string[]).includes(input.region)) conditions.push(eq(codRooms.region, input.region));
  const where = conditions.length === 0 ? undefined : conditions.length === 1 ? conditions[0] : and(...conditions);
  return db.select({
    id: codRooms.id,
    title: codRooms.title,
    description: codRooms.description,
    region: codRooms.region,
    map: codRooms.map,
    teamMode: codRooms.teamMode,
    perspective: codRooms.perspective,
    status: codRooms.status,
    isPublished: codRooms.isPublished,
    capacity: codRooms.capacity,
    entryFeeRial: codRooms.entryFeeRial,
    serviceFeeRial: codRooms.serviceFeeRial,
    prizeBudgetRial: codRooms.prizeBudgetRial,
    rewardConfig: codRooms.rewardConfig,
    minRankPoints: codRooms.minRankPoints,
    requiresRecording: codRooms.requiresRecording,
    checkInOpensAt: codRooms.checkInOpensAt,
    checkInClosesAt: codRooms.checkInClosesAt,
    credentialsRevealAt: codRooms.credentialsRevealAt,
    startsAt: codRooms.startsAt,
    endsAt: codRooms.endsAt,
    createdAt: codRooms.createdAt,
    registeredCount: count(codRoomEntries.id),
  }).from(codRooms)
    .leftJoin(codRoomEntries, eq(codRoomEntries.roomId, codRooms.id))
    .where(where)
    .groupBy(codRooms.id)
    .orderBy(codRooms.startsAt)
    .limit(Math.min(Math.max(input.limit || 100, 1), 300));
}

export async function getCodRoomDetail(roomId: string, viewerId?: string | null, isAdmin = false) {
  await ensureCodArenaSchema();
  const [room] = await db.select().from(codRooms).where(eq(codRooms.id, roomId)).limit(1);
  if (!room) return null;
  const entries = await db.select({
    id: codRoomEntries.id,
    userId: codRoomEntries.userId,
    status: codRoomEntries.status,
    checkedInAt: codRoomEntries.checkedInAt,
    kills: codRoomEntries.kills,
    placement: codRoomEntries.placement,
    rewardRial: codRoomEntries.rewardRial,
    resultStatus: codRoomEntries.resultStatus,
    codUsername: codRoomEntries.codUsernameSnapshot,
    displayName: users.displayName,
    rankPoints: codPlayerRanks.points,
    rankTier: codPlayerRanks.tier,
  }).from(codRoomEntries)
    .innerJoin(users, eq(codRoomEntries.userId, users.id))
    .leftJoin(codPlayerRanks, and(eq(codPlayerRanks.userId, codRoomEntries.userId), eq(codPlayerRanks.region, room.region)))
    .where(eq(codRoomEntries.roomId, roomId))
    .orderBy(codRoomEntries.createdAt);
  const myEntry = viewerId ? entries.find((entry) => entry.userId === viewerId) : undefined;
  const [staff] = viewerId ? await db.select({ role: codRoomStaff.role }).from(codRoomStaff)
    .where(and(eq(codRoomStaff.roomId, roomId), eq(codRoomStaff.userId, viewerId))).limit(1) : [];
  const privileged = isAdmin || Boolean(staff);
  if (!room.isPublished && !privileged && !myEntry) return { forbidden: true as const };
  const reveal = shouldRevealCodRoomCredentials({
    isAdmin: privileged,
    isRegistered: Boolean(myEntry),
    checkedIn: Boolean(myEntry?.checkedInAt),
    revealAt: room.credentialsRevealAt,
    status: room.status as CodRoomStatus,
  });
  const [evidenceRow] = privileged ? await db.select({ value: count() }).from(codRoomEvidence).where(eq(codRoomEvidence.roomId, roomId)) : [{ value: 0 }];
  return {
    ...room,
    roomCode: reveal ? room.roomCode : null,
    roomPassword: reveal ? room.roomPassword : null,
    officialJoinUrl: reveal ? room.officialJoinUrl : null,
    credentialsVisible: reveal,
    checkInAvailable: Boolean(myEntry && !myEntry.checkedInAt &&
      (!room.checkInOpensAt || new Date() >= room.checkInOpensAt) &&
      (!room.checkInClosesAt || new Date() <= room.checkInClosesAt)),
    registeredCount: entries.length,
    myEntry: myEntry ? { ...myEntry, userId: undefined } : null,
    staffRole: staff?.role || null,
    evidenceCount: Number(evidenceRow?.value || 0),
    entries: (privileged || myEntry ? entries : []).map((entry) => ({
      id: privileged ? entry.id : undefined,
      displayName: entry.displayName,
      codUsername: entry.codUsername,
      status: entry.status,
      checkedIn: Boolean(entry.checkedInAt),
      rankPoints: Number(entry.rankPoints || 0),
      rankTier: entry.rankTier || "rookie",
      ...(privileged || entry.userId === viewerId ? { kills: entry.kills, placement: entry.placement, rewardRial: entry.rewardRial, resultStatus: entry.resultStatus } : {}),
    })),
  };
}

export async function joinCodRoom(input: { roomId: string; userId: string; rulesAccepted: boolean; ip?: string }) {
  await Promise.all([ensureCodArenaSchema(), ensureWalletMoneySchema()]);
  if (!input.rulesAccepted) throw new Error("COD_RULES_REQUIRED");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${input.roomId} FOR UPDATE`);
    const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, input.roomId)).limit(1);
    if (!room) throw new Error("COD_ROOM_NOT_FOUND");
    if (room.status !== "registration") throw new Error("COD_REGISTRATION_CLOSED");
    if (room.startsAt <= new Date()) throw new Error("COD_REGISTRATION_CLOSED");
    const [account] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1);
    if (!account) throw new Error("COD_USER_NOT_FOUND");
    if (!room.isPublished && account.role !== "admin" && account.role !== "super_admin") {
      const [betaStaff] = await tx.select({ id: codRoomStaff.id }).from(codRoomStaff)
        .where(and(eq(codRoomStaff.roomId, room.id), eq(codRoomStaff.userId, account.id))).limit(1);
      if (!betaStaff) throw new Error("COD_ROOM_NOT_FOUND");
    }
    if (!account.codMobileId || !account.codMobileUsername) throw new Error("COD_PROFILE_REQUIRED");
    if (account.codMobileRegion !== room.region) throw new Error("COD_REGION_MISMATCH");
    const [existing] = await tx.select({ id: codRoomEntries.id }).from(codRoomEntries)
      .where(and(eq(codRoomEntries.roomId, room.id), eq(codRoomEntries.userId, account.id))).limit(1);
    if (existing) throw new Error("COD_ALREADY_JOINED");
    const [{ value: registered }] = await tx.select({ value: count() }).from(codRoomEntries).where(eq(codRoomEntries.roomId, room.id));
    if (Number(registered || 0) >= room.capacity) throw new Error("COD_ROOM_FULL");
    const [rank] = await tx.select().from(codPlayerRanks)
      .where(and(eq(codPlayerRanks.userId, account.id), eq(codPlayerRanks.region, room.region))).limit(1);
    if (Number(rank?.points || 0) < room.minRankPoints) throw new Error("COD_RANK_TOO_LOW");
    const live = codArenaLive();
    const entryFee = bigIntFromText(room.entryFeeRial);
    let paymentTransactionId: string | null = null;
    if (live && entryFee > BigInt(0)) {
      const gate = checkAgeGate({ birthDate: account.birthDate, nationalId: account.nationalId });
      if (!gate.ok) throw new Error("COD_AGE_GATE_BLOCKED");
      if (account.codMobileStatus !== "verified") throw new Error("COD_PROFILE_NOT_VERIFIED");
      let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, account.id)).limit(1);
      if (!wallet) [wallet] = await tx.insert(wallets).values({ userId: account.id, balance: "0", currency: "RIAL" }).returning();
      const debited = await updateWalletBalanceSafely(tx, wallet.id, entryFee, "decrease");
      if (!debited) throw new Error("COD_INSUFFICIENT_BALANCE");
      const [payment] = await tx.insert(transactions).values({
        walletId: wallet.id,
        amount: entryFee.toString(),
        type: "entry_fee",
        status: "completed",
        referenceId: `cod-room-entry-${room.id}-${account.id}`,
        metadata: { kind: "cod_room_entry", roomId: room.id, userId: account.id, serviceFeeRial: room.serviceFeeRial },
      }).returning();
      paymentTransactionId = payment.id;
    }
    let [player] = await tx.select().from(players).where(eq(players.visibleUserId, account.id)).limit(1);
    if (!player) {
      [player] = await tx.insert(players).values({
        visibleUserId: account.id,
        username: account.username || account.gamentId,
        displayName: account.displayName,
        email: account.email,
        avatarUrl: account.avatarUrl,
      }).returning();
    }
    const [entry] = await tx.insert(codRoomEntries).values({
      roomId: room.id,
      userId: account.id,
      playerId: player.id,
      codUidSnapshot: account.codMobileId,
      codUsernameSnapshot: account.codMobileUsername,
      region: room.region,
      status: "registered",
      paymentMode: live ? "live" : "shadow",
      entryFeeRial: room.entryFeeRial,
      serviceFeeRial: room.serviceFeeRial,
      paymentTransactionId,
      rulesVersion: room.rulesVersion,
      rulesAcceptedAt: new Date(),
    }).returning();
    await tx.insert(codRoomAuditEvents).values({
      roomId: room.id,
      actorId: account.id,
      eventType: "entry_joined",
      payload: { entryId: entry.id, paymentMode: entry.paymentMode, ip: input.ip || null },
    });
    return { entry, roomTitle: room.title, live };
  });
}

export async function checkInCodRoom(roomId: string, userId: string) {
  await ensureCodArenaSchema();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${roomId} FOR UPDATE`);
    const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, roomId)).limit(1);
    if (!room) throw new Error("COD_ROOM_NOT_FOUND");
    if (!["registration", "check_in", "lobby_open"].includes(room.status)) throw new Error("COD_CHECKIN_CLOSED");
    const now = new Date();
    if (room.checkInOpensAt && now < room.checkInOpensAt) throw new Error("COD_CHECKIN_NOT_OPEN");
    if (room.checkInClosesAt && now > room.checkInClosesAt) throw new Error("COD_CHECKIN_CLOSED");
    const [entry] = await tx.update(codRoomEntries).set({
      status: "checked_in",
      checkedInAt: now,
      updatedAt: now,
    }).where(and(eq(codRoomEntries.roomId, roomId), eq(codRoomEntries.userId, userId), inArray(codRoomEntries.status, ["registered", "checked_in"]))).returning();
    if (!entry) throw new Error("COD_ENTRY_NOT_FOUND");
    await tx.insert(codRoomAuditEvents).values({ roomId, actorId: userId, eventType: "entry_checked_in", payload: { entryId: entry.id } });
    return entry;
  });
}

const EVIDENCE_KINDS = ["profile", "scoreboard", "recording", "lobby_recording", "dispute"];

export async function addCodRoomEvidence(input: {
  roomId: string;
  userId: string;
  isAdmin: boolean;
  kind: string;
  fileUrl: string;
  contentHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await ensureCodArenaSchema();
  const kind = String(input.kind || "");
  if (!EVIDENCE_KINDS.includes(kind)) throw new Error("COD_EVIDENCE_KIND_INVALID");
  let parsed: URL;
  try { parsed = new URL(input.fileUrl); } catch { throw new Error("COD_EVIDENCE_URL_INVALID"); }
  if (parsed.protocol !== "https:" || input.fileUrl.length > 1500) throw new Error("COD_EVIDENCE_URL_INVALID");
  const hash = input.contentHash ? input.contentHash.toLowerCase() : null;
  if (hash && !/^[a-f0-9]{64}$/.test(hash)) throw new Error("COD_EVIDENCE_HASH_INVALID");
  const [entry] = await db.select().from(codRoomEntries)
    .where(and(eq(codRoomEntries.roomId, input.roomId), eq(codRoomEntries.userId, input.userId))).limit(1);
  const [staff] = await db.select().from(codRoomStaff)
    .where(and(eq(codRoomStaff.roomId, input.roomId), eq(codRoomStaff.userId, input.userId))).limit(1);
  const privileged = input.isAdmin || Boolean(staff);
  if (!entry && !privileged) throw new Error("COD_ENTRY_NOT_FOUND");
  if (kind === "lobby_recording" && !privileged) throw new Error("COD_EVIDENCE_FORBIDDEN");
  try {
    const [created] = await db.insert(codRoomEvidence).values({
      roomId: input.roomId,
      entryId: entry?.id || null,
      uploadedById: input.userId,
      kind,
      fileUrl: input.fileUrl,
      contentHash: hash,
      metadata: input.metadata || {},
    }).returning();
    await db.insert(codRoomAuditEvents).values({ roomId: input.roomId, actorId: input.userId, eventType: "evidence_added", payload: { evidenceId: created.id, kind } });
    return created;
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.code || (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") throw new Error("COD_EVIDENCE_DUPLICATE");
    throw error;
  }
}

export async function createCodRoom(raw: Record<string, unknown>, adminId: string) {
  await ensureCodArenaSchema();
  const values = normalizeCodRoomInput(raw);
  if (values.startsAt.getTime() <= Date.now() + 5 * 60_000) throw new Error("زمان شروع روم جدید باید حداقل ۵ دقیقه در آینده باشد");
  const { maximumLiabilityRial, ...databaseValues } = values;
  const [created] = await db.insert(codRooms).values({ ...databaseValues, createdById: adminId }).returning();
  await db.insert(codRoomAuditEvents).values({ roomId: created.id, actorId: adminId, eventType: "room_created", payload: { maximumLiabilityRial } });
  return { ...created, maximumLiabilityRial };
}

export async function updateCodRoom(roomId: string, raw: Record<string, unknown>, adminId: string) {
  await Promise.all([ensureCodArenaSchema(), ensureWalletMoneySchema()]);
  const values = normalizeCodRoomInput(raw);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${roomId} FOR UPDATE`);
    const [before] = await tx.select().from(codRooms).where(eq(codRooms.id, roomId)).limit(1);
    if (!before) throw new Error("COD_ROOM_NOT_FOUND");
    if (!canTransitionCodRoomStatus(before.status as CodRoomStatus, values.status)) throw new Error("COD_STATUS_TRANSITION_INVALID");
    const [{ value: entryCount }] = await tx.select({ value: count() }).from(codRoomEntries).where(eq(codRoomEntries.roomId, roomId));
    if (Number(entryCount || 0) > 0) {
      const commercialTermsChanged = before.entryFeeRial !== values.entryFeeRial ||
        before.serviceFeeRial !== values.serviceFeeRial ||
        before.prizeBudgetRial !== values.prizeBudgetRial ||
        before.referralRateBps !== values.referralRateBps ||
        before.region !== values.region ||
        before.teamMode !== values.teamMode ||
        before.perspective !== values.perspective ||
        before.map !== values.map ||
        before.rulesVersion !== values.rulesVersion ||
        before.rules !== values.rules ||
        JSON.stringify(before.rewardConfig) !== JSON.stringify(values.rewardConfig);
      if (commercialTermsChanged) throw new Error("COD_LOCKED_AFTER_REGISTRATION");
      if (values.capacity < Number(entryCount || 0)) throw new Error("COD_CAPACITY_BELOW_REGISTRATIONS");
    }
    let refunds = 0;
    if (before.status !== "cancelled" && values.status === "cancelled") {
      const entries = await tx.select().from(codRoomEntries).where(and(
        eq(codRoomEntries.roomId, roomId),
        ne(codRoomEntries.status, "refunded"),
      ));
      for (const entry of entries) {
        const amount = bigIntFromText(entry.entryFeeRial);
        if (entry.paymentMode === "live" && amount > BigInt(0)) {
          let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, entry.userId)).limit(1);
          if (!wallet) [wallet] = await tx.insert(wallets).values({ userId: entry.userId, balance: "0", currency: "RIAL" }).returning();
          await updateWalletBalanceSafely(tx, wallet.id, amount, "increase");
          await tx.insert(transactions).values({
            walletId: wallet.id,
            amount: amount.toString(),
            type: "refund",
            status: "completed",
            referenceId: `cod-room-refund-${roomId}-${entry.id}`,
            metadata: { kind: "cod_room_refund", roomId, entryId: entry.id, userId: entry.userId },
          });
          refunds += 1;
        }
        await tx.update(codRoomEntries).set({
          status: entry.paymentMode === "live" && amount > BigInt(0) ? "refunded" : "cancelled",
          resultStatus: "cancelled",
          updatedAt: new Date(),
        }).where(eq(codRoomEntries.id, entry.id));
      }
    }
    const { maximumLiabilityRial, ...databaseValues } = values;
    const [updated] = await tx.update(codRooms).set({ ...databaseValues, updatedAt: new Date() }).where(eq(codRooms.id, roomId)).returning();
    await tx.insert(codRoomAuditEvents).values({ roomId, actorId: adminId, eventType: "room_updated", payload: { fromStatus: before.status, toStatus: updated.status, maximumLiabilityRial, refunds } });
    return { ...updated, maximumLiabilityRial };
  });
}

export async function deleteCodRoom(roomId: string, adminId: string) {
  await ensureCodArenaSchema();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${roomId} FOR UPDATE`);
    const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, roomId)).limit(1);
    if (!room) throw new Error("COD_ROOM_NOT_FOUND");
    const [{ value }] = await tx.select({ value: count() }).from(codRoomEntries).where(eq(codRoomEntries.roomId, roomId));
    if (Number(value || 0) > 0 || room.status !== "draft") throw new Error("COD_ROOM_DELETE_FORBIDDEN");
    await tx.delete(codRoomEvidence).where(eq(codRoomEvidence.roomId, roomId));
    await tx.delete(codRoomStaff).where(eq(codRoomStaff.roomId, roomId));
    await tx.delete(codRoomAuditEvents).where(eq(codRoomAuditEvents.roomId, roomId));
    await tx.delete(codRooms).where(eq(codRooms.id, roomId));
    return { deleted: true, adminId };
  });
}

async function createCodReferralShadow(client: any, input: {
  roomId: string;
  entryId: string;
  userId: string;
  serviceFeeRial: bigint;
  referralRateBps: number;
}) {
  const amount = codReferralCommissionRial(input.serviceFeeRial, input.referralRateBps);
  if (amount <= BigInt(0)) return { created: false as const, reason: "zero_commission" as const };
  const [existing] = await client.select({ id: affiliateCommissionEvents.id }).from(affiliateCommissionEvents)
    .where(and(eq(affiliateCommissionEvents.sourceType, "cod_room_entry"), eq(affiliateCommissionEvents.sourceId, input.entryId))).limit(1);
  if (existing) return { created: false as const, reason: "already_exists" as const };
  const [attribution] = await client.select({
    partnerId: affiliateAttributions.partnerId,
    ownerId: mediaPartners.userId,
  }).from(affiliateAttributions)
    .innerJoin(mediaPartners, eq(affiliateAttributions.partnerId, mediaPartners.id))
    .where(and(
      eq(affiliateAttributions.userId, input.userId),
      eq(affiliateAttributions.status, "active"),
      gt(affiliateAttributions.expiresAt, new Date()),
      eq(mediaPartners.status, "active"),
      ne(mediaPartners.userId, input.userId),
    )).limit(1);
  if (!attribution) return { created: false as const, reason: "no_active_attribution" as const };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [daily] = await client.select({ value: count() }).from(affiliateCommissionEvents).where(and(
    eq(affiliateCommissionEvents.sourceType, "cod_room_entry"),
    gte(affiliateCommissionEvents.createdAt, since),
    sql`${affiliateCommissionEvents.risk}->>'referredUserId' = ${input.userId}`,
    sql`${affiliateCommissionEvents.status} <> 'reversed'`,
  ));
  if (Number(daily?.value || 0) >= COD_ARENA_DAILY_REFERRAL_ENTRY_CAP) {
    return { created: false as const, reason: "daily_cap" as const };
  }
  const status = codArenaLive() && affiliateProgramLive() ? "pending" : "shadow";
  const [event] = await client.insert(affiliateCommissionEvents).values({
    matchId: null,
    sourceType: "cod_room_entry",
    sourceId: input.entryId,
    totalAmountRial: amount.toString(),
    status,
    availableAt: new Date(Date.now() + AFFILIATE_HOLD_HOURS * 60 * 60 * 1000),
    risk: {
      game: "cod_mobile",
      source: "service_fee_percentage",
      roomId: input.roomId,
      entryId: input.entryId,
      referredUserId: input.userId,
      serviceFeeRial: input.serviceFeeRial.toString(),
      referralRateBps: input.referralRateBps,
      mode: status,
    },
  }).onConflictDoNothing().returning();
  if (!event) return { created: false as const, reason: "concurrent_duplicate" as const };
  await client.insert(affiliateCommissionShares).values({
    eventId: event.id,
    partnerId: attribution.partnerId,
    referredUserId: input.userId,
    amountRial: amount.toString(),
    status,
  });
  return { created: true as const, amountRial: amount, status };
}

export interface CodSettlementResultInput {
  entryId: string;
  kills: number;
  placement?: number | null;
}

export async function settleCodRoom(input: {
  roomId: string;
  adminId: string;
  results: CodSettlementResultInput[];
  evidenceConfirmed: boolean;
}) {
  await Promise.all([ensureCodArenaSchema(), ensureWalletMoneySchema()]);
  if (!input.evidenceConfirmed) throw new Error("COD_EVIDENCE_CONFIRMATION_REQUIRED");
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM cod_rooms WHERE id=${input.roomId} FOR UPDATE`);
    const [room] = await tx.select().from(codRooms).where(eq(codRooms.id, input.roomId)).limit(1);
    if (!room) throw new Error("COD_ROOM_NOT_FOUND");
    if (!canTransitionCodRoomStatus(room.status as CodRoomStatus, "settling") || room.status === "completed") throw new Error("COD_SETTLEMENT_STATUS_INVALID");
    if (room.requiresRecording) {
      const [evidence] = await tx.select({ value: count() }).from(codRoomEvidence).where(and(
        eq(codRoomEvidence.roomId, room.id),
        inArray(codRoomEvidence.kind, ["scoreboard", "recording", "lobby_recording"]),
      ));
      if (Number(evidence?.value || 0) === 0) throw new Error("COD_SETTLEMENT_EVIDENCE_REQUIRED");
    }
    const allEntries = await tx.select().from(codRoomEntries)
      .where(and(eq(codRoomEntries.roomId, room.id), ne(codRoomEntries.status, "refunded"), ne(codRoomEntries.status, "cancelled")))
      .orderBy(codRoomEntries.createdAt);
    for (const absent of allEntries.filter((entry) => !entry.checkedInAt || entry.status === "no_show")) {
      await tx.update(codRoomEntries).set({ status: "no_show", resultStatus: "no_show", rewardRial: "0", updatedAt: new Date() })
        .where(eq(codRoomEntries.id, absent.id));
    }
    const entries = allEntries.filter((entry) => Boolean(entry.checkedInAt) && entry.status !== "no_show");
    if (!entries.length) throw new Error("COD_SETTLEMENT_EMPTY");
    const byEntry = new Map(input.results.map((row) => [row.entryId, row]));
    if (input.results.some((row) => !entries.some((entry) => entry.id === row.entryId))) throw new Error("COD_SETTLEMENT_ENTRY_INVALID");
    if (room.teamMode === "solo") {
      const placements = input.results.map((row) => row.placement).filter((value): value is number => value != null);
      if (new Set(placements).size !== placements.length) throw new Error("COD_SETTLEMENT_DUPLICATE_PLACEMENT");
    }
    const calculated = entries.map((entry) => {
      const result = byEntry.get(entry.id) || { entryId: entry.id, kills: 0, placement: null };
      return { entry, reward: calculateCodEntryReward(room.rewardConfig, result.kills, result.placement) };
    });
    const totalReward = calculated.reduce((sum, row) => sum + row.reward.totalRewardRial, BigInt(0));
    if (totalReward > bigIntFromText(room.prizeBudgetRial)) throw new Error("COD_SETTLEMENT_OVER_BUDGET");
    await tx.update(codRooms).set({ status: "settling", updatedAt: new Date() }).where(eq(codRooms.id, room.id));
    const live = codArenaLive();
    const referralEvents: Array<{ created: boolean; amountRial?: bigint; status?: string }> = [];
    for (const row of calculated) {
      let rewardTransactionId: string | null = null;
      if (live && row.reward.totalRewardRial > BigInt(0)) {
        let [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, row.entry.userId)).limit(1);
        if (!wallet) [wallet] = await tx.insert(wallets).values({ userId: row.entry.userId, balance: "0", currency: "RIAL" }).returning();
        await updateWalletBalanceSafely(tx, wallet.id, row.reward.totalRewardRial, "increase");
        const [rewardTransaction] = await tx.insert(transactions).values({
          walletId: wallet.id,
          amount: row.reward.totalRewardRial.toString(),
          type: "tournament_win",
          status: "completed",
          referenceId: `cod-room-reward-${room.id}-${row.entry.id}`,
          metadata: { kind: "cod_room_reward", roomId: room.id, entryId: row.entry.id, kills: row.reward.kills, placement: row.reward.placement },
        }).returning();
        rewardTransactionId = rewardTransaction.id;
      }
      await tx.insert(codRoomSettlements).values({
        roomId: room.id,
        entryId: row.entry.id,
        kills: row.reward.kills,
        placement: row.reward.placement,
        killRewardRial: row.reward.killRewardRial.toString(),
        placementRewardRial: row.reward.placementRewardRial.toString(),
        participationRewardRial: row.reward.participationRewardRial.toString(),
        totalRewardRial: row.reward.totalRewardRial.toString(),
        status: live ? "paid" : "shadow",
        rewardTransactionId,
        verifiedById: input.adminId,
        verifiedAt: new Date(),
      }).onConflictDoUpdate({
        target: [codRoomSettlements.roomId, codRoomSettlements.entryId],
        set: {
          kills: row.reward.kills,
          placement: row.reward.placement,
          killRewardRial: row.reward.killRewardRial.toString(),
          placementRewardRial: row.reward.placementRewardRial.toString(),
          participationRewardRial: row.reward.participationRewardRial.toString(),
          totalRewardRial: row.reward.totalRewardRial.toString(),
          status: live ? "paid" : "shadow",
          rewardTransactionId,
          verifiedById: input.adminId,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await tx.update(codRoomEntries).set({
        status: "settled",
        kills: row.reward.kills,
        placement: row.reward.placement,
        rewardRial: row.reward.totalRewardRial.toString(),
        resultStatus: "verified",
        settledAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(codRoomEntries.id, row.entry.id));
      const gained = codRankPointsForResult(row.reward.kills, row.reward.placement);
      const [rank] = await tx.select().from(codPlayerRanks).where(and(
        eq(codPlayerRanks.userId, row.entry.userId),
        eq(codPlayerRanks.region, room.region),
      )).for("update").limit(1);
      const nextPoints = Number(rank?.points || 0) + gained;
      if (rank) {
        await tx.update(codPlayerRanks).set({
          points: nextPoints,
          tier: codRankTier(nextPoints),
          verifiedRooms: rank.verifiedRooms + 1,
          totalKills: rank.totalKills + row.reward.kills,
          wins: rank.wins + (row.reward.placement === 1 ? 1 : 0),
          updatedAt: new Date(),
        }).where(eq(codPlayerRanks.id, rank.id));
      } else {
        await tx.insert(codPlayerRanks).values({
          userId: row.entry.userId,
          region: room.region,
          points: nextPoints,
          tier: codRankTier(nextPoints),
          verifiedRooms: 1,
          totalKills: row.reward.kills,
          wins: row.reward.placement === 1 ? 1 : 0,
        });
      }
      if (bigIntFromText(row.entry.entryFeeRial) > BigInt(0)) {
        referralEvents.push(await createCodReferralShadow(tx, {
          roomId: room.id,
          entryId: row.entry.id,
          userId: row.entry.userId,
          serviceFeeRial: bigIntFromText(row.entry.serviceFeeRial),
          referralRateBps: room.referralRateBps,
        }));
      }
    }
    await tx.update(codRooms).set({ status: "completed", endsAt: room.endsAt || new Date(), updatedAt: new Date() }).where(eq(codRooms.id, room.id));
    await tx.insert(codRoomAuditEvents).values({
      roomId: room.id,
      actorId: input.adminId,
      eventType: "room_settled",
      payload: { live, totalRewardRial: totalReward.toString(), entryCount: entries.length, referralEventsCreated: referralEvents.filter((row) => row.created).length },
    });
    return {
      live,
      roomId: room.id,
      entryCount: entries.length,
      totalRewardRial: totalReward.toString(),
      referralEventsCreated: referralEvents.filter((row) => row.created).length,
      participants: calculated.map((row) => ({
        userId: row.entry.userId,
        kills: row.reward.kills,
        placement: row.reward.placement,
        rewardRial: row.reward.totalRewardRial.toString(),
      })),
    };
  });
}
