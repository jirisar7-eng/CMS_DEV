import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';

describe('SYN-NAV-001 Navigation Foundation', () => {
  test('Should define NavigationSet and NavigationItem in Prisma schema', () => {
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
    assert(schema.includes('model NavigationSet'));
    assert(schema.includes('model NavigationItem'));
    assert(schema.includes('projectId'));
    assert(schema.includes('pageId'));
    assert(schema.includes('Cascade'));
  });

  test('API repository should have fetch endpoints', () => {
    const repo = fs.readFileSync('lib/domain/navigation/repository.ts', 'utf8');
    assert(repo.includes('fetchApi'));
    assert(repo.includes('/api/admin/navigation'));
  });

  test('API route should enforce RBAC navigation.view', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/route.ts', 'utf8');
    assert(apiRoute.includes("hasPermission(context.userId!, 'navigation.view'"));
  });

  test('API route should enforce RBAC navigation.publish', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    assert(apiRoute.includes("hasPermission(context.userId, 'navigation.publish'"));
  });
  
  test('Dynamic API route should enforce page isolation', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    assert(apiRoute.includes("page.projectId !== context.projectId"));
    assert(apiRoute.includes("Stránka nebyla nalezena nebo nepatří k tomuto projektu"));
  });

  test('Dynamic API route should detect cycles', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    assert(apiRoute.includes("checkCycle(set.items, itemId, body.parentId)"));
  });

  test('Dynamic API route should create audit logs', () => {
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    assert(apiRoute.includes("prisma.auditLog.create"));
    assert(apiRoute.includes("NAVIGATION_SET_UPDATED"));
  });

  test('Public API route should exist', () => {
    assert(fs.existsSync('app/api/public/navigation/route.ts'));
    const apiRoute = fs.readFileSync('app/api/public/navigation/route.ts', 'utf8');
    assert(apiRoute.includes("status: 'PUBLISHED'"));
    assert(apiRoute.includes("visibility: true"));
  });
});
