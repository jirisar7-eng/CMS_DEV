// @ts-nocheck
import React from 'react';
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert';
import Module from 'node:module';

class NextRedirectError extends Error {
  url: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT: ${url}`);
    this.url = url;
  }
}

const redirectMock = mock.fn((url: string) => {
  throw new NextRedirectError(url);
});

const requireAuthenticatedUserMock = mock.fn();
const getSessionMock = mock.fn();
const hasPermissionMock = mock.fn();
const isDatabaseConfiguredMock = mock.fn(() => true);

const AdminShellMock = ({ user, children }: any) =>
  React.createElement('div', { 'data-testid': 'admin-shell', 'data-user': user?.id }, children);

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
  if (id === 'next/navigation') {
    return { redirect: redirectMock };
  }
  if (id === '@/lib/auth/session') {
    return {
      requireAuthenticatedUser: requireAuthenticatedUserMock,
      getSession: getSessionMock,
    };
  }
  if (id === '@/lib/auth/rbac') {
    return {
      hasPermission: hasPermissionMock,
    };
  }
  if (id === '@/lib/runtime/database') {
    return {
      isDatabaseConfigured: isDatabaseConfiguredMock,
    };
  }
  if (id === '@/components/admin/AdminShell') {
    return {
      AdminShell: AdminShellMock,
    };
  }
  if (id === '@/components/brand/SynthesisLogo') {
    return {
      SynthesisLogo: () => React.createElement('div', { 'data-testid': 'synthesis-logo' }),
    };
  }
  if (id === '@/components/admin/auth/LoginForm') {
    return {
      LoginForm: () => React.createElement('div', { 'data-testid': 'login-form' }),
    };
  }
  return originalRequire.apply(this, arguments as any);
};

const AdminLayout = require('../app/admin/layout').default;
const LoginPage = require('../app/(auth)/admin/login/page').default;

afterEach(() => {
  redirectMock.mock.resetCalls();
  requireAuthenticatedUserMock.mock.resetCalls();
  getSessionMock.mock.resetCalls();
  hasPermissionMock.mock.resetCalls();
  isDatabaseConfiguredMock.mock.resetCalls();
});

test('AdminLayout - Unauthenticated user fails closed and redirects to /admin/login', async () => {
  requireAuthenticatedUserMock.mock.mockImplementationOnce(() =>
    Promise.reject(new Error('UNAUTHENTICATED'))
  );

  await assert.rejects(
    async () => {
      await AdminLayout({ children: 'content' });
    },
    (err: any) => {
      assert.ok(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/admin/login');
      return true;
    }
  );

  assert.strictEqual(redirectMock.mock.calls.length, 1);
  assert.strictEqual(hasPermissionMock.mock.calls.length, 0);
});

test('AdminLayout - Authenticated user without admin.access fails closed and redirects to /admin/login', async () => {
  const mockUser = { id: 'user-1', email: 'user@example.com', status: 'ACTIVE' };
  requireAuthenticatedUserMock.mock.mockImplementationOnce(() =>
    Promise.resolve(mockUser)
  );
  hasPermissionMock.mock.mockImplementationOnce(() => Promise.resolve(false));

  await assert.rejects(
    async () => {
      await AdminLayout({ children: 'content' });
    },
    (err: any) => {
      assert.ok(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/admin/login');
      return true;
    }
  );

  assert.strictEqual(hasPermissionMock.mock.calls.length, 1);
  assert.strictEqual(hasPermissionMock.mock.calls[0].arguments[0], 'user-1');
  assert.strictEqual(hasPermissionMock.mock.calls[0].arguments[1], 'admin.access');
  assert.strictEqual(redirectMock.mock.calls.length, 1);
});

test('AdminLayout - Disabled user fails authentication/authorization and redirects to /admin/login', async () => {
  requireAuthenticatedUserMock.mock.mockImplementationOnce(() =>
    Promise.reject(new Error('USER_DISABLED'))
  );

  await assert.rejects(
    async () => {
      await AdminLayout({ children: 'content' });
    },
    (err: any) => {
      assert.ok(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/admin/login');
      return true;
    }
  );

  assert.strictEqual(redirectMock.mock.calls.length, 1);
  assert.strictEqual(hasPermissionMock.mock.calls.length, 0);
});

test('AdminLayout - User with explicit DENY on admin.access cannot bypass and redirects to /admin/login', async () => {
  const mockUser = { id: 'user-denied', email: 'denied@example.com', status: 'ACTIVE' };
  requireAuthenticatedUserMock.mock.mockImplementationOnce(() =>
    Promise.resolve(mockUser)
  );
  hasPermissionMock.mock.mockImplementationOnce(() => Promise.resolve(false));

  await assert.rejects(
    async () => {
      await AdminLayout({ children: 'content' });
    },
    (err: any) => {
      assert.ok(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/admin/login');
      return true;
    }
  );

  assert.strictEqual(hasPermissionMock.mock.calls.length, 1);
  assert.strictEqual(hasPermissionMock.mock.calls[0].arguments[0], 'user-denied');
  assert.strictEqual(hasPermissionMock.mock.calls[0].arguments[1], 'admin.access');
  assert.strictEqual(redirectMock.mock.calls.length, 1);
});

test('AdminLayout - Error in permission evaluation fails closed and redirects to /admin/login', async () => {
  const mockUser = { id: 'user-err', email: 'err@example.com', status: 'ACTIVE' };
  requireAuthenticatedUserMock.mock.mockImplementationOnce(() =>
    Promise.resolve(mockUser)
  );
  hasPermissionMock.mock.mockImplementationOnce(() =>
    Promise.reject(new Error('Database connection failure'))
  );

  await assert.rejects(
    async () => {
      await AdminLayout({ children: 'content' });
    },
    (err: any) => {
      assert.ok(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/admin/login');
      return true;
    }
  );

  assert.strictEqual(redirectMock.mock.calls.length, 1);
});

test('AdminLayout - Authenticated user with admin.access renders AdminShell', async () => {
  const mockUser = { id: 'admin-1', email: 'admin@example.com', status: 'ACTIVE' };
  requireAuthenticatedUserMock.mock.mockImplementationOnce(() =>
    Promise.resolve(mockUser)
  );
  hasPermissionMock.mock.mockImplementationOnce(() => Promise.resolve(true));

  const result = await AdminLayout({ children: 'protected-content' });

  assert.strictEqual(redirectMock.mock.calls.length, 0);
  assert.strictEqual(hasPermissionMock.mock.calls.length, 1);
  assert.strictEqual(result.type, AdminShellMock);
  assert.strictEqual(result.props.user, mockUser);
  assert.strictEqual(result.props.children, 'protected-content');
});

test('LoginPage - Authenticated user with admin.access redirects to /admin', async () => {
  const mockUser = { id: 'admin-1', email: 'admin@example.com', status: 'ACTIVE' };
  getSessionMock.mock.mockImplementationOnce(() =>
    Promise.resolve({ user: mockUser })
  );
  hasPermissionMock.mock.mockImplementationOnce(() => Promise.resolve(true));

  await assert.rejects(
    async () => {
      await LoginPage();
    },
    (err: any) => {
      assert.ok(err instanceof NextRedirectError);
      assert.strictEqual(err.url, '/admin');
      return true;
    }
  );

  assert.strictEqual(hasPermissionMock.mock.calls.length, 1);
  assert.strictEqual(hasPermissionMock.mock.calls[0].arguments[0], 'admin-1');
  assert.strictEqual(hasPermissionMock.mock.calls[0].arguments[1], 'admin.access');
  assert.strictEqual(redirectMock.mock.calls.length, 1);
});

test('LoginPage - Authenticated user WITHOUT admin.access stays on login page (no loop)', async () => {
  const mockUser = { id: 'non-admin', email: 'reader@example.com', status: 'ACTIVE' };
  getSessionMock.mock.mockImplementationOnce(() =>
    Promise.resolve({ user: mockUser })
  );
  hasPermissionMock.mock.mockImplementationOnce(() => Promise.resolve(false));

  const result = await LoginPage();

  assert.strictEqual(redirectMock.mock.calls.length, 0);
  assert.strictEqual(hasPermissionMock.mock.calls.length, 1);
  assert.ok(result);
});

test('LoginPage - Unauthenticated user renders login page', async () => {
  getSessionMock.mock.mockImplementationOnce(() =>
    Promise.resolve({ user: null })
  );

  const result = await LoginPage();

  assert.strictEqual(redirectMock.mock.calls.length, 0);
  assert.strictEqual(hasPermissionMock.mock.calls.length, 0);
  assert.ok(result);
});
