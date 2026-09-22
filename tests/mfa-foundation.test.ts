import assert from "node:assert/strict";
import { test } from "node:test";
import * as OTPAuth from "otpauth";
import { generateTotpSecret, verifyTotpToken, generateRecoveryCode, hashRecoveryCode, verifyRecoveryCode } from "../lib/auth/mfa";

test("MFA foundation", async () => {
  const secret = generateTotpSecret();
  const token = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
  assert.equal(verifyTotpToken(secret, token), true);

  const code = generateRecoveryCode();
  const hash = await hashRecoveryCode(code);
  assert.notEqual(hash, code);
  assert.equal(await verifyRecoveryCode(code, hash), true);
});
