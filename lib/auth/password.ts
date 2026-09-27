import bcrypt from "bcryptjs";

export const BCRYPT_SALT_ROUNDS = 12;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export interface PasswordValidationResult {
  valid: boolean;
  error?: "PASSWORD_REQUIRED" | "PASSWORD_TOO_SHORT" | "PASSWORD_TOO_LONG_BYTES" | "INVALID_PASSWORD_TYPE";
  message?: string;
}

/**
 * Validates password candidate according to strict security constraints:
 * - Must be a string
 * - Minimum 8 characters
 * - Maximum 72 UTF-8 bytes (prevents silent bcrypt truncation)
 * - Preserves whitespace and exact Unicode bytes without trimming/normalization
 */
export function validatePassword(password: unknown): PasswordValidationResult {
  if (typeof password !== "string") {
    return {
      valid: false,
      error: "INVALID_PASSWORD_TYPE",
      message: "Password must be a string",
    };
  }

  if (password.length === 0) {
    return {
      valid: false,
      error: "PASSWORD_REQUIRED",
      message: "Password is required",
    };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: "PASSWORD_TOO_SHORT",
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
    };
  }

  const byteLength = Buffer.byteLength(password, "utf8");
  if (byteLength > MAX_PASSWORD_BYTES) {
    return {
      valid: false,
      error: "PASSWORD_TOO_LONG_BYTES",
      message: `Password exceeds maximum allowed UTF-8 byte limit (${MAX_PASSWORD_BYTES} bytes)`,
    };
  }

  return { valid: true };
}

/**
 * Hashes a validated password with canonical cost 12.
 */
export async function hashPassword(password: string): Promise<string> {
  const check = validatePassword(password);
  if (!check.valid) {
    throw new Error(check.error || "INVALID_PASSWORD");
  }
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (typeof password !== "string" || typeof hash !== "string" || !password || !hash) {
    return false;
  }
  return bcrypt.compare(password, hash);
}
