import { PageContent } from './contracts';

export const MAX_BLOCKS = 1000;
export const MAX_DEPTH = 12;

const APPROVED_BLOCK_TYPES = new Set([
  'heading',
  'paragraph',
  'rich_text',
  'image',
  'columns',
  'callout',
  'quote',
  'button',
  'divider',
  'module_embed'
]);

export function validateSlugSegment(slug: string): boolean {
  if (typeof slug !== 'string') return false;
  
  if (slug.trim() !== slug) return false;
  if (slug.length === 0 || slug.length > 255) return false;
  
  if (slug === '.' || slug === '..') return false;
  
  if (slug.includes('/') || slug.includes('\\')) return false;
  
  // Reject control characters
  if (/[\x00-\x1F\x7F]/.test(slug)) return false;

  // Reject full URLs
  if (slug.startsWith('http://') || slug.startsWith('https://') || slug.startsWith('//')) {
    return false;
  }
  
  return true;
}

export function validatePageContent(content: unknown): PageContent {
  if (!content || typeof content !== 'object') {
    throw new Error('Content must be an object');
  }

  // prototype pollution check
  checkPrototypePollution(content);

  const pc = content as Record<string, unknown>;

  if (typeof pc.version !== 'number' || pc.version <= 0 || !Number.isInteger(pc.version)) {
    throw new Error('Invalid version');
  }

  if (typeof pc.schemaVersion !== 'string' || pc.schemaVersion.length === 0 || pc.schemaVersion.length > 100) {
    throw new Error('Invalid schemaVersion');
  }

  if (!Array.isArray(pc.blocks)) {
    throw new Error('Blocks must be an array');
  }

  const state = {
    blockCount: 0,
    seenIds: new Set<string>(),
  };

  validateBlocks(pc.blocks, 0, state);

  return pc as unknown as PageContent;
}

function checkPrototypePollution(obj: unknown) {
  if (!obj || typeof obj !== 'object') return;

  if (obj instanceof Date || obj instanceof Map || obj instanceof Set || obj instanceof RegExp) {
    throw new Error('Invalid object type');
  }

  // Also reject custom classes/prototypes (must be plain objects or arrays)
  const proto = Object.getPrototypeOf(obj);
  if (proto !== null && proto !== Object.prototype && proto !== Array.prototype) {
    throw new Error('Invalid object prototype');
  }

  if (Array.isArray(obj)) {
    for (const item of obj) {
      checkPrototypePollution(item);
    }
    return;
  }

  for (const key of Object.keys(obj as object)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      throw new Error('Prototype pollution detected');
    }
    const val = (obj as Record<string, unknown>)[key];
    
    if (typeof val === 'function' || typeof val === 'symbol' || typeof val === 'bigint' || typeof val === 'undefined') {
      throw new Error(`Invalid value type: ${typeof val}`);
    }
    
    if (typeof val === 'number' && !Number.isFinite(val)) {
      throw new Error('Non-finite number');
    }

    checkPrototypePollution(val);
  }
}

function validateBlocks(blocks: unknown[], depth: number, state: { blockCount: number, seenIds: Set<string> }) {
  if (depth > MAX_DEPTH) {
    throw new Error(`Max depth ${MAX_DEPTH} exceeded`);
  }

  for (const b of blocks) {
    state.blockCount++;
    if (state.blockCount > MAX_BLOCKS) {
      throw new Error(`Max blocks ${MAX_BLOCKS} exceeded`);
    }

    if (!b || typeof b !== 'object') {
      throw new Error('Block must be an object');
    }

    const block = b as Record<string, unknown>;

    if (typeof block.id !== 'string' || block.id.length === 0 || block.id.length > 255) {
      throw new Error('Invalid block id');
    }

    if (state.seenIds.has(block.id)) {
      throw new Error(`Duplicate block id: ${block.id}`);
    }
    state.seenIds.add(block.id);

    if (typeof block.type !== 'string' || !APPROVED_BLOCK_TYPES.has(block.type)) {
      throw new Error(`Unknown block type: ${block.type}`);
    }

    if (typeof block.order !== 'number' || block.order < 0 || !Number.isInteger(block.order)) {
      throw new Error('Invalid block order');
    }

    if (!block.data || typeof block.data !== 'object' || Array.isArray(block.data)) {
      throw new Error('Block data must be a plain object');
    }

    if (block.type === 'module_embed') {
      validateModuleEmbed(block.data as Record<string, unknown>);
    }

    if (block.children !== undefined) {
      if (!Array.isArray(block.children)) {
        throw new Error('Block children must be an array');
      }
      validateBlocks(block.children, depth + 1, state);
    }
  }
}

function validateModuleEmbed(data: Record<string, unknown>) {
  if (typeof data.moduleId !== 'string' || data.moduleId.length === 0 || data.moduleId.length > 255) {
    throw new Error('Invalid moduleId');
  }

  if (typeof data.schemaVersion !== 'string' || data.schemaVersion.length === 0 || data.schemaVersion.length > 100) {
    throw new Error('Invalid schemaVersion');
  }

  if (!data.parameters || typeof data.parameters !== 'object' || Array.isArray(data.parameters)) {
    throw new Error('parameters must be a plain object');
  }

  for (const [k, v] of Object.entries(data.parameters)) {
    if (v !== null && typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') {
      throw new Error(`Invalid parameter value for ${k}`);
    }
    if (typeof v === 'number' && !Number.isFinite(v)) {
      throw new Error(`Non-finite number in parameter ${k}`);
    }
  }

  if (data.fallbackText !== undefined) {
    if (typeof data.fallbackText !== 'string' || data.fallbackText.length > 1000) {
      throw new Error('Invalid fallbackText');
    }
  }
}
