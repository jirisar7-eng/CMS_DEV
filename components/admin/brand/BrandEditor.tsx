'use client';

import { useState } from 'react';
import { BrandVersionData } from '@/lib/domain/brand/contracts';
import { LucideLock } from 'lucide-react';

export function BrandEditor({ brandData, onChange, readonly }: { brandData: BrandVersionData | any, onChange?: (data: any) => void, readonly: boolean }) {
  const [data, setData] = useState<any>(brandData);
  const [mode, setMode] = useState<'light' | 'dark' | 'extraDark'>('light');

  const handleTokenChange = (group: string, key: string, value: string) => {
    if (readonly) return;
    
    // Simplification for the editor updating state
    const newData = { ...data };
    if (!newData.tokens) newData.tokens = {};
    if (!newData.tokens[group]) newData.tokens[group] = {};
    
    if (typeof newData.tokens[group] === 'string') {
        newData.tokens[group] = value;
    } else {
        newData.tokens[group][key] = value;
    }
    
    setData(newData);
    if (onChange) onChange(newData);
  };

  const renderColorInput = (label: string, group: string, key: string, val: string) => (
    <div className="flex flex-col gap-1.5" key={`${group}-${key}`}>
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

  return (
    <div className="flex-1 overflow-y-auto p-6 flex justify-center">
      <div className="w-full max-w-3xl space-y-8 bg-card border rounded-xl p-8 shadow-sm">
        
        {readonly && (
          <div className="bg-muted p-4 rounded-lg flex items-center gap-3 text-sm">
            <LucideLock className="w-5 h-5 text-muted-foreground" />
            <p>You are viewing a published version. To make changes, create a draft first.</p>
          </div>
        )}
        
        <div>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">Brand Colors</h3>
          <div className="grid grid-cols-2 gap-6">
            {renderColorInput('Brand Primary', 'brand', 'primary', data.tokens?.brand?.primary)}
            {renderColorInput('Brand Soft', 'brand', 'soft', data.tokens?.brand?.soft)}
            {renderColorInput('Action Primary', 'action', 'primary', data.tokens?.action?.primary)}
            {renderColorInput('Action Text', 'action', 'primaryText', data.tokens?.action?.primaryText)}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4 border-b pb-2">Typography Settings</h3>
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
