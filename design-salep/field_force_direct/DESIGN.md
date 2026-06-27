---
name: Field Force Direct
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#434652'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#747783'
  outline-variant: '#c4c6d4'
  surface-tint: '#2f59b7'
  primary: '#00296d'
  on-primary: '#ffffff'
  primary-container: '#003d9b'
  on-primary-container: '#91afff'
  inverse-primary: '#b2c5ff'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#422700'
  on-tertiary: '#ffffff'
  tertiary-container: '#613b00'
  on-tertiary-container: '#f49d0a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001848'
  on-primary-fixed-variant: '#08409e'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 30px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  title-md:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  price-display:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '800'
    lineHeight: 24px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  touch-target-min: 48px
  container-padding: 16px
---

## Brand & Style

The design system is engineered for high-velocity field operations within the FMCG sector. The brand personality is **authoritative, efficient, and reliable**, designed to instill confidence in sales representatives managing high-volume transactions under varied lighting conditions. 

The aesthetic follows a **High-Contrast Modern** approach. It prioritizes extreme legibility and "fat-finger" accessibility to minimize input errors during site visits. Visual clutter is stripped away in favor of purposeful whitespace and clear structural grouping. The emotional response should be one of professional utility—a tool that works as hard as the person using it.

## Colors

This design system utilizes a high-contrast palette to ensure outdoor readability.

- **Primary (#003D9B):** A deep, trustworthy blue used for core actions, navigation states, and brand presence.
- **Success (#10B981):** "Đã duyệt" (Approved) status and positive growth indicators.
- **Warning (#F59E0B):** "Chờ duyệt" (Pending) status and inventory alerts.
- **Error (#EF4444):** "Từ chối" (Rejected) status and critical validation errors.
- **Neutral/Surface:** We use a refined scale of grays to separate the canvas from interactive cards. The background remains pure white to maximize screen brightness.

## Typography

The design system employs **Manrope** for its excellent Vietnamese diacritic rendering and modern, geometric structure. 

- **Hierarchy:** Use `display-lg` for daily sales targets or total amounts.
- **Data Density:** `body-sm` is reserved for secondary metadata in lists (e.g., SKU numbers, timestamps).
- **Pricing:** A specific `price-display` role is defined to ensure financial figures are the most prominent element in order summaries.
- **Language:** All Vietnamese text should maintain standard sentence casing, except for `label-caps` used in table headers or small metadata tags.

## Layout & Spacing

This is a **Mobile-First Fluid Grid** system. 

- **Mobile (Screens 1-6):** Use a single-column layout with 16px side margins. Elements are stacked vertically to prioritize thumb-reach.
- **Desktop (Screens 7-8):** Transition to a 12-column fixed grid (max-width 1200px) for administrative and reporting views.
- **Spacing Rhythm:** Based on an 8px scale, with a 12px "half-step" used specifically for card internal padding and tight component groupings.
- **Touch Targets:** Every interactive element (buttons, checkboxes, list items) must maintain a minimum height/width of 48px to accommodate rapid field use.

## Elevation & Depth

The design system uses **Tonal Layers and Low-Contrast Outlines** rather than heavy shadows to maintain a clean, "app-like" feel.

- **Level 0 (Background):** Pure white (#FFFFFF).
- **Level 1 (Cards/Surfaces):** Light Gray (#F8FAFC) or White with a 1px border (#E2E8F0).
- **Level 2 (Active/Floating):** Use a very soft, diffused shadow (0px 4px 12px rgba(0, 0, 0, 0.05)) for sticky bottom navigation bars and primary action buttons.
- **Interaction:** On tap/press, cards should slightly darken or show a subtle inset stroke to provide immediate tactile feedback.

## Shapes

The shape language is **Rounded and Friendly**, yet structured.

- **Primary Radius:** 12px (0.75rem) for cards, input fields, and large buttons. This provides a modern look that feels ergonomic.
- **Small Radius:** 6px for tags, status badges, and small icons.
- **Pill Shape:** Used exclusively for status indicators (e.g., "Đã duyệt") to distinguish them from actionable buttons.

## Components

### Buttons
- **Primary Action:** Solid #003D9B background, white text, 48px minimum height. Usually sticky to the bottom of the viewport.
- **Secondary Action:** Ghost style with #003D9B border and text.

### Navigation
- **Bottom Bar:** Fixed to the bottom. 4-5 icons with labels. Active state uses the Primary color; inactive uses Neutral.

### Cards & Lists
- **Order Cards:** Feature a thumbnail of the primary SKU (48x48px), the shop name in `title-md`, and a status badge in the top right.
- **Spacing:** 12px vertical gap between list items.

### Forms & Inputs
- **Input Fields:** 12px rounded corners, 1px border (#CBD5E1). Labels are always visible above the field (never just placeholders).
- **Camera Upload:** Large dashed-border box with a centered camera icon, optimized for capturing "Cửa hàng" (Storefront) or "Hóa đơn" (Invoice) photos.

### Status Badges
- **Đã duyệt:** Green background (10% opacity) with Green text.
- **Chờ duyệt:** Amber background (10% opacity) with Amber text.
- **Từ chối:** Red background (10% opacity) with Red text.