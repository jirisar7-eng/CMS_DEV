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
