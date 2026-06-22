import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  numeric,
} from "drizzle-orm/pg-core";

// --- ENUMS ---
export const userRoleEnum = pgEnum("user_role", [
  "player", "judge", "moderator", "admin", "super_admin"
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unlinked", "pending", "verified", "rejected"
]);

export const gameEnum = pgEnum("game_type", [
  "clash_royale", "cod_mobile", "fortnite"
]);

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "registration", "in_progress", "completed", "cancelled"
]);

export const matchStatusEnum = pgEnum("match_status", [
  "pending", "in_progress", "awaiting_judgment", "completed", "disputed"
]);

export const tournamentFormatEnum = pgEnum("tournament_format", [
  "single_elimination", "double_elimination", "round_robin"
]);

export const transactionTypeEnum = pgEnum("transaction_type", [
  "deposit", "withdrawal", "tournament_win", "entry_fee", "refund"
]);

export const transactionStatusEnum = pgEnum("transaction_status", [
  "pending", "completed", "failed", "cancelled"
]);

// --- TABLES ---

// Site settings
export const siteSettings = pgTable("site_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Site images
export const siteImages = pgTable("site_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  url: text("url").notNull(),
  altText: varchar("alt_text", { length: 255 }),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Users
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  username: varchar("username", { length: 100 }).unique(),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  gamentId: varchar("gament_id", { length: 20 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: text("bio"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: userRoleEnum("role").notNull().default("player"),
  isVerified: boolean("is_verified").notNull().default(false),
  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  rankPoints: integer("rank_points").default(1000).notNull(),
  clashRoyaleId: varchar("clash_royale_id", { length: 100 }),
  clashRoyaleUsername: varchar("clash_royale_username", { length: 100 }),
  clashRoyaleStatus: verificationStatusEnum("cr_status").default("unlinked"),
  codMobileId: varchar("cod_mobile_id", { length: 100 }),
  codMobileUsername: varchar("cod_mobile_username", { length: 100 }),
  codMobileStatus: verificationStatusEnum("codm_status").default("unlinked"),
  fortniteId: varchar("fortnite_id", { length: 100 }),
  fortniteUsername: varchar("fortnite_username", { length: 100 }),
  fortniteStatus: verificationStatusEnum("fortnite_status").default("unlinked"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsVersion: varchar("terms_version", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
}, (table) => ({
  phoneIdx: index("users_phone_idx").on(table.phoneNumber),
  rankIdx: index("users_rank_points_idx").on(table.rankPoints),
  gamentIdIdx: index("users_gament_id_idx").on(table.gamentId),
}));

// Sessions
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  link: varchar("link", { length: 500 }),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("notifications_user_id_idx").on(table.userId),
}));

// Teams
export const teams = pgTable("teams", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  tag: varchar("tag", { length: 10 }).notNull(),
  logoUrl: varchar("logo_url", { length: 500 }),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Team members
export const teamMembers = pgTable("team_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  teamId: uuid("team_id").notNull().references(() => teams.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
}, (table) => ({
  teamIdIdx: index("team_members_team_id_idx").on(table.teamId),
  userIdIdx: index("team_members_user_id_idx").on(table.userId),
}));

// Achievements
export const achievements = pgTable("achievements", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  nameFA: varchar("name_fa", { length: 100 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  descriptionFA: varchar("description_fa", { length: 255 }).notNull(),
  icon: varchar("icon", { length: 50 }).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  requirement: integer("requirement").notNull(),
  points: integer("points").notNull().default(10),
});

// User achievements
export const userAchievements = pgTable("user_achievements", {
  id: uuid("id").defaultRandom().primaryKey(),
  visibleUserId: uuid("user_id").notNull().references(() => users.id),
  achievementId: uuid("achievement_id").notNull().references(() => achievements.id),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_achievements_user_id_idx").on(table.visibleUserId),
}));

// Tournaments
export const tournaments = pgTable("tournaments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  game: gameEnum("game").notNull(),
  format: tournamentFormatEnum("format").notNull().default("single_elimination"),
  status: tournamentStatusEnum("status").notNull().default("registration"),
  description: text("description"),
  maxPlayers: integer("max_players").notNull().default(16),
  prizePool: varchar("prize_pool", { length: 100 }),
  winnersCount: integer("winners_count").default(1),
  categoryLabel: varchar("category_label", { length: 100 }),
  entryFee: varchar("entry_fee", { length: 100 }).default("رایگان"),
  gameMode: varchar("game_mode", { length: 100 }),
  mapName: varchar("map_name", { length: 100 }),
  serverSlots: integer("server_slots").default(16),
  prize1st: varchar("prize_1st", { length: 100 }),
  prize2nd: varchar("prize_2nd", { length: 100 }),
  prize3rd: varchar("prize_3rd", { length: 100 }),
  prize4to10: varchar("prize_4to10", { length: 100 }),
  rules: text("rules"),
  bannerUrl: varchar("banner_url", { length: 500 }),
  roomId: varchar("room_id", { length: 100 }),
  roomPassword: varchar("room_password", { length: 100 }),
  lobbyNotes: text("lobby_notes"),
  roomVisibleAt: timestamp("room_visible_at"),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  startDate: timestamp("start_date"),
});

// Honors / Hall of Fame
export const honors = pgTable("honors", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 30 }).notNull().default("news"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  icon: varchar("icon", { length: 20 }).notNull().default("🏆"),
  imageUrl: text("image_url"),
  prize: varchar("prize", { length: 120 }),
  username: varchar("username", { length: 100 }),
  level: integer("level"),
  highlight: boolean("highlight").notNull().default(false),
  game: varchar("game", { length: 50 }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  userId: uuid("user_id").references(() => users.id),
  createdById: uuid("created_by_id").references(() => users.id),
  approvedById: uuid("approved_by_id").references(() => users.id),
  source: varchar("source", { length: 50 }).notNull().default("manual"),
  metadata: jsonb("metadata"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  statusIdx: index("honors_status_idx").on(table.status),
  typeIdx: index("honors_type_idx").on(table.type),
  gameIdx: index("honors_game_idx").on(table.game),
  createdAtIdx: index("honors_created_at_idx").on(table.createdAt),
  publishedAtIdx: index("honors_published_at_idx").on(table.publishedAt),
}));

// Players
export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  visibleUserId: uuid("user_id").references(() => users.id),
  username: varchar("username", { length: 100 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  gameId: varchar("game_id", { length: 100 }),
  rating: integer("rating").notNull().default(1000),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("players_user_id_idx").on(table.visibleUserId),
}));

// Registrations
export const registrations = pgTable("registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  playerId: uuid("player_id").notNull().references(() => players.id),
  visibleUserId: uuid("user_id").notNull().references(() => users.id),
  seed: integer("seed"),
  checkedInAt: timestamp("checked_in_at"),
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
}, (table) => ({
  tournamentIdx: index("registrations_tournament_id_idx").on(table.tournamentId),
  playerIdIdx: index("registrations_player_id_idx").on(table.playerId),
}));

// Telegram pre-registrations
// Leads/users collected by the official Gament Telegram bot before the user
// completes official tournament registration inside the web app.
export const telegramPreRegistrations = pgTable("telegram_pre_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull().unique(),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  telegramFirstName: varchar("telegram_first_name", { length: 100 }),
  telegramLastName: varchar("telegram_last_name", { length: 100 }),
  linkedUserId: uuid("linked_user_id").references(() => users.id),
  gamentId: varchar("gament_id", { length: 20 }),
  fullName: varchar("full_name", { length: 100 }).notNull(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  game: varchar("game", { length: 50 }).notNull(),
  platform: varchar("platform", { length: 50 }),
  gamerTag: varchar("gamer_tag", { length: 100 }).notNull(),
  city: varchar("city", { length: 100 }),
  teamName: varchar("team_name", { length: 100 }),
  status: varchar("status", { length: 30 }).notNull().default("new"),
  source: varchar("source", { length: 50 }).notNull().default("telegram_bot"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  telegramIdIdx: index("telegram_pre_reg_telegram_id_idx").on(table.telegramId),
  gamentIdIdx: index("telegram_pre_reg_gament_id_idx").on(table.gamentId),
  phoneIdx: index("telegram_pre_reg_phone_idx").on(table.phoneNumber),
  gameIdx: index("telegram_pre_reg_game_idx").on(table.game),
  statusIdx: index("telegram_pre_reg_status_idx").on(table.status),
  createdAtIdx: index("telegram_pre_reg_created_at_idx").on(table.createdAt),
}));

// Telegram webhook conversation sessions
export const telegramBotSessions = pgTable("telegram_bot_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull().unique(),
  state: varchar("state", { length: 50 }).notNull().default("idle"),
  data: jsonb("data").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  telegramIdIdx: index("telegram_bot_sessions_telegram_id_idx").on(table.telegramId),
  updatedAtIdx: index("telegram_bot_sessions_updated_at_idx").on(table.updatedAt),
}));

// Telegram accounts linked to Gament users
export const telegramAccounts = pgTable("telegram_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull().unique(),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  telegramFirstName: varchar("telegram_first_name", { length: 100 }),
  telegramLastName: varchar("telegram_last_name", { length: 100 }),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  linkedAt: timestamp("linked_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  telegramIdIdx: index("telegram_accounts_telegram_id_idx").on(table.telegramId),
  userIdIdx: index("telegram_accounts_user_id_idx").on(table.userId),
}));

// One-time codes generated by /link in the Telegram bot
export const telegramLinkCodes = pgTable("telegram_link_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull(),
  codeHash: varchar("code_hash", { length: 64 }).notNull(),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  telegramFirstName: varchar("telegram_first_name", { length: 100 }),
  telegramLastName: varchar("telegram_last_name", { length: 100 }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  telegramIdIdx: index("telegram_link_codes_telegram_id_idx").on(table.telegramId),
  codeHashIdx: index("telegram_link_codes_code_hash_idx").on(table.codeHash),
  expiresAtIdx: index("telegram_link_codes_expires_at_idx").on(table.expiresAt),
}));

// Referral tracking for Telegram growth loops
export const telegramReferrals = pgTable("telegram_referrals", {
  id: uuid("id").defaultRandom().primaryKey(),
  referrerTelegramId: varchar("referrer_telegram_id", { length: 32 }).notNull(),
  referredTelegramId: varchar("referred_telegram_id", { length: 32 }).notNull().unique(),
  referredUsername: varchar("referred_username", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  referrerIdx: index("telegram_referrals_referrer_idx").on(table.referrerTelegramId),
  referredIdx: index("telegram_referrals_referred_idx").on(table.referredTelegramId),
}));

// De-duplication for reminders, lobby notices and channel result posts
export const telegramSentNotifications = pgTable("telegram_sent_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  dedupeKey: varchar("dedupe_key", { length: 180 }).notNull().unique(),
  telegramId: varchar("telegram_id", { length: 32 }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  type: varchar("type", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  dedupeIdx: index("telegram_sent_notifications_dedupe_idx").on(table.dedupeKey),
  tournamentIdx: index("telegram_sent_notifications_tournament_idx").on(table.tournamentId),
  typeIdx: index("telegram_sent_notifications_type_idx").on(table.type),
}));

// Telegram campaign analytics for /start campaign_* and other deep links
export const telegramCampaignEvents = pgTable("telegram_campaign_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaign: varchar("campaign", { length: 100 }).notNull(),
  telegramId: varchar("telegram_id", { length: 32 }).notNull(),
  telegramUsername: varchar("telegram_username", { length: 100 }),
  eventType: varchar("event_type", { length: 50 }).notNull().default("start"),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  campaignIdx: index("telegram_campaign_events_campaign_idx").on(table.campaign),
  telegramIdx: index("telegram_campaign_events_telegram_idx").on(table.telegramId),
  eventIdx: index("telegram_campaign_events_event_idx").on(table.eventType),
}));

// Coupons usable by Telegram and web registration flows
export const coupons = pgTable("coupons", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 120 }),
  discountPercent: integer("discount_percent").notNull().default(0),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  game: varchar("game", { length: 50 }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  codeIdx: index("coupons_code_idx").on(table.code),
  activeIdx: index("coupons_active_idx").on(table.isActive),
  tournamentIdx: index("coupons_tournament_idx").on(table.tournamentId),
}));

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  couponId: uuid("coupon_id").notNull().references(() => coupons.id),
  userId: uuid("user_id").references(() => users.id),
  telegramId: varchar("telegram_id", { length: 32 }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  status: varchar("status", { length: 30 }).notNull().default("active"),
  discountRial: numeric("discount_rial", { precision: 20, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  usedAt: timestamp("used_at"),
}, (table) => ({
  couponIdx: index("coupon_redemptions_coupon_idx").on(table.couponId),
  userIdx: index("coupon_redemptions_user_idx").on(table.userId),
  telegramIdx: index("coupon_redemptions_telegram_idx").on(table.telegramId),
  statusIdx: index("coupon_redemptions_status_idx").on(table.status),
}));

// Waiting list for full tournaments
export const tournamentWaitlist = pgTable("tournament_waitlist", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  userId: uuid("user_id").references(() => users.id),
  telegramId: varchar("telegram_id", { length: 32 }),
  status: varchar("status", { length: 30 }).notNull().default("waiting"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  notifiedAt: timestamp("notified_at"),
}, (table) => ({
  tournamentIdx: index("tournament_waitlist_tournament_idx").on(table.tournamentId),
  userIdx: index("tournament_waitlist_user_idx").on(table.userId),
  telegramIdx: index("tournament_waitlist_telegram_idx").on(table.telegramId),
  statusIdx: index("tournament_waitlist_status_idx").on(table.status),
}));

// Telegram channel message tracking, used to edit capacity/status later
export const telegramChannelPosts = pgTable("telegram_channel_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  chatId: varchar("chat_id", { length: 100 }).notNull(),
  messageId: integer("message_id").notNull(),
  kind: varchar("kind", { length: 50 }).notNull().default("tournament"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  tournamentIdx: index("telegram_channel_posts_tournament_idx").on(table.tournamentId),
  chatIdx: index("telegram_channel_posts_chat_idx").on(table.chatId),
}));

// Matches
export const matches = pgTable("matches", {
  id: uuid("id").defaultRandom().primaryKey(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id),
  round: integer("round").notNull(),
  matchNumber: integer("match_number").notNull(),
  player1Id: uuid("player1_id").references(() => players.id),
  player2Id: uuid("player2_id").references(() => players.id),
  winnerId: uuid("winner_id").references(() => players.id),
  player1Score: integer("player1_score"),
  player2Score: integer("player2_score"),
  status: matchStatusEnum("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at"),
  completedAt: timestamp("completed_at"),
  evidence: jsonb("evidence"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  tournamentIdx: index("matches_tournament_id_idx").on(table.tournamentId),
  player1Idx: index("matches_player1_id_idx").on(table.player1Id),
  player2Idx: index("matches_player2_id_idx").on(table.player2Id),
}));

// Match evidence
export const matchEvidence = pgTable("match_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  uploadedById: uuid("uploaded_by_id").notNull().references(() => users.id),
  fileUrl: varchar("file_url", { length: 500 }).notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  matchIdIdx: index("match_evidence_match_id_idx").on(table.matchId),
}));

// Judges
export const judges = pgTable("judges", {
  id: uuid("id").defaultRandom().primaryKey(),
  visibleUserId: uuid("user_id").references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("judge"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Judgments
export const judgments = pgTable("judgments", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  judgeId: uuid("judge_id").references(() => judges.id),
  isAiJudgment: boolean("is_ai_judgment").notNull().default(false),
  verdict: varchar("verdict", { length: 50 }).notNull(),
  reasoning: text("reasoning"),
  confidence: integer("confidence"),
  scoreBreakdown: jsonb("score_breakdown"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  matchIdIdx: index("judgments_match_id_idx").on(table.matchId),
}));

// Disputes
export const disputes = pgTable("disputes", {
  id: uuid("id").defaultRandom().primaryKey(),
  matchId: uuid("match_id").notNull().references(() => matches.id),
  raisedById: uuid("raised_by_id").notNull().references(() => players.id),
  reason: text("reason").notNull(),
  evidenceUrls: jsonb("evidence_urls"),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  resolution: text("resolution"),
  resolvedById: uuid("resolved_by_id").references(() => judges.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => ({
  matchIdIdx: index("disputes_match_id_idx").on(table.matchId),
}));

// Verification
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  identifierIdx: index("verif_phone_idx").on(table.identifier),
}));

// AI Management
export const aiProposals = pgTable("ai_proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  targetId: uuid("target_id").notNull(),
  suggestedAction: text("suggested_action").notNull(),
  confidence: integer("confidence").notNull(),
  reasoning: text("reasoning"),
  status: varchar("status", { length: 20 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Granular admin permissions
export const adminPermissions = pgTable("admin_permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  permission: varchar("permission", { length: 80 }).notNull(),
  allowed: boolean("allowed").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userPermissionIdx: index("admin_permissions_user_permission_idx").on(table.userId, table.permission),
}));

// Admin audit logs
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  adminId: uuid("admin_id").references(() => users.id),
  action: varchar("action", { length: 100 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  metadata: jsonb("metadata"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  adminIdx: index("admin_audit_admin_idx").on(table.adminId),
  entityIdx: index("admin_audit_entity_idx").on(table.entityType, table.entityId),
  createdIdx: index("admin_audit_created_idx").on(table.createdAt),
}));

// Wallets
export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  balance: numeric("balance", { precision: 20, scale: 0 }).notNull().default("0"),
  currency: varchar("currency", { length: 10 }).notNull().default("RIAL"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("wallets_user_id_idx").on(table.userId),
}));

// Transactions
export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletId: uuid("wallet_id").notNull().references(() => wallets.id),
  amount: numeric("amount", { precision: 20, scale: 0 }).notNull(),
  type: transactionTypeEnum("type").notNull(),
  status: transactionStatusEnum("status").notNull().default("pending"),
  referenceId: varchar("reference_id", { length: 255 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  walletIdIdx: index("transactions_wallet_id_idx").on(table.walletId),
  referenceIdx: index("transactions_reference_id_idx").on(table.referenceId),
}));

// Support Tickets
export const tickets = pgTable("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  subject: varchar("subject", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Rate limits
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 191 }).primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at").notNull(),
}, (table) => ({
  resetAtIdx: index("rate_limits_reset_at_idx").on(table.resetAt),
}));

// Classified ads monitoring (Divar / Sheypoor)
export const classifiedAds = pgTable("classified_ads", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: varchar("platform", { length: 30 }).notNull(),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  url: text("url").notNull(),
  price: varchar("price", { length: 100 }),
  city: varchar("city", { length: 100 }),
  district: varchar("district", { length: 100 }),
  category: varchar("category", { length: 100 }),
  imageUrl: text("image_url"),
  keywords: jsonb("keywords").notNull().default('[]'),
  rawPayload: jsonb("raw_payload"),
  status: varchar("status", { length: 30 }).notNull().default("new"),
  contactedAt: timestamp("contacted_at"),
  contactMethod: varchar("contact_method", { length: 50 }),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  platformExternalIdUnique: index("classified_ads_platform_external_id_idx").on(table.platform, table.externalId),
  statusIdx: index("classified_ads_status_idx").on(table.status),
  platformIdx: index("classified_ads_platform_idx").on(table.platform),
  createdAtIdx: index("classified_ads_created_at_idx").on(table.createdAt),
  keywordsIdx: index("classified_ads_keywords_idx").on(table.keywords),
}));

export const classifiedScrapeLogs = pgTable("classified_scrape_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: varchar("platform", { length: 30 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  itemsFound: integer("items_found").default(0).notNull(),
  itemsNew: integer("items_new").default(0).notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
