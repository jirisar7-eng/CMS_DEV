import { LifecyclePageRevision } from "./lifecycle/types";

export interface BlockDiff {
  id: string;
  type: string;
  status: "ADDED" | "REMOVED" | "MODIFIED" | "UNCHANGED";
  summary: string;
}

export function computeRevisionDiff(
  current: LifecyclePageRevision | any,
  previous: LifecyclePageRevision | any | null
) {
  const titleChanged = previous ? current.title !== previous.title : false;
  const slugChanged = previous ? current.slug !== previous.slug : false;
  const descriptionChanged = previous ? current.description !== previous.description : false;
  const visibilityChanged = previous ? current.visibility !== previous.visibility : false;

  const currentBlocks = current.content?.blocks || [];
  const previousBlocks = previous?.content?.blocks || [];

  const prevBlockMap = new Map<string, { type: string; data?: Record<string, unknown> }>();
  previousBlocks.forEach((b: any, idx: number) => {
    const key = b.id || `block-${idx}`;
    prevBlockMap.set(key, b);
  });

  const blockDiffs: BlockDiff[] = [];
  const visitedPrevKeys = new Set<string>();

  currentBlocks.forEach((currBlock: any, idx: number) => {
    const key = currBlock.id || `block-${idx}`;
    const prevBlock = prevBlockMap.get(key);
    visitedPrevKeys.add(key);

    if (!prevBlock) {
      blockDiffs.push({
        id: key,
        type: currBlock.type,
        status: "ADDED",
        summary: `Přidán nový blok (${currBlock.type})`,
      });
    } else if (
      JSON.stringify(currBlock.data || {}) !== JSON.stringify(prevBlock.data || {}) ||
      currBlock.type !== prevBlock.type
    ) {
      blockDiffs.push({
        id: key,
        type: currBlock.type,
        status: "MODIFIED",
        summary: `Změna obsahu/typu bloku (${prevBlock.type} -> ${currBlock.type})`,
      });
    } else {
      blockDiffs.push({
        id: key,
        type: currBlock.type,
        status: "UNCHANGED",
        summary: "Bez změny",
      });
    }
  });

  previousBlocks.forEach((prevBlock: any, idx: number) => {
    const key = prevBlock.id || `block-${idx}`;
    if (!visitedPrevKeys.has(key)) {
      blockDiffs.push({
        id: key,
        type: prevBlock.type,
        status: "REMOVED",
        summary: `Odebrán blok (${prevBlock.type})`,
      });
    }
  });

  const hasChanges =
    titleChanged ||
    slugChanged ||
    descriptionChanged ||
    visibilityChanged ||
    blockDiffs.some((b) => b.status !== "UNCHANGED");

  return {
    titleChanged,
    slugChanged,
    descriptionChanged,
    visibilityChanged,
    blockDiffs,
    hasChanges,
    previousRevisionNumber: previous?.revisionNumber ?? null,
  };
}
