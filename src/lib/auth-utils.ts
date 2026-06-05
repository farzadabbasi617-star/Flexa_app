import bcrypt from 'bcryptjs';
import logger from './logger';

export async function hashPassword(password: string): Promise<string> {
  try {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  } catch (error) {
    logger.error({ error }, 'Error hashing password');
    throw new Error('Password hashing failed');
  }
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error({ error }, 'Error comparing passwords');
    throw new Error('Password comparison failed');
  }
}
