import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("SYN-PROJECTS-002: Project Admin UI Truthfulness & Lifecycle Parity", () => {
  const rootDir = path.resolve(__dirname, "..");
  const clientListPath = path.join(rootDir, "app/admin/projects/ClientProjectList.tsx");
  const navPath = path.join(rootDir, "lib/navigation/adminNav.ts");
  const clientCode = fs.readFileSync(clientListPath, "utf8");
  const navCode = fs.readFileSync(navPath, "utf8");

  it("declares FUNKČNÍ capability status for Projects in admin navigation and CapabilityShell", () => {
    assert.match(clientCode, /status=["']FUNKČNÍ["']/);
    assert.match(navCode, /id:\s*['"]projects['"][\s\S]*?status:\s*['"]FUNKČNÍ['"]/);
  });

  it("no Projects create or switch actions use handleUnfinishedAction", () => {
    assert.doesNotMatch(clientCode, /handleUnfinishedAction\(\s*['"]Založit nový projekt['"]\s*\)/);
    assert.doesNotMatch(clientCode, /handleUnfinishedAction\(\s*`Přepnout do projektu/);
    assert.doesNotMatch(clientCode, /handleUnfinishedAction\(/);
  });

  it("CapabilityShell receives real onEmptyAction opening create dialog", () => {
    assert.match(clientCode, /onEmptyAction=\{handleOpenCreate\}/);
    assert.match(clientCode, /emptyActionLabel=["']Založit nový projekt["']/);
  });

  it("Create Project invokes POST /api/admin/projects with trimmed name and optional key", () => {
    assert.match(clientCode, /fetch\(\s*["']\/api\/admin\/projects["'],\s*\{[\s\S]*?method:\s*["']POST["']/);
    assert.match(clientCode, /createName\.trim\(\)/);
  });

  it("Rename Project invokes PATCH /api/admin/projects/[projectId] with name only", () => {
    assert.match(clientCode, /\/api\/admin\/projects\/\$\{encodeURIComponent\(editingProject\.id\)\}/);
    assert.match(clientCode, /method:\s*["']PATCH["']/);
    assert.match(clientCode, /name:\s*trimmedName/);
    assert.doesNotMatch(clientCode, /key:\s*trimmedName/);
  });

  it("Archive Project invokes PATCH /api/admin/projects/[projectId] with status ARCHIVED", () => {
    assert.match(clientCode, /\/api\/admin\/projects\/\$\{encodeURIComponent\(archivingProject\.id\)\}/);
    assert.match(clientCode, /status:\s*["']ARCHIVED["']/);
  });

  it("Switching project writes syn_project_id cookie for path=/ with 1-year max-age", () => {
    assert.match(clientCode, /document\.cookie\s*=\s*`syn_project_id=\$\{projectId\};\s*path=\/;\s*max-age=31536000`/);
    assert.match(clientCode, /window\.location\.reload\(\)/);
  });

  it("Archiving the currently active project clears the syn_project_id cookie before reload", () => {
    assert.match(clientCode, /if\s*\(\s*archivingProject\.id\s*===\s*activeProjectId\s*\)\s*\{[\s\S]*?document\.cookie\s*=\s*["']syn_project_id=;\s*path=\/;\s*max-age=0["']/);
  });

  it("Truthful status-specific actions: only ACTIVE projects can switch, rename, or archive", () => {
    assert.match(clientCode, /const\s+isActive\s*=\s*p\.status\s*===\s*["']ACTIVE["']/);
    assert.match(clientCode, /Pouze pro čtení/);
  });

  it("Archived and disabled projects cannot switch, rename, or archive", () => {
    assert.match(clientCode, /\{isActive\s*&&\s*\([\s\S]*?handleSwitchProject/);
    assert.match(clientCode, /\{isActive\s*\?\s*\([\s\S]*?handleOpenRename/);
    assert.match(clientCode, /handleOpenArchive\(p\)/);
  });

  it("Strictly prohibits hard Delete controls and Restore controls", () => {
    assert.doesNotMatch(clientCode, /method:\s*["']DELETE["']/i);
    assert.doesNotMatch(clientCode, /Smazat projekt/i);
    assert.doesNotMatch(clientCode, /Odstranit projekt/i);
    assert.doesNotMatch(clientCode, /Obnovit projekt/i);
    assert.doesNotMatch(clientCode, /status:\s*["']RESTORE["']/i);
  });

  it("Strictly omits deferred capabilities (memberships, roles, permission matrix)", () => {
    assert.doesNotMatch(clientCode, /membership/i);
    assert.doesNotMatch(clientCode, /členové/i);
    assert.doesNotMatch(clientCode, /přiřadit uživatele/i);
  });

  it("Safe error mapping without internal stack traces or raw server errors", () => {
    assert.match(clientCode, /Neplatné údaje projektu\./);
    assert.match(clientCode, /Přihlášení vypršelo nebo uživatel není aktivní\./);
    assert.match(clientCode, /Nemáte oprávnění spravovat projekty\./);
    assert.match(clientCode, /Projekt s tímto klíčem již existuje\./);
    assert.match(clientCode, /Projekt se nepodařilo uložit\./);
    assert.doesNotMatch(clientCode, /err\.stack/);
    assert.doesNotMatch(clientCode, /error\.stack/);
  });
});
