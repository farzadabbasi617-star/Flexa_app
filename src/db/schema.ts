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

export const userRoleEnum = pgEnum("user_role", [
  "player",
  "judge",
  "moderator",
  "admin",
  "super_admin",
]);

// Site settings (admin-managed content)
export const siteSettings = pgTable("site_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Site images (admin uploads)
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

// Users table (for authentication)
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: userRoleEnum("role").notNull().default("player"),
  isVerified: boolean("is_verified").notNull().default(false),
  clashRoyaleId: varchar("clash_royale_id", { length: 100 }),
  clashRoyaleUsername: varchar("clash_royale_username", { length: 100 }),
  codMobileId: varchar("cod_mobile_id", { length: 100 }),
  codMobileUsername: varchar("cod_mobile_username", { length: 100 }),
  fortniteId: varchar("fortnite_id", { length: 100 }),
  fortniteUsername: varchar("fortnite_username", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// Sessions table
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
});

// Notifications table
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

// Teams table
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

// Achievements table
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

export const gameEnum = pgEnum("game_type", [
  "clash_royale",
  "cod_mobile",
  "fortnite",
]);

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "registration",
  "in_progress",
  "completed",
  "cancelled",
]);

export const matchStatusEnum = pgEnum("match_status", [
  "pending",
  "in_progress",
  "awaiting_judgment",
  "completed",
  "disputed",
]);

export const tournamentFormatEnum = pgEnum("tournament_format", [
  "single_elimination",
  "double_elimination",
  "round_robin",
]);

// Tournaments table
export const tournaments = pgTable("tournaments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  game: gameEnum("game").notNull(),
  format: tournamentFormatEnum("format").notNull().default("single_elimination"),
  status: tournamentStatusEnum("status").notNull().default("registration"),
  description: text("description"),
  maxPlayers: integer("max_players").notNull().default(16),
  prizePool: varchar("prize_pool", { length: 100 }),
  winnersCount: integer("winners_count").default(1), // جدید: جایزه برای چند نفر
  categoryLabel: varchar("category_label", { length: 100 }), // جدید: صد نفره، کیلی و...
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
  createdById: uuid("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  startDate: timestamp("start_date"),
});

// Players table
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

// Tournament registrations
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

// Matches table
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

// Chat messages table
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

// Judges table
export const judges = pgTable("judges", {
  id: uuid("id").defaultRandom().primaryKey(),
  visibleUserId: uuid("user_id").references(() => users.id),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("judge"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Judgments table
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

// Disputes table
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

// Rate limits — shared across instances (in-memory Maps don't work on
// multi-instance / serverless hosting). One row per (bucket) key counts hits
// within the current window.
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 191 }).primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: timestamp("reset_at").notNull(),
}, (table) => ({
  resetAtIdx: index("rate_limits_reset_at_idx").on(table.resetAt),
}));
import { pgTable, uuid, varchar, text, timestamp, integer } from "drizzle-orm/pg-core";
import { users } from "./schema";

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
