import { PublishingWorkspace } from "@/components/admin/publishing/PublishingWorkspace";
import { getActiveProjectId } from "@/lib/domain/pages-client/server-context";

export default async function PublishingPage() {
  const projectId = await getActiveProjectId();
  return <PublishingWorkspace projectId={projectId} />;
}
