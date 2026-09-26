import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import {
  SESSION_IDLE_TIMEOUT_MINUTES,
  SESSION_ABSOLUTE_TIMEOUT_HOURS,
} from "@/lib/auth/session-policy";

test("SYN-SEC-011: Security Admin UI Truthfulness and Runtime Alignment Contract", async (t) => {
  const pagePath = path.join(process.cwd(), "app/admin/security/page.tsx");
  assert.ok(fs.existsSync(pagePath), "app/admin/security/page.tsx must exist");
  const pageSource = fs.readFileSync(pagePath, "utf8");

  const nextConfigPath = path.join(process.cwd(), "next.config.ts");
  assert.ok(fs.existsSync(nextConfigPath), "next.config.ts must exist");
  const nextConfigSource = fs.readFileSync(nextConfigPath, "utf8");

  await t.test("A. Frame Protection: Does NOT claim X-Frame-Options: DENY", () => {
    assert.doesNotMatch(pageSource, /X-Frame-Options:\s*DENY/i);
  });

  await t.test("B. Frame Protection: Claims X-Frame-Options: SAMEORIGIN", () => {
    assert.match(pageSource, /X-Frame-Options:\s*SAMEORIGIN/);
  });

  await t.test("C. Frame Protection: Communicates CSP frame-ancestors \x27self\x27", () => {
    assert.match(pageSource, /frame-ancestors/);
    assert.match(pageSource, /self/);
  });

  await t.test("D. HSTS: Does NOT claim includeSubDomains or preload", () => {
    assert.doesNotMatch(pageSource, /includeSubDomains/);
    assert.doesNotMatch(pageSource, /preload/);
  });

  await t.test("E. HSTS: Communicates max-age=31536000", () => {
    assert.match(pageSource, /max-age=31536000/);
  });

  await t.test("F. Session Timeout: Does NOT claim stale 30 minutes idle timeout", () => {
    assert.doesNotMatch(pageSource, /30 minutách neaktivity/);
  });

  await t.test("G. Session Policy Imports: Imports canonical constants from pure session-policy", () => {
    assert.match(pageSource, /from ["']@\/lib\/auth\/session-policy["']/);
    assert.match(pageSource, /SESSION_IDLE_TIMEOUT_MINUTES/);
    assert.match(pageSource, /SESSION_ABSOLUTE_TIMEOUT_HOURS/);
  });

  await t.test("H. Session Policy Values: Pure constants evaluate to 15m idle and 12h absolute", () => {
    assert.strictEqual(SESSION_IDLE_TIMEOUT_MINUTES, 15);
    assert.strictEqual(SESSION_ABSOLUTE_TIMEOUT_HOURS, 12);
  });

  await t.test("I. Capability Status: Retains status=\x22POUZE UI\x22", () => {
    assert.match(pageSource, /status=["']POUZE UI["']/);
  });

  await t.test("J. Truthfulness Notice: Removes false blanket statement", () => {
    assert.doesNotMatch(pageSource, /Bezpečnostní backend a telemetrie zatím nejsou připojeny/);
  });

  await t.test("K. Section Separation: Distinguishes active runtime controls from preview controls", () => {
    assert.match(pageSource, /Aktivní runtime HTTP ochrany/);
    assert.match(pageSource, /Aktivní politika administrátorské relace/);
    assert.match(pageSource, /Náhled nenapojených bezpečnostních nastavení/);
  });

  await t.test("L. Preview Controls: Checkboxes are disabled and not defaultChecked", () => {
    assert.doesNotMatch(pageSource, /defaultChecked/);
    assert.match(pageSource, /disabled/);
  });

  await t.test("M. Runtime Parity with next.config.ts", () => {
    assert.match(nextConfigSource, /SAMEORIGIN/);
    assert.match(nextConfigSource, /frame-ancestors 'self'/);
    assert.match(nextConfigSource, /max-age=31536000/);
    assert.doesNotMatch(nextConfigSource, /includeSubDomains/);
  });
});
