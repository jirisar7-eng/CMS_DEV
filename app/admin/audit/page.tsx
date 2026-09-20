import React from "react";
import { AuditWorkspace } from "@/components/admin/audit/AuditWorkspace";
import { getActiveProjectId } from "@/lib/domain/pages-client/server-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuditPage() {
  const projectId = await getActiveProjectId();
  return <AuditWorkspace projectId={projectId} />;
}
