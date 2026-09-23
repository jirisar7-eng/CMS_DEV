import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getAllowedPublishingActions,
  getLatestActionableRevisions,
  publishingActionEndpoint,
  type PublishingRevision,
} from "../components/admin/publishing/PublishingWorkspace";

function revision(
  overrides: Partial<PublishingRevision> &
    Pick<PublishingRevision, "id" | "pageId" | "revisionNumber" | "status">
): PublishingRevision {
  return {
    title: "Page",
    slug: "page",
    lockVersion: 1,
    ...overrides,
  };
}

test("selects only the deterministic latest actionable revision per page", () => {
  const result = getLatestActionableRevisions([
    revision({
      id: "rev-1",
      pageId: "page-1",
      revisionNumber: 1,
      status: "DRAFT",
      title: "Alpha",
    }),
    revision({
      id: "rev-2",
      pageId: "page-1",
      revisionNumber: 2,
      status: "IN_REVIEW",
      title: "Alpha",
      lockVersion: 2,
    }),
    revision({
      id: "rev-3",
      pageId: "page-2",
      revisionNumber: 3,
      status: "APPROVED",
      title: "Beta",
    }),
    revision({
      id: "rev-4",
      pageId: "page-3",
      revisionNumber: 4,
      status: "PUBLISHED",
      title: "Gamma",
    }),
  ]);

  assert.deepEqual(
    result.map((item) => [item.pageId, item.id, item.status]),
    [
      ["page-1", "rev-2", "IN_REVIEW"],
      ["page-2", "rev-3", "APPROVED"],
    ]
  );
});

test("maps canonical actions strictly from lifecycle status and scheduled context", () => {
  assert.deepEqual(getAllowedPublishingActions("DRAFT"), ["submit-review"]);
  assert.deepEqual(getAllowedPublishingActions("IN_REVIEW"), [
    "approve",
    "request-changes",
  ]);
  assert.deepEqual(getAllowedPublishingActions("APPROVED"), [
    "publish",
    "schedule-publish",
  ]);
  assert.deepEqual(
    getAllowedPublishingActions("APPROVED", {
      scheduledPublishAt: "2030-01-01T00:00:00.000Z",
    }),
    ["publish", "cancel-schedule"]
  );
  assert.deepEqual(getAllowedPublishingActions("PUBLISHED"), []);
});

test("builds project-scoped canonical lifecycle endpoints", () => {
  assert.equal(
    publishingActionEndpoint("project-1", "page-1", "submit-review"),
    "/api/admin/projects/project-1/pages/page-1/actions/submit-review"
  );
  assert.equal(
    publishingActionEndpoint("project-1", "page-1", "approve"),
    "/api/admin/projects/project-1/pages/page-1/actions/approve"
  );
  assert.equal(
    publishingActionEndpoint("project-1", "page-1", "request-changes"),
    "/api/admin/projects/project-1/pages/page-1/actions/request-changes"
  );
  assert.equal(
    publishingActionEndpoint("project-1", "page-1", "publish"),
    "/api/admin/projects/project-1/pages/page-1/actions/publish"
  );
  assert.equal(
    publishingActionEndpoint("project-1", "page-1", "schedule-publish"),
    "/api/admin/projects/project-1/pages/page-1/actions/schedule-publish"
  );
  assert.equal(
    publishingActionEndpoint("project-1", "page-1", "cancel-schedule"),
    "/api/admin/projects/project-1/pages/page-1/actions/cancel-schedule"
  );
  assert.equal(
    publishingActionEndpoint("project-1", "page-1", "unpublish"),
    "/api/admin/projects/project-1/pages/page-1/actions/unpublish"
  );
});

test("workspace uses origin guard and reloads authoritative state after mutations", () => {
  const source = fs.readFileSync(
    "components/admin/publishing/PublishingWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /"X-CMS-Origin-Check": "1"/);
  assert.match(source, /expectedLockVersion: revision\.lockVersion/);
  assert.match(source, /handleRefresh\(\);/);

  // Lifecycle state is never advanced through an optimistic client-side reducer.
  assert.equal(source.includes("setRevisions((prev"), false);
  assert.equal(source.includes("setRevisions((current"), false);
});

test("workspace contains authoritative schedule and unpublish mutation wiring", () => {
  const source = fs.readFileSync(
    "components/admin/publishing/PublishingWorkspace.tsx",
    "utf8"
  );

  assert.match(source, /schedule-publish/);
  assert.match(source, /cancel-schedule/);
  assert.match(source, /unpublish/);
  assert.match(source, /expectedScheduledRevisionId/);
  assert.match(source, /expectedScheduledPublishAt/);
  assert.match(source, /expectedPublishedRevisionId/);
});
