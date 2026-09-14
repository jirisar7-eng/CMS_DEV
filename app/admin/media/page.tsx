"use client";

import React, { useState } from 'react';
import { CapabilityShell } from '@/components/admin/CapabilityShell';
import { 
  Upload, 
  Image as ImageIcon, 
  FileText, 
  Film, 
  Search, 
  Filter, 
  FolderPlus, 
  Download, 
  Trash2, 
  ExternalLink,
  HardDrive
} from 'lucide-react';

export default function MediaPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'documents' | 'videos'>('all');
  const [selectedItem, setSelectedItem] = useState<number | null>(1);

  const mediaItems = [
    { id: 1, name: 'hero-banner-main.webp', type: 'image', size: '320 KB', dimension: '1920x1080', date: '12. 09. 2026', url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=600&q=80' },
    { id: 2, name: 'synthesis-logo-white.svg', type: 'image', size: '14 KB', dimension: 'Vector SVG', date: '10. 09. 2026', url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80' },
    { id: 3, name: 'vyrocni-zprava-2025.pdf', type: 'document', size: '2.4 MB', dimension: 'PDF Dokument', date: '08. 09. 2026', url: '' },
    { id: 4, name: 'produktovy-katalog-v3.pdf', type: 'document', size: '4.8 MB', dimension: 'PDF Dokument', date: '05. 09. 2026', url: '' },
    { id: 5, name: 'prezentace-firmy-preview.webp', type: 'image', size: '410 KB', dimension: '1280x720', date: '01. 09. 2026', url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=80' },
    { id: 6, name: 'intro-video-promo.mp4', type: 'video', size: '18.2 MB', dimension: '1080p 60fps', date: '28. 08. 2026', url: '' },
  ];

  const filteredItems = mediaItems.filter(item => {
    if (activeTab === 'images') return item.type === 'image';
    if (activeTab === 'documents') return item.type === 'document';
    if (activeTab === 'videos') return item.type === 'video';
    return true;
  });

  const selectedMedia = mediaItems.find(item => item.id === selectedItem);

  return (
    <CapabilityShell
      group="OBSAH"
      title="Knihovna médií"
      description="Centrální úložiště a správa obrázků, dokumentů a multimediálních aktiv pro všechny stránky webu."
      status="UI PŘIPRAVENO"
      helpKey="content.media.view"
      emptyTitle="V knihovně médií zatím nejsou žádné soubory"
      emptyDescription="Přetáhněte sem soubory z počítače nebo klikněte na tlačítko Nahrát soubor."
      emptyActionLabel="Nahrát první soubor"
    >
      {({ handleUnfinishedAction }) => (
        <div className="space-y-6">
          {/* Top Controls & Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Hledat podle názvu souboru nebo tagu..."
                  className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-input bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-xl border border-border">
                {[
                  { key: 'all', label: 'Vše' },
                  { key: 'images', label: 'Obrázky' },
                  { key: 'documents', label: 'Dokumenty' },
                  { key: 'videos', label: 'Videa' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                      activeTab === tab.key
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Vytvořit složku')}
                className="px-3 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-border bg-card hover:bg-muted text-foreground transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Nová složka</span>
              </button>
              <button
                type="button"
                onClick={() => handleUnfinishedAction('Nahrát soubor')}
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px] cursor-pointer inline-flex items-center gap-2 shadow-xs"
              >
                <Upload className="w-4 h-4" />
                <span>Nahrát soubor</span>
              </button>
            </div>
          </div>

          {/* Storage Bar Indicator */}
          <div className="p-4 rounded-xl border border-border bg-card/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <HardDrive className="w-4 h-4 text-primary" />
              <span className="font-semibold text-foreground">Využití objektového úložiště:</span>
              <span className="text-muted-foreground">24.5 MB z 10.0 GB (0.24 %)</span>
            </div>
            <div className="w-full sm:w-48 bg-muted rounded-full h-2 overflow-hidden border border-border/50">
              <div className="bg-primary h-full rounded-full w-[2.4%]"></div>
            </div>
          </div>

          {/* Main Grid + Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item.id)}
                  className={`group relative p-3 rounded-2xl border bg-card transition-all cursor-pointer flex flex-col justify-between ${
                    selectedItem === item.id
                      ? 'border-primary ring-2 ring-primary/20 shadow-sm'
                      : 'border-border hover:border-border/80 hover:shadow-2xs'
                  }`}
                >
                  <div className="aspect-4/3 w-full rounded-xl bg-muted/50 border border-border/50 flex items-center justify-center overflow-hidden mb-2 relative">
                    {item.type === 'image' ? (
                      <div className="w-full h-full bg-cover bg-center flex items-center justify-center bg-slate-900/10 dark:bg-slate-100/10">
                        <ImageIcon className="w-8 h-8 text-muted-foreground/60" />
                      </div>
                    ) : item.type === 'document' ? (
                      <FileText className="w-10 h-10 text-primary/70" />
                    ) : (
                      <Film className="w-10 h-10 text-purple-500/70" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-foreground truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground flex justify-between">
                      <span>{item.size}</span>
                      <span>{item.date}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Item Detail Inspector */}
            {selectedMedia && (
              <div className="p-5 rounded-2xl border border-border bg-card shadow-xs space-y-4 h-fit">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold text-foreground">Detail média</h3>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {selectedMedia.type}
                  </span>
                </div>

                <div className="aspect-video rounded-xl bg-muted border border-border/60 flex items-center justify-center overflow-hidden">
                  {selectedMedia.type === 'image' ? (
                    <ImageIcon className="w-12 h-12 text-muted-foreground/50" />
                  ) : (
                    <FileText className="w-12 h-12 text-primary/60" />
                  )}
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Název souboru:</span>
                    <span className="font-semibold text-foreground break-all">{selectedMedia.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Velikost:</span>
                      <span className="font-semibold text-foreground">{selectedMedia.size}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Rozlišení / Typ:</span>
                      <span className="font-semibold text-foreground">{selectedMedia.dimension}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Alternativní text (ALT):</span>
                    <input
                      type="text"
                      defaultValue="Hlavní vizuální banner prezentace Synthesis"
                      className="w-full mt-1 px-2.5 py-1.5 rounded-lg border border-input bg-background text-foreground text-xs"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Kopírovat URL adresu média')}
                    className="w-full py-2 text-xs font-semibold rounded-xl border border-border bg-background hover:bg-muted text-foreground transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Kopírovat veřejnou URL</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnfinishedAction('Smazat médium z knihovny')}
                    className="w-full py-2 text-xs font-semibold rounded-xl text-destructive hover:bg-destructive/10 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Smazat soubor</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </CapabilityShell>
  );
}
