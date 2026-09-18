import React from 'react';
import { PageContent } from '@/lib/domain/pages';
import { BlockRenderer } from '@/components/admin/composer/BlockRenderer';

interface CanonicalContentRendererProps {
  content: PageContent | null | undefined;
  className?: string;
  isPreview?: boolean;
}

/**
 * Shared Public & Preview Renderer for Synthesis Canonical PageContent.
 * Guarantees absolute parity between Admin Preview and Public Surface.
 */
export const CanonicalContentRenderer: React.FC<CanonicalContentRendererProps> = ({
  content,
  className = '',
  isPreview = false,
}) => {
  if (!content || !Array.isArray(content.blocks) || content.blocks.length === 0) {
    return (
      <div className={`w-full py-12 px-4 text-center text-muted-foreground ${className}`}>
        <p className="text-sm">Tato stránka zatím neobsahuje žádný publikovaný obsah.</p>
      </div>
    );
  }

  // Sort blocks deterministically by order
  const sortedBlocks = [...content.blocks].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className={`space-y-4 w-full ${className}`}>
      {sortedBlocks.map((block) => (
        <BlockRenderer key={block.id} block={block} isPreview={isPreview} />
      ))}
    </div>
  );
};
