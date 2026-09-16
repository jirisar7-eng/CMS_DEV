'use client';

import { useState } from 'react';
import { BrandVersionData } from '@/lib/domain/brand/contracts';
import { LucideLock } from 'lucide-react';
import { ThemeMode } from '@/lib/domain/brand/resolver';

export function BrandEditor({ brandData, onChange, readonly }: { brandData: BrandVersionData | any, onChange?: (data: any) => void, readonly: boolean }) {
  const [data, setData] = useState<any>(brandData);
  const [mode, setMode] = useState<ThemeMode>('light');

  const handleTokenChange = (group: string, key: string, value: string) => {
    if (readonly) return;
    
    const newData = { ...data };
    if (!newData.themeModes) newData.themeModes = {};
    if (!newData.themeModes[mode]) {
        newData.themeModes[mode] = { ...data.themeModes['light'] };
    }
    
    if (!newData.themeModes[mode][group]) newData.themeModes[mode][group] = {};
    
    if (typeof newData.themeModes[mode][group] === 'string') {
        newData.themeModes[mode][group] = value;
    } else {
        newData.themeModes[mode][group][key] = value;
    }
    
    // Also sync to root tokens if light mode (for backwards compatibility)
    if (mode === 'light') {
        if (!newData.tokens) newData.tokens = {};
        if (!newData.tokens[group]) newData.tokens[group] = {};
        if (typeof newData.tokens[group] === 'string') {
            newData.tokens[group] = value;
        } else {
            newData.tokens[group][key] = value;
        }
    }
    
    setData(newData);
    if (onChange) onChange(newData);
  };

  const handleStringChange = (key: string, value: string) => {
    if (readonly) return;
    
    const newData = { ...data };
    if (!newData.themeModes) newData.themeModes = {};
    if (!newData.themeModes[mode]) {
        newData.themeModes[mode] = { ...data.themeModes['light'] };
    }
    
    newData.themeModes[mode][key] = value;
    
    if (mode === 'light') {
        if (!newData.tokens) newData.tokens = {};
        newData.tokens[key] = value;
    }
    
    setData(newData);
    if (onChange) onChange(newData);
  }

  const currentTokens = data?.themeModes?.[mode] || data?.tokens || {};

  const renderColorInput = (label: string, group: string, key: string, val: string) => (
    <div className="flex flex-col gap-1.5" key={`${mode}-${group}-${key}`}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <input 
          type="color" 
          value={val || '#ffffff'} 
          onChange={(e) => handleTokenChange(group, key, e.target.value)}
          disabled={readonly}
          className="w-8 h-8 rounded border p-0 cursor-pointer disabled:opacity-50"
        />
        <input 
          type="text" 
          value={val || ''}
          onChange={(e) => handleTokenChange(group, key, e.target.value)}
          disabled={readonly}
          className="flex-1 text-sm bg-transparent border-b border-border focus:border-primary focus:outline-none py-1 disabled:opacity-50 font-mono"
        />
      </div>
    </div>
  );

  const renderRootColorInput = (label: string, key: string, val: string) => (
    <div className="flex flex-col gap-1.5" key={`${mode}-root-${key}`}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <input 
          type="color" 
          value={val || '#ffffff'} 
          onChange={(e) => handleStringChange(key, e.target.value)}
          disabled={readonly}
          className="w-8 h-8 rounded border p-0 cursor-pointer disabled:opacity-50"
        />
        <input 
          type="text" 
          value={val || ''}
          onChange={(e) => handleStringChange(key, e.target.value)}
          disabled={readonly}
          className="flex-1 text-sm bg-transparent border-b border-border focus:border-primary focus:outline-none py-1 disabled:opacity-50 font-mono"
        />
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 flex justify-center">
      <div className="w-full max-w-3xl space-y-8 bg-card border rounded-xl p-8 shadow-sm">
        
        {readonly && (
          <div className="bg-muted p-4 rounded-lg flex items-center gap-3 text-sm">
            <LucideLock className="w-5 h-5 text-muted-foreground" />
            <p>You are viewing a published version. To make changes, create a draft first.</p>
          </div>
        )}
        
        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode('light')} className={`px-4 py-2 text-sm font-medium rounded-md ${mode === 'light' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>Light Mode</button>
          <button onClick={() => setMode('dark')} className={`px-4 py-2 text-sm font-medium rounded-md ${mode === 'dark' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>Dark Mode</button>
          <button onClick={() => setMode('extraDark')} className={`px-4 py-2 text-sm font-medium rounded-md ${mode === 'extraDark' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}>Extra Dark Mode</button>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">Brand Colors ({mode})</h3>
          <div className="grid grid-cols-2 gap-6">
            {renderColorInput('Brand Primary', 'brand', 'primary', currentTokens?.brand?.primary)}
            {renderColorInput('Brand Soft', 'brand', 'soft', currentTokens?.brand?.soft)}
            {renderColorInput('Action Primary', 'action', 'primary', currentTokens?.action?.primary)}
            {renderColorInput('Action Text', 'action', 'primaryText', currentTokens?.action?.primaryText)}
            {renderRootColorInput('Link', 'link', currentTokens?.link)}
            {renderRootColorInput('Focus', 'focus', currentTokens?.focus)}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">Surfaces & Canvas ({mode})</h3>
          <div className="grid grid-cols-2 gap-6">
            {renderRootColorInput('Canvas', 'canvas', currentTokens?.canvas)}
            {renderRootColorInput('Surface', 'surface', currentTokens?.surface)}
            {renderRootColorInput('Surface Elevated', 'surfaceElevated', currentTokens?.surfaceElevated)}
            {renderRootColorInput('Border', 'border', currentTokens?.border)}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">Text Colors ({mode})</h3>
          <div className="grid grid-cols-2 gap-6">
            {renderColorInput('Text Primary', 'text', 'primary', currentTokens?.text?.primary)}
            {renderColorInput('Text Secondary', 'text', 'secondary', currentTokens?.text?.secondary)}
            {renderColorInput('Text Muted', 'text', 'muted', currentTokens?.text?.muted)}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">State Colors ({mode})</h3>
          <div className="grid grid-cols-2 gap-6">
            {renderColorInput('Success', 'state', 'success', currentTokens?.state?.success)}
            {renderColorInput('Warning', 'state', 'warning', currentTokens?.state?.warning)}
            {renderColorInput('Error', 'state', 'error', currentTokens?.state?.error)}
            {renderColorInput('Info', 'state', 'info', currentTokens?.state?.info)}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">Typography Settings (Global)</h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Font Family</label>
              <select 
                disabled={readonly}
                value={data.typography?.fontFamily || 'Inter, sans-serif'}
                onChange={(e) => {
                  const newData = { ...data };
                  newData.typography = { ...newData.typography, fontFamily: e.target.value };
                  setData(newData);
                  if (onChange) onChange(newData);
                }}
                className="text-sm bg-muted/50 border border-border rounded-md px-3 py-2 disabled:opacity-50"
              >
                <option value="Inter, sans-serif">Inter</option>
                <option value="Roboto, sans-serif">Roboto</option>
                <option value="Geist, sans-serif">Geist</option>
              </select>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Heading Weight</label>
              <select 
                disabled={readonly}
                value={data.typography?.headingWeight || '700'}
                onChange={(e) => {
                  const newData = { ...data };
                  newData.typography = { ...newData.typography, headingWeight: e.target.value };
                  setData(newData);
                  if (onChange) onChange(newData);
                }}
                className="text-sm bg-muted/50 border border-border rounded-md px-3 py-2 disabled:opacity-50"
              >
                <option value="400">Regular (400)</option>
                <option value="500">Medium (500)</option>
                <option value="600">Semi Bold (600)</option>
                <option value="700">Bold (700)</option>
                <option value="800">Extra Bold (800)</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">Assets</h3>
          <div className="p-4 bg-muted/50 rounded-lg text-sm text-muted-foreground">
            ASSET_UPLOAD_STATUS: DEFERRED_AUTHORIZED_MEDIA_WRITE
            <br />
            (Asset upload will be enabled in a future update once secure media writing is integrated.)
          </div>
        </div>
        
      </div>
    </div>
  );
}
