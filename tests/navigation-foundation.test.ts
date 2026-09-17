import { describe, it, expect } from 'vitest';

describe('SYN-NAV-001 Navigation Foundation', () => {
  it('Should define NavigationSet and NavigationItem in Prisma schema', async () => {
    const fs = require('fs');
    const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
    
    expect(schema).toContain('model NavigationSet');
    expect(schema).toContain('model NavigationItem');
    expect(schema).toContain('projectId');
    expect(schema).toContain('pageId');
    expect(schema).toContain('CASCADE');
  });

  it('API repository should have fetch endpoints', () => {
    const fs = require('fs');
    const repo = fs.readFileSync('lib/domain/navigation/repository.ts', 'utf8');
    expect(repo).toContain('fetchApi');
    expect(repo).toContain('/api/admin/navigation');
  });

  it('API route should enforce RBAC navigation.view', () => {
    const fs = require('fs');
    const apiRoute = fs.readFileSync('app/api/admin/navigation/route.ts', 'utf8');
    expect(apiRoute).toContain("hasPermission(context.userId!, 'navigation.view'");
  });
  
  it('Dynamic API route should enforce page isolation', () => {
    const fs = require('fs');
    const apiRoute = fs.readFileSync('app/api/admin/navigation/[setId]/[[...action]]/route.ts', 'utf8');
    expect(apiRoute).toContain("page.projectId !== context.projectId");
    expect(apiRoute).toContain("Stránka nebyla nalezena nebo nepatří k tomuto projektu");
  });
});
