'use client';

import React, { useState } from 'react';
import { AlertTriangle, Code2 } from 'lucide-react';
import { SvgEditor } from '@/components/admin/svg-editor';

const INITIAL_SAFE_DEMO_SVG = `<svg viewBox="0 0 800 500" width="800" height="500" xmlns="http://www.w3.org/2000/svg">
  <g id="demo-synthesis-symbol">
    <path id="symbol-wireframe" d="M 220 250 L 300 170 L 380 250 L 300 330 Z" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linejoin="round" />
    <circle id="node-top" cx="300" cy="170" r="32" fill="#6366f1" fill-opacity="0.9" />
    <circle id="node-left" cx="220" cy="250" r="32" fill="#3b82f6" fill-opacity="0.9" />
    <circle id="node-right" cx="380" cy="250" r="32" fill="#0ea5e9" fill-opacity="0.9" />
    <circle id="node-bottom" cx="300" cy="330" r="32" fill="#10b981" fill-opacity="0.9" />
    <circle id="node-core" cx="300" cy="250" r="16" fill="#ffffff" stroke="#0f172a" stroke-width="3" />
  </g>
  <g id="demo-typography">
    <rect id="badge-pill" x="440" y="195" width="130" height="26" rx="6" fill="#ede9fe" />
    <text id="badge-label" x="452" y="213" font-family="sans-serif" font-size="11" font-weight="bold" fill="#5b21b6">CORE PLATFORM</text>
    <text id="brand-heading" x="440" y="265" font-family="sans-serif" font-size="32" font-weight="bold" fill="#0f172a">Synthesis CMS</text>
    <text id="brand-tagline" x="440" y="298" font-family="sans-serif" font-size="14" fill="#64748b">Vektorovy editor a renderer</text>
  </g>
  <circle id="accent-node-1" cx="80" cy="80" r="10" fill="#cbd5e1" />
  <circle id="accent-node-2" cx="720" cy="420" r="14" fill="#cbd5e1" />
  <rect id="accent-rect-1" x="680" y="80" width="24" height="24" rx="4" fill="#e2e8f0" />
</svg>`;

export default function SvgEditorPage() {
  const [serializedSvg, setSerializedSvg] = useState<string>('');

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">SVG Editor</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 border border-amber-500/20">
              DEV PREVIEW
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Vývojový náhled univerzálního SVG editoru
          </p>
        </div>
      </div>

      {/* Short Warning */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
        <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
        <p className="font-medium">
          Ukládání, import a publikování zatím nejsou aktivní.
        </p>
      </div>

      {/* Editor Workspace */}
      <div className="w-full min-h-[65vh] h-[65vh] md:h-[70vh] rounded-2xl border border-border overflow-hidden bg-card shadow-xs flex flex-col">
        <SvgEditor
          initialSvgString={INITIAL_SAFE_DEMO_SVG}
          onChange={setSerializedSvg}
        />
      </div>

      {/* Optional Dev Output (escaped plain text only) */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <Code2 className="w-4 h-4" />
            <span>Aktuální serializovaný SVG stav (pouze pro čtení)</span>
          </div>
          {serializedSvg && (
            <span className="text-[11px] font-mono text-muted-foreground">
              {serializedSvg.length} znaků
            </span>
          )}
        </div>
        <pre className="p-4 rounded-xl bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto max-h-52 select-all">
          {serializedSvg || INITIAL_SAFE_DEMO_SVG}
        </pre>
      </div>
    </div>
  );
}
