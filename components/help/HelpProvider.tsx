'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { HelpTopic, HelpContextState } from '@/lib/help/types';
import { helpRegistry } from '@/lib/help/registry';

const HelpContext = createContext<HelpContextState | null>(null);

export const HelpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTopic, setCurrentTopic] = useState<HelpTopic | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openHelp = useCallback((keyOrTopic: string | HelpTopic) => {
    if (typeof keyOrTopic === 'string') {
      const topic = helpRegistry.getTopic(keyOrTopic);
      setCurrentTopic(topic);
    } else {
      setCurrentTopic(keyOrTopic);
    }
    setIsOpen(true);
  }, []);

  const closeHelp = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <HelpContext.Provider
      value={{
        currentTopic,
        isOpen,
        openHelp,
        closeHelp,
      }}
    >
      {children}
    </HelpContext.Provider>
  );
};

export function useHelp(): HelpContextState {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    throw new Error('useHelp must be used within a HelpProvider');
  }
  return ctx;
}
