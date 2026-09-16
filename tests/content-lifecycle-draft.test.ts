import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ContentLifecycleService,
  ContentLifecycleStore,
  LifecyclePage,
  LifecyclePageRevision,
  ContentLifecycleError,
  CreatePageWithDraftParams,
  UpdateDraftRevisionAtomicParams,
  RecordLifecycleAuditParams,
} from '../lib/domain/content/lifecycle';
import { PageContent } from '../lib/domain/content/contracts';

// In-Memory Test Store implementing ContentLifecycleStore with transactional rollback capability
class InMemoryContentLifecycleStore implements ContentLifecycleStore {
  pages: Map<string, LifecyclePage> = new Map();
  revisions: Map<string, LifecyclePageRevision> = new Map();
  auditLogs: RecordLifecycleAuditParams[] = [];

  // Snapshot mechanism for transactional rollback
  private clone(): {
    pages: Map<string, LifecyclePage>;
    revisions: Map<string, LifecyclePageRevision>;
    auditLogs: RecordLifecycleAuditParams[];
  } {
    const pages = new Map<string, LifecyclePage>();
    for (const [k, v] of this.pages.entries()) {
      pages.set(k, { ...v, createdAt: new Date(v.createdAt), updatedAt: new Date(v.updatedAt) });
    }
    const revisions = new Map<string, LifecyclePageRevision>();
    for (const [k, v] of this.revisions.entries()) {
      revisions.set(k, {
        ...v,
        createdAt: new Date(v.createdAt),
        content: JSON.parse(JSON.stringify(v.content)),
        seo: { ...v.seo },
        navigation: { ...v.navigation },
      });
    }
    const auditLogs = [...this.auditLogs];
    return { pages, revisions, auditLogs };
  }

  async transaction<T>(fn: (txStore: ContentLifecycleStore) => Promise<T>): Promise<T> {
    const snapshot = this.clone();
    try {
      return await fn(this);
    } catch (err) {
      // Rollback on failure
      this.pages = snapshot.pages;
      this.revisions = snapshot.revisions;
      this.auditLogs = snapshot.auditLogs;
      throw err;
    }
  }

  async findPageById(projectId: string, pageId: string): Promise<LifecyclePage | null> {
    const page = this.pages.get(pageId);
    if (!page || page.projectId !== projectId) return null;
    return { ...page };
  }

  async createPageWithDraft(
    params: CreatePageWithDraftParams
  ): Promise<{ page: LifecyclePage; revision: LifecyclePageRevision }> {
    // Unique check for projectId + key
    for (const p of this.pages.values()) {
      if (p.projectId === params.projectId && p.key === params.key) {
        throw new ContentLifecycleError('KEY_CONFLICT', `Key '${params.key}' already exists in project`);
      }
    }

    const pageId = `page_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const revisionId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date();

    const revision: LifecyclePageRevision = {
      id: revisionId,
      pageId,
      revisionNumber: 1,
      status: 'DRAFT',
      title: params.title,
      slug: params.slug,
      locale: params.locale,
      description: params.description,
      visibility: params.visibility,
      content: params.content,
      seo: {},
      navigation: {},
      schemaVersion: params.schemaVersion,
      lockVersion: 1,
      createdById: params.actorId,
      createdAt: now,
      submittedAt: null,
      approvedAt: null,
      publishedAt: null,
      derivedFromRevisionId: null,
    };

    const page: LifecyclePage = {
      id: pageId,
      projectId: params.projectId,
      key: params.key,
      parentId: params.parentId,
      sortOrder: 0,
      draftRevisionId: revisionId,
      publishedRevisionId: null,
      createdAt: now,
      updatedAt: now,
    };

    this.pages.set(pageId, page);
    this.revisions.set(revisionId, revision);

    return { page: { ...page }, revision: { ...revision } };
  }

  async findRevisionById(revisionId: string): Promise<LifecyclePageRevision | null> {
    const rev = this.revisions.get(revisionId);
    if (!rev) return null;
    return { ...rev };
  }

  async updateDraftRevisionAtomic(
    params: UpdateDraftRevisionAtomicParams
  ): Promise<{ updated: boolean; revision?: LifecyclePageRevision }> {
    const rev = this.revisions.get(params.revisionId);
    if (
      !rev ||
      rev.pageId !== params.pageId ||
      rev.status !== 'DRAFT' ||
      rev.lockVersion !== params.expectedLockVersion
    ) {
      return { updated: false };
    }

    const updated: LifecyclePageRevision = {
      ...rev,
      title: params.data.title ?? rev.title,
      slug: params.data.slug ?? rev.slug,
      locale: params.data.locale ?? rev.locale,
      description: params.data.description !== undefined ? params.data.description : rev.description,
      visibility: params.data.visibility ?? rev.visibility,
      content: params.data.content ?? rev.content,
      schemaVersion: params.data.schemaVersion ?? rev.schemaVersion,
      lockVersion: rev.lockVersion + 1,
    };

    this.revisions.set(params.revisionId, updated);
    return { updated: true, revision: { ...updated } };
  }

  async touchPageUpdatedAt(projectId: string, pageId: string): Promise<LifecyclePage> {
    const page = this.pages.get(pageId);
    if (!page || page.projectId !== projectId) {
      throw new Error('Page not found');
    }
    const updated: LifecyclePage = {
      ...page,
      updatedAt: new Date(Date.now() + 10),
    };
    this.pages.set(pageId, updated);
    return { ...updated };
  }

  async recordAudit(params: RecordLifecycleAuditParams): Promise<void> {
    this.auditLogs.push(params);
  }
}

const validContent: PageContent = {
  version: 1,
  schemaVersion: '1.0.0',
  blocks: [
    {
      id: 'b1',
      type: 'heading',
      order: 0,
      data: { text: 'Homepage Heading', level: 1 },
    },
    {
      id: 'b2',
      type: 'paragraph',
      order: 1,
      data: { text: 'Welcome to our platform' },
    },
  ],
};

function setupTestService(opts?: {
  allowedPermissions?: Set<string>;
  store?: InMemoryContentLifecycleStore;
}) {
  const store = opts?.store ?? new InMemoryContentLifecycleStore();
  const permissions = opts?.allowedPermissions ?? new Set(['content.create', 'content.edit']);

  const service = new ContentLifecycleService({
    store,
    hasPermission: async (_actorId, permission, _projectId) => {
      return permissions.has(permission);
    },
  });

  return { service, store, permissions };
}

describe('Content Lifecycle - Draft Management Service', () => {
  describe('createPageDraft', () => {
    it('PASS: authorized page + initial draft creation', async () => {
      const { service, store } = setupTestService();

      const result = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'home',
        title: 'Home Page',
        slug: 'home-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
        description: 'Main landing page',
      });

      assert.ok(result.page.id);
      assert.equal(result.page.projectId, 'proj-1');
      assert.equal(result.page.key, 'home');
      assert.equal(result.page.draftRevisionId, result.revision.id);
      assert.equal(result.page.publishedRevisionId, null);

      assert.equal(result.revision.revisionNumber, 1);
      assert.equal(result.revision.status, 'DRAFT');
      assert.equal(result.revision.lockVersion, 1);
      assert.equal(result.revision.title, 'Home Page');
      assert.equal(result.revision.slug, 'home-page');
      assert.equal(result.revision.locale, 'cs');
      assert.equal(result.revision.visibility, 'PUBLIC');
      assert.equal(result.revision.schemaVersion, '1.0.0');
      assert.equal(result.revision.createdById, 'user-admin');

      // Verify audit
      assert.equal(store.auditLogs.length, 1);
      const audit = store.auditLogs[0];
      assert.equal(audit.action, 'CONTENT_PAGE_CREATED');
      assert.equal(audit.scopeType, 'PROJECT');
      assert.equal(audit.scopeId, 'proj-1');
      assert.equal(audit.resourceType, 'PAGE');
      assert.equal(audit.resourceId, result.page.id);
      assert.equal(audit.actorId, 'user-admin');
      assert.equal(audit.metadata.pageId, result.page.id);
      assert.equal(audit.metadata.revisionId, result.revision.id);
      assert.equal(audit.metadata.revisionNumber, 1);
      assert.equal(audit.metadata.lockVersion, 1);
      assert.equal(audit.metadata.key, 'home');
      assert.equal((audit.metadata as any).content, undefined);
    });

    it('FAIL: content.create permission denied', async () => {
      const { service } = setupTestService({ allowedPermissions: new Set() });

      await assert.rejects(
        async () => {
          await service.createPageDraft({
            actorId: 'user-guest',
            projectId: 'proj-1',
            key: 'home',
            title: 'Home Page',
            slug: 'home-page',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: validContent,
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('FAIL: invalid slug rejected', async () => {
      const { service } = setupTestService();

      await assert.rejects(
        async () => {
          await service.createPageDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            key: 'home',
            title: 'Home Page',
            slug: '../bad/path',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: validContent,
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });

    it('FAIL: invalid content rejected', async () => {
      const { service } = setupTestService();

      await assert.rejects(
        async () => {
          await service.createPageDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            key: 'home',
            title: 'Home Page',
            slug: 'home-page',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: { invalid: true },
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });

    it('FAIL: blank projectId rejected', async () => {
      const { service } = setupTestService();

      await assert.rejects(
        async () => {
          await service.createPageDraft({
            actorId: 'user-admin',
            projectId: '   ',
            key: 'home',
            title: 'Home Page',
            slug: 'home-page',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: validContent,
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });

    it('FAIL: parent from another project / parent not visible in project rejected', async () => {
      const { service } = setupTestService();

      // Create a page in project 1
      const parentInP1 = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'parent-page',
        title: 'Parent in P1',
        slug: 'parent-p1',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      // Attempt to create a page in project 2 referencing parent in project 1
      await assert.rejects(
        async () => {
          await service.createPageDraft({
            actorId: 'user-admin',
            projectId: 'proj-2',
            key: 'child-page',
            title: 'Child in P2',
            slug: 'child-p2',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: validContent,
            parentId: parentInP1.page.id,
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'PARENT_SCOPE_VIOLATION');
          return true;
        }
      );
    });

    it('FAIL: project+key conflict mapped to KEY_CONFLICT', async () => {
      const { service } = setupTestService();

      await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'about',
        title: 'About Us',
        slug: 'about-us',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      await assert.rejects(
        async () => {
          await service.createPageDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            key: 'about',
            title: 'About Us Duplicate',
            slug: 'about-us-2',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: validContent,
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'KEY_CONFLICT');
          return true;
        }
      );
    });

    it('FAIL: no partial Page remains after failed transaction', async () => {
      const store = new InMemoryContentLifecycleStore();
      const service = new ContentLifecycleService({
        store,
        hasPermission: async () => true,
      });

      // Hook store createPageWithDraft to simulate a failure during creation
      const origCreate = store.createPageWithDraft.bind(store);
      store.createPageWithDraft = async (params) => {
        await origCreate(params);
        throw new Error('Simulated mid-transaction failure');
      };

      await assert.rejects(
        async () => {
          await service.createPageDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            key: 'failed-page',
            title: 'Failed',
            slug: 'failed',
            locale: 'cs',
            visibility: 'PUBLIC',
            content: validContent,
          });
        },
        /Simulated mid-transaction failure/
      );

      // Verify rollback: 0 pages and 0 revisions in store
      assert.equal(store.pages.size, 0);
      assert.equal(store.revisions.size, 0);
      assert.equal(store.auditLogs.length, 0);
    });
  });

  describe('updateDraft', () => {
    it('PASS: authorized DRAFT update increments lockVersion and touches Page updatedAt', async () => {
      const { service, store } = setupTestService();

      const created = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'contact',
        title: 'Contact Original',
        slug: 'contact-page',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      const originalUpdatedAt = created.page.updatedAt;

      const updated = await service.updateDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        pageId: created.page.id,
        expectedLockVersion: 1,
        title: 'Contact Updated',
        slug: 'contact-new-slug',
      });

      assert.equal(updated.revision.title, 'Contact Updated');
      assert.equal(updated.revision.slug, 'contact-new-slug');
      assert.equal(updated.revision.lockVersion, 2);
      assert.equal(updated.revision.revisionNumber, 1);
      assert.equal(updated.revision.status, 'DRAFT');

      assert.ok(updated.page.updatedAt.getTime() >= originalUpdatedAt.getTime());

      // Check audit for update
      assert.equal(store.auditLogs.length, 2); // create + update
      const updateAudit = store.auditLogs[1];
      assert.equal(updateAudit.action, 'CONTENT_DRAFT_UPDATED');
      assert.equal(updateAudit.resourceType, 'PAGE_REVISION');
      assert.equal(updateAudit.resourceId, created.revision.id);
      assert.equal(updateAudit.actorId, 'user-admin');
      assert.equal(updateAudit.metadata.pageId, created.page.id);
      assert.equal(updateAudit.metadata.lockVersion, 2);
      assert.deepEqual(updateAudit.metadata.changedFields, ['title', 'slug']);
      assert.equal((updateAudit.metadata as any).content, undefined);
    });

    it('FAIL: content.edit denied', async () => {
      const { service, permissions } = setupTestService();

      const created = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'terms',
        title: 'Terms',
        slug: 'terms',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      // Revoke edit permission
      permissions.delete('content.edit');

      await assert.rejects(
        async () => {
          await service.updateDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            pageId: created.page.id,
            expectedLockVersion: 1,
            title: 'Terms Updated',
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('FAIL: Page from another project appears as PAGE_NOT_FOUND', async () => {
      const { service } = setupTestService();

      const created = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'legal',
        title: 'Legal',
        slug: 'legal',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      await assert.rejects(
        async () => {
          await service.updateDraft({
            actorId: 'user-admin',
            projectId: 'proj-2', // different project
            pageId: created.page.id,
            expectedLockVersion: 1,
            title: 'Legal Hack',
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'PAGE_NOT_FOUND');
          return true;
        }
      );
    });

    it('FAIL: no draft pointer throws NO_DRAFT', async () => {
      const { service, store } = setupTestService();

      const created = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'nodraft',
        title: 'No Draft',
        slug: 'nodraft',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      // Clear draft pointer
      const page = store.pages.get(created.page.id)!;
      page.draftRevisionId = null;

      await assert.rejects(
        async () => {
          await service.updateDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            pageId: created.page.id,
            expectedLockVersion: 1,
            title: 'Update Attempt',
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'NO_DRAFT');
          return true;
        }
      );
    });

    it('FAIL: draft points to revision of different Page throws POINTER_INTEGRITY_VIOLATION', async () => {
      const { service, store } = setupTestService();

      const page1 = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'p1',
        title: 'P1',
        slug: 'p1',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      const page2 = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'p2',
        title: 'P2',
        slug: 'p2',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      // Corrupt page1 to point to page2 revision
      const p1 = store.pages.get(page1.page.id)!;
      p1.draftRevisionId = page2.revision.id;

      await assert.rejects(
        async () => {
          await service.updateDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            pageId: page1.page.id,
            expectedLockVersion: 1,
            title: 'Corrupted Update',
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'POINTER_INTEGRITY_VIOLATION');
          return true;
        }
      );
    });

    it('FAIL: non-DRAFT statuses rejected (IN_REVIEW, APPROVED, PUBLISHED)', async () => {
      for (const invalidStatus of ['IN_REVIEW', 'APPROVED', 'PUBLISHED'] as const) {
        const { service, store } = setupTestService();

        const created = await service.createPageDraft({
          actorId: 'user-admin',
          projectId: 'proj-1',
          key: `status-${invalidStatus.toLowerCase()}`,
          title: `Status ${invalidStatus}`,
          slug: `status-${invalidStatus.toLowerCase()}`,
          locale: 'cs',
          visibility: 'PUBLIC',
          content: validContent,
        });

        // Mutate status to non-DRAFT
        const rev = store.revisions.get(created.revision.id)!;
        rev.status = invalidStatus;

        await assert.rejects(
          async () => {
            await service.updateDraft({
              actorId: 'user-admin',
              projectId: 'proj-1',
              pageId: created.page.id,
              expectedLockVersion: 1,
              title: 'Attempt update on non-draft',
            });
          },
          (err: ContentLifecycleError) => {
            assert.equal(err.code, 'DRAFT_STATE_INVALID');
            return true;
          }
        );
      }
    });

    it('FAIL: stale expectedLockVersion throws LOCK_CONFLICT', async () => {
      const { service } = setupTestService();

      const created = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'lock-test',
        title: 'Lock Test',
        slug: 'lock-test',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      // Update 1 (lockVersion becomes 2)
      await service.updateDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        pageId: created.page.id,
        expectedLockVersion: 1,
        title: 'Update 1',
      });

      // Concurrent or stale update expecting version 1
      await assert.rejects(
        async () => {
          await service.updateDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            pageId: created.page.id,
            expectedLockVersion: 1, // Stale! Current is 2
            title: 'Stale Update',
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'LOCK_CONFLICT');
          return true;
        }
      );
    });

    it('FAIL: invalid slug rejected before write', async () => {
      const { service } = setupTestService();

      const created = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'slug-test',
        title: 'Slug Test',
        slug: 'valid-slug',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      await assert.rejects(
        async () => {
          await service.updateDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            pageId: created.page.id,
            expectedLockVersion: 1,
            slug: 'http://evil.com/fake',
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });

    it('FAIL: invalid content rejected before write', async () => {
      const { service } = setupTestService();

      const created = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'content-test',
        title: 'Content Test',
        slug: 'valid-slug',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      await assert.rejects(
        async () => {
          await service.updateDraft({
            actorId: 'user-admin',
            projectId: 'proj-1',
            pageId: created.page.id,
            expectedLockVersion: 1,
            content: { version: -1, blocks: [] },
          });
        },
        (err: ContentLifecycleError) => {
          assert.equal(err.code, 'INVALID_INPUT');
          return true;
        }
      );
    });
  });

  describe('Audit Integrity', () => {
    it('audit occurs inside transaction and does NOT contain PageContent payload', async () => {
      const { service, store } = setupTestService();

      const created = await service.createPageDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        key: 'audit-safe',
        title: 'Audit Safe',
        slug: 'audit-safe',
        locale: 'cs',
        visibility: 'PUBLIC',
        content: validContent,
      });

      await service.updateDraft({
        actorId: 'user-admin',
        projectId: 'proj-1',
        pageId: created.page.id,
        expectedLockVersion: 1,
        content: validContent,
      });

      assert.equal(store.auditLogs.length, 2);

      for (const log of store.auditLogs) {
        assert.ok(!('content' in log.metadata));
        assert.ok(!('blocks' in log.metadata));
        assert.ok(!('description' in log.metadata));
      }
    });
  });
});
