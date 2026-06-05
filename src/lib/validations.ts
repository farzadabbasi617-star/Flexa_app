import { z } from 'zod';

export const RegisterSchema = z.object({
  username: z.string().min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد').max(20),
  email: z.string().email('ایمیل وارد شده معتبر نیست'),
  password: z.string()
    .min(8, 'رمز عبور باید حداقل ۸ کاراکتر باشد')
    .refine((val) => /[A-Z]/.test(val), { message: 'رمز عبور باید حداقل یک حرف بزرگ داشته باشد' })
    .refine((val) => /[a-z]/.test(val), { message: 'رمز عبور باید حداقل یک حرف کوچک داشته باشد' })
    .refine((val) => /[0-9]/.test(val), { message: 'رمز عبور باید حداقل یک عدد داشته باشد' }),
  fullName: z.string().min(2, 'نام کامل الزامی است'),
});

export const LoginSchema = z.object({
  identifier: z.string().min(1, 'ایمیل یا نام کاربری الزامی است'),
  password: z.string().min(1, 'رمز عبور الزامی است'),
});

export const AIAnalyzePlayerSchema = z.object({
  playerId: z.string().uuid('ID بازیکن معتبر نیست'),
  stats: z.any().optional(),
});

export const AIAssistantSchema = z.object({
  message: z.string().min(1, 'پیام نمی‌تواند خالی باشد').max(1000, 'پیام بیش از حد طولانی است'),
});

export const AIModerateSchema = z.object({
  content: z.string().min(1, 'محتوا برای بررسی الزامی است').max(5000),
});
