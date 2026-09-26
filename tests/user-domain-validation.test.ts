import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validatePassword,
  hashPassword,
  verifyPassword,
  BCRYPT_SALT_ROUNDS,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
} from "@/lib/auth/password";
import {
  validateEmail,
  validateDisplayName,
  validateUserStatus,
  validateCreateUserInput,
  validatePatchUserInput,
} from "@/lib/domain/users/validation";
import { EVENT_METADATA_SCHEMAS, sanitizeAuditMetadata } from "@/lib/domain/audit/service";
import { revokeAllUserSessions } from "@/lib/auth/session";

describe("SYN-USERS-001: Password Foundation & Policy", () => {
  it("accepts valid bcrypt-safe password with length >= 8 and bytes <= 72", () => {
    const res = validatePassword("CorrectHorseBatteryStaple123");
    assert.equal(res.valid, true);
    assert.equal(res.error, undefined);
  });

  it("rejects passwords shorter than 8 characters", () => {
    const res1 = validatePassword("short7!");
    assert.equal(res1.valid, false);
    assert.equal(res1.error, "PASSWORD_TOO_SHORT");

    const res2 = validatePassword("");
    assert.equal(res2.valid, false);
    assert.equal(res2.error, "PASSWORD_REQUIRED");
  });

  it("rejects non-string password inputs", () => {
    assert.equal(validatePassword(null).valid, false);
    assert.equal(validatePassword(12345678).valid, false);
    assert.equal(validatePassword({}).valid, false);
  });

  it("strictly enforces maximum 72 UTF-8 bytes to prevent bcrypt silent truncation", () => {
    // 72 ASCII characters = 72 bytes -> PASS
    const pass72 = "A".repeat(72);
    assert.equal(Buffer.byteLength(pass72, "utf8"), 72);
    assert.equal(validatePassword(pass72).valid, true);

    // 73 ASCII characters = 73 bytes -> FAIL
    const pass73 = "A".repeat(73);
    assert.equal(Buffer.byteLength(pass73, "utf8"), 73);
    const res73 = validatePassword(pass73);
    assert.equal(res73.valid, false);
    assert.equal(res73.error, "PASSWORD_TOO_LONG_BYTES");
  });

  it("correctly calculates multi-byte UTF-8 byte boundaries for Unicode passwords", () => {
    // Czech character "ř" is 2 bytes in UTF-8
    // 36 "ř" characters = 72 bytes -> PASS
    const passCzech72 = "ř".repeat(36);
    assert.equal(Buffer.byteLength(passCzech72, "utf8"), 72);
    assert.equal(validatePassword(passCzech72).valid, true);

    // 37 "ř" characters = 74 bytes -> FAIL
    const passCzech74 = "ř".repeat(37);
    assert.equal(Buffer.byteLength(passCzech74, "utf8"), 74);
    const resCzech = validatePassword(passCzech74);
    assert.equal(resCzech.valid, false);
    assert.equal(resCzech.error, "PASSWORD_TOO_LONG_BYTES");

    // Emoji "🔑" is 4 bytes in UTF-8
    // 18 "🔑" emojis = 72 bytes -> PASS
    const passEmoji72 = "🔑".repeat(18);
    assert.equal(Buffer.byteLength(passEmoji72, "utf8"), 72);
    assert.equal(validatePassword(passEmoji72).valid, true);

    // 19 "🔑" emojis = 76 bytes -> FAIL
    const passEmoji76 = "🔑".repeat(19);
    assert.equal(Buffer.byteLength(passEmoji76, "utf8"), 76);
    const resEmoji = validatePassword(passEmoji76);
    assert.equal(resEmoji.valid, false);
    assert.equal(resEmoji.error, "PASSWORD_TOO_LONG_BYTES");
  });

  it("preserves whitespace and exact Unicode without trimming or NFC normalization", () => {
    const rawWithSpaces = "  password with spaces  ";
    assert.equal(validatePassword(rawWithSpaces).valid, true);

    // Decomposed Unicode "e" + combining acute "\u0065\u0301" vs precomposed "\u00E9"
    const decomposed = "\u0065\u0301" + "1234567";
    const precomposed = "\u00E9" + "1234567";
    assert.notEqual(decomposed, precomposed);
    assert.equal(validatePassword(decomposed).valid, true);
    assert.equal(validatePassword(precomposed).valid, true);
  });

  it("hashes passwords with bcrypt cost 12 and verifies correctly", async () => {
    assert.equal(BCRYPT_SALT_ROUNDS, 12);
    const plaintext = "SecureAdminPassword!2026";
    const hash = await hashPassword(plaintext);

    assert.ok(hash.startsWith("$2a$12$") || hash.startsWith("$2b$12$"), "Hash must use cost 12");
    assert.equal(await verifyPassword(plaintext, hash), true);
    assert.equal(await verifyPassword("WrongPassword!2026", hash), false);
    assert.equal(await verifyPassword("", hash), false);
  });
});

describe("SYN-USERS-001: Email, DisplayName & Status Validation", () => {
  it("normalizes email with trim and lowercase and validates format", () => {
    const res = validateEmail("  Admin.User@Synthesis.COM  ");
    assert.equal(res.valid, true);
    assert.equal(res.normalized, "admin.user@synthesis.com");

    assert.equal(validateEmail("invalid-email").valid, false);
    assert.equal(validateEmail("").valid, false);
    assert.equal(validateEmail("a".repeat(250) + "@test.com").valid, false);
  });

  it("normalizes display name with trim and NFC and converts empty to null", () => {
    const res1 = validateDisplayName("  Jiří Šár  ");
    assert.equal(res1.valid, true);
    assert.equal(res1.normalized, "Jiří Šár");

    const res2 = validateDisplayName("   ");
    assert.equal(res2.valid, true);
    assert.equal(res2.normalized, null);

    const res3 = validateDisplayName(null);
    assert.equal(res3.valid, true);
    assert.equal(res3.normalized, null);

    const res4 = validateDisplayName("A".repeat(101));
    assert.equal(res4.valid, false);
  });

  it("validates user status allowing only ACTIVE or DISABLED in Admin V1", () => {
    assert.equal(validateUserStatus("ACTIVE").valid, true);
    assert.equal(validateUserStatus("DISABLED").valid, true);

    // SUSPENDED is not an allowed Admin V1 mutation target
    const resSuspended = validateUserStatus("SUSPENDED");
    assert.equal(resSuspended.valid, false);

    assert.equal(validateUserStatus("DELETED").valid, false);
    assert.equal(validateUserStatus("UNKNOWN").valid, false);
  });
});

describe("SYN-USERS-001: Create & Patch Request Shape Validation", () => {
  it("validates CreateUserInput and rejects unknown or mass-assignment properties", () => {
    const valid = validateCreateUserInput({
      email: "  New.Admin@Example.com ",
      password: "SafePassword123",
      displayName: "New Admin",
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.data?.email, "new.admin@example.com");
    assert.equal(valid.data?.password, "SafePassword123");
    assert.equal(valid.data?.displayName, "New Admin");

    // Rejects unknown property
    const withRole = validateCreateUserInput({
      email: "test@example.com",
      password: "SafePassword123",
      role: "SUPER_ADMIN",
    });
    assert.equal(withRole.valid, false);
    assert.ok(withRole.errors?.role);

    // Rejects missing password
    const noPass = validateCreateUserInput({
      email: "test@example.com",
    });
    assert.equal(noPass.valid, false);
    assert.ok(noPass.errors?.password);
  });

  it("validates PatchUserInput and strictly rejects password, roles, permissions, and sessions", () => {
    const valid = validatePatchUserInput({
      displayName: "Updated Name",
      status: "DISABLED",
    });
    assert.equal(valid.valid, true);
    assert.equal(valid.data?.displayName, "Updated Name");
    assert.equal(valid.data?.status, "DISABLED");

    // Explicitly rejects password modification in PATCH
    const withPass = validatePatchUserInput({
      password: "NewPassword123",
    });
    assert.equal(withPass.valid, false);
    assert.ok(withPass.errors?.password);

    // Explicitly rejects roles or permissions
    const withRoles = validatePatchUserInput({
      roles: ["SUPER_ADMIN"],
    });
    assert.equal(withRoles.valid, false);
    assert.ok(withRoles.errors?.roles);

    // Rejects empty patch
    const empty = validatePatchUserInput({});
    assert.equal(empty.valid, false);
  });
});

describe("SYN-USERS-001: Audit Event Schemas & Metadata Sanitization", () => {
  it("contains USER_CREATED, USER_UPDATED, and USER_STATUS_CHANGED in EVENT_METADATA_SCHEMAS", () => {
    assert.ok(EVENT_METADATA_SCHEMAS.USER_CREATED, "USER_CREATED schema must exist");
    assert.ok(EVENT_METADATA_SCHEMAS.USER_UPDATED, "USER_UPDATED schema must exist");
    assert.ok(EVENT_METADATA_SCHEMAS.USER_STATUS_CHANGED, "USER_STATUS_CHANGED schema must exist");
  });

  it("sanitizes audit metadata and strictly strips passwords, hashes, tokens and secrets", () => {
    const raw = {
      targetUserId: "user-123",
      email: "admin@example.com",
      password: "PlaintextPassword!",
      passwordHash: "$2b$12$somehashsecret",
      sessionToken: "raw-token-123",
      mfaSecret: "JBSWY3DPEHPK3PXP",
      changedFields: ["email", "displayName"],
    };

    const sanitizedCreated = sanitizeAuditMetadata(raw, "USER_CREATED");
    assert.equal(sanitizedCreated.targetUserId, "user-123");
    assert.equal(sanitizedCreated.email, "admin@example.com");
    assert.equal(sanitizedCreated.password, undefined);
    assert.equal(sanitizedCreated.passwordHash, undefined);
    assert.equal(sanitizedCreated.sessionToken, undefined);
    assert.equal(sanitizedCreated.mfaSecret, undefined);

    const sanitizedUpdated = sanitizeAuditMetadata(raw, "USER_UPDATED");
    assert.equal(sanitizedUpdated.targetUserId, "user-123");
    assert.deepEqual(sanitizedUpdated.changedFields, ["email", "displayName"]);
    assert.equal(sanitizedUpdated.password, undefined);
  });
});

describe("SYN-USERS-001: Session Revocation Backward Compatibility", () => {
  it("revokeAllUserSessions accepts legacy string argument and new options object with tx", async () => {
    // When DB is not configured or in unit test, it returns without throw
    await assert.doesNotReject(async () => {
      await revokeAllUserSessions("user-123");
      await revokeAllUserSessions("user-123", "except-session-id");
      await revokeAllUserSessions("user-123", { exceptSessionId: "except-session-id" });
      await revokeAllUserSessions("user-123", { tx: undefined });
    });
  });
});
