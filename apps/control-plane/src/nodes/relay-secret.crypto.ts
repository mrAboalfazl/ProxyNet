import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function encryptionKey(): Buffer {
  const configured = process.env.NODE_RELAY_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error('NODE_RELAY_ENCRYPTION_KEY is required to store relay credentials');
  }

  const key = Buffer.from(configured, 'base64');
  if (key.length !== 32) {
    throw new Error('NODE_RELAY_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return key;
}

/** Encrypt the node-only relay credential before it is persisted. */
export function encryptRelaySecret(secret: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${authTag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

/** Decrypt a persisted credential only at the point it is sent to its node relay. */
export function decryptRelaySecret(payload: string): string {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = payload.split('.');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !ciphertextEncoded) {
    throw new Error('invalid encrypted relay credential');
  }

  const iv = Buffer.from(ivEncoded, 'base64url');
  const authTag = Buffer.from(tagEncoded, 'base64url');
  const ciphertext = Buffer.from(ciphertextEncoded, 'base64url');
  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
    throw new Error('invalid encrypted relay credential');
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
