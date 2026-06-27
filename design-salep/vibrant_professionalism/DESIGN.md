---
name: Vibrant Professionalism
colors:
  surface: '#f9f9ff'
  surface-dim: '#d2daf0'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e0e8ff'
  surface-container-highest: '#dbe2f9'
  on-surface: '#141b2c'
  on-surface-variant: '#5c403b'
  inverse-surface: '#293041'
  inverse-on-surface: '#edf0ff'
  outline: '#906f6a'
  outline-variant: '#e5bdb7'
  surface-tint: '#bc140d'
  primary: '#b50c08'
  on-primary: '#ffffff'
  primary-container: '#d92d20'
  on-primary-container: '#fff6f5'
  inverse-primary: '#ffb4a8'
  secondary: '#7a5900'
  on-secondary: '#ffffff'
  secondary-container: '#febf23'
  on-secondary-container: '#6d4f00'
  tertiary: '#973d2d'
  on-tertiary: '#ffffff'
  tertiary-container: '#b75443'
  on-tertiary-container: '#fff7f5'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad5'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930002'
  secondary-fixed: '#ffdea2'
  secondary-fixed-dim: '#fbbc1f'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5c4200'
  tertiary-fixed: '#ffdad4'
  tertiary-fixed-dim: '#ffb4a6'
  on-tertiary-fixed: '#400200'
  on-tertiary-fixed-variant: '#7f2a1d'
  background: '#f9f9ff'
  on-background: '#141b2c'
  surface-variant: '#dbe2f9'
typography:
  headline-xl:
    fontFamily: Manrope
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-sm:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  headline-xl-mobile:
    fontFamily: Manrope
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg-mobile:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  3xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is engineered for high-impact professional environments, balancing the urgency of a bold primary red with the warmth of a gold secondary accent. The target audience is modern enterprise users who require clarity, speed, and a sense of reliability. 

The design style is **Corporate / Modern**, leaning into a structured, clean aesthetic that utilizes generous white space and high-contrast elements to drive focus. The emotional response should be one of confidence and precision—where the UI feels both energetic and grounded. It avoids unnecessary ornamentation in favor of crisp layouts and purposeful color application.

## Colors

The palette is centered around a **Vibrant Corporate Red** (`#D92D20`) which serves as the primary action color for buttons, critical states, and brand highlights. To balance the intensity of the red, a **Warm Gold** (`#F7B91A`) is used for secondary accents, warning states, and high-visibility markers.

The neutral palette is grounded in a deep charcoal (`#101828`) to maintain high legibility. Surfaces utilize a warm-tinted grayscale to harmonize with the red and gold tones, ensuring the interface feels cohesive rather than sterile. Accessibility is prioritized by ensuring that the primary red maintains a 4.5:1 contrast ratio against white backgrounds for text, and the gold is used primarily for non-text UI elements or paired with dark neutrals.

## Typography

This design system exclusively uses **Manrope** to maintain a modern, geometric, yet highly legible appearance. The typography scales from bold, impactful headlines for information hierarchy to clean, functional body text for data-heavy views.

- **Headlines:** Use Bold (700) or SemiBold (600) weights with slightly tightened letter spacing for a more authoritative look.
- **Body Text:** Use Regular (400) weight for maximum readability.
- **Labels:** Use SemiBold (600) for UI controls, navigation, and metadata to distinguish them clearly from prose.
- **Mobile Adjustments:** Larger display type is scaled down for mobile to maintain clear hierarchy without overwhelming the viewport.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** model built on a 4px baseline. Most components and layouts should adhere to an 8-point rhythm (8px, 16px, 24px, etc.) for vertical and horizontal consistency.

- **Desktop:** A 12-column grid with 24px gutters. Max content width is 1280px.
- **Tablet:** An 8-column grid with 16px gutters and margins.
- **Mobile:** A 4-column grid with 16px gutters and margins.

Spacing should be used to create clear logical groupings. Use larger spacing (32px+) to separate distinct sections, and smaller spacing (8px-12px) for related elements within a card or container.

## Elevation & Depth

This design system uses **Tonal Layers** and **Low-Contrast Outlines** to define depth. Instead of aggressive shadows, hierarchy is established through surface color shifts.

- **Level 0 (Background):** Pure white or `#F9FAFB`.
- **Level 1 (Cards/Containers):** White surface with a 1px solid border in `#EAECF0`.
- **Level 2 (Dropdowns/Popovers):** White surface with a subtle, diffused shadow (0px 4px 12px, 5% opacity charcoal) to lift it off the page.
- **Level 3 (Modals):** High-contrast overlay with a centered container to focus the user’s attention.

Avoid using heavy black shadows; instead, use slightly tinted shadows that pull from the neutral charcoal palette to maintain a clean, professional feel.

## Shapes

The design system utilizes a **Rounded** shape language to soften the intensity of the high-contrast color palette.

- **Standard Elements:** 12px (0.75rem) corner radius for buttons, input fields, and small containers.
- **Large Elements:** 16px (1rem) corner radius for cards and modals.
- **Small Elements:** 4px or 8px for chips and tags where space is limited.

This consistency in rounding ensures the UI feels approachable and modern, providing a tactile quality that balances the "Corporate" brand personality.

## Components

The components reflect the bold, structured nature of the design system.

- **Buttons:** Primary buttons use the Corporate Red background with white text. Secondary buttons use a white background with a Corporate Red border and text. Ghost buttons use Red text with no background.
- **Chips:** Small, 8px rounded elements. Use the Warm Gold background with a deep neutral text for status indicators or high-priority tags.
- **Inputs:** 12px rounded borders in a soft neutral grey (`#D0D5DD`). On focus, the border shifts to the primary Corporate Red with a subtle 2px glow.
- **Cards:** 16px rounded corners with a 1px `#EAECF0` border. Headlines inside cards should be SemiBold for clarity.
- **Lists:** Clean rows separated by a 1px border. Use the Warm Gold as a subtle highlight color for hover states or active selection indicators on the left edge.
- **Checkboxes & Radios:** Use the Primary Red for active/checked states to ensure they are the clear focal point of the interaction.