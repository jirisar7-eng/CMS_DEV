import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { HelpProvider } from '@/components/help/HelpProvider';
import { HelpPanel } from '@/components/help/HelpPanel';
import { BrandRepository } from '@/lib/domain/brand/repository';
import { SYNTHESIS_ORANGE_DEFAULT } from '@/lib/domain/brand/contracts';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });

export const metadata: Metadata = {
  title: 'Synthesis CMS',
  description: 'Modulární redakční systém platformy Synthesis pro správu stránek, obsahu a hierarchie.',
};

export default async function RootLayout({children}: {children: React.ReactNode}) {
  let brandData = SYNTHESIS_ORANGE_DEFAULT;
  try {
    brandData = await BrandRepository.getActiveBrandData('SYSTEM');
  } catch (e) {
    console.error("Failed to load SYSTEM brand, using default fallback.", e);
  }
  return (
    <html lang="cs" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" themes={["light", "dark", "extraDark", "system"]} enableSystem disableTransitionOnChange brandData={brandData}>
          <HelpProvider>
            {children}
            <HelpPanel />
          </HelpProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
