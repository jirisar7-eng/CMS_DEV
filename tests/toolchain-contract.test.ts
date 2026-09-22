import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));

test("toolchain versions are pinned to the CMS 1.0 baseline", () => {
  assert.equal(pkg.engines.node, "22.18.0");
  assert.equal(pkg.engines.npm, "10.9.3");
  assert.equal(pkg.packageManager, "npm@10.9.3");

  assert.equal(pkg.dependencies.next, "15.5.25");
  assert.equal(pkg.devDependencies.eslint, "9.39.1");
  assert.equal(pkg.devDependencies["eslint-config-next"], "15.5.25");

  assert.equal(lock.packages["node_modules/next"].version, "15.5.25");
  assert.equal(lock.packages["node_modules/eslint"].version, "9.39.1");
  assert.equal(lock.packages["node_modules/eslint-config-next"].version, "15.5.25");
});

test("npm is the only package manager contract", () => {
  assert.equal(fs.existsSync("package-lock.json"), true);
  assert.equal(fs.existsSync("bun.lock"), false);
  assert.equal(fs.existsSync("yarn.lock"), false);
  assert.equal(fs.existsSync("pnpm-lock.yaml"), false);
});

test("flat ESLint config is authoritative and lint cannot be bypassed", () => {
  assert.equal(fs.existsSync("eslint.config.mjs"), true);
  assert.equal(fs.existsSync(".eslintrc.json"), false);
  assert.equal(pkg.scripts.lint, "eslint .");

  const nextConfig = fs.readFileSync("next.config.ts", "utf8");
  assert.equal(nextConfig.includes("ignoreDuringBuilds"), false);
});
