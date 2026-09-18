import { SEARCH_MAX_BODY_TEXT_LENGTH } from './types';

/**
 * Strict allowlist of searchable textual fields per ContentBlockType.
 * Any property NOT listed here is strictly ignored and will never be indexed.
 * Technical fields (id, order, type), URLs, parameters, secrets, and unknown fields
 * are excluded by design.
 */
const ALLOWED_BLOCK_TEXT_FIELDS: Record<string, readonly string[]> = {
  heading: ['text'],
  paragraph: ['text'],
  rich_text: ['html', 'text'],
  image: ['alt', 'caption'],
  callout: ['title', 'text'],
  quote: ['quote', 'author', 'citation'],
  button: ['label'],
  divider: [],
  columns: [],
  // module_embed: only fallbackText may be exposed; parameters and IDs are strictly forbidden
  module_embed: ['fallbackText'],
};

/**
 * Strips HTML tags and decodes common safe HTML entities to plain text.
 */
export function stripHtmlToPlainText(input: string): string {
  if (typeof input !== 'string') return '';
  // Replace tags with whitespace to preserve word separation
  const noTags = input.replace(/<[^>]*>/g, ' ');
  // Decode common HTML entities safely
  return noTags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Normalizes text by collapsing sequential whitespace characters into a single space and trimming.
 */
export function normalizeSearchText(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(/\s+/g, ' ').trim();
}

interface BlockLike {
  id?: unknown;
  type?: unknown;
  order?: unknown;
  data?: unknown;
  children?: unknown;
}

const MAX_TRAVERSAL_DEPTH = 12;

function collectBlockText(
  block: BlockLike,
  depth: number,
  outputChunks: string[],
  currentLengthRef: { length: number },
  maxOutputLength: number
): void {
  if (depth > MAX_TRAVERSAL_DEPTH) return;
  if (currentLengthRef.length >= maxOutputLength) return;

  if (!block || typeof block !== 'object') return;

  const blockType = typeof block.type === 'string' ? block.type : null;
  if (!blockType) return;

  const allowedFields = ALLOWED_BLOCK_TEXT_FIELDS[blockType];
  if (allowedFields && block.data && typeof block.data === 'object' && !Array.isArray(block.data)) {
    const dataObj = block.data as Record<string, unknown>;

    for (const field of allowedFields) {
      if (currentLengthRef.length >= maxOutputLength) break;

      const val = dataObj[field];
      if (typeof val !== 'string') continue;

      let extracted = val;
      if (blockType === 'rich_text' && field === 'html') {
        extracted = stripHtmlToPlainText(val);
      }

      const normalized = normalizeSearchText(extracted);
      if (normalized.length > 0) {
        const remaining = maxOutputLength - currentLengthRef.length;
        const toAdd = normalized.length > remaining ? normalized.slice(0, remaining) : normalized;
        outputChunks.push(toAdd);
        currentLengthRef.length += toAdd.length + 1; // +1 for space separator
      }
    }
  }

  // Recurse through children if present
  if (Array.isArray(block.children)) {
    for (const child of block.children) {
      if (currentLengthRef.length >= maxOutputLength) break;
      if (child && typeof child === 'object') {
        collectBlockText(
          child as BlockLike,
          depth + 1,
          outputChunks,
          currentLengthRef,
          maxOutputLength
        );
      }
    }
  }
}

/**
 * Safely extracts searchable plain text from canonical PageContent or block collections.
 * - Never stringifies or blindly traverses arbitrary JSON.
 * - Enforces a strict field allowlist per block type.
 * - Only exposes fallbackText for module_embed (never parameters or IDs).
 * - Traverses valid children trees up to depth 12.
 * - Normalizes whitespace and bounds output length.
 */
export function extractCanonicalText(
  content: unknown,
  maxOutputLength: number = SEARCH_MAX_BODY_TEXT_LENGTH
): string {
  if (!content || typeof content !== 'object') {
    return '';
  }

  const chunks: string[] = [];
  const currentLengthRef = { length: 0 };

  let blocksToProcess: unknown[] = [];

  if (Array.isArray(content)) {
    blocksToProcess = content;
  } else if ('blocks' in (content as Record<string, unknown>)) {
    const rawBlocks = (content as Record<string, unknown>).blocks;
    if (Array.isArray(rawBlocks)) {
      blocksToProcess = rawBlocks;
    }
  }

  for (const item of blocksToProcess) {
    if (currentLengthRef.length >= maxOutputLength) break;
    if (item && typeof item === 'object') {
      collectBlockText(
        item as BlockLike,
        0,
        chunks,
        currentLengthRef,
        maxOutputLength
      );
    }
  }

  return normalizeSearchText(chunks.join(' '));
}
