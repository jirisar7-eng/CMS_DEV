export type HelpKey =
  // Obsah (Content)
  | 'admin.dashboard.view'
  | 'content.pages.view'
  | 'content.page.create'
  | 'content.page.edit'
  | 'content.block.create'
  | 'content.block.edit'
  | 'content.draft.save'
  | 'content.preview'
  | 'content.publish'
  | 'content.media.view'
  | 'media.library'
  | 'media.upload'
  | 'media.alt'
  | 'media.replace'
  | 'media.delete'
  | 'media.usage'
  | 'content.navigation.view'
  | 'navigation.manager'
  | 'navigation.item'
  | 'navigation.internal_link'
  | 'navigation.external_link'
  | 'navigation.reorder'
  | 'navigation.visibility'
  | 'navigation.broken_reference'
  | 'content.publishing.view'
  | 'content.revisions.view'
  | 'content.seo.view'
  | 'content.redirects.view'
  | 'content.search.view'
  // Design
  | 'design.themes.view'
  | 'design.brands.view'
  | 'design.svg_editor.view'
  | 'design.pwa.view'
  // Správa (Management)
  | 'management.modules.view'
  | 'management.users.view'
  | 'management.roles.view'
  | 'management.audit.view'
  // Komunikace (Communication)
  | 'communication.notifications.view'
  | 'communication.templates.view'
  // Data
  | 'data.analytics.view'
  | 'data.import_export.view'
  // Bezpečnost (Security)
  | 'security.overview.view'
  | 'security.sessions.view'
  | 'security.privacy.view'
  // Systém (System)
  | 'system.settings.view'
  | 'system.integrations.view'
  | 'system.diagnostics.view'
  | 'system.logs.view'
  | 'system.queues.view'
  // Platforma (Platform)
  | 'platform.projects.view'
  | 'platform.project_packs.view'
  | 'platform.deployment.view'
  // Status Model & Governance
  | 'system.status_model'
  // Theme & General
  | 'theme.switch';

export interface HelpTopic {
  helpKey: HelpKey | string;
  title: string;
  shortSummary: string;
  extendedBody: string;
  tags?: string[];
  docUrl?: string;
  fallback?: boolean;
}

export interface HelpContextState {
  currentTopic: HelpTopic | null;
  isOpen: boolean;
  openHelp: (keyOrTopic: HelpKey | string | HelpTopic) => void;
  closeHelp: () => void;
}

