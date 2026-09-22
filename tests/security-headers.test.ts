import { test } from 'node:test';
import assert from 'node:assert/strict';
import nextConfig from '../next.config';
import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server';

async function policy(environment: string) {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: environment });
  try {
    const rules = await nextConfig.headers!();
    assert.equal(rules.length, 1);
    assert.equal(rules[0].source, '/:path*');
    const headers = Object.fromEntries(rules[0].headers.map(({ key, value }) => [key, value]));
    const directives = Object.fromEntries(headers['Content-Security-Policy'].split('; ').map(part => {
      const [name, ...sources] = part.split(' ');
      return [name, sources];
    }));
    return { headers, directives, rules };
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else Object.assign(process.env, { NODE_ENV: previous });
  }
}

test('production enforces global security headers with bounded HSTS scope', async () => {
  const { headers, directives } = await policy('production');
  assert.equal(headers['Strict-Transport-Security'], 'max-age=31536000');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
  assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
  assert.deepEqual(directives['frame-ancestors'], ["'self'"]);
  assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
  assert.ok(!headers['Content-Security-Policy'].includes('unsafe-eval'));
  assert.ok(!headers['Content-Security-Policy'].includes('*'));
  for (const sources of Object.values(directives)) {
    assert.ok(!sources.some(source => ['https:', 'http:', 'ws:', 'wss:'].includes(source)));
  }
});

test('CSP preserves hydration, editor frames, media previews, fonts and same-origin APIs', async () => {
  const { directives } = await policy('production');
  assert.deepEqual(directives['script-src'], ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives['style-src'], ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives['frame-src'], ["'self'"]);
  assert.deepEqual(directives['connect-src'], ["'self'"]);
  assert.deepEqual(directives['font-src'], ["'self'", 'data:']);
  assert.deepEqual(directives['media-src'], ["'self'", 'blob:']);
  assert.deepEqual(directives['img-src'], ["'self'", 'data:', 'blob:', 'https://picsum.photos', 'https://fastly.picsum.photos']);
});

test('CSP blocks plugins, inline event handlers, foreign bases and form submissions', async () => {
  const { directives } = await policy('production');
  assert.deepEqual(directives['default-src'], ["'self'"]);
  assert.deepEqual(directives['object-src'], ["'none'"]);
  assert.deepEqual(directives['script-src-attr'], ["'none'"]);
  assert.deepEqual(directives['base-uri'], ["'self'"]);
  assert.deepEqual(directives['form-action'], ["'self'"]);
});

test('eval and local HMR connections are development-only; HSTS is production-only', async () => {
  const dev = await policy('development');
  assert.ok(dev.directives['script-src'].includes("'unsafe-eval'"));
  assert.deepEqual(dev.directives['connect-src'], ["'self'", 'ws://localhost:*', 'ws://127.0.0.1:*']);
  assert.equal(dev.headers['Strict-Transport-Security'], undefined);
  for (const environment of ['production', 'test', '']) {
    const { directives, headers } = await policy(environment);
    assert.ok(!directives['script-src'].includes("'unsafe-eval'"));
    assert.deepEqual(directives['connect-src'], ["'self'"]);
    if (environment !== 'production') assert.equal(headers['Strict-Transport-Security'], undefined);
  }
});


test('Next applies the policy to public, admin, editor, API, media and static routes', async () => {
  const { rules, headers } = await policy('production');
  for (const path of ['/', '/admin', '/admin/login', '/admin/pages/example/edit',
    '/api/health', '/api/media/example', '/_next/static/chunks/app.js',
    '/_next/image?url=%2Flogo.png&w=64&q=75', '/favicon.ico', '/missing-page']) {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://cms.example${path}`,
      nextConfig: { headers: async () => rules },
    });
    for (const [name, value] of Object.entries(headers)) {
      assert.equal(response.headers.get(name), value, `${path}: ${name}`);
    }
  }
});
