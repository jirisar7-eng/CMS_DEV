import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { DETERMINISTIC_TESTS, POSTGRES_TESTS } from './test_manifest.mjs';

function classifyTests() {
  console.log('=== FAIL-CLOSED TEST CLASSIFICATION CHECK ===');

  const testsDir = 'tests';
  if (!fs.existsSync(testsDir)) {
    console.error(`ERROR: Tests directory "${testsDir}" does not exist.`);
    process.exit(1);
  }

  const diskFiles = fs.readdirSync(testsDir)
    .filter(file => file.endsWith('.test.ts'))
    .map(file => path.join(testsDir, file).replace(/\\/g, '/'))
    .sort();

  const diskSet = new Set(diskFiles);

  const deterministicSet = new Set();
  const duplicateDeterministic = [];
  for (const t of DETERMINISTIC_TESTS) {
    if (deterministicSet.has(t)) {
      duplicateDeterministic.push(t);
    }
    deterministicSet.add(t);
  }

  const postgresSet = new Set();
  const duplicatePostgres = [];
  for (const t of POSTGRES_TESTS) {
    if (postgresSet.has(t)) {
      duplicatePostgres.push(t);
    }
    postgresSet.add(t);
  }

  let failed = false;

  if (duplicateDeterministic.length > 0) {
    console.error('FAIL: Duplicate entries in DETERMINISTIC_TESTS:', duplicateDeterministic);
    failed = true;
  }

  if (duplicatePostgres.length > 0) {
    console.error('FAIL: Duplicate entries in POSTGRES_TESTS:', duplicatePostgres);
    failed = true;
  }

  const overlap = [];
  for (const t of deterministicSet) {
    if (postgresSet.has(t)) {
      overlap.push(t);
    }
  }
  if (overlap.length > 0) {
    console.error('FAIL: Test(s) present in both groups:', overlap);
    failed = true;
  }

  const staleManifest = [];
  for (const t of DETERMINISTIC_TESTS) {
    if (!diskSet.has(t)) {
      staleManifest.push(t);
    }
  }
  for (const t of POSTGRES_TESTS) {
    if (!diskSet.has(t)) {
      staleManifest.push(t);
    }
  }
  if (staleManifest.length > 0) {
    console.error('FAIL: Stale manifest entries (files missing from disk):', staleManifest);
    failed = true;
  }

  const unclassified = [];
  for (const f of diskFiles) {
    if (!deterministicSet.has(f) && !postgresSet.has(f)) {
      unclassified.push(f);
    }
  }
  if (unclassified.length > 0) {
    console.error('FAIL: Unclassified test file(s) found on disk:', unclassified);
    failed = true;
  }

  const totalManifest = DETERMINISTIC_TESTS.length + POSTGRES_TESTS.length;
  console.log(`Disk Test Inventory Count: ${diskFiles.length}`);
  console.log(`Manifest Total Count: ${totalManifest}`);
  console.log(`Deterministic Count: ${DETERMINISTIC_TESTS.length}`);
  console.log(`PostgreSQL Count: ${POSTGRES_TESTS.length}`);
  console.log(`Unclassified Count: ${unclassified.length}`);

  if (failed) {
    console.error('=== CLASSIFICATION CHECK FAILED ===');
    process.exit(1);
  }

  console.log('=== CLASSIFICATION CHECK PASSED ===');
}

function runGroup(groupName, testList) {
  classifyTests();
  console.log(`=== RUNNING ${groupName} TESTS (${testList.length} files) ===`);

  const result = spawnSync('npx', ['tsx', '--test', ...testList], {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`Failed to start test process: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const mode = process.argv[2];

if (mode === 'classify') {
  classifyTests();
} else if (mode === 'unit') {
  runGroup('DETERMINISTIC UNIT', DETERMINISTIC_TESTS);
} else if (mode === 'postgres') {
  runGroup('POSTGRESQL INTEGRATION', POSTGRES_TESTS);
} else {
  console.error(`Usage: node scripts/ci/run_classified_tests.mjs [classify|unit|postgres]`);
  process.exit(1);
}
