import { z } from 'zod';

export const RegisterSchema = z.object({
  username: z.string().min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد').max(20),
  email: z.string().email('ایمیل وارد شده معتبر نیست'),
  password: z.string().min(6, 'رمز عبور باید حداقل ۶ کاراکتر باشد'),
  fullName: z.string().min(2, 'نام کامل الزامی است'),
});

export const LoginSchema = z.object({
  identifier: z.string().min(1, 'ایمیل یا نام کاربری الزامی است'),
  password: z.string().min(1, 'رمز عبور الزامی است'),
});

export const TournamentCreateSchema = z.object({
  name: z.string().min(3, 'نام تورنومنت باید حداقل ۳ کاراکتر باشد'),
  game: z.enum(['Clash Royale', 'Call of Duty', 'Fortnite']),
  maxPlayers: z.number().int().positive(),
  startDate: z.string().datetime(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type TournamentCreateInput = z.infer<typeof TournamentCreateSchema>;
