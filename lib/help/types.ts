export type HelpKey =
  | 'admin.dashboard.view'
  | 'content.pages.view'
  | 'content.page.create'
  | 'content.page.edit'
  | 'content.block.create'
  | 'content.block.edit'
  | 'content.draft.save'
  | 'content.preview'
  | 'content.publish'
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
