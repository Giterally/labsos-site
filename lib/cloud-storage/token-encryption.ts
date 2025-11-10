import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 16 bytes for AES
const SALT_LENGTH = 64; // 64 bytes for salt
const TAG_LENGTH = 16; // 16 bytes for GCM tag
const KEY_LENGTH = 32; // 32 bytes for AES-256

/**
 * Get encryption key from environment variable
 * If not set, generates a key (should be set in production)
 */
function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  
  if (!key) {
    console.error('[TokenEncryption] TOKEN_ENCRYPTION_KEY environment variable is not set');
    throw new Error('TOKEN_ENCRYPTION_KEY environment variable is not set');
  }
  
  console.log(`[TokenEncryption] Encryption key found, length: ${key.length}`);
  
  // If key is hex string, convert to buffer
  if (key.length === 64) {
    console.log('[TokenEncryption] Using hex key format');
    return Buffer.from(key, 'hex');
  }
  
  // Otherwise, derive key from string using PBKDF2
  console.log('[TokenEncryption] Deriving key from string using PBKDF2');
  return crypto.pbkdf2Sync(key, 'token-encryption-salt', 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt a token using AES-256-GCM
 * Returns base64 encoded string: salt:iv:tag:encrypted
 */
export function encryptToken(plaintext: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Derive key from master key and salt
    const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256');
    
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const tag = cipher.getAuthTag();
    
    // Combine salt:iv:tag:encrypted
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'base64')
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Token encryption error:', error);
    throw new Error('Failed to encrypt token');
  }
}

/**
 * Decrypt a token using AES-256-GCM
 * Expects base64 encoded string: salt:iv:tag:encrypted
 */
export function decryptToken(encryptedData: string): string {
  try {
    const key = getEncryptionKey();
    const combined = Buffer.from(encryptedData, 'base64');
    
    // Extract components
    const salt = combined.subarray(0, SALT_LENGTH);
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from master key and salt
    const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, 'sha256');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Token decryption error:', error);
    throw new Error('Failed to decrypt token');
  }
}

/**
 * Generate a random encryption key (for initial setup)
 * Returns hex string that can be used as TOKEN_ENCRYPTION_KEY
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

