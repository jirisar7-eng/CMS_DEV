# SYN-UI-007: MEDIA LIBRARY (PROTOTYPE)

## Task Identification
- **TASK_ID**: SYN-UI-007-MEDIA-LIBRARY
- **PROJECT**: SYNTHESIS_CMS
- **ENV**: CMS_DEV
- **LAYER**: CMS
- **CHANGE_CLASS**: CODE
- **BRANCH**: task/SYN-UI-007-MEDIA-LIBRARY
- **BASE_SHA**: 43cff97b63bb298dec6e45c103df3ef8fee13e64

## Objectives
Turn Media from `UI PŘIPRAVENO` → `PROTOTYP`.
- Implement editor-independent Media domain model (`MediaAsset`, `StorageProvider`, `MalwareScanner`, `MediaUsageReference`).
- Implement in-memory media repository with full prototype actions: upload simulation, preview, metadata editing (ALT, title, description), replacement, reference copying, download, archive, and delete.
- Enforce strict delete safety: check usage references across pages/blocks, block destructive delete if referenced, show reference breakdown, and provide safe archive alternative.
- Security boundaries: safe MIME validation, prohibition of arbitrary executables, SVG sanitized/treated as active content, isolated storage keys.
- Contextual help topics for `media.library`, `media.upload`, `media.alt`, `media.replace`, `media.delete`, `media.usage`.
- Fully responsive layout for 390px mobile up to 1440px+ desktop with grid/list toggling, search, type filtering, sorting, and asset inspector.

## Implementation Progress
- [x] Domain types and interfaces defined (`/lib/domain/media/types.ts`)
- [x] Mock storage and malware providers implemented (`/lib/domain/media/mockProviders.ts`)
- [x] In-memory repository with delete protection and safe upload pipeline (`/lib/domain/media/repository.ts`)
- [x] Navigation updated: Media -> `PROTOTYP` (`/lib/navigation/adminNav.ts`)
- [x] Registered 7 help topics in registry (`/lib/help/registry.ts`)
- [x] Created `MediaAssetCard`, `MediaGrid`, `MediaList` components
- [x] Created `MediaUploadModal` with drag-and-drop & simulated scan pipeline
- [x] Created `MediaReplaceModal` ensuring reference retention
- [x] Created `MediaDeleteModal` with strict usage protection
- [x] Created `MediaDetailDrawer` with metadata form & usage links
- [x] Created `MediaLibraryWorkspace` with search, type filters, sort & metrics
- [x] Integrated into `/app/admin/media/page.tsx`
- [x] Linter: PASS (0 errors, 0 warnings)
- [x] Production Build: PASS (Next.js 15.5.25 optimized build)

