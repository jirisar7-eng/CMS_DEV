import assert from "node:assert/strict";
import { test } from "node:test";
import crypto from "node:crypto";
import { encryptSecret, decryptSecret } from "../lib/security/encryption";

test("AES-256-GCM secret encryption", () => {
  const key = crypto.randomBytes(32).toString("base64");
  const plain = "JBSWY3DPEHPK3PXP";

  const encrypted = encryptSecret(plain, key);

  assert.notEqual(encrypted, plain);
  assert.equal(decryptSecret(encrypted, key), plain);
  assert.throws(() => decryptSecret(encrypted, crypto.randomBytes(32).toString("base64")));
});
