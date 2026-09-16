'use client';

import { useState } from 'react';

export function BrandPreview({ brandData }: { brandData: any }) {
  const [viewport, setViewport] = useState('desktop');
  
  const width = viewport === 'desktop' ? '100%' : viewport + 'px';
  const tokens = brandData?.tokens || {};
  
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-12 border-b bg-card flex items-center justify-center gap-2">
        <button onClick={() => setViewport('320')} className={`px-3 py-1 text-xs rounded ${viewport === '320' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>320px</button>
        <button onClick={() => setViewport('390')} className={`px-3 py-1 text-xs rounded ${viewport === '390' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>390px</button>
        <button onClick={() => setViewport('768')} className={`px-3 py-1 text-xs rounded ${viewport === '768' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>768px</button>
        <button onClick={() => setViewport('desktop')} className={`px-3 py-1 text-xs rounded ${viewport === 'desktop' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>Desktop</button>
      </div>
      
      <div className="flex-1 overflow-y-auto bg-black/5 flex justify-center py-8">
        <div 
          className="bg-white shadow-xl rounded-lg overflow-hidden flex flex-col transition-all duration-300"
          style={{ width, maxWidth: '100%', minHeight: '600px' }}
        >
          {/* Simulated content styled by tokens */}
          <div 
            style={{ 
              backgroundColor: tokens.canvas || '#ffffff', 
              color: tokens.text?.primary || '#000000',
              fontFamily: brandData?.typography?.fontFamily,
            }} 
            className="flex-1 p-8"
          >
            <header className="mb-12 border-b pb-4" style={{ borderColor: tokens.border }}>
              <h1 style={{ color: tokens.brand?.primary, fontWeight: brandData?.typography?.headingWeight }} className="text-3xl">Brand Preview</h1>
            </header>
            
            <section className="space-y-6">
              <div>
                <h2 style={{ fontWeight: brandData?.typography?.headingWeight }} className="text-xl mb-2">Typography & Colors</h2>
                <p style={{ color: tokens.text?.secondary }}>This is secondary text. It provides additional context but is less prominent than primary text.</p>
                <p style={{ color: tokens.text?.muted }} className="text-sm mt-1">This is muted text, typically used for captions or minor details.</p>
              </div>
              
              <div style={{ backgroundColor: tokens.surface }} className="p-6 rounded-xl">
                <h3 style={{ fontWeight: brandData?.typography?.headingWeight }} className="text-lg mb-3">Surface Element</h3>
                <p className="mb-4">Cards and surfaces use this background color to stand out from the canvas.</p>
                <button 
                  style={{ 
                    backgroundColor: tokens.action?.primary, 
                    color: tokens.action?.primaryText 
                  }}
                  className="px-4 py-2 rounded-md font-medium"
                >
                  Primary Action
                </button>
              </div>
              
              <div className="flex gap-4">
                <div style={{ backgroundColor: tokens.state?.success, color: '#fff' }} className="px-3 py-1 rounded text-xs font-medium">Success</div>
                <div style={{ backgroundColor: tokens.state?.warning, color: '#000' }} className="px-3 py-1 rounded text-xs font-medium">Warning</div>
                <div style={{ backgroundColor: tokens.state?.error, color: '#fff' }} className="px-3 py-1 rounded text-xs font-medium">Error</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
