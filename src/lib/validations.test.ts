import { describe, expect, it } from "vitest";
import { RegisterSchema, EmailOtpRequestSchema, EmailOtpVerifySchema } from "./validations";

const validBase = {
  username: "ShadowGamer",
  phoneNumber: "09123456789",
  email: "player@example.com",
  password: "secret123",
  displayName: "Shadow Gamer",
  termsAccepted: true,
};

describe("RegisterSchema", () => {
  it("accepts a fully valid registration payload", () => {
    const result = RegisterSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("player@example.com");
      expect(result.data.phoneNumber).toBe("09123456789");
    }
  });

  it("rejects registration when email is missing (email is now required)", () => {
    const { email, ...withoutEmail } = validBase;
    void email;
    const result = RegisterSchema.safeParse(withoutEmail);
    expect(result.success).toBe(false);
    // Should surface our Persian "required" message, not zod's generic
    // "expected string, received undefined".
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("ایمیل الزامی است");
    }
  });

  it("rejects registration when email is an empty string", () => {
    const result = RegisterSchema.safeParse({ ...validBase, email: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email format", () => {
    const result = RegisterSchema.safeParse({ ...validBase, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("still requires a valid mobile number (unchanged behavior)", () => {
    const result = RegisterSchema.safeParse({ ...validBase, phoneNumber: "12345" });
    expect(result.success).toBe(false);
  });

  it("lowercases and trims the email", () => {
    const result = RegisterSchema.safeParse({ ...validBase, email: "  Player@Example.COM  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("player@example.com");
    }
  });
});

describe("EmailOtpRequestSchema", () => {
  it("accepts a valid email", () => {
    expect(EmailOtpRequestSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("rejects a missing email", () => {
    expect(EmailOtpRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("EmailOtpVerifySchema", () => {
  it("accepts a 6-digit code", () => {
    const result = EmailOtpVerifySchema.safeParse({ email: "a@b.com", code: "123456" });
    expect(result.success).toBe(true);
  });

  it("rejects a code that isn't exactly 6 digits", () => {
    expect(EmailOtpVerifySchema.safeParse({ email: "a@b.com", code: "12345" }).success).toBe(false);
    expect(EmailOtpVerifySchema.safeParse({ email: "a@b.com", code: "1234567" }).success).toBe(false);
    expect(EmailOtpVerifySchema.safeParse({ email: "a@b.com", code: "abcdef" }).success).toBe(false);
  });
});
