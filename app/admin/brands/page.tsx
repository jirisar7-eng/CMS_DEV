import { getOrCreateBrand } from './actions';
import { BrandStudioClient } from '@/components/admin/brand/BrandStudioClient';

export const metadata = {
  title: 'Brand Studio - Synthesis CMS',
};

export default async function BrandStudioPage() {
  // We'll manage the SYSTEM brand by default here
  const brand = await getOrCreateBrand('SYSTEM', null);
  
  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Brand Studio</h1>
          <p className="text-sm text-muted-foreground">Manage semantic colors, typography, and theme modes.</p>
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <BrandStudioClient initialBrand={brand} />
      </div>
    </div>
  );
}
