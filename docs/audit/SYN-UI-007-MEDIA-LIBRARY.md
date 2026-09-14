# Audit Evidence: SYN-UI-007-MEDIA-LIBRARY

- **Task ID**: SYN-UI-007-MEDIA-LIBRARY
- **Layer**: CMS
- **Change Class**: CODE
- **Mode**: IMPLEMENTATION
- **Status**: IMPLEMENTED & VERIFIED

---

## 1. Scope & Objective
Přechod schopnosti Knihovna médií z `UI PŘIPRAVENO` na plnohodnotný `PROTOTYP`.
Zajištění rozhraní pro správu médií, nahrávání, editaci metadat (ALT textů), bezpečné nahrazování a ochranu referencí při mazání (Delete Safety).

---

## 2. Implemented Architecture & Domain Boundaries

1. **Domain Model (`/lib/domain/media/types.ts`)**:
   - `MediaAsset` model nezávislý na editoru (Puck/Tiptap).
   - `StorageProvider` rozhraní (decoupling od fyzického úložiště jako S3/MinIO).
   - `MalwareScanner` rozhraní (decoupling od antivirového skeneru jako ClamAV).
   - Bezpečné úložištní klíče (`storageKey` UUID), které oddělují název souboru od cesty.
   - Detekce a označení aktivního obsahu (SVG).

2. **Repository & Pipeline (`/lib/domain/media/repository.ts`)**:
   - Bezpečný upload pipeline: validace MIME/velikosti -> skenování -> uložení do úložiště -> přiřazení metadat.
   - **Delete Safety**: Kontrola `usageCount` a seznamu referencí (`usageReferences`). Pokud je médium aktivně využíváno na stránkách, destruktivní smazání je blokováno a je nabídnuta bezpečná archivace.
   - Nahrazení souboru (`replaceFile`): Zachovává identitu média a všechny vazby na existujících stránkách.

3. **User Interface (`/app/admin/media/page.tsx` & `/components/admin/media/*`)**:
   - `MediaLibraryWorkspace`: Přepínání Grid/List, vyhledávání, filtry typů (Vše, Obrázky, Vektory, Dokumenty, Video, Audio), řazení a statistiky.
   - `MediaGrid` & `MediaList`: Responzivní zobrazení aktiv se stavovými štítky (rozlišení, velikost, využití).
   - `MediaDetailDrawer`: Zobrazení náhledu, technických a bezpečnostních dat, editace metadat a rozpis stránek s aktivním využitím.
   - `MediaUploadModal`: Podpora drag-and-drop i výběru souboru, validace, průběh skenování a zadání ALT textu.
   - `MediaReplaceModal`: Bezpečná výměna obsahu se zachováním vazeb.
   - `MediaDeleteModal`: Vizuální blokace smazání u využitých médií s výpisem stránek a tlačítkem „Archivovat“.

4. **Navigace a Nápověda**:
   - `/lib/navigation/adminNav.ts`: Aktualizace stavu na `PROTOTYP`.
   - `/lib/help/registry.ts`: 7 kontextových nápověd (`media.library`, `media.upload`, `media.alt`, `media.replace`, `media.delete`, `media.usage`, `media.detail`).

---

## 3. Verification & Compliance
- **Lint**: PASS (0 chyb, 0 varování)
- **Compile/Build**: PASS (Next.js 15.5.25 optimized production build)
- **Truthfulness**: Zobrazen informační pruh potvrzující in-memory adaptér prototypu.
- **Bezpečnost**: Žádné nebezpečné přípony, SVG označeno jako aktivní obsah, žádné přímé cesty k souborovému systému.
