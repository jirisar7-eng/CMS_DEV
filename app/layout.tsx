import type {Metadata} from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { HelpProvider } from '@/components/help/HelpProvider';
import { HelpPanel } from '@/components/help/HelpPanel';

const inter = Inter({ subsets: ['latin', 'latin-ext'] });

export const metadata: Metadata = {
  title: 'Synthesis CMS',
  description: 'Modulární redakční systém platformy Synthesis pro správu stránek, obsahu a hierarchie.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <HelpProvider>
            {children}
            <HelpPanel />
          </HelpProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
