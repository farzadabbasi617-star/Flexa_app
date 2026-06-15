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
  termsAccepted: z.boolean().refine((value) => value === true, "پذیرش قوانین و مقررات فلکسا الزامی است"),
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
