import argon2 from 'argon2';
import logger from './logger';

export async function hashPassword(password: string): Promise<string> {
  try {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  } catch (error) {
    logger.error({ error }, 'Argon2 hashing failed');
    throw new Error('Internal security error');
  }
}

export async function comparePassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (error) {
    logger.error({ error }, 'Argon2 verification failed');
    return false;
  }
}
