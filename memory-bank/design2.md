# Lazy Movie Advisor Style Reference
> Subdued command center for cinematic discovery and conversation.

**Theme strategy:** dark-first with light-theme parity

This document keeps the Lazy visual language as the base system while describing the app-specific conversation and recommendation patterns that already exist in the product. The result should feel quiet, disciplined, and content-first, not flashy or highly saturated.

## Scope

- Conversational home screen and clarification flow
- Recommendation cards, availability chips, and trailer actions
- Shared controls: chips, inputs, buttons, badges, loading states, and modal media playback
- Theme tokens and Tailwind 3 mapping for the current app stack

## Design Principles

- Prioritize content over decoration.
- Use deep, muted surfaces, crisp borders, and sharp typography.
- Keep accent usage sparse and functional.
- Preserve accessibility across dark and light themes.
- Support conversation without collapsing into a generic chat layout.

## Token Architecture

Use semantic tokens in components and map them to theme values. Dark mode is the default visual language. Light mode is enabled with `data-theme="light"` on `html` or `body` and should preserve contrast, spacing, and hierarchy without changing the overall system.

### Core Palette

| Name | Value | Role |
|------|-------|------|
| Midnight Ink | `#0a0a0a` | Deepest surface background, text on light elements, subtle shadow anchor |
| Carbon Gray | `#26272c` | Primary page background and broad surfaces |
| Slate Surface | `#1a1b1f` | Elevated card backgrounds, inputs, message containers |
| Ash Gray | `#3b3c3e` | Subtle elevated surface and hover state |
| Ghost Border | `#8a8c93` | Borders, separators, outlines, and structural chrome |
| Whisper Gray | `#62646a` | Secondary text, metadata, and icon strokes |
| Muted Text | `#535355` | Placeholder text and very subtle labels |
| Callout Text | `#e0e0e0` | Body text and primary content on dark surfaces |
| Pure White | `#ffffff` | Light surface text, dividers, and edge highlights |
| Accent Cyan | `#00d9ff` | Functional emphasis for focus, user message surfaces, and active intent states |

### Semantic Color Tokens

| Token | Dark default | Light |
|------|--------------|-------|
| `--color-bg` | `#26272c` | `#f7f8fa` |
| `--color-surface` | `#1a1b1f` | `#ffffff` |
| `--color-surface-2` | `#3b3c3e` | `#f1f4f8` |
| `--color-text` | `#e0e0e0` | `#101114` |
| `--color-text-muted` | `#62646a` | `#4e5965` |
| `--color-border` | `#8a8c93` | `#d7e2ea` |
| `--color-accent` | `#00d9ff` | `#00b7d8` |
| `--color-accent-contrast` | `#0a0a0a` | `#ffffff` |
| `--color-focus-ring` | `#00d9ff` | `#00b7d8` |

## Typography

### Primary Family

- Token: `--font-inter`
- Stack: `Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`, `sans-serif`
- Weights: 300, 400, 500, 600

### Display Family

- Token: `--font-migra`
- Stack: `Migra`, `ui-serif`, `Georgia`, `serif`
- Weight: 500
- Use sparingly for large hero headlines and editorial emphasis.

### Type Scale

| Token | Size | Line Height | Tracking | Use |
|------|------|-------------|----------|-----|
| `--text-caption` | 11px | 1.5 | -0.004px | Metadata, helper copy, intent labels |
| `--text-base` | 14px | 1.45 | -0.010px | Body copy and conversation text |
| `--text-heading` | 20px | 1.25 | -0.031px | Section headings and card titles |
| `--text-heading-lg` | 24px | 1.23 | -0.036px | Hero supporting headings |
| `--text-display` | 58px | 1.09 | 0.048px | Large hero or featured statement |

Keep body copy readable and avoid over-tight tracking outside headings and labels.

## Spacing and Shape

### Spacing Scale

| Token | Value |
|------|-------|
| `--spacing-4` | 4px |
| `--spacing-8` | 8px |
| `--spacing-12` | 12px |
| `--spacing-16` | 16px |
| `--spacing-20` | 20px |
| `--spacing-24` | 24px |
| `--spacing-32` | 32px |
| `--spacing-40` | 40px |
| `--spacing-44` | 44px |
| `--spacing-48` | 48px |

### Layout Rhythm

- Page max width: 1200px
- Section gap: 40px
- Card padding: 14px
- Element gap: 14px

### Radii

| Element | Value |
|---------|-------|
| buttons | 4px |
| inputs | 4px |
| cards | 8px |
| badges | 22px |
| pills | 48px |

### Elevation

- Card shadow: `rgba(0, 0, 0, 0.12) 0px 12px 12px 0px`
- Soft hover shadow: `rgba(4, 4, 7, 0.25) 0px 2px 4px 0px, rgba(4, 4, 7, 0.4) 0px 8px 24px 0px`
- Keep shadows subtle and restrained. Do not use heavy glow as a default surface treatment.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Base Canvas | `#26272c` | Main page background |
| 1 | Input / Elevated Base | `#1a1b1f` | Inputs, message bubbles, cards |
| 2 | Interactive Card | `#3b3c3e` | Hoverable or active containers |
| 3 | Highlight Surface | `#00d9ff` | Reserved for user message fill, focus states, and active chips when needed |

## Component Patterns

### Browsing Components

1. Recommendation card
- Background: `--color-surface`
- Border: 1px solid `--color-border`
- Radius: `--radius-cards`
- Includes title, type/year, synopsis, why-this, availability, and trailer action

2. Poster media card
- Use consistent aspect ratio with object-fit cover
- Keep media tightly cropped and framed within the card
- Apply only a subtle hover border or shadow change

3. Availability chip
- Use a neutral pill shape with compact text
- Show subscription, rent, buy, or free-with-ads state clearly

### Conversational Components

1. User message bubble
- Align right
- Background: accent-cyan or accent-tinted surface
- Text must remain readable in both themes
- Keep the bubble compact and easy to scan

2. Assistant message bubble
- Align left
- Background: `--color-surface`
- Border: 1px solid `--color-border`
- Include optional metadata row for detected mode and confidence

3. Intent chip
- Pill shape with neutral border by default
- Active state uses `--color-accent` with high-contrast text
- Keep chips keyboard focusable and readable at small sizes

4. Clarification question block
- Card container with concise prompt and short context line
- Supports select chips, free text, and boolean choices
- Show one primary next action instead of many competing controls

5. Inline option chips
- Compact, focusable chip controls
- Distinct selected, hover, focus, and disabled states
- Avoid relying on color alone for selection state

6. Conversation composer
- Multi-line textarea with visible label
- Enter submits, Shift+Enter inserts a newline
- Keep loading and disabled states obvious without jumping layout

7. Pending response indicator
- Render a pending assistant bubble immediately after the latest user message
- Use concise copy such as "Generating response", then "Still working on this request", then a slower-response helper line if delay persists
- Include low-amplitude animated dots only while motion is allowed
- Show a non-destructive cancel or retry action for delayed responses

8. Error state
- Replace the pending indicator with inline assistant-area error text
- Provide a clear retry action near the failed response
- Preserve prior messages and clarification context

## Accessibility and Interaction

- Minimum touch target: 44px by 44px for tappable controls
- Focus-visible: 2px outline using `--color-focus-ring` with 2px offset
- Announce pending, delayed, and failed states with an `aria-live="polite"` region
- Support reduced-motion by disabling non-essential animation
- Keep keyboard flow intact for chips, composer, modal close actions, and retry controls
- Do not use emoji or emoticons in UI text, labels, placeholders, or system messages

## Do and Do Not

### Do
- Use Carbon Gray as the default background and Slate Surface for elevated content.
- Keep Ghost Border as the primary separator color.
- Use Inter for most UI and Migra only where a headline needs editorial emphasis.
- Preserve the conversational components already in the app.
- Keep accent color reserved for functional states: focus, active intent, user bubbles, and pending emphasis.
- Maintain WCAG AA contrast in both themes.
- Use Tailwind 3 utilities and theme extension mapping.

### Do Not
- Do not add new accent colors without updating semantic token mappings.
- Do not make accent cyan the dominant visual theme.
- Do not introduce Tailwind 4-only syntax while the app remains on Tailwind 3.
- Do not use heavy drop shadows or bright decorative glows as a default treatment.
- Do not rely on color alone to signal selected chips, pending states, or failure.
- Do not use generic system fonts as the primary design language.

## Imagery and Layout

The imagery should stay sparse and tightly framed, with posters and trailers treated as contained media elements rather than full-bleed decoration. Use subtle gradients and localized depth only where they help the eye settle. The page should remain centered, readable, and efficient, with conversational content on top and browsing modules as supporting sections below.

## Quick Start

### CSS Custom Properties

```css
:root {
  color-scheme: dark;

  --color-bg: #26272c;
  --color-surface: #1a1b1f;
  --color-surface-2: #3b3c3e;
  --color-text: #e0e0e0;
  --color-text-muted: #62646a;
  --color-border: #8a8c93;
  --color-accent: #00d9ff;
  --color-accent-contrast: #0a0a0a;
  --color-focus-ring: #00d9ff;

  --font-inter: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-migra: Migra, ui-serif, Georgia, serif;

  --text-caption: 11px;
  --text-base: 14px;
  --text-heading: 20px;
  --text-heading-lg: 24px;
  --text-display: 58px;

  --tracking-caption: -0.004px;
  --tracking-base: -0.010px;
  --tracking-heading: -0.031px;
  --tracking-heading-lg: -0.036px;
  --tracking-display: 0.048px;

  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-44: 44px;

  --radius-md: 4px;
  --radius-lg: 8px;
  --radius-badge: 22px;
  --radius-pill: 48px;

  --shadow-card: rgba(0, 0, 0, 0.12) 0px 12px 12px 0px;
  --shadow-soft: rgba(4, 4, 7, 0.25) 0px 2px 4px 0px, rgba(4, 4, 7, 0.4) 0px 8px 24px 0px;
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

### Tailwind 3 Mapping

Use the existing Tailwind 3 setup and map theme tokens through `tailwind.config.js`.

```js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-2': 'var(--color-surface-2)',
        text: 'var(--color-text)',
        'text-muted': 'var(--color-text-muted)',
        border: 'var(--color-border)',
        accent: 'var(--color-accent)',
        'accent-contrast': 'var(--color-accent-contrast)'
      },
      borderRadius: {
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        badge: 'var(--radius-badge)',
        pill: 'var(--radius-pill)'
      },
      fontFamily: {
        sans: ['var(--font-inter)'],
        serif: ['var(--font-migra)']
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        soft: 'var(--shadow-soft)'
      }
    }
  },
  plugins: []
}
```

## Example Component Prompts

- Create a clarification question card with a muted prompt, three option chips, and one primary continue button. Use Lazy-style borders, small radius values, and strong focus rings.
- Create assistant and user message bubbles with intent metadata chips. Keep the layout compact, readable, and accessible in dark and light themes.
- Create a recommendation card with poster, why-this copy, availability chips, and a trailer action. Use subtle shadows and avoid bright cinematic glow.
- Create a pending assistant bubble with animated dots, delayed-response helper copy, and a cancel action. Respect reduced-motion settings.

## Similar References

- Superhuman: keyboard-first efficiency and subtle motion
- Linear: disciplined spacing and restrained surfaces
- Raycast: command-center clarity with sharp focus behavior
- Figma: dense but legible tool and content hierarchy

## Version

**Version:** 2.0
**Last Updated:** May 22, 2026
**Platform:** Web
**Color Modes:** Dark (default), Light
