"use client";

import React, { useState } from 'react';
import {
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  ChevronDown,
  Menu,
  X,
  Compass,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { NavigationSet, NavigationItem } from '@/lib/domain/navigation/types';
import { PageSummary } from '@/lib/domain/pages';

interface NavigationPreviewProps {
  currentSet: NavigationSet;
  pagesMap: Map<string, PageSummary>;
}

type DeviceMode = 'DESKTOP' | 'TABLET' | 'MOBILE';

export const NavigationPreview: React.FC<NavigationPreviewProps> = ({
  currentSet,
  pagesMap,
}) => {
  const [deviceMode, setDeviceMode] = useState<DeviceMode>('DESKTOP');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Filter visible items
  const visibleItems = currentSet.items.filter((i) => i.visibility);

  // Build tree hierarchy for rendering
  const rootItems = visibleItems.filter((i) => !i.parentId).sort((a, b) => a.order - b.order);
  const getChildren = (parentId: string) =>
    visibleItems.filter((i) => i.parentId === parentId).sort((a, b) => a.order - b.order);

  // Resolve link target href
  const resolveHref = (item: NavigationItem): string => {
    if (item.type === 'PAGE') {
      if (item.pageId) {
        const page = pagesMap.get(item.pageId);
        return page ? page.path : '#broken-page-link';
      }
      return '#';
    }
    if (item.type === 'EXTERNAL_LINK') {
      return item.externalUrl || '#';
    }
    if (item.type === 'ANCHOR') {
      return item.anchor || '#';
    }
    return '#';
  };

  const getContainerWidth = () => {
    switch (deviceMode) {
      case 'MOBILE':
        return 'max-w-[390px]';
      case 'TABLET':
        return 'max-w-[768px]';
      case 'DESKTOP':
      default:
        return 'max-w-full';
    }
  };

  return (
    <div
      id="nav-live-preview-container"
      className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden space-y-3"
    >
      {/* Top Preview Controls Bar */}
      <div className="p-3 sm:px-4 bg-muted/40 border-b border-border flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 font-bold text-foreground">
            <Compass className="w-4 h-4 text-primary" />
            <span>Náhled konceptu (Draft preview)</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {currentSet.context} ({visibleItems.length} aktivních)
          </span>
        </div>

        {/* Viewport size switcher */}
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/50">
          <button
            type="button"
            onClick={() => setDeviceMode('DESKTOP')}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 font-medium transition-colors cursor-pointer ${
              deviceMode === 'DESKTOP'
                ? 'bg-card text-foreground shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Desktopové zobrazení (1440px)"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode('TABLET')}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 font-medium transition-colors cursor-pointer ${
              deviceMode === 'TABLET'
                ? 'bg-card text-foreground shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Tabletové zobrazení (768px)"
          >
            <Tablet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tablet</span>
          </button>
          <button
            type="button"
            onClick={() => setDeviceMode('MOBILE')}
            className={`px-2 py-1 rounded-lg flex items-center gap-1 font-medium transition-colors cursor-pointer ${
              deviceMode === 'MOBILE'
                ? 'bg-card text-foreground shadow-xs font-bold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Mobilní zobrazení (390px)"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Mobil (390px)</span>
          </button>
        </div>
      </div>

      {/* Viewport Stage */}
      <div className="p-4 sm:p-6 bg-muted/10 flex justify-center min-h-[260px]">
        <div
          className={`w-full transition-all duration-300 rounded-2xl border border-border/80 bg-background shadow-md overflow-hidden ${getContainerWidth()}`}
        >
          {/* 1. HEADER CONTEXT OR DESKTOP PREVIEW */}
          {(currentSet.context === 'HEADER' || currentSet.context === 'CUSTOM') && (
            <div className="divide-y divide-border">
              {/* Header navbar mock */}
              <header className="px-4 py-3 flex items-center justify-between gap-4 bg-card">
                {/* Logo mock */}
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-black text-xs">
                    S
                  </div>
                  <span className="font-bold text-foreground text-xs sm:text-sm tracking-tight">Synthesis</span>
                </div>

                {/* Desktop menu links (Hidden on mobile mode) */}
                {deviceMode !== 'MOBILE' ? (
                  <nav className="flex items-center gap-1 text-xs font-medium">
                    {rootItems.map((item) => {
                      const children = getChildren(item.id);
                      const hasSub = children.length > 0;
                      const isOpen = activeDropdown === item.id;

                      if (hasSub) {
                        return (
                          <div
                            key={item.id}
                            className="relative"
                            onMouseEnter={() => setActiveDropdown(item.id)}
                            onMouseLeave={() => setActiveDropdown(null)}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveDropdown(isOpen ? null : item.id)}
                              className="px-2.5 py-1.5 rounded-lg text-foreground hover:bg-muted/80 flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <span>{item.label}</span>
                              <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            </button>

                            {/* Dropdown Menu */}
                            {isOpen && (
                              <div className="absolute left-0 top-full mt-1 w-48 rounded-xl border border-border bg-card shadow-lg p-1.5 z-20 space-y-0.5">
                                {children.map((child) => (
                                  <a
                                    key={child.id}
                                    href={resolveHref(child)}
                                    target={child.openInNewTab ? '_blank' : undefined}
                                    rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                                    onClick={(e) => e.preventDefault()}
                                    className="block px-2.5 py-1.5 rounded-lg text-xs text-foreground hover:bg-muted transition-colors"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span>{child.label}</span>
                                      {child.type === 'EXTERNAL_LINK' && (
                                        <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                      )}
                                    </div>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <a
                          key={item.id}
                          href={resolveHref(item)}
                          target={item.openInNewTab ? '_blank' : undefined}
                          rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                          onClick={(e) => e.preventDefault()}
                          className="px-2.5 py-1.5 rounded-lg text-foreground hover:bg-muted/80 flex items-center gap-1 transition-colors"
                        >
                          <span>{item.label}</span>
                          {item.type === 'EXTERNAL_LINK' && (
                            <ExternalLink className="w-3 h-3 text-muted-foreground" />
                          )}
                        </a>
                      );
                    })}
                  </nav>
                ) : (
                  /* Mobile Drawer Toggle */
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="p-1.5 rounded-lg text-foreground hover:bg-muted transition-colors cursor-pointer"
                    aria-label="Otevřít mobilní menu"
                  >
                    {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                )}

                {/* Right button mock */}
                <div className="hidden sm:flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground font-semibold text-xs inline-flex items-center gap-1">
                    <span>Kontakt</span>
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </header>

              {/* Mobile Drawer Menu rendering */}
              {deviceMode === 'MOBILE' && mobileMenuOpen && (
                <div className="p-4 bg-card border-b border-border space-y-2">
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2">
                    Mobilní nabídka
                  </div>
                  <div className="space-y-1">
                    {rootItems.map((item) => {
                      const children = getChildren(item.id);
                      return (
                        <div key={item.id} className="space-y-1">
                          <a
                            href={resolveHref(item)}
                            onClick={(e) => e.preventDefault()}
                            className="flex items-center justify-between p-2 rounded-xl text-xs font-semibold text-foreground hover:bg-muted"
                          >
                            <span>{item.label}</span>
                            {item.type === 'EXTERNAL_LINK' && (
                              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                            )}
                          </a>
                          {children.map((child) => (
                            <a
                              key={child.id}
                              href={resolveHref(child)}
                              onClick={(e) => e.preventDefault()}
                              className="flex items-center justify-between pl-6 pr-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                            >
                              <span>{child.label}</span>
                            </a>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Simulated page body */}
              <div className="p-6 text-center text-xs text-muted-foreground space-y-2">
                <div className="w-12 h-1.5 rounded-full bg-muted mx-auto" />
                <p>Simulovaný obsah webové stránky...</p>
              </div>
            </div>
          )}

          {/* 2. FOOTER CONTEXT PREVIEW */}
          {currentSet.context === 'FOOTER' && (
            <footer className="p-6 bg-card space-y-6 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                {rootItems.map((group) => {
                  const children = getChildren(group.id);
                  return (
                    <div key={group.id} className="space-y-2">
                      <div className="font-bold text-foreground text-xs">{group.label}</div>
                      <ul className="space-y-1.5">
                        {children.length > 0 ? (
                          children.map((child) => (
                            <li key={child.id}>
                              <a
                                href={resolveHref(child)}
                                target={child.openInNewTab ? '_blank' : undefined}
                                rel={child.openInNewTab ? 'noopener noreferrer' : undefined}
                                onClick={(e) => e.preventDefault()}
                                className="text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                              >
                                <span>{child.label}</span>
                                {child.type === 'EXTERNAL_LINK' && (
                                  <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                )}
                              </a>
                            </li>
                          ))
                        ) : (
                          <li>
                            <a
                              href={resolveHref(group)}
                              onClick={(e) => e.preventDefault()}
                              className="text-muted-foreground hover:text-primary"
                            >
                              {group.label}
                            </a>
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>© {new Date().getFullYear()} Synthesis — Jiří Šár. Všechna práva vyhrazena.</span>
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Validovaná struktura návrhu (Draft)</span>
                </span>
              </div>
            </footer>
          )}

          {/* 3. MOBILE DRAWER CONTEXT PREVIEW */}
          {currentSet.context === 'MOBILE' && (
            <div className="p-4 bg-card space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="font-bold text-foreground">Navigace pro mobilní zařízení</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">Dotykové UI</span>
              </div>
              <div className="space-y-1">
                {rootItems.map((item) => {
                  const children = getChildren(item.id);
                  return (
                    <div key={item.id} className="space-y-1">
                      <div className="p-2.5 rounded-xl bg-muted/30 hover:bg-muted/60 flex items-center justify-between font-semibold text-foreground">
                        <span>{item.label}</span>
                        {item.type === 'EXTERNAL_LINK' && (
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                      {children.map((child) => (
                        <div
                          key={child.id}
                          className="pl-6 pr-2.5 py-2 rounded-lg text-muted-foreground hover:text-foreground flex items-center justify-between text-xs"
                        >
                          <span>└ {child.label}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. PORTAL CONTEXT PREVIEW */}
          {currentSet.context === 'PORTAL' && (
            <div className="p-4 bg-card space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="font-bold text-foreground">Partnerský a Klientský Portál</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                  Přihlášený uživatel
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {rootItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-border hover:border-primary/40 bg-muted/20 transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-foreground">{item.label}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{resolveHref(item)}</div>
                    </div>
                    {item.type === 'EXTERNAL_LINK' && (
                      <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
