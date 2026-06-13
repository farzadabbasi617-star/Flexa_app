import { db } from "@/db";
import { verificationTokens, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export const AuthService = {
  /**
   * Generate a 6-digit OTP for Mobile or a Link Token for Email
   */
  async generateVerificationToken(identifier: string) {
    const token = crypto.randomInt(100000, 999999).toString(); // 6-digit OTP
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins expiry

    await db.insert(verificationTokens).values({
      identifier,
      token,
      expiresAt,
    });

    // In production, send SMS or Email here
    console.log(`Verification code for ${identifier}: ${token}`);
    return token;
  },

  /**
   * Verify the token and update user status
   */
  async verifyIdentifier(identifier: string, token: string) {
    const [record] = await db.select()
      .from(verificationTokens)
      .where(and(
        eq(verificationTokens.identifier, identifier),
        eq(verificationTokens.token, token)
      ));

    if (!record || record.expiresAt < new Date()) {
      throw new Error("کد تایید نامعتبر یا منقضی شده است");
    }

    // Mark email as verified if it's an email
    if (identifier.includes("@")) {
      await db.update(users)
        .set({ emailVerified: new Date() })
        .where(eq(users.email, identifier));
    }

    // Clean up used token
    await db.delete(verificationTokens).where(eq(verificationTokens.id, record.id));
    
    return true;
  }
};
