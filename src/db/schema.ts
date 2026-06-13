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
  flexaId: varchar("flexa_id", { length: 20 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: text("bio"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: userRoleEnum("role").notNull().default("player"),
  isVerified: boolean("is_verified").notNull().default(false),
  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  rankPoints: integer("rank_points").default(1000).notNull(),
  chatStrikes: integer("chat_strikes").default(0),
  chatBanUntil: timestamp("chat_ban_until"),
  clashRoyaleId: varchar("clash_royale_id", { length: 100 }),
  clashRoyaleUsername: varchar("clash_royale_username", { length: 100 }),
  clashRoyaleStatus: verificationStatusEnum("cr_status").default("unlinked"),
  codMobileId: varchar("cod_mobile_id", { length: 100 }),
  codMobileUsername: varchar("cod_mobile_username", { length: 100 }),
  codMobileStatus: verificationStatusEnum("codm_status").default("unlinked"),
  fortniteId: varchar("fortnite_id", { length: 100 }),
  fortniteUsername: varchar("fortnite_username", { length: 100 }),
  fortniteStatus: verificationStatusEnum("fortnite_status").default("unlinked"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
}, (table) => ({
  phoneIdx: index("users_phone_idx").on(table.phoneNumber),
  rankIdx: index("users_rank_points_idx").on(table.rankPoints),
  flexaIdIdx: index("users_flexa_id_idx").on(table.flexaId),
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
  prize1st: varchar("prize_1st", { length: 100 }),
  prize2nd: varchar("prize_2nd", { length: 100 }),
  prize3rd: varchar("prize_3rd", { length: 100 }),
  prize4to10: varchar("prize_4to10", { length: 100 }),
  rules: text("rules"),
  bannerUrl: varchar("banner_url", { length: 500 }),
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  startDate: timestamp("start_date"),
});

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
  registeredAt: timestamp("registered_at").defaultNow().notNull(),
}, (table) => ({
  tournamentIdx: index("registrations_tournament_id_idx").on(table.tournamentId),
  playerIdIdx: index("registrations_player_id_idx").on(table.playerId),
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

// Chat
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  receiverId: uuid("receiver_id").notNull().references(() => users.id),
  tournamentId: uuid("tournament_id").references(() => tournaments.id),
  matchId: uuid("match_id").references(() => matches.id),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  senderIdx: index("chat_messages_sender_id_idx").on(table.senderId),
  receiverIdx: index("chat_messages_receiver_id_idx").on(table.receiverId),
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

// Wallets
export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  balance: text("balance").notNull().default("0"),
  currency: varchar("currency", { length: 10 }).notNull().default("RIAL"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("wallets_user_id_idx").on(table.userId),
}));

// Transactions
export const transactions = pgTable("transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  walletId: uuid("wallet_id").notNull().references(() => wallets.id),
  amount: text("amount").notNull(),
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

// Ephemeral Chat
export const globalChat = pgTable("global_chat", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdIdx: index("chat_created_idx").on(table.createdAt),
}));

// Rate limits
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 191 }).primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at").notNull(),
}, (table) => ({
  resetAtIdx: index("rate_limits_reset_at_idx").on(table.resetAt),
}));
