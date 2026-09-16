# Synthesis CMS Brand Book

**PRODUCT:** Synthesis CMS  
**BRAND SCOPE:** SYSTEM  
**STATUS:** Normative built-in SYSTEM brand specification for SYN-BRAND-003.  

## 1. Brand Principle

The approved direction is: **“White space. Dark content. Orange action.”**

Synthesis Orange is the core identity color. However, **identity color and accessible action color are NOT always identical.** Synthesis Orange must never be used indiscriminately for body text or elements requiring strict contrast compliance against white unless it is shifted to meet WCAG AA.

**Brand Character:**
- Clear
- Modular
- Technical
- Calm
- Trustworthy
- Modern
- Restrained
- Accessible
- Mobile-first

**Design Constraints:**
- No gradients are required for core identity.
- No decorative complexity should compete with content.

## 2. Canonical Logo

The canonical symbol is an **abstract modular S** constructed from two interlocking rounded ribbon paths.

**Specifications:**
- **ViewBox:** 32 × 32
- **Caps & Joins:** Rounded
- **Stroke Width:** 5
- **Frame/Box:** No enclosing square or frame
- **Center:** No central pill
- **Styling:** No gradient, no opacity trick
- **Immutability:** The geometry is immutable unless a future explicit brand migration changes it.

**Supported Variants:**
The `SynthesisLogo` React component implements several variants:
- `primary`
- `symbol`
- `monochrome-dark`
- `monochrome-white`
- `admin-compact`

*Note: The `admin-compact` variant currently uses the same canonical symbol geometry.*

## 3. Logo Usage Rules

- **Use built-in components:** Use the existing `SynthesisLogo` renderer in React surfaces.
- **Use built-in static assets:** Use the built-in public SVG assets for static/metadata use.
- **Never redraw:** Never redraw the symbol manually in consumers (no inline `<path>` copying).
- **Never distort:** Never stretch or distort the symbol.
- **Never arbitrarily recolor:** Never recolor the symbol with arbitrary project colors.
- **No visual effects:** Never add shadows, frames, gradients, or effects to the canonical symbol.
- **Decorative usage:** If an adjacent visible wordmark is present, the symbol may be hidden from screen readers (decorative).
- **Meaningful usage:** A standalone meaningful symbol must expose accessible identity text.
- **Sizing:** 
  - Minimum normal UI symbol size: `20` CSS px.
  - Preferred compact UI range: approximately `24–32` CSS px.
  - Favicon is a controlled exception to the normal UI minimum.
  - App and maskable assets own their safe-zone treatments.

**Important:** A raster Apple Touch PNG is **NOT YET PROVIDED**. Future raster generation belongs to the PWA/App Profile pipeline.

## 4. Asset Inventory

The exact production asset inventory consists of the following **8** files:

1. `public/brand/synthesis/synthesis-symbol.svg`
2. `public/brand/synthesis/synthesis-symbol-monochrome.svg`
3. `public/brand/synthesis/synthesis-logo.svg`
4. `public/brand/synthesis/synthesis-logo-dark.svg`
5. `public/brand/synthesis/synthesis-logo-white.svg`
6. `public/brand/synthesis/favicon.svg`
7. `public/brand/synthesis/app-icon.svg`
8. `public/brand/synthesis/maskable-icon.svg`

**Manifest Usage:**
- `app-icon.svg` is mapped in the web app manifest with `purpose: "any"`.
- `maskable-icon.svg` is mapped in the web app manifest with `purpose: "maskable"`.
- `favicon.svg` is used directly in metadata.

## 5. Authoritative Palette

The following values are extracted directly from `SYNTHESIS_ORANGE_DEFAULT`. Do not independently invent palette values.

### LIGHT

- **brand.primary:** `#FF7A00`
- **brand.soft:** `#FFE4CC`
- **action.primary:** `#C25700`
- **action.primaryText:** `#FFFFFF`
- **text.primary:** `#1F1F1F`
- **text.secondary:** `#4D4D4D`
- **text.muted:** `#737373`
- **canvas:** `#FFFFFF`
- **surface:** `#F5F5F5`
- **surfaceElevated:** `#FFFFFF`
- **border:** `#E5E5E5`
- **link:** `#C25700`
- **focus:** `#000000`
- **state.success:** `#16A34A`
- **state.warning:** `#F59E0B`
- **state.error:** `#DC2626`
- **state.info:** `#2563EB`

### DARK

- **brand.primary:** `#FF7A00`
- **brand.soft:** `#4A2805`
- **action.primary:** `#FF9E40`
- **action.primaryText:** `#121212`
- **text.primary:** `#FFFFFF`
- **text.secondary:** `#A3A3A3`
- **text.muted:** `#888888`
- **canvas:** `#121212`
- **surface:** `#1E1E1E`
- **surfaceElevated:** `#2A2A2A`
- **border:** `#333333`
- **link:** `#FF9E40`
- **focus:** `#FFFFFF`
- **state.success:** `#22C55E`
- **state.warning:** `#FBBF24`
- **state.error:** `#EF4444`
- **state.info:** `#3B82F6`

### EXTRA DARK

- **brand.primary:** `#FF7A00`
- **brand.soft:** `#4A2805`
- **action.primary:** `#FF9E40`
- **action.primaryText:** `#000000`
- **text.primary:** `#FFFFFF`
- **text.secondary:** `#A3A3A3`
- **text.muted:** `#888888`
- **canvas:** `#000000`
- **surface:** `#0A0A0A`
- **surfaceElevated:** `#141414`
- **border:** `#222222`
- **link:** `#FF9E40`
- **focus:** `#FFFFFF`
- **state.success:** `#22C55E`
- **state.warning:** `#FBBF24`
- **state.error:** `#EF4444`
- **state.info:** `#3B82F6`

## 6. Color Usage Contract

- **brand.primary:** Identity, symbol, selected brand accent.
- **action.primary:** Interactive actions.
- **text.primary:** Main readable content.
- **text.secondary:** Supporting content.
- **text.muted:** Muted/supporting UI only where validated usage remains readable.
- **link:** Inline/navigation links.
- **focus:** Focus indication.
- **state.\*:** Semantic state communication; never use as the sole communication channel.

**Important distinction for accessibility:** `#FF7A00` is the identity color. However, it is NOT the default LIGHT button/action background. The LIGHT accessible primary action color is `#C25700`. The Dark/Extra Dark action color is `#FF9E40`.

## 7. Typography

**Primary family:** `Inter`  
**Fallback contract:** `Inter, sans-serif`  
**Implementation:** `next/font/google` Inter

**Default BrandVersion typography:**
- **headingWeight:** `700`
- **bodyWeight:** `400`

**Typography utility scale (from `globals.css`):**
- `text-display`
- `text-heading-1`
- `text-heading-2`
- `text-heading-3`
- `text-body`
- `text-body-small`
- `text-ui`
- `text-meta`

Do not invent utilities absent from `globals.css`.

## 8. Spacing / Radius / Motion

The actual values defined in `app/globals.css`:
- **Spacing Grid:**
  - `--space-1`: 0.25rem
  - `--space-2`: 0.5rem
  - `--space-3`: 0.75rem
  - `--space-4`: 1rem
  - `--space-5`: 1.25rem
  - `--space-6`: 1.5rem
  - `--space-8`: 2rem
  - `--space-10`: 2.5rem
  - `--space-12`: 3rem
  - `--space-16`: 4rem
  - `--space-20`: 5rem
- **Content Max Width:** `--content-max` (1200px)
- **Wide Max Width:** `--content-wide` (1440px)
- **Responsive Gutters:** `--page-gutter-mobile` (1rem), `--page-gutter-tablet` (1.5rem), and `--page-gutter-desktop` (2rem)
- **Section Gaps:** `--section-gap-mobile` (3rem) and `--section-gap-desktop` (5rem)
- **Radius Scale:**
  - `--radius-xs`: 0.375rem
  - `--radius-sm`: 0.5rem
  - `--radius-md`: 0.625rem
  - `--radius-lg`: 0.75rem
  - `--radius-xl`: 1rem
  - `--radius-pill`: 999px
- **Shadow Scale:**
  - `--shadow-sm`: 0 1px 2px rgb(0 0 0 / 0.06)
  - `--shadow-md`: 0 4px 12px rgb(0 0 0 / 0.08)
  - `--shadow-lg`: 0 12px 30px rgb(0 0 0 / 0.12)
- **Touch Target:** `--touch-target-min` (2.75rem / 44px)
- **Motion Durations:**
  - `--duration-fast`: 120ms
  - `--duration-normal`: 180ms
  - `--duration-slow`: 240ms
- **Easing:**
  - `--ease-standard`: `cubic-bezier(0.2, 0, 0, 1)`
  - `--ease-emphasized`: `cubic-bezier(0.2, 0, 0, 1.2)`
- **Reduced-Motion Contract:** Enforced via media query targeting `@media (prefers-reduced-motion: reduce)`.

**Explicit prohibition:** `transition-all` is prohibited for ordinary Brand UI.

## 9. Theme Behavior

- **Light:** Default Synthesis mode.
- **Dark:** Explicitly supported.
- **Extra Dark:** Explicitly supported.
- **System:** May be explicitly selected by the user.

**Important:** Extra Dark must NOT be automatically selected solely from OS dark preference. The `ThemeProvider` behavior remains unchanged.

## 10. Accessibility Matrix

This matrix is generated directly from the production accessibility validator (`lib/domain/brand/accessibility.ts`) checking `SYNTHESIS_ORANGE_DEFAULT`.

| Mode | Pair | Foreground | Background | Ratio | Required | Result |
|---|---|---|---|---|---|---|
| light | text.primary / canvas | #1F1F1F | #FFFFFF | 16.48 | 4.5 | PASS |
| light | text.primary / surface | #1F1F1F | #F5F5F5 | 15.12 | 4.5 | PASS |
| light | text.muted / canvas | #737373 | #FFFFFF | 4.74 | 4.5 | PASS |
| light | action.primaryText / action.primary | #FFFFFF | #C25700 | 4.51 | 4.5 | PASS |
| light | link / canvas | #C25700 | #FFFFFF | 4.51 | 4.5 | PASS |
| light | focus / canvas | #000000 | #FFFFFF | 21.00 | 3.0 | PASS |
| light | focus / surface | #000000 | #F5F5F5 | 19.26 | 3.0 | PASS |
| dark | text.primary / canvas | #FFFFFF | #121212 | 18.73 | 4.5 | PASS |
| dark | text.primary / surface | #FFFFFF | #1E1E1E | 16.67 | 4.5 | PASS |
| dark | text.muted / canvas | #888888 | #121212 | 5.28 | 4.5 | PASS |
| dark | action.primaryText / action.primary | #121212 | #FF9E40 | 9.11 | 4.5 | PASS |
| dark | link / canvas | #FF9E40 | #121212 | 9.11 | 4.5 | PASS |
| dark | focus / canvas | #FFFFFF | #121212 | 18.73 | 3.0 | PASS |
| dark | focus / surface | #FFFFFF | #1E1E1E | 16.67 | 3.0 | PASS |
| extraDark | text.primary / canvas | #FFFFFF | #000000 | 21.00 | 4.5 | PASS |
| extraDark | text.primary / surface | #FFFFFF | #0A0A0A | 19.80 | 4.5 | PASS |
| extraDark | text.muted / canvas | #888888 | #000000 | 5.92 | 4.5 | PASS |
| extraDark | action.primaryText / action.primary | #000000 | #FF9E40 | 10.22 | 4.5 | PASS |
| extraDark | link / canvas | #FF9E40 | #000000 | 10.22 | 4.5 | PASS |
| extraDark | focus / canvas | #FFFFFF | #000000 | 21.00 | 3.0 | PASS |
| extraDark | focus / surface | #FFFFFF | #0A0A0A | 19.80 | 3.0 | PASS |

**ACCESSIBILITY_VALIDATOR_RESULT:** PASS

The production Brand validator passes all 21 currently enforced contrast checks for the built-in Synthesis brand.

## 11. Accessibility Limitations

The automated Brand validator does not currently certify every possible foreground/background combination.

In particular, state colors, arbitrary component compositions, large-text exceptions and user-authored PROJECT brand combinations must still follow component-level and Brand validation rules. 

## 12. Focus / Touch / Motion

- **Focus:** Visible focus is required. Focus cannot rely solely on color changes that disappear against the surface.
- **Touch:** Interactive mobile targets must be approximately/minimum `44px` where applicable (e.g., login buttons, inputs).
- **Motion:** Reduced motion preferences must be respected.
- **Semantics:** Semantics must not be communicated solely by color. Errors need text/role/other semantic indication (e.g., `role="alert"` in the login form).
- **Logo:** Decorative logo handling vs meaningful logo handling applies.

## 13. Brand Governance

When code and documentation disagree, the validated implementation is authoritative until an explicit versioned brand migration updates both.

**Authoritative Code/Data:**
- `lib/domain/brand/contracts.ts`
- `lib/domain/brand/accessibility.ts`
- `lib/domain/brand/runtime.ts`
- `components/brand/SynthesisLogo.tsx`
- `app/globals.css`
- `public/brand/synthesis/*`
