import argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import logger from './logger';

export async function hashPassword(password: string): Promise<string> {
  try {
    // Try Argon2 first (High security)
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 32768, // Reduced memory cost for better compatibility with free tiers
      timeCost: 2,
      parallelism: 1,
    });
  } catch (error) {
    logger.warn({ error }, 'Argon2 failed, falling back to bcryptjs');
    try {
      // Fallback to bcryptjs (Pure JS, works everywhere)
      return await bcrypt.hash(password, 10);
    } catch (bcryptError) {
      logger.error({ bcryptError }, 'Both hashing methods failed');
      throw new Error('Security system failure');
    }
  }
}

export async function comparePassword(hash: string, password: string): Promise<boolean> {
  try {
    // Detect if hash is Argon2 or Bcrypt
    if (hash.startsWith('$argon2')) {
      return await argon2.verify(hash, password);
    }
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error({ error }, 'Password verification failed');
    return false;
  }
}
