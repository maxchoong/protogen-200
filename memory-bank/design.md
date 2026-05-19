# MovieFlix Style Reference
> Movie discovery and conversational recommendation UI. Clean, cinematic, and task-focused.

**Theme Strategy:** dual theme (dark + light), default to dark

This design system supports both browsing and conversational query flows in the same product. The visual language stays restrained and cinematic, while the interaction model prioritizes clarity, quick refinement, and readable multi-turn exchanges.

## Scope

- Browsing surfaces: hero, grids, recommendation cards, detail actions
- Conversational surfaces: chat thread, intent chips, clarification questions, inline option picks
- Shared controls: form fields, buttons, badges, links, modal media playback

## Token Architecture

Use semantic tokens at component level and map them to theme values. Dark mode is the default via `:root`. Light mode is enabled with `[data-theme="light"]` on `html` or `body`.

### Core Palette

| Name | Value | Role |
|------|-------|------|
| Deep Black | `#0a0a0a` | Primary dark background |
| Dark Steel | `#1a1a1a` | Dark surface |
| Graphite | `#e8e8e8` | Primary text on dark |
| Snow | `#ffffff` | High-emphasis text |
| Light Slate | `#2d2d2d` | Dark border and muted control background |
| Mid Grey | `#444444` | Secondary text |
| Ash | `#666666` | Tertiary text and dividers |
| Neon Cyan | `#00d9ff` | Accent and focus color |
| Paper | `#f7f8fa` | Primary light background |
| Porcelain | `#ffffff` | Light surface |
| Ink | `#101114` | Primary text on light |
| Steel Blue | `#d7e2ea` | Light border and muted control background |

### Semantic Color Tokens

| Token | Dark (default) | Light |
|------|-----------------|-------|
| `--color-bg` | `#0a0a0a` | `#f7f8fa` |
| `--color-surface` | `#1a1a1a` | `#ffffff` |
| `--color-surface-2` | `#121212` | `#f1f4f8` |
| `--color-text` | `#e8e8e8` | `#101114` |
| `--color-text-muted` | `#666666` | `#4e5965` |
| `--color-border` | `#2d2d2d` | `#d7e2ea` |
| `--color-accent` | `#00d9ff` | `#00b7d8` |
| `--color-accent-contrast` | `#0a0a0a` | `#ffffff` |
| `--color-focus-ring` | `#00d9ff` | `#00b7d8` |

## Typography

### Primary Family

- Token: `--font-ui`
- Stack: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `system-ui`, `sans-serif`
- Weights: 500, 700, 800

### Monospace Family

- Token: `--font-mono`
- Stack: `SFMono-Regular`, `Menlo`, `Monaco`, `Consolas`, `monospace`
- Weights: 700, 800

### Type Scale and Tracking

| Token | Size | Line Height | Tracking |
|------|------|-------------|----------|
| `--text-xs` | 12px | 1.3 | `--tracking-xs: -0.25px` |
| `--text-base` | 16px | 1.45 | `--tracking-base: -0.10px` |
| `--text-lg` | 18px | 1.4 | `--tracking-lg: -0.15px` |
| `--text-2xl` | 28px | 1.2 | `--tracking-2xl: -0.70px` |

Use tighter tracking for headings and labels only. Keep body copy and synopsis near neutral tracking for readability.

## Spacing and Shape

### Spacing Scale

| Token | Value |
|------|-------|
| `--space-4` | 4px |
| `--space-8` | 8px |
| `--space-12` | 12px |
| `--space-16` | 16px |
| `--space-24` | 24px |
| `--space-32` | 32px |

### Radii

| Token | Value | Use |
|------|-------|-----|
| `--radius-sm` | 6px | Inputs, chips |
| `--radius-md` | 8px | Buttons |
| `--radius-lg` | 12px | Cards |
| `--radius-pill` | 999px | Intent badges and tag pills |

### Elevation

- Card shadow: `0 0 20px rgba(0, 217, 255, 0.05)`
- Card hover shadow: `0 0 28px rgba(0, 217, 255, 0.12)`
- Keep shadows soft and color-tinted, not heavy black drop shadows.

## Interaction and Accessibility

- Minimum touch target: 44px by 44px for tappable controls
- Focus-visible: 2px outline using `--color-focus-ring` with 2px offset
- Maintain WCAG AA contrast in both themes
- Use motion sparingly; support reduced-motion by disabling non-essential transitions
- Keep keyboard flow intact for chat input, option chips, and modal close actions

## Component Patterns

### Browsing Components

1. Primary CTA button
- Background `--color-surface-2`
- Text `--color-text`
- Radius `--radius-md`
- Padding: 8px 16px
- Hover: border or glow with `--color-accent`

2. Recommendation card
- Background `--color-surface`
- Border: 1px solid `--color-border`
- Radius `--radius-lg`
- Includes title, type/year, synopsis, why-this, availability, trailer action

3. Poster media card
- Background `--color-surface`
- Border and subtle glow on hover
- Avoid distortion: object-fit cover with consistent aspect ratio

### Conversational Components

1. User message bubble
- Align right
- Background: accent-tinted surface
- Text must pass contrast in both themes

2. Assistant message bubble
- Align left
- Background: `--color-surface`
- Include metadata row for detected mode and confidence when available

3. Intent chip
- Pill shape (`--radius-pill`)
- Neutral background by default
- Active state uses `--color-accent` with high-contrast text

4. Clarification question block
- Card container with concise prompt
- Supports select chips, free-text response, and boolean choices
- Show one primary next action to prevent decision overload

5. Inline option chips
- Compact, keyboard-focusable chip controls
- Distinct selected, hover, focus, and disabled states

6. Conversation composer
- Multi-line textarea with visible label
- Enter submits, Shift+Enter inserts newline
- Show loading and disabled states clearly

## Layout Guidance

- Default layout supports conversational-first home screen
- Secondary browsing modules (trending, examples, results) appear as supporting sections
- On mobile, increase vertical spacing and reduce horizontal density
- Keep line length readable for synopsis and assistant responses (about 60 to 75 characters where possible)

## Do and Do Not

### Do

- Default to dark theme while keeping light theme parity for all components
- Use semantic tokens, not hard-coded hex values in components
- Keep accent color reserved for interaction, focus, and key highlights
- Ensure conversation components follow the same spacing and typography system as cards
- Verify keyboard, screen reader labels, and focus order for conversational controls

### Do Not

- Do not add new accent colors without updating semantic token mappings
- Do not rely on color alone to indicate selected conversational options
- Do not use dense 2px gaps between all interactive elements on mobile
- Do not introduce Tailwind v4-only syntax while the app remains on Tailwind v3

## Quick Start

### CSS Custom Properties

```css
:root {
  color-scheme: dark;

  /* Theme: dark default */
  --color-bg: #0a0a0a;
  --color-surface: #1a1a1a;
  --color-surface-2: #121212;
  --color-text: #e8e8e8;
  --color-text-muted: #666666;
  --color-border: #2d2d2d;
  --color-accent: #00d9ff;
  --color-accent-contrast: #0a0a0a;
  --color-focus-ring: #00d9ff;

  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --text-xs: 12px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-2xl: 28px;

  --tracking-xs: -0.25px;
  --tracking-base: -0.10px;
  --tracking-lg: -0.15px;
  --tracking-2xl: -0.70px;

  --space-4: 4px;
  --space-8: 8px;
  --space-12: 12px;
  --space-16: 16px;
  --space-24: 24px;
  --space-32: 32px;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 999px;
}

[data-theme="light"] {
  color-scheme: light;

  --color-bg: #f7f8fa;
  --color-surface: #ffffff;
  --color-surface-2: #f1f4f8;
  --color-text: #101114;
  --color-text-muted: #4e5965;
  --color-border: #d7e2ea;
  --color-accent: #00b7d8;
  --color-accent-contrast: #ffffff;
  --color-focus-ring: #00b7d8;
}
```

### Tailwind v3 Mapping

Use the existing Tailwind v3 setup and map theme tokens through `tailwind.config.js`.

```js
// tailwind.config.js (v3 style)
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        text: "var(--color-text)",
        "text-muted": "var(--color-text-muted)",
        border: "var(--color-border)",
        accent: "var(--color-accent)",
        "accent-contrast": "var(--color-accent-contrast)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      fontFamily: {
        sans: ["var(--font-ui)"],
        mono: ["var(--font-mono)"],
      },
      boxShadow: {
        card: "0 0 20px rgba(0, 217, 255, 0.05)",
        "card-hover": "0 0 28px rgba(0, 217, 255, 0.12)",
      },
    },
  },
  plugins: [],
};
```

## Design Prompt Guide

1. Create a clarification question card for conversational flow with a prompt, 3 option chips, and one primary continue button. Use semantic color tokens and strong keyboard focus styles.
2. Create assistant and user message bubbles with mode/confidence metadata chips. Ensure both dark and light themes maintain WCAG AA contrast.
3. Create a recommendation card with poster, why-this copy, availability chips, and trailer action, using `--radius-lg` and soft cyan-tinted shadows.

## Similar Product References

- Netflix: high-contrast media-first hierarchy
- Letterboxd: dense discovery surfaces and list scanning
- TMDB: efficient content browsing layout
- Linear: disciplined tokenized UI language

---

**Version:** 1.1
**Last Updated:** May 19, 2026
**Platform:** Web
**Color Modes:** Dark (default), Light