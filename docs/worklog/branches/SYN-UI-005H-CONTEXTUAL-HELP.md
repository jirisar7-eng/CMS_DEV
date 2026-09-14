# SYN-UI-005H: CONTEXTUAL HELP FOUNDATION

## Goal
Implement central extensible Contextual Help system across Synthesis CMS administration and composer views.

## Architecture
- `lib/help/types.ts`: Strictly typed `HelpKey`, `HelpTopic`, and `HelpContextState`.
- `lib/help/registry.ts`: `HelpRegistryService` singleton with defaults for 10 core operations and safe fallback for unknown keys.
- `components/help/HelpProvider.tsx`: Global React Context for help state management.
- `components/help/HelpTrigger.tsx`: Accessible inline trigger (`?`) with desktop tooltip and mobile 44px touch target.
- `components/help/HelpPanel.tsx`: Responsive modal panel (slide-over drawer on desktop 1440, bottom sheet on mobile 390).

## Integrated Surfaces
- `app/layout.tsx`: Provider wrapper and global HelpPanel
- `components/theme/theme-toggle.tsx`: `theme.switch`
- `components/admin/pages/PagesWorkspace.tsx`: `content.page.create`
- `components/admin/pages/PageCreateWorkspace.tsx`: `content.page.create`, `content.draft.save`
- `components/admin/pages/PageDetailWorkspace.tsx`: `content.page.create`, `content.preview`, `content.publish`, `content.draft.save`
- `components/admin/composer/ComposerHeader.tsx`: `content.preview`, `content.draft.save`
- `components/admin/composer/BlockPalette.tsx`: `content.block.create`
- `components/admin/composer/BlockInspector.tsx`: `content.block.edit`
