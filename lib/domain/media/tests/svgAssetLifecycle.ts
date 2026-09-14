/**
 * SYNTHESIS CMS — SVG ASSET LIFECYCLE BRIDGE TEST SUITE
 *
 * Verifies that the server SVG asset lifecycle bridge enforces:
 * - Fail-closed security rules
 * - Deterministic normalization and serialization
 * - Exact checksum derivation
 * - No exposure of raw SVG on failure
 * - Pipeline identity
 */

import assert from 'assert';
import { prepareSvgAssetDraft, SVG_SECURITY_PIPELINE_ID } from '../svgAssetLifecycle.server';

interface TestCase {
  id: string;
  name: string;
  run: () => void;
}

const SAFE_SVG_A = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect x="10" y="10" width="80" height="80" fill="#ff0000" rx="5" ry="5" />
  <ellipse cx="50" cy="50" rx="30" ry="20" fill="#00ff00" />
</svg>`;

const SCRIPT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <script>alert(1)</script>
  <rect x="0" y="0" width="10" height="10" />
</svg>`;

const EVENT_HANDLER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="10" height="10" onload="alert(1)" />
</svg>`;

const FOREIGN_OBJECT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <foreignObject width="100" height="100">
    <div xmlns="http://www.w3.org/1999/xhtml">Unsafe HTML content</div>
  </foreignObject>
</svg>`;

const EXTERNAL_HREF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <a href="https://malicious.example.com/steal">
    <ellipse cx="50" cy="50" rx="40" ry="30" />
  </a>
</svg>`;

const MALFORMED_XML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect x="0" y="0" width="10" height="10">
</svg>`;

const ATTR_ORDER_1 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><rect x="10" y="20" width="30" height="40" fill="#000" /></svg>`;
const ATTR_ORDER_2 = `<svg height="100" width="100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#000" height="40" width="30" y="20" x="10" /></svg>`;

export const TESTS: TestCase[] = [
  {
    id: 'test-01-safe-svg-success',
    name: '1. safe SVG -> success',
    run: () => {
      const res = prepareSvgAssetDraft(SAFE_SVG_A);
      assert.strictEqual(res.success, true, 'Safe SVG must succeed');
      if (res.success) {
        assert.ok(res.canonicalSvg.length > 0, 'Canonical SVG must be non-empty');
        assert.ok(res.nodeCount > 0, 'Node count must be > 0');
        assert.ok(res.maxDepth > 0, 'Max depth must be > 0');
        assert.ok(res.sizeBytes > 0, 'Size in bytes must be > 0');
      }
    },
  },
  {
    id: 'test-02-script-rejected',
    name: '2. script SVG -> rejected',
    run: () => {
      const res = prepareSvgAssetDraft(SCRIPT_SVG);
      assert.strictEqual(res.success, false, 'Script tag must be rejected');
      if (!res.success) {
        assert.strictEqual(res.reasonCode, 'SVG_SCRIPT_DETECTED');
      }
    },
  },
  {
    id: 'test-03-event-handler-rejected',
    name: '3. event-handler SVG -> rejected',
    run: () => {
      const res = prepareSvgAssetDraft(EVENT_HANDLER_SVG);
      assert.strictEqual(res.success, false, 'Event handler attribute must be rejected');
      if (!res.success) {
        assert.strictEqual(res.reasonCode, 'SVG_EVENT_HANDLER_DETECTED');
      }
    },
  },
  {
    id: 'test-04-foreign-object-rejected',
    name: '4. foreignObject -> rejected',
    run: () => {
      const res = prepareSvgAssetDraft(FOREIGN_OBJECT_SVG);
      assert.strictEqual(res.success, false, 'foreignObject element must be rejected');
      if (!res.success) {
        assert.strictEqual(res.reasonCode, 'SVG_FOREIGN_OBJECT');
      }
    },
  },
  {
    id: 'test-05-external-href-rejected',
    name: '5. external href -> rejected',
    run: () => {
      const res = prepareSvgAssetDraft(EXTERNAL_HREF_SVG);
      assert.strictEqual(res.success, false, 'External link / tag <a> must be rejected');
      if (!res.success) {
        assert.strictEqual(res.reasonCode, 'SVG_FORBIDDEN_ELEMENT');
      }
    },
  },
  {
    id: 'test-06-malformed-xml-rejected',
    name: '6. malformed XML -> rejected',
    run: () => {
      const res = prepareSvgAssetDraft(MALFORMED_XML);
      assert.strictEqual(res.success, false, 'Malformed XML must be rejected');
      if (!res.success) {
        assert.strictEqual(res.stage, 'parse', 'Stage must be parse');
      }
    },
  },
  {
    id: 'test-07-identical-canonical-svg',
    name: '7. same safe input twice -> byte-identical canonicalSvg',
    run: () => {
      const res1 = prepareSvgAssetDraft(SAFE_SVG_A);
      const res2 = prepareSvgAssetDraft(SAFE_SVG_A);
      assert.strictEqual(res1.success, true);
      assert.strictEqual(res2.success, true);
      if (res1.success && res2.success) {
        assert.strictEqual(res1.canonicalSvg, res2.canonicalSvg, 'Canonical SVG must be byte-identical');
      }
    },
  },
  {
    id: 'test-08-identical-canonical-checksum',
    name: '8. same safe input twice -> identical canonical checksum',
    run: () => {
      const res1 = prepareSvgAssetDraft(SAFE_SVG_A);
      const res2 = prepareSvgAssetDraft(SAFE_SVG_A);
      assert.strictEqual(res1.success, true);
      assert.strictEqual(res2.success, true);
      if (res1.success && res2.success) {
        assert.strictEqual(
          res1.canonicalChecksumSha256,
          res2.canonicalChecksumSha256,
          'Canonical checksums must match'
        );
      }
    },
  },
  {
    id: 'test-09-equivalent-attribute-ordering',
    name: '9. equivalent attribute ordering -> identical canonical result',
    run: () => {
      const res1 = prepareSvgAssetDraft(ATTR_ORDER_1);
      const res2 = prepareSvgAssetDraft(ATTR_ORDER_2);
      assert.strictEqual(res1.success, true);
      assert.strictEqual(res2.success, true);
      if (res1.success && res2.success) {
        assert.strictEqual(res1.canonicalSvg, res2.canonicalSvg, 'Canonical SVG must be identical despite attribute order');
        assert.strictEqual(
          res1.canonicalChecksumSha256,
          res2.canonicalChecksumSha256,
          'Canonical checksums must match despite attribute order'
        );
      }
    },
  },
  {
    id: 'test-10-source-checksum-exists',
    name: '10. source checksum exists',
    run: () => {
      const res = prepareSvgAssetDraft(SAFE_SVG_A);
      assert.strictEqual(res.success, true);
      if (res.success) {
        assert.strictEqual(typeof res.sourceChecksumSha256, 'string');
        assert.strictEqual(res.sourceChecksumSha256.length, 64, 'SHA-256 hex string must be 64 characters');
        assert.match(res.sourceChecksumSha256, /^[0-9a-f]{64}$/, 'Must be lowercase hex format');
      }
    },
  },
  {
    id: 'test-11-canonical-checksum-exists',
    name: '11. canonical checksum exists',
    run: () => {
      const res = prepareSvgAssetDraft(SAFE_SVG_A);
      assert.strictEqual(res.success, true);
      if (res.success) {
        assert.strictEqual(typeof res.canonicalChecksumSha256, 'string');
        assert.strictEqual(res.canonicalChecksumSha256.length, 64, 'SHA-256 hex string must be 64 characters');
        assert.match(res.canonicalChecksumSha256, /^[0-9a-f]{64}$/, 'Must be lowercase hex format');
      }
    },
  },
  {
    id: 'test-12-failure-never-returns-raw-svg',
    name: '12. failure never returns raw SVG',
    run: () => {
      const badInputs = [
        SCRIPT_SVG,
        EVENT_HANDLER_SVG,
        FOREIGN_OBJECT_SVG,
        EXTERNAL_HREF_SVG,
        MALFORMED_XML,
      ];
      for (const bad of badInputs) {
        const res = prepareSvgAssetDraft(bad);
        assert.strictEqual(res.success, false, 'Bad input must fail');
        const record = res as unknown as Record<string, unknown>;
        assert.strictEqual('canonicalSvg' in record, false, 'Failure must not contain canonicalSvg');
        assert.strictEqual('rawSvg' in record, false, 'Failure must not contain rawSvg');
        assert.strictEqual('input' in record, false, 'Failure must not contain input');
        assert.strictEqual('svg' in record, false, 'Failure must not contain svg');
        // Ensure no field contains the bad input string
        for (const val of Object.values(record)) {
          if (typeof val === 'string') {
            assert.strictEqual(val.includes(bad), false, 'Failure fields must not contain raw input');
          }
        }
      }
    },
  },
  {
    id: 'test-13-pipeline-id',
    name: '13. pipelineId == SYN-SEC-SVG-001',
    run: () => {
      const res = prepareSvgAssetDraft(SAFE_SVG_A);
      assert.strictEqual(res.success, true);
      if (res.success) {
        assert.strictEqual(res.pipelineId, 'SYN-SEC-SVG-001');
        assert.strictEqual(res.pipelineId, SVG_SECURITY_PIPELINE_ID);
      }
    },
  },
];

export function runLifecycleSuite(): { total: number; passed: number; failed: number } {
  console.log('=== Running SVG Asset Lifecycle Tests ===');
  let passed = 0;
  let failed = 0;

  for (const t of TESTS) {
    try {
      t.run();
      console.log(`[PASS] ${t.name}`);
      passed++;
    } catch (err) {
      console.error(`[FAIL] ${t.name}:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`--- Result: ${passed} passed, ${failed} failed out of ${TESTS.length} ---`);
  return { total: TESTS.length, passed, failed };
}

// Auto-run if executed directly
if (process.argv[1]?.includes('svgAssetLifecycle')) {
  const result = runLifecycleSuite();
  if (result.failed > 0) {
    process.exit(1);
  }
}
