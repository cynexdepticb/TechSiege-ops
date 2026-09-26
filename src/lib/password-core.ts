import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;
const SALT_BYTES = 16;

/** Stored format: $scrypt$<saltHex>$<hashHex> */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `$scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  // parts === ["", "scrypt", salt, hash]
  if (parts.length !== 4 || parts[1] !== "scrypt") return false;
  const [, , salt, hash] = parts;
  if (!salt || !hash) return false;
  try {
    const candidate = scryptSync(password, salt, KEYLEN);
    const expected = Buffer.from(hash, "hex");
    if (candidate.length !== expected.length) return false;
    return timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/** Burns comparable CPU when the account doesn't exist, so login responses
 *  take the same time whether or not the email is registered. */
const DUMMY_HASH = hashPassword("timing-equalisation-placeholder");

export function fakeVerify(): void {
  verifyPassword("not-a-real-password", DUMMY_HASH);
}
