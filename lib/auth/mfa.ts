import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";

export const MFA_ISSUER = "Synthesis CMS";

const totp = (secret: string, label = "admin") => new OTPAuth.TOTP({
  issuer: MFA_ISSUER, label, algorithm: "SHA1", digits: 6, period: 30,
  secret: OTPAuth.Secret.fromBase32(secret),
});

export const generateTotpSecret = () => new OTPAuth.Secret({ size: 20 }).base32;
export const createTotpUri = (secret: string, label: string) => totp(secret, label).toString();

export function verifyTotpToken(secret: string, token: string) {
  if (!/^\d{6}$/.test(token)) return false;
  try { return totp(secret).validate({ token, window: 1 }) !== null; }
  catch { return false; }
}

export const generateRecoveryCode = () =>
  crypto.randomBytes(10).toString("hex").toUpperCase().match(/.{1,5}/g)!.join("-");

export const hashRecoveryCode = (code: string) =>
  bcrypt.hash(code.replace(/-/g, ""), 12);

export const verifyRecoveryCode = (code: string, hash: string) =>
  bcrypt.compare(code.replace(/-/g, ""), hash);
