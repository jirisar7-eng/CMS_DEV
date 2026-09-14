'use client';

import React, { useState, useRef, useId, useMemo } from 'react';
import type { HelpKey } from '@/lib/help/types';
import { helpRegistry } from '@/lib/help/registry';
import { useHelp } from './HelpProvider';
import { HelpCircle, ChevronRight } from 'lucide-react';

interface HelpTriggerProps {
  helpKey: HelpKey | string;
  size?: 'sm' | 'md' | 'icon-only';
  align?: 'left' | 'right';
  className?: string;
  label?: string;
}

export const HelpTrigger: React.FC<HelpTriggerProps> = ({
  helpKey,
  size = 'md',
  align = 'left',
  className = '',
  label,
}) => {
  const { openHelp } = useHelp();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipId = useId();
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const topic = useMemo(() => helpRegistry.getTopic(helpKey), [helpKey]);

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 150);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openHelp(topic);
  };

  const triggerLabel = label || `Nápověda k ${topic.title}`;

  return (
    <div
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        id={`help-trigger-${helpKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
        onClick={handleClick}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        aria-describedby={showTooltip ? tooltipId : undefined}
        aria-label={triggerLabel}
        className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors cursor-pointer"
      >
        <HelpCircle
          className={size === 'sm' ? 'w-3.5 h-3.5' : size === 'icon-only' ? 'w-4 h-4' : 'w-4 h-4'}
        />
      </button>

      {/* Accessible Desktop Tooltip with Short Summary */}
      {showTooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 bottom-full mb-2 ${
            align === 'right' ? 'right-0' : 'left-0'
          } w-64 p-3 bg-popover text-popover-foreground rounded-xl border border-border shadow-md text-xs space-y-1.5 animate-in fade-in-0 zoom-in-95 pointer-events-none hidden sm:block`}
        >
          <div className="font-semibold text-foreground flex items-center justify-between">
            <span className="truncate">{topic.title}</span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          </div>
          <p className="text-muted-foreground leading-relaxed line-clamp-2">
            {topic.shortSummary}
          </p>
          <div className="text-[10px] text-primary font-medium pt-0.5">
            Klepnutím otevřete podrobnou nápovědu
          </div>
        </div>
      )}
    </div>
  );
};
