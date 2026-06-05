import argon2 from 'argon2';
import logger from './logger';

export async function hashPassword(password: string): Promise<string> {
  try {
    // Argon2 automatically handles salting and work factors
    return await argon2.hash(password, {
      type: argon2.argon2id, // Most secure variant
      memoryCost: 65536,     // 64MB
      timeCost: 3,           // 3 iterations
      parallelism: 4,        // 4 threads
    });
  } catch (error) {
    logger.error({ error }, 'Argon2 hashing failed');
    throw new Error('Internal security error');
  }
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    logger.error({ error }, 'Argon2 verification failed');
    return false;
  }
}
