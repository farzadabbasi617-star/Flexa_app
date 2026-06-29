import { z } from "zod";
import { normalizeLoginIdentifier, normalizePhoneNumber } from "@/lib/phone";

const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().email("ایمیل وارد شده معتبر نیست").optional()
);

export const RegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "نام کاربری باید حداقل ۳ کاراکتر باشد")
    .max(20, "نام کاربری نباید بیشتر از ۲۰ کاراکتر باشد")
    .regex(/^[\p{L}\p{N}_.-]+$/u, "نام کاربری فقط می‌تواند شامل حروف، عدد، نقطه، خط تیره و آندرلاین باشد"),
  phoneNumber: z.preprocess(
    (value) => (typeof value === "string" ? normalizePhoneNumber(value) : value),
    z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: 09123456789)")
  ),
  email: optionalEmail,
  password: z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد"),
  displayName: z.string().trim().min(2, "نام نمایشی الزامی است").max(100),
  termsAccepted: z.boolean().refine((value) => value === true, "پذیرش قوانین و مقررات گیمنت الزامی است"),
});

export const LoginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "شماره موبایل، ایمیل یا نام کاربری الزامی است")
    .transform(normalizeLoginIdentifier),
  password: z.string().min(1, "رمز عبور الزامی است"),
});

export const AIAnalyzePlayerSchema = z.object({
  playerId: z.string().uuid("ID بازیکن معتبر نیست"),
  stats: z.any().optional(),
});

export const AIAssistantSchema = z.object({
  message: z.string().min(1, "پیام نمی‌تواند خالی باشد").max(1000, "پیام بیش از حد طولانی است"),
});

export const AIModerateSchema = z.object({
  content: z.string().min(1, "محتوا برای بررسی الزامی است").max(5000),
});

// ===========================================================================
// STORE / MARKETPLACE & KYC
// ===========================================================================

/** Validates an Iranian national ID (کد ملی) including the checksum digit. */
export function isValidIranianNationalId(value: string): boolean {
  const code = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(code)) return false;
  // Reject all-equal-digit codes (e.g. 0000000000) which pass the checksum but are invalid.
  if (/^(\d)\1{9}$/.test(code)) return false;
  const check = Number(code[9]);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(code[i]) * (10 - i);
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

const nationalIdSchema = z.preprocess(
  (v) => (typeof v === "string" ? v.replace(/\D/g, "") : v),
  z.string().refine(isValidIranianNationalId, "کد ملی وارد شده معتبر نیست")
);

const httpUrl = z.string().trim().url("آدرس تصویر معتبر نیست").max(500);

export const KycSubmitSchema = z.object({
  fullName: z.string().trim().min(3, "نام و نام خانوادگی الزامی است").max(150),
  nationalId: nationalIdSchema,
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}[/-]\d{1,2}[/-]\d{1,2}$/, "تاریخ تولد معتبر نیست (مثال: 1375/03/21)")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  idCardImageUrl: httpUrl,
  selfieImageUrl: httpUrl,
});

export const KycReviewSchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  rejectionReason: z.string().trim().max(500).optional(),
});

const STORE_KINDS = ["currency", "account", "item", "service"] as const;
const STORE_GAMES = ["clash_royale", "cod_mobile", "fortnite"] as const;
const CURRENCY_KINDS = ["gem", "cp", "uc", "vbucks", "coin", "gold", "other"] as const;

// Price entered by users in TOMAN; converted to RIAL on the server.
const priceTomanSchema = z.coerce
  .number()
  .int("قیمت باید عدد صحیح باشد")
  .min(1000, "حداقل قیمت ۱۰۰۰ تومان است")
  .max(2_000_000_000, "قیمت بیش از حد مجاز است");

export const StoreListingCreateSchema = z
  .object({
    kind: z.enum(STORE_KINDS, { message: "نوع کالا معتبر نیست" }),
    game: z.enum(STORE_GAMES).optional(),
    title: z.string().trim().min(3, "عنوان الزامی است").max(200),
    description: z.string().trim().max(5000).optional(),
    priceToman: priceTomanSchema,
    currencyKind: z.enum(CURRENCY_KINDS).optional(),
    currencyAmount: z.coerce.number().int().min(1).max(100_000_000).optional(),
    stock: z.coerce.number().int().min(1, "موجودی حداقل ۱").max(100000).default(1),
    images: z.array(httpUrl).max(8, "حداکثر ۸ تصویر").default([]),
    deliveryNotes: z.string().trim().max(5000).optional(),
  })
  .refine(
    (d) => d.kind !== "currency" || (d.currencyKind && d.currencyAmount),
    { message: "برای ارز داخل بازی، نوع و مقدار ارز الزامی است", path: ["currencyAmount"] }
  )
  // Unique account sales should not allow stock > 1 unless explicitly an item batch.
  .refine((d) => d.kind !== "account" || d.stock === 1, {
    message: "برای فروش اکانت، موجودی باید ۱ باشد",
    path: ["stock"],
  });

export const StoreOrderCreateSchema = z.object({
  listingId: z.string().uuid("شناسه آگهی معتبر نیست"),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
  buyerNote: z.string().trim().max(1000).optional(),
});

export const StoreOrderActionSchema = z.object({
  action: z.enum(["deliver", "confirm", "dispute", "cancel"]),
  reason: z.string().trim().max(1000).optional(),
});

export const StoreListingReviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  rejectionReason: z.string().trim().max(500).optional(),
});
