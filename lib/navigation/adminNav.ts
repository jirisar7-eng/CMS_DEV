import {
  LayoutDashboard,
  FileText,
  Image as ImageIcon,
  Compass,
  Send,
  History,
  Globe,
  CornerUpRight,
  Search,
  Paintbrush,
  Tags,
  PenTool,
  Smartphone,
  Blocks,
  Users,
  KeyRound,
  ShieldAlert,
  Bell,
  Mail,
  BarChart3,
  ArrowDownUp,
  ShieldCheck,
  Laptop,
  ShieldQuestion,
  Settings,
  Plug,
  Activity,
  Terminal,
  ListOrdered,
  FolderKanban,
  Package,
  Rocket,
  LucideIcon,
} from 'lucide-react';
import { CapabilityStatus } from '@/components/admin/CapabilityStatusBadge';
import { CapabilityGroup } from '@/components/admin/CapabilityShell';
import { HelpKey } from '@/lib/help/types';

export interface AdminNavItem {
  id: string;
  name: string;
  href: string;
  icon: LucideIcon;
  group: CapabilityGroup;
  status: CapabilityStatus;
  helpKey: HelpKey;
  description: string;
}

export interface AdminNavGroup {
  id: CapabilityGroup;
  name: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: 'OBSAH',
    name: 'Obsah',
    items: [
      {
        id: 'dashboard',
        name: 'Přehled',
        href: '/admin',
        icon: LayoutDashboard,
        group: 'OBSAH',
        status: 'FUNKČNÍ',
        helpKey: 'admin.dashboard.view',
        description: 'Centrální přehled stavu publikace, aktivity redakce a rychlých akcí.',
      },
      {
        id: 'pages',
        name: 'Stránky',
        href: '/admin/pages',
        icon: FileText,
        group: 'OBSAH',
        status: 'FUNKČNÍ',
        helpKey: 'content.pages.view',
        description: 'Hierarchická struktura a správa všech stránek webu.',
      },
      {
        id: 'media',
        name: 'Média',
        href: '/admin/media',
        icon: ImageIcon,
        group: 'OBSAH',
        status: 'ZÁKLAD',
        helpKey: 'media.library',
        description: 'Knihovna obrázků, dokumentů a multimediálních aktiv.',
      },
      {
        id: 'navigation',
        name: 'Navigace',
        href: '/admin/navigation',
        icon: Compass,
        group: 'OBSAH',
        status: 'ZÁKLAD',
        helpKey: 'navigation.manager',
        description: 'Hierarchický správce menu, záhlaví, patičky a bezpečných odkazů.',
      },
      {
        id: 'publishing',
        name: 'Publikování',
        href: '/admin/publishing',
        icon: Send,
        group: 'OBSAH',
        status: 'ZÁKLAD',
        helpKey: 'content.publishing.view',
        description: 'Publikační pipeline, neměnné verze a okamžitý rollback.',
      },
      {
        id: 'revisions',
        name: 'Revize',
        href: '/admin/revisions',
        icon: History,
        group: 'OBSAH',
        status: 'ZÁKLAD',
        helpKey: 'content.revisions.view',
        description: 'Historie změn a vizuální porovnání revizí obsahu.',
      },
      {
        id: 'seo',
        name: 'SEO',
        href: '/admin/seo',
        icon: Globe,
        group: 'OBSAH',
        status: 'POUZE UI',
        helpKey: 'content.seo.view',
        description: 'Globální SEO metadata, Open Graph a generátor sitemap.xml.',
      },
      {
        id: 'redirects',
        name: 'Přesměrování',
        href: '/admin/redirects',
        icon: CornerUpRight,
        group: 'OBSAH',
        status: 'POUZE UI',
        helpKey: 'content.redirects.view',
        description: 'Pravidla pro přesměrování URL adres (HTTP 301/302).',
      },
      {
        id: 'search',
        name: 'Vyhledávání',
        href: '/admin/search',
        icon: Search,
        group: 'OBSAH',
        status: 'ZÁKLAD',
        helpKey: 'content.search.view',
        description: 'Fulltextový index webu a statistiky hledaných výrazů.',
      },
    ],
  },
  {
    id: 'DESIGN',
    name: 'Design',
    items: [
      {
        id: 'themes',
        name: 'Vzhledy',
        href: '/admin/themes',
        icon: Paintbrush,
        group: 'DESIGN',
        status: 'FUNKČNÍ',
        helpKey: 'design.themes.view',
        description: 'Vizuální témata, barevné palety a design tokeny.',
      },
      {
        id: 'brands',
        name: 'Značky',
        href: '/admin/brands',
        icon: Tags,
        group: 'DESIGN',
        status: 'FUNKČNÍ',
        helpKey: 'design.brands.view',
        description: 'Logotypy, favicony, barvy a vizuální identita projektu.',
      },
      {
        id: 'svg-editor',
        name: 'SVG Editor',
        href: '/admin/svg-editor',
        icon: PenTool,
        group: 'DESIGN',
        status: 'ZÁKLAD',
        helpKey: 'design.svg_editor.view',
        description: 'Vývojový vektorový editor pro bezpečná SVG aktiva a prvky značky.',
      },
      {
        id: 'pwa',
        name: 'PWA',
        href: '/admin/pwa',
        icon: Smartphone,
        group: 'DESIGN',
        status: 'POUZE UI',
        helpKey: 'design.pwa.view',
        description: 'Instalační manifest aplikace a správa offline režimu.',
      },
    ],
  },
  {
    id: 'SPRÁVA',
    name: 'Správa',
    items: [
      {
        id: 'modules',
        name: 'Moduly',
        href: '/admin/modules',
        icon: Blocks,
        group: 'SPRÁVA',
        status: 'POUZE UI',
        helpKey: 'management.modules.view',
        description: 'Správa a aktivace funkčních modulů a rozšíření.',
      },
      {
        id: 'users',
        name: 'Uživatelé',
        href: '/admin/users',
        icon: Users,
        group: 'SPRÁVA',
        status: 'ZÁKLAD',
        helpKey: 'management.users.view',
        description: 'Správa redakčních a administrátorských účtů s 2FA.',
      },
      {
        id: 'roles',
        name: 'Role a oprávnění',
        href: '/admin/roles',
        icon: KeyRound,
        group: 'SPRÁVA',
        status: 'ZÁKLAD',
        helpKey: 'management.roles.view',
        description: 'Přístupová práva (RBAC) a politika nejnižších privilegií.',
      },
      {
        id: 'audit',
        name: 'Audit',
        href: '/admin/audit',
        icon: ShieldAlert,
        group: 'SPRÁVA',
        status: 'ZÁKLAD',
        helpKey: 'management.audit.view',
        description: 'Neměnný bezpečnostní protokol událostí a změn.',
      },
    ],
  },
  {
    id: 'KOMUNIKACE',
    name: 'Komunikace',
    items: [
      {
        id: 'notifications',
        name: 'Notifikace',
        href: '/admin/notifications',
        icon: Bell,
        group: 'KOMUNIKACE',
        status: 'POUZE UI',
        helpKey: 'communication.notifications.view',
        description: 'Centrum redakčních a systémových upozornění.',
      },
      {
        id: 'templates',
        name: 'Šablony zpráv',
        href: '/admin/templates',
        icon: Mail,
        group: 'KOMUNIKACE',
        status: 'PLÁNOVÁNO',
        helpKey: 'communication.templates.view',
        description: 'Transakční šablony e-mailů a notifikačních zpráv.',
      },
    ],
  },
  {
    id: 'DATA',
    name: 'Data',
    items: [
      {
        id: 'analytics',
        name: 'Analytika',
        href: '/admin/analytics',
        icon: BarChart3,
        group: 'DATA',
        status: 'POUZE UI',
        helpKey: 'data.analytics.view',
        description: 'Statistiky návštěvnosti bez cookies v souladu s GDPR.',
      },
      {
        id: 'import-export',
        name: 'Import / Export',
        href: '/admin/import-export',
        icon: ArrowDownUp,
        group: 'DATA',
        status: 'POUZE UI',
        helpKey: 'data.import_export.view',
        description: 'Portabilita celého webu, zálohování a obnova dat.',
      },
    ],
  },
  {
    id: 'BEZPEČNOST',
    name: 'Bezpečnost',
    items: [
      {
        id: 'security',
        name: 'Zabezpečení',
        href: '/admin/security',
        icon: ShieldCheck,
        group: 'BEZPEČNOST',
        status: 'POUZE UI',
        helpKey: 'security.overview.view',
        description: 'Bezpečnostní štít, TLS certifikáty a HTTP hlavičky.',
      },
      {
        id: 'sessions',
        name: 'Relace a zařízení',
        href: '/admin/sessions',
        icon: Laptop,
        group: 'BEZPEČNOST',
        status: 'ZÁKLAD',
        helpKey: 'security.sessions.view',
        description: 'Aktivní přihlášená zařízení a vzdálené odhlášení.',
      },
      {
        id: 'privacy',
        name: 'GDPR a soukromí',
        href: '/admin/privacy',
        icon: ShieldQuestion,
        group: 'BEZPEČNOST',
        status: 'POUZE UI',
        helpKey: 'security.privacy.view',
        description: 'Cookie lišta, souhlasy a správa ochrany osobních údajů.',
      },
    ],
  },
  {
    id: 'SYSTÉM',
    name: 'Systém',
    items: [
      {
        id: 'settings',
        name: 'Nastavení',
        href: '/admin/settings',
        icon: Settings,
        group: 'SYSTÉM',
        status: 'POUZE UI',
        helpKey: 'system.settings.view',
        description: 'Globální systémové parametry, lokalizace a režim údržby.',
      },
      {
        id: 'integrations',
        name: 'Integrace',
        href: '/admin/integrations',
        icon: Plug,
        group: 'SYSTÉM',
        status: 'POUZE UI',
        helpKey: 'system.integrations.view',
        description: 'Webhooky, externí služby a cloudová úložiště.',
      },
      {
        id: 'diagnostics',
        name: 'Diagnostika',
        href: '/admin/diagnostics',
        icon: Activity,
        group: 'SYSTÉM',
        status: 'POUZE UI',
        helpKey: 'system.diagnostics.view',
        description: 'Diagnostika běhového prostředí, databáze a paměti.',
      },
      {
        id: 'logs',
        name: 'Logy',
        href: '/admin/logs',
        icon: Terminal,
        group: 'SYSTÉM',
        status: 'POUZE UI',
        helpKey: 'system.logs.view',
        description: 'Živé systémové protokoly a chybová hlášení.',
      },
      {
        id: 'queues',
        name: 'Úlohy a fronty',
        href: '/admin/queues',
        icon: ListOrdered,
        group: 'SYSTÉM',
        status: 'PLÁNOVÁNO',
        helpKey: 'system.queues.view',
        description: 'Asynchronní úlohy na pozadí a plánovač Cron úloh.',
      },
    ],
  },
  {
    id: 'PLATFORMA',
    name: 'Platforma',
    items: [
      {
        id: 'projects',
        name: 'Projekty',
        href: '/admin/projects',
        icon: FolderKanban,
        group: 'PLATFORMA',
        status: 'ZÁKLAD',
        helpKey: 'platform.projects.view',
        description: 'Autorizovaný registr projektů, přepínání projektového kontextu a tenantová izolace.',
      },
      {
        id: 'project-packs',
        name: 'Project Packs',
        href: '/admin/project-packs',
        icon: Package,
        group: 'PLATFORMA',
        status: 'PLÁNOVÁNO',
        helpKey: 'platform.project_packs.view',
        description: 'Distribuční balíčky a certifikované sestavy modulů.',
      },
      {
        id: 'deployment',
        name: 'Deployment',
        href: '/admin/deployment',
        icon: Rocket,
        group: 'PLATFORMA',
        status: 'POUZE UI',
        helpKey: 'platform.deployment.view',
        description: 'Stav nasazení, Git SHA kontrolní součet a Cloud Run hosting.',
      },
    ],
  },
];

export const ALL_ADMIN_NAV_ITEMS = ADMIN_NAV_GROUPS.flatMap((g) => g.items);

export function getNavItemByPath(pathname: string): AdminNavItem | undefined {
  if (pathname === '/admin') {
    return ALL_ADMIN_NAV_ITEMS.find((item) => item.href === '/admin');
  }
  return ALL_ADMIN_NAV_ITEMS.find(
    (item) => item.href !== '/admin' && (pathname === item.href || pathname.startsWith(item.href + '/'))
  );
}

export function getCapabilityById(id: string): AdminNavItem | undefined {
  return ALL_ADMIN_NAV_ITEMS.find((item) => item.id === id);
}

export function getCapabilityStatus(id: string): CapabilityStatus {
  return getCapabilityById(id)?.status ?? 'PLÁNOVÁNO';
}

export function getCapabilityStats(): Record<CapabilityStatus, number> & { total: number } {
  const stats: Record<CapabilityStatus, number> = {
    'PLÁNOVÁNO': 0,
    'POUZE UI': 0,
    'ZÁKLAD': 0,
    'FUNKČNÍ': 0,
    'DOKONČENO': 0,
    'VYPNUTO': 0,
  };
  const capabilities = ALL_ADMIN_NAV_ITEMS.filter((item) => item.id !== 'dashboard');
  for (const item of capabilities) {
    if (stats[item.status] !== undefined) {
      stats[item.status]++;
    }
  }
  return {
    ...stats,
    total: capabilities.length,
  };
}
