# Synthesis CMS Brand Foundation
**Task**: SYN-BRAND-001
**Status**: IN_PROGRESS

## 1. Architektura Tokenů
- Design system využívá CSS variables (Tailwind `@theme`) k definici systémových barev a tokenů.
- Globální `globals.css` byl refaktorován, aby využíval Synthesis brand barvy.

## 2. Barevná Paleta (Light Orange)
- **Brand Primary**: `#FF7A00` (`--brand-primary` / `brand`)
- **Brand Soft**: `#FFE4CC` (`--brand-primary-soft` / `brand-soft`)
- **Action Primary**: `#C25700` (`--action-primary` / `action`) pro zajištění accessibility WCAG AA s bílým textem.
- **Surface**: Bílé a světle šedé tóny (`#FFFFFF`, `#F5F5F5`, `#FAFAFA`).
- **Text**: Tmavě šedé odstíny pro optimální kontrast (`#1F1F1F`, `#52525B`).
- Byly zachovány sémantické barvy (success: green, warning: amber, danger: red, info: blue).

## 3. Typografie a Symbolika
- Aplikován primární font **Inter** (přes `next/font/google`).
- Modul `SynthesisLogo` implementován jako placeholder (FINAL_VECTOR_LOGO = PENDING) a integrován do navigačních komponent.

## 4. UI Aktualizace (Admin)
- Odstraněny plošné výplně `bg-primary` u aktivních položek v levém sidebaru pro zmírnění "orange flood" efektu.
- Nahrazeno indikátorem nalevo (`border-l-4 border-l-primary`) s jemnějším pozadím (`bg-primary/10`).
- Sémantické tokeny aplikovány konzistentně do `AdminDashboard.tsx`.

## 5. UI Aktualizace (Public)
- Veřejná úvodní stránka sjednocena s brandovými claims ("Tvořte. Spravujte. Růstě.").
- Navigace upravena k použití jednotné identity.
