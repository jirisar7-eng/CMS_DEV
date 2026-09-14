# SYN-UI-006: CMS CAPABILITY SHELLS

## Goal
Implement complete visual administration map of GENERAL Synthesis CMS capabilities across structured navigation groups with a truthful capability status model.

## Navigation Groups & Routes (31 General Capabilities)
1. **OBSAH (Content)**:
   - Přehled: `/admin` (PROTOTYP)
   - Stránky: `/admin/pages` (PROTOTYP)
   - Média: `/admin/media` (UI PŘIPRAVENO)
   - Navigace: `/admin/navigation` (UI PŘIPRAVENO)
   - Publikování: `/admin/publishing` (UI PŘIPRAVENO)
   - Revize: `/admin/revisions` (UI PŘIPRAVENO)
   - SEO: `/admin/seo` (UI PŘIPRAVENO)
   - Přesměrování: `/admin/redirects` (UI PŘIPRAVENO)
   - Vyhledávání: `/admin/search` (UI PŘIPRAVENO)

2. **DESIGN**:
   - Vzhledy: `/admin/themes` (UI PŘIPRAVENO)
   - Značky: `/admin/brands` (UI PŘIPRAVENO)
   - PWA: `/admin/pwa` (PLÁNOVÁNO)

3. **SPRÁVA (Management)**:
   - Moduly: `/admin/modules` (UI PŘIPRAVENO)
   - Uživatelé: `/admin/users` (UI PŘIPRAVENO)
   - Role a oprávnění: `/admin/roles` (UI PŘIPRAVENO)
   - Audit: `/admin/audit` (UI PŘIPRAVENO)

4. **KOMUNIKACE (Communication)**:
   - Notifikace: `/admin/notifications` (UI PŘIPRAVENO)
   - Šablony zpráv: `/admin/templates` (PLÁNOVÁNO)

5. **DATA**:
   - Analytika: `/admin/analytics` (UI PŘIPRAVENO)
   - Import / Export: `/admin/import-export` (UI PŘIPRAVENO)

6. **BEZPEČNOST (Security)**:
   - Zabezpečení: `/admin/security` (UI PŘIPRAVENO)
   - Relace a zařízení: `/admin/sessions` (UI PŘIPRAVENO)
   - GDPR a soukromí: `/admin/privacy` (UI PŘIPRAVENO)

7. **SYSTÉM (System)**:
   - Nastavení: `/admin/settings` (UI PŘIPRAVENO)
   - Integrace: `/admin/integrations` (UI PŘIPRAVENO)
   - Diagnostika: `/admin/diagnostics` (UI PŘIPRAVENO)
   - Logy: `/admin/logs` (UI PŘIPRAVENO)
   - Úlohy a fronty: `/admin/queues` (PLÁNOVÁNO)

8. **PLATFORMA (Platform)**:
   - Projekty: `/admin/projects` (UI PŘIPRAVENO)
   - Project Packs: `/admin/project-packs` (PLÁNOVÁNO)
   - Deployment: `/admin/deployment` (UI PŘIPRAVENO)

## Truthful Status Model & Semantics
- **PROTOTYP**: Interaktivní workflow běžící nad in-memory adaptérem / fixture daty (Dashboard, Stránky, Composer).
- **UI PŘIPRAVENO**: Vizuální rozhraní existuje, je plně responzivní a podporuje simulaci stavů (Normal, Empty, Loading, Error, Disabled), ale backendové služby nejsou připojeny. Všechna data jsou pravdivě označena jako ukázková.
- **PLÁNOVÁNO**: Schopnost schválena v roadmapě, bez implementace (PWA, Templates, Queues, Project Packs).
- **FUNKČNÍ**: Plná end-to-end implementace s reálnou perzistencí (vyhrazena pro dokončené vertikální slices).
- **VYPNUTO**: Schopnost záměrně deaktivována konfigurací nebo bezpečnostní politikou.

## Architecture Invariants
- Responsive: mobile 320/360/390/412 (compact group navigation, no overflow) and desktop 1440/1920 (dense, readable layout).
- Status badges: PROTOTYP, UI PŘIPRAVENO, PLÁNOVÁNO, VYPNUTO, FUNKČNÍ.
- State simulation: Empty / Loading / Error / Module-disabled / Normal view tabs for every capability.
- Unfinished action notifications explicitly declare that backend APIs will be connected in future tasks.
- Contextual HelpTrigger on every capability with dedicated help topics in `lib/help/registry.ts` (including `system.status_model`).
