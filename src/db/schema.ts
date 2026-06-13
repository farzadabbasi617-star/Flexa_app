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

export const verificationStatusEnum = pgEnum("verification_status", [
  "unlinked",
  "pending",
  "verified",
  "rejected",
]);

// Users table (Core Identity)
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 20 }).unique(), // MOBILE LOGIN
  emailVerified: timestamp("email_verified"), // EMAIL VERIFICATION
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  flexaId: varchar("flexa_id", { length: 20 }).notNull().unique(), 
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: text("bio"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  role: userRoleEnum("role").notNull().default("player"),
  isVerified: boolean("is_verified").notNull().default(false),
  
  // Game IDs and statuses
  clashRoyaleId: varchar("clash_royale_id", { length: 100 }),
  clashRoyaleStatus: verificationStatusEnum("cr_status").default("unlinked"),
  codMobileId: varchar("cod_mobile_id", { length: 100 }),
  codMobileStatus: verificationStatusEnum("codm_status").default("unlinked"),
  fortniteId: varchar("fortnite_id", { length: 100 }),
  fortniteStatus: verificationStatusEnum("fortnite_status").default("unlinked"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at"),
});

// Verification Tokens (For OTP and Email Links)
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(), // Email or Phone
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  identifierIdx: index("verif_identifier_idx").on(table.identifier),
}));

// Rest of the existing tables (Tournaments, Matches, etc.)
// ... (I will keep the existing logic in the final merged file)

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
