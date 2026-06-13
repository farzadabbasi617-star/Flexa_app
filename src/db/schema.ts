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
  "player", "judge", "moderator", "admin", "super_admin"
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unlinked", "pending", "verified", "rejected"
]);

// --- Core Identity (Mobile Centric) ---
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).notNull().unique(), // MANDATORY
  phoneVerifiedAt: timestamp("phone_verified_at"), // MUST BE SET TO ACCESS APP
  username: varchar("username", { length: 100 }).unique(),
  email: varchar("email", { length: 255 }).unique(), 
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  flexaId: varchar("flexa_id", { length: 20 }).notNull().unique(), 
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: text("bio"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: userRoleEnum("role").notNull().default("player"),
  isVerified: boolean("is_verified").notNull().default(false),
  
  // Strike System for Chat
  chatStrikes: integer("chat_strikes").default(0),
  chatBanUntil: timestamp("chat_ban_until"),
  
  // Game IDs
  clashRoyaleId: varchar("clash_royale_id", { length: 100 }),
  clashRoyaleStatus: verificationStatusEnum("cr_status").default("unlinked"),
  codMobileId: varchar("cod_mobile_id", { length: 100 }),
  codMobileStatus: verificationStatusEnum("codm_status").default("unlinked"),
  fortniteId: varchar("fortnite_id", { length: 100 }),
  fortniteStatus: verificationStatusEnum("fortnite_status").default("unlinked"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// Verification OTPs
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(), // Phone number
  token: varchar("token", { length: 255 }).notNull().unique(), // 6-digit OTP
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  identifierIdx: index("verif_phone_idx").on(table.identifier),
}));

// (Tournament, Wallet, and other tables follow...)

export const siteSettings = pgTable("site_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const siteImages = pgTable("site_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  url: text("url").notNull(),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: varchar("user_agent", { length: 500 }),
});

export const tournaments = pgTable("tournaments", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  game: varchar("game", { length: 50 }).notNull(),
  prizePool: varchar("prize_pool", { length: 100 }),
  winnersCount: integer("winners_count").default(1),
  entryFee: varchar("entry_fee", { length: 100 }).default("رایگان"),
  startDate: timestamp("start_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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

export const transactionTypeEnum = pgEnum("transaction_type", ["deposit", "withdrawal", "tournament_win", "entry_fee", "refund"]);
export const transactionStatusEnum = pgEnum("transaction_status", ["pending", "completed", "failed", "cancelled"]);

export const wallets = pgTable("wallets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  balance: text("balance").notNull().default("0"),
  currency: varchar("currency", { length: 10 }).notNull().default("RIAL"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("wallets_user_id_idx").on(table.userId),
}));

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
}));

// --- Support System ---
export const tickets = pgTable("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  subject: varchar("subject", { length: 255 }).notNull(),
  status: varchar("status", { length: 20 }).default("open"), // open, pending, closed
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id").notNull().references(() => tickets.id),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Ephemeral Global Chat ---
export const globalChat = pgTable("global_chat", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  createdIdx: index("chat_created_idx").on(table.createdAt),
}));
