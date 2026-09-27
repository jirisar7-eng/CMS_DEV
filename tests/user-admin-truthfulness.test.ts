import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("SYN-USERS-001: Users Admin UI Truthfulness & Endpoint Cutover", () => {
  const rootDir = path.resolve(__dirname, "..");
  const usersPagePath = path.join(rootDir, "app/admin/users/page.tsx");
  const adminNavPath = path.join(rootDir, "lib/navigation/adminNav.ts");

  const pageCode = fs.readFileSync(usersPagePath, "utf8");
  const navCode = fs.readFileSync(adminNavPath, "utf8");

  it("Users CapabilityShell status is FUNKČNÍ", () => {
    assert.match(pageCode, /status=["']FUNKČNÍ["']/);
  });

  it("adminNav users capability status is FUNKČNÍ", () => {
    assert.match(navCode, /id:\s*['"]users['"][\s\S]*?status:\s*['"]FUNKČNÍ['"]/);
  });

  it("no hardcoded demo identities, names, or emails remain", () => {
    assert.doesNotMatch(pageCode, /jiri\.sar@synthesis\.com/);
    assert.doesNotMatch(pageCode, /redakce@synthesis\.com/);
    assert.doesNotMatch(pageCode, /korektor@synthesis\.com/);
    assert.doesNotMatch(pageCode, /Jiří Šár/);
  });

  it("no handleUnfinishedAction remains", () => {
    assert.doesNotMatch(pageCode, /handleUnfinishedAction/);
  });

  it("no invitation workflow claims remain", () => {
    assert.doesNotMatch(pageCode, /Pozvat uživatele/);
    assert.doesNotMatch(pageCode, /Pozvánka odeslána/);
    assert.doesNotMatch(pageCode, /invitation/i);
    assert.doesNotMatch(navCode, /id:\s*['"]users['"][\s\S]*?pozván/i);
  });

  it("no fake lastLogin data remains", () => {
    assert.doesNotMatch(pageCode, /lastLogin/);
    assert.doesNotMatch(pageCode, /Poslední přihlášení/);
  });

  it("GET /api/admin/users endpoint binding is present", () => {
    assert.match(pageCode, /\/api\/admin\/users/);
    assert.match(pageCode, /method:\s*["']GET["']/);
  });

  it("POST /api/admin/users endpoint binding is present", () => {
    assert.match(pageCode, /\/api\/admin\/users/);
    assert.match(pageCode, /method:\s*["']POST["']/);
  });

  it("PATCH /api/admin/users/${encodeURIComponent(...)} endpoint binding is present", () => {
    assert.match(pageCode, /\/api\/admin\/users\/\$\{encodeURIComponent\(/);
    assert.match(pageCode, /method:\s*["']PATCH["']/);
  });

  it("create payload includes email, password, and optional displayName", () => {
    assert.match(pageCode, /email:\s*createEmail\.trim\(\)/);
    assert.match(pageCode, /password:\s*createPassword/);
    assert.match(pageCode, /if\s*\(\s*createDisplayName\.trim\(\)\s*\)/);
    assert.match(pageCode, /payload\.displayName\s*=\s*createDisplayName\.trim\(\)/);
  });

  it("edit payload is limited to email and displayName", () => {
    assert.match(pageCode, /email:\s*editEmail/);
    assert.match(pageCode, /displayName:\s*editDisplayName/);
    assert.doesNotMatch(pageCode, /editPassword/);
    assert.doesNotMatch(pageCode, /editRole/);
  });

  it("lifecycle sends status ACTIVE or DISABLED", () => {
    assert.match(pageCode, /status:\s*lifecycleTargetStatus/);
    assert.match(pageCode, /["']DISABLED["']/);
    assert.match(pageCode, /["']ACTIVE["']/);
  });

  it("SUSPENDED is rendered read-only and not mutable", () => {
    assert.match(pageCode, /SUSPENDED/);
    assert.match(pageCode, /isMutable/);
    assert.match(pageCode, /Pouze pro čtení/);
  });

  it("globalRoles and hasMfa are read-only display data", () => {
    assert.match(pageCode, /globalRoles/);
    assert.match(pageCode, /hasMfa/);
    assert.match(pageCode, /Bez globální role/);
  });

  it("no DELETE request exists", () => {
    assert.doesNotMatch(pageCode, /method:\s*["']DELETE["']/i);
    assert.doesNotMatch(pageCode, /Smazat uživatele/i);
    assert.doesNotMatch(pageCode, /Odstranit uživatele/i);
  });

  it("no password reset UI exists", () => {
    assert.doesNotMatch(pageCode, /reset.*hesl/i);
    assert.doesNotMatch(pageCode, /obnov.*hesl/i);
  });

  it("no role mutation UI exists", () => {
    assert.doesNotMatch(pageCode, /přiřadit.*rol/i);
    assert.doesNotMatch(pageCode, /změnit.*rol/i);
  });

  it("no raw error.message or stack rendering exists", () => {
    assert.doesNotMatch(pageCode, /err\.stack/);
    assert.doesNotMatch(pageCode, /error\.stack/);
    assert.doesNotMatch(pageCode, /JSON\.stringify\(err/);
    assert.doesNotMatch(pageCode, /JSON\.stringify\(error/);
    assert.doesNotMatch(pageCode, /json\?\.error\?\.message/);
  });

  it("safe error-code mapping exists for all required error codes", () => {
    assert.match(pageCode, /mapUserErrorCode/);
    assert.match(pageCode, /UNAUTHENTICATED/);
    assert.match(pageCode, /FORBIDDEN/);
    assert.match(pageCode, /INVALID_INPUT/);
    assert.match(pageCode, /EMAIL_EXISTS/);
    assert.match(pageCode, /NOT_FOUND/);
    assert.match(pageCode, /INVALID_USER_STATE/);
    assert.match(pageCode, /CANNOT_DEACTIVATE_SELF/);
    assert.match(pageCode, /DATABASE_ERROR/);
  });

  it("successful mutations perform authoritative list refresh", () => {
    assert.match(pageCode, /await loadUsers/);
  });
});
