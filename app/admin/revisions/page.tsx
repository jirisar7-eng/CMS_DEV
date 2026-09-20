import { RevisionsWorkspace } from "@/components/admin/revisions/RevisionsWorkspace";
import { getActiveProjectId } from "@/lib/domain/pages-client/server-context";

export default async function RevisionsPage() {
  const projectId = await getActiveProjectId();
  return <RevisionsWorkspace projectId={projectId} />;
}
