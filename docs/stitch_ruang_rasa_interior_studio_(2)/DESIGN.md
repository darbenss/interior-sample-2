---
name: Ruang Rasa
colors:
  surface: '#faf9f6'
  surface-dim: '#dadad7'
  surface-bright: '#faf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f4f1'
  surface-container: '#eeeeeb'
  surface-container-high: '#e8e8e5'
  surface-container-highest: '#e3e3e0'
  on-surface: '#1a1c1a'
  on-surface-variant: '#444748'
  inverse-surface: '#2f312f'
  inverse-on-surface: '#f1f1ee'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#010101'
  on-primary: '#ffffff'
  primary-container: '#1c1c1c'
  on-primary-container: '#858484'
  inverse-primary: '#c8c6c5'
  secondary: '#775a19'
  on-secondary: '#ffffff'
  secondary-container: '#fed488'
  on-secondary-container: '#785a1a'
  tertiary: '#010202'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1d1b'
  on-tertiary-container: '#848583'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#e9c176'
  on-secondary-fixed: '#261900'
  on-secondary-fixed-variant: '#5d4201'
  tertiary-fixed: '#e2e3e0'
  tertiary-fixed-dim: '#c6c7c4'
  on-tertiary-fixed: '#1a1c1b'
  on-tertiary-fixed-variant: '#454745'
  background: '#faf9f6'
  on-background: '#1a1c1a'
  surface-variant: '#e3e3e0'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 80px
    fontWeight: '400'
    lineHeight: 90px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 54px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 56px
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
  headline-md:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
  body-lg:
    fontFamily: Montserrat
    fontSize: 18px
    fontWeight: '300'
    lineHeight: 32px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Montserrat
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 28px
  label-caps:
    fontFamily: Montserrat
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.15em
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 32px
  margin-mobile: 24px
  section-gap: 160px
---

## Brand & Style

The design system is built upon a high-end editorial aesthetic that mirrors the tactile luxury of contemporary Asian interior design. It targets a discerning audience seeking tranquility, architectural precision, and cultural depth. The brand personality is poised, intellectual, and intentionally quiet, allowing the architectural photography to command the narrative.

The visual style merges **Minimalism** with **Modern Editorial** cues. It utilizes a vast "spatial silence" (whitespace) to frame content as if it were a curated gallery exhibition. Key characteristics include:
- **Asymmetrical Balance:** Breaking the rigid grid to create a sense of organic movement and bespoke craftsmanship.
- **Overlapping Elements:** Subtle layering of typography over imagery to create physical depth and a "layered" material feel.
- **Micro-interactions:** Transitions should be slow and intentional, mimicking the deliberate pace of luxury living.

## Colors

The palette is rooted in the "Alabaster" foundation, providing a warm, breathable canvas that avoids the clinical coldness of pure white. 

- **Deep Charcoal (#1C1C1C):** Used for all core communication. It provides the "ink" on the page, ensuring high legibility and an authoritative tone.
- **Muted Brass (#C5A059):** This is a functional accent. Use it for "moments of intent"—a single border under a heading, a primary action, or a delicate active state indicator. It should never overwhelm the page.
- **Soft Neutrals:** Utilize subtle shifts between Alabaster and slightly deeper beige tones to define sections without the need for harsh lines.

## Typography

This design system relies on a high-contrast typographic pairing. **Playfair Display** provides the editorial soul—its high-contrast strokes and elegant serifs evoke the feeling of a premium printed masthead. It should be used for large titles and pull quotes.

**Montserrat** acts as the functional counterpart. To maintain the luxury feel, use lighter weights (300/400) for body copy with generous line heights to ensure the text feels airy and readable.

**Key Rule:** Large display headings should use tighter letter spacing to feel "locked," while small labels and navigational elements should use increased letter spacing for a sophisticated, technical look.

## Layout & Spacing

The layout philosophy follows a **Fluid Grid** with intentional breaks. On desktop, use a 12-column grid with wide 32px gutters.

- **Masonry Grids:** Images should not be uniform. Mix vertical (4:5) and horizontal (3:2) aspect ratios to create a rhythmic, magazine-style flow.
- **Asymmetrical Offsets:** Use "Pull-quotes" or "Featured Images" that offset from the main container by 1-2 columns to create visual interest.
- **Breathable Sections:** Use extreme vertical padding (160px+) between major sections. This forces the user to slow down and appreciate each "room" of the digital experience.
- **Mobile Reflow:** On mobile, move to a 4-column grid. Ensure that overlapping elements are simplified into a vertical stack to maintain legibility while keeping the "layered" feel through background color shifts.

## Elevation & Depth

This system avoids traditional shadows to maintain its flat, editorial integrity. Depth is instead achieved through:
- **Tonal Layering:** Placing a deep charcoal element over an alabaster surface creates an immediate foreground/background relationship.
- **Glassmorphism (Selective):** For navigation bars only, use a high-blur (20px) backdrop filter with a 90% opacity Alabaster tint. This creates a "frosted linen" effect that feels tactile and premium.
- **Strict Outlines:** Instead of shadows, use 1px solid borders in the "Neutral" or "Brass" colors to define interactive zones. This keeps the interface feeling architectural and precise.

## Shapes

The design system employs a **Sharp (0)** roundedness strategy. Sharp corners communicate architectural precision, structural integrity, and high-end sophistication. 

- **Hard Edges:** All buttons, input fields, and image containers must have 0px border-radius.
- **Exception:** Small icons or circular buttons (like a "Scroll to Top" or a play button) may use a full pill shape to provide a soft contrast to the otherwise rigid geometry.

## Components

### Buttons
- **Primary:** Deep Charcoal background, Alabaster text, 0px radius. On hover, the background shifts to Muted Brass.
- **Secondary/Ghost:** 1px Deep Charcoal border, no fill. Text is Montserrat bold caps.

### Navigation
- Top navigation should be minimal. Use Montserrat for links with a 1px Brass underline that appears on hover/active states. The logo should always be in Playfair Display.

### Form Fields (High-End)
- Use **Floating Labels**. The input is a single 1px Charcoal line at the bottom. The label is Montserrat, which shrinks and moves up when the field is active. No background fill for inputs.

### Cards & Imagery
- Images should use `object-fit: cover`. 
- Every image should have a subtle "Material Label" — a small, absolute-positioned Montserrat label in the corner denoting the material or location (e.g., "TEAK / BALI").

### Footer
- High-contrast Deep Charcoal background (#1C1C1C) with Alabaster text. This creates a "grounding" effect for the page. Use a 3-column layout for links, contact info, and social icons.