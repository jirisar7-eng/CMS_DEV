import React from 'react';
import { PageComposerWorkspace } from '@/components/admin/composer/PageComposerWorkspace';
import { getActiveProjectContext } from '@/lib/domain/pages-client/server-context';
import { resolveProjectEntitlementsServer } from '@/lib/composer/entitlements.server';
import { AlertCircle } from 'lucide-react';

export const metadata = {
  title: 'Editor obsahu (Composer) | Synthesis CMS',
  description: 'Kanonický blokový editor obsahu pro stránky Synthesis.',
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ projectId?: string }>;
}

export default async function PageComposerRoute({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const projectContext = await getActiveProjectContext(resolvedSearchParams.projectId);

  if (projectContext.status !== 'PROJECT_VALID' || !projectContext.projectId) {
    return (
      <div data-testid="fail-closed-server-project-context" className="p-4 sm:p-8 max-w-md mx-auto mt-8 sm:mt-12 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-center flex flex-col items-center gap-3 w-full max-w-full min-w-0">
        <AlertCircle className="w-8 h-8 shrink-0" />
        <h2 className="text-lg font-bold break-words">Aktivní projekt nebylo možné ověřit</h2>
        <p className="text-sm text-muted-foreground break-words">
          {projectContext.status === 'PROJECT_INACTIVE' && 'Vybraný projekt je neaktivní.'}
          {projectContext.status === 'PROJECT_FORBIDDEN' && 'Nemáte oprávnění k přístupu k tomuto projektu.'}
          {projectContext.status === 'PROJECT_NOT_FOUND' && 'Vybraný projekt neexistuje.'}
          {(projectContext.status === 'PROJECT_NOT_SELECTED' || !projectContext.status) && 'Není vybrán žádný aktivní projekt.'}
        </p>
      </div>
    );
  }

  const entitlements = await resolveProjectEntitlementsServer(projectContext.projectId);

  return (
    <PageComposerWorkspace
      pageId={resolvedParams.id}
      projectId={projectContext.projectId}
      initialEntitlements={entitlements}
    />
  );
}
