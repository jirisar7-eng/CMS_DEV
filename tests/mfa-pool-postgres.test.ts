import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";

// Re-run the unchanged concurrency scenarios with the pool size from the CI
// failure, independent of the developer machine's CPU-derived Prisma default.
// Six/seven concurrent attempts must make progress using only five connections.
test("PostgreSQL MFA completes with a saturated five-connection pool", { skip: !process.env.DATABASE_URL }, async () => {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  databaseUrl.searchParams.set("connection_limit", "5");
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl.toString() };
  // Start an independent test runner, not an inherited node:test worker.
  delete env.NODE_TEST_CONTEXT;
  const { stdout, stderr } = await promisify(execFile)(process.execPath, [
    "--import", "tsx", "--require", "./scripts/ci/mock_server_only.cjs",
    "--test", "--test-reporter=tap", "tests/mfa-postgres.test.ts",
  ], {
    env,
    maxBuffer: 1024 * 1024,
  });
  assert.match(stdout, /# fail 0/);
  assert.doesNotMatch(stdout + stderr, /P2028|Unable to start a transaction|Timed out fetching a new connection/);
});
