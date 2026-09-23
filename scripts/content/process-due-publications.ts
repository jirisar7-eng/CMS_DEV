import { prisma } from '@/lib/db';
import { getContentLifecycleService } from '@/lib/domain/content/lifecycle';

async function main(): Promise<void> {
  const now = new Date();
  const service = getContentLifecycleService();

  const pages = await prisma.page.findMany({
    where: {
      scheduledPublishAt: { lte: now },
    },
    orderBy: {
      scheduledPublishAt: 'asc',
    },
    take: 100,
    select: {
      id: true,
      projectId: true,
      scheduledRevisionId: true,
      scheduledPublishAt: true,
      scheduledById: true,
    },
  });

  let failures = 0;

  for (const page of pages) {
    if (
      !page.scheduledRevisionId ||
      !page.scheduledPublishAt ||
      !page.scheduledById
    ) {
      failures += 1;
      console.error(JSON.stringify({
        event: 'scheduled_publish_integrity_failure',
        pageId: page.id,
        projectId: page.projectId,
      }));
      continue;
    }

    const revision = await prisma.pageRevision.findUnique({
      where: { id: page.scheduledRevisionId },
      select: {
        id: true,
        lockVersion: true,
      },
    });

    if (!revision) {
      failures += 1;
      console.error(JSON.stringify({
        event: 'scheduled_publish_revision_missing',
        pageId: page.id,
        projectId: page.projectId,
        revisionId: page.scheduledRevisionId,
      }));
      continue;
    }

    try {
      const result = await service.publishScheduled({
        projectId: page.projectId,
        pageId: page.id,
        expectedScheduledRevisionId: page.scheduledRevisionId,
        expectedScheduledPublishAt: page.scheduledPublishAt,
        expectedScheduledById: page.scheduledById,
        expectedLockVersion: revision.lockVersion,
        now,
      });

      console.log(JSON.stringify({
        event: 'scheduled_publish_completed',
        pageId: result.page.id,
        projectId: page.projectId,
        revisionId: result.revision.id,
        releaseId: result.release.id,
      }));
    } catch (error) {
      failures += 1;
      console.error(JSON.stringify({
        event: 'scheduled_publish_failed',
        pageId: page.id,
        projectId: page.projectId,
        revisionId: page.scheduledRevisionId,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      }));
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('process-due-publications failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
