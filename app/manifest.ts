import type { MetadataRoute } from 'next';
import { SYNTHESIS_ORANGE_DEFAULT } from '@/lib/domain/brand/contracts';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Synthesis CMS',
    short_name: 'Synthesis CMS',
    description: 'Modulární redakční systém platformy Synthesis pro správu stránek, obsahu a hierarchie.',
    start_url: '/',
    display: 'standalone',
    background_color: SYNTHESIS_ORANGE_DEFAULT.tokens.canvas,
    theme_color: SYNTHESIS_ORANGE_DEFAULT.tokens.brand.primary,
    icons: [
      {
        src: '/brand/synthesis/app-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/brand/synthesis/maskable-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      }
    ],
  };
}
