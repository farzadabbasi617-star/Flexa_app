import logger from './logger';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(ip: string, limit: number = 100, windowMs: number = 60 * 1000) {
  const now = Date.now();
  const record = rateLimitStore.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (record.count >= limit) {
    logger.warn({ ip }, 'Rate limit exceeded');
    return { success: false, remaining: 0, resetAt: record.resetAt };
  }

  record.count++;
  rateLimitStore.set(ip, record);
  return { success: true, remaining: limit - record.count };
}
