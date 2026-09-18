# SYN-EDITOR-001: Visual Page Editor Foundation

## Přehled a architektura

Tento dokument zachycuje implementaci vizuálního editoru stránek (Composer) postaveného nad kanonickým modelem obsahu Synthesis CMS s Puckem jako obousměrným adaptérem.

### Klíčové principy
1. **Puck jako adaptér, nikoliv SSOT**: Databázovou autoritou zůstává kanonický model stránek a revizí v PostgreSQL. Puck formát je generován pouze pro zobrazení/editaci.
2. **Entitlements & Gates**: Komponenty a vlastnosti jsou chráněny serverovými pravidly a matricí edic (COMMUNITY, COMMERCIAL, GRANTED/PARTNER).
3. **Labs Model**: Experimentální funkce (AI Design, puck_ai, nové komponenty) běží pod explicitními lab flagy ve stejném codebase.
4. **Sanitizace a bezpečnost**: Všechna uživatelská data a atributy komponent procházejí striktní sanitizací proti XSS a injection útokům.
5. **Sdílený renderer**: `lib/composer/render.tsx` zajišťuje vizuální a funkční paritu mezi administrátorským náhledem a veřejným webem.

