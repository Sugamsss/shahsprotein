# Shah's Nutrition — Complete Build Plan

> **Stack**: React 18 + TypeScript + Vite + Vanilla CSS + Lucide Icons  
> **Commit convention**: `[Phase.Sprint.Stage.Task] short description`  
> **Workflow**: One chat per task. Stage checkpoint = low-intelligence review. Sprint checkpoint = medium-intelligence review. Phase checkpoint = high-intelligence review.

---

## How To Use This Plan

1. **Per task** → open a new chat, tell it "execute task X.X.X.X from `BUILD_PLAN.md`". The task description contains everything needed.
2. **Stage checkpoint** → open a new chat, tell it "run the Stage X.X.X checkpoint from `BUILD_PLAN.md`".
3. **Sprint checkpoint** → open a new chat (medium model), tell it "run the Sprint X.X checkpoint from `BUILD_PLAN.md`".
4. **Phase checkpoint** → open a new chat (high model), tell it "run the Phase X checkpoint from `BUILD_PLAN.md`".
5. **Always read [`AGENTS.md`](.agents/AGENTS.md) and [`SPEC.md`](SPEC.md) before touching any file.**

---

## Reference Files (read before any task)

| File | Purpose |
|------|---------|
| `.agents/AGENTS.md` | Mandatory architectural rules — read first, every time |
| `SPEC.md` | Full product spec: color palettes, component contracts, section breakdown |
| `Design/Dark Mode.png` | Dark theme reference design (pixel truth) |
| `Design/Light Mode.png` | Light theme reference design (pixel truth) |
| `Design/Logo.png` | Brand logo source file |
| `Design/Logos.png` | All logo variant references |
| `Assets/ASSET_GENERATION_SPEC.md` | Exact AI prompts + specs for every image asset |
| `public/assets/ASSET_GENERATION_SPEC.md` | Same spec, served from public |

---

## Current State Snapshot (as of plan creation)

### ✅ Already Built & Compiles Clean
- Vite 5 + React 18 + TypeScript (strict), `@/` path alias
- Design tokens: `src/styles/tokens.css` — fonts, spacing, radii, transitions
- Theme system: `src/styles/dark-theme.css`, `src/styles/light-theme.css`, `ThemeContext`, `data-theme` FOUC prevention
- Global CSS reset: `src/styles/global.css` — `.glass-card`, `.text-gradient` utilities
- Type system: `src/types/` — `Product`, `FAQItem`, `BrandValue`, `Theme`, `WaitlistSubmission/Response/Context`
- Data layer: `src/data/` — `products.ts`, `faqs.ts`, `values.ts`, `siteConfig.ts` (all populated)
- Contexts: `ThemeContext`, `WaitlistContext`, `ModalContext`
- Services: `WaitlistService` (localStorage), `AnalyticsService` (console stub)
- All UI primitives: `Button`, `Input`, `Badge`, `Card`, `Modal`, `ThemeToggle`, `Toast`, `AvatarGroup`
- All layout components: `Header`, `Footer`, `Container`, `SectionHeader`
- All section components: `HeroSection`, `ProductsSection`, `ValuesSection`, `StorySection`, `FAQSection`, `NewsletterSection`
- Both modals: `ProductDetailModal`, `WaitlistModal`
- `App.tsx` wires everything together — boots without errors

### ❌ Not Done Yet
- Git repository (no init, no history)
- Visual fidelity — components render but do NOT match reference designs
- Product images missing from product cards (field exists in data, not rendered)
- Avatar images use Unsplash URLs, should use local files
- Avatar local files don't exist yet
- Hero composition, product, story images are low-res mockup crops (need real AI-generated assets)
- `Footer.tsx` references wrong logo path (`/Design/Logo.png` → fix to `/assets/logo.png`)
- No favicon (`/favicon.ico` referenced in `index.html` but file doesn't exist)
- `ThemeToggle` is a plain icon button — reference design shows sliding switch
- Products section doesn't render product images at all
- Values section layout differs between themes (light = horizontal cards, dark = vertical) — not implemented
- No scroll-reveal animations
- No responsive CSS (mobile breakpoints)
- No per-component hover micro-interactions
- No accessibility (ARIA, focus traps, skip-nav)
- No SEO meta tags (OG, Twitter Card, JSON-LD)
- No deployment config
- Story text is hardcoded in JSX — violates data separation rule
- `animations.css` only has 3 basic keyframes — needs expansion

---

## Architectural Rules (from AGENTS.md — enforced at every checkpoint)

1. **No "Building in Public" / Journey Section** — skip it, even though it's in the reference images
2. **Section order**: `Hero` → `Products` → `Core Values` → `Our Story` → `FAQ` → `Newsletter` → `Footer`
3. **Theme**: `data-theme` attribute + CSS variables only. Never hardcode hex in components.
4. **Data**: All text in `src/data/*.ts`. No hardcoded strings in JSX.
5. **Services**: All waitlist logic via `useWaitlist()` hook only.
6. **Component scope**: `ui/` = pure primitives, `sections/` = composed sections, `modals/` = context-driven popups.
7. **Typing**: Explicit interfaces from `src/types/`. No `any`.
8. **Abstraction**: Only extract a component if reused 2+ times or a file exceeds 150 lines.

---

---

# PHASE 1 — Foundation & Infrastructure
> Git, tooling, assets, CSS system. Nothing visually changes yet — just building the foundation.

---

## Sprint 1.1 — Project Setup & Git

### Stage 1.1.1 — Repository Initialization

#### Task 1.1.1.1 — Initialize Git Repo
**Files**: `.gitignore` (new)  
**What to do**:
1. Run `git init` in the project root (`/Users/sugam/0. Production Projects/shahsprotein`).
2. Create `.gitignore` with these entries:
   ```
   node_modules/
   dist/
   .DS_Store
   *.env
   .env.local
   .vite/
   .idea/
   .vscode/
   *.log
   ```
3. Stage all existing files: `git add -A`
4. Commit: `git commit -m "[1.1.1.1] Initialize git repository with .gitignore"`

**Verify**: `git log --oneline` shows one commit.

---

#### Task 1.1.1.2 — Verify Clean TypeScript Compilation
**Files**: none (verification only)  
**What to do**:
1. Run `npm run lint` (runs `tsc --noEmit`).
2. Must produce **zero errors**.
3. If errors appear, fix them. There should be none based on current state.
4. If fixes were needed, commit: `git commit -m "[1.1.1.2] Fix TypeScript compilation errors"`

**Verify**: `npm run lint` exits with code 0.

---

### Stage 1.1.1 Checkpoint
> **Low intelligence check**: Confirm `git log --oneline` shows at least one commit. Confirm `npm run lint` exits clean. Confirm `npm run dev` serves the app on port 3000 without crashing.

---

### Stage 1.1.2 — Dev Server Validation

#### Task 1.1.2.1 — Verify Dev Server Renders
**Files**: none  
**What to do**:
1. Run `npm run dev` and open `http://localhost:3000`.
2. Confirm app renders without any React console errors or red screens.
3. Confirm theme toggle changes theme.
4. No code changes — this is a verification step.
5. No commit needed.

---

### Sprint 1.1 Checkpoint
> **Medium intelligence check**: Git is initialized. TypeScript compiles clean. Dev server runs. All existing files are committed. No outstanding issues.

---

## Sprint 1.2 — Asset Pipeline

### Stage 1.2.1 — Logo & Favicon

#### Task 1.2.1.1 — Fix Footer Logo Path
**Files**: `src/components/layout/Footer.tsx`  
**What to do**:
1. Open `src/components/layout/Footer.tsx`.
2. Find line 29: `src="/Design/Logo.png"` — change to `src="/assets/logo.png"`.
3. The correct logo already exists at `public/assets/logo.png` (853KB).
4. Commit: `git commit -m "[1.2.1.1] Fix Footer logo path to public assets"`

**Verify**: Run `npm run dev`, confirm logo appears in Footer.

---

#### Task 1.2.1.2 — Create Favicon
**Files**: `public/favicon.ico`, `public/favicon-32x32.png`, `public/apple-touch-icon.png`, `index.html`  
**What to do**:
1. Using the `Design/Logo.png` as reference (the S symbol mark), generate or derive:
   - `public/favicon.ico` — 32×32 and 16×16 ICO
   - `public/favicon-32x32.png` — 32×32 PNG
   - `public/apple-touch-icon.png` — 180×180 PNG
2. Update `index.html` `<head>` to add after the existing favicon link:
   ```html
   <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
   <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
   ```
3. Commit: `git commit -m "[1.2.1.2] Add favicon and apple-touch-icon"`

---

### Stage 1.2.1 Checkpoint
> **Low intelligence check**: `public/assets/logo.png` exists. Footer renders the logo. `public/favicon.ico` exists. Browser tab shows favicon.

---

### Stage 1.2.2 — Product & Hero Image Generation

> **Context**: Read `Assets/ASSET_GENERATION_SPEC.md` for the exact AI prompts, aspect ratios, and composition layouts for each image. That file is the complete source of truth for every asset.  
> **Current files**: The existing images in `public/assets/` (`hero-composition.png`, `product-chivda.png`, `product-muesli.png`, `product-bars.png`, `story-kitchen.png`) were low-resolution crops from the reference design mockups. They need to be replaced with high-quality AI-generated images.

#### Task 1.2.2.1 — Generate Hero Composition Image
**Files**: `public/assets/hero-composition.png` (overwrite)  
**Spec**: Aspect ratio `4:3`. Use Asset 1 prompt from `Assets/ASSET_GENERATION_SPEC.md`.  
**Key composition rule**: Left 45% of frame MUST be dark/empty for text overlay. Main bowl + pouch on the right 50%–95%.  
**Commit**: `git commit -m "[1.2.2.1] Generate high-quality hero composition image"`

---

#### Task 1.2.2.2 — Generate Protein Chivda Product Image
**Files**: `public/assets/product-chivda.png` (overwrite)  
**Spec**: Aspect ratio `4:3`. Use Asset 2 prompt from `Assets/ASSET_GENERATION_SPEC.md`.  
**Commit**: `git commit -m "[1.2.2.2] Generate Protein Chivda product image"`

---

#### Task 1.2.2.3 — Generate Muesli Product Image
**Files**: `public/assets/product-muesli.png` (overwrite)  
**Spec**: Aspect ratio `4:3`. Use Asset 3 prompt from `Assets/ASSET_GENERATION_SPEC.md`.  
**Commit**: `git commit -m "[1.2.2.3] Generate Muesli product image"`

---

#### Task 1.2.2.4 — Generate Protein Bars Product Image
**Files**: `public/assets/product-bars.png` (overwrite)  
**Spec**: Aspect ratio `4:3`. Use Asset 4 prompt from `Assets/ASSET_GENERATION_SPEC.md`.  
**Commit**: `git commit -m "[1.2.2.4] Generate Protein Bars product image"`

---

#### Task 1.2.2.5 — Generate Story Kitchen Image
**Files**: `public/assets/story-kitchen.png` (overwrite)  
**Spec**: Aspect ratio `16:9`. Use Asset 5 prompt from `Assets/ASSET_GENERATION_SPEC.md`.  
**Commit**: `git commit -m "[1.2.2.5] Generate founders kitchen story image"`

---

### Stage 1.2.2 Checkpoint
> **Low intelligence check**: All 5 files exist and have file sizes > 50KB (indicating they're real images, not corrupt). Run `npm run dev`, navigate to the page, and confirm images load in the browser without broken-image icons.

---

### Stage 1.2.3 — Avatar Images

#### Task 1.2.3.1 — Generate Avatar Headshots
**Files**: `public/assets/avatar-1.png`, `avatar-2.png`, `avatar-3.png`, `avatar-4.png` (new)  
**Spec**: Aspect ratio `1:1` (400×400 each). Use Avatar prompts 1–4 from `Assets/ASSET_GENERATION_SPEC.md`.  
**Style**: Consistent warm lighting, natural expressions, genuine smiles. Mix of Indian men and women, ages 20s–30s.  
**Commit**: `git commit -m "[1.2.3.1] Generate local avatar images for social proof"`

---

#### Task 1.2.3.2 — Update AvatarGroup to Use Local Avatars
**Files**: `src/components/ui/AvatarGroup.tsx`  
**What to do**:
1. Open `src/components/ui/AvatarGroup.tsx`.
2. Lines 9–13: Replace the 4 Unsplash URLs with local paths:
   ```typescript
   const avatars = [
     '/assets/avatar-1.png',
     '/assets/avatar-2.png',
     '/assets/avatar-3.png',
     '/assets/avatar-4.png',
   ];
   ```
3. Commit: `git commit -m "[1.2.3.2] Switch AvatarGroup to local avatar images"`

---

### Stage 1.2.3 Checkpoint
> **Low intelligence check**: 4 avatar files exist in `public/assets/`. Run `npm run dev` — Hero section shows 4 overlapping circular avatars loading from local files (check browser Network tab, no Unsplash requests).

---

### Sprint 1.2 Checkpoint
> **Medium intelligence check**:
> - All 9 assets exist in `public/assets/`: `logo.png`, `hero-composition.png`, `product-chivda.png`, `product-muesli.png`, `product-bars.png`, `story-kitchen.png`, `avatar-1.png`, `avatar-2.png`, `avatar-3.png`, `avatar-4.png`
> - `favicon.ico` exists in `public/`
> - Footer logo path fixed
> - AvatarGroup uses local images
> - `npm run lint` — zero errors
> - `npm run dev` — renders without errors, all images load

---

## Sprint 1.3 — CSS Architecture & Design System

### Stage 1.3.1 — Extend Design Tokens

#### Task 1.3.1.1 — Add Missing Tokens to tokens.css
**Files**: `src/styles/tokens.css`  
**What to do**: Append these new tokens inside the existing `:root {}` block:
```css
/* Z-Index Scale */
--z-header: 500;
--z-modal-overlay: 900;
--z-modal: 1000;
--z-toast: 2000;

/* Section Layout */
--section-padding-y: var(--space-16);
--container-padding-x: var(--space-6);

/* Card */
--card-padding: var(--space-6);
```
**Rules**: Do NOT change any existing tokens. Only append.  
**Commit**: `git commit -m "[1.3.1.1] Add z-index, section padding, and card padding tokens"`

---

### Stage 1.3.2 — Extend Theme Variables

#### Task 1.3.2.1 — Extend Dark Theme CSS Variables
**Files**: `src/styles/dark-theme.css`  
**What to do**: Append these inside the existing `[data-theme="dark"] {}` block:
```css
/* Section Backgrounds */
--color-bg-section: transparent;
--color-bg-newsletter: rgba(22, 28, 36, 0.9);
--color-bg-faq-active: rgba(212, 175, 55, 0.06);

/* Hero Background Glow */
--color-hero-gradient: radial-gradient(ellipse at 70% 30%, rgba(212, 175, 55, 0.07) 0%, transparent 60%);

/* Product Name Accent (shown in gold in dark mode per reference) */
--color-product-name: #e5c158;
```
**Reference**: Check `Design/Dark Mode.png` for the warm gold accent on product names and the subtle radial glow behind the hero image.  
**Rules**: Append only — do not modify existing variables.  
**Commit**: `git commit -m "[1.3.2.1] Extend dark theme CSS variables"`

---

#### Task 1.3.2.2 — Extend Light Theme CSS Variables
**Files**: `src/styles/light-theme.css`  
**What to do**: Append these inside the existing `[data-theme="light"] {}` block:
```css
/* Section Backgrounds */
--color-bg-section: transparent;
--color-bg-newsletter: rgba(255, 255, 255, 0.9);
--color-bg-faq-active: rgba(59, 130, 246, 0.04);

/* Hero Background Glow */
--color-hero-gradient: radial-gradient(ellipse at 70% 30%, rgba(59, 130, 246, 0.06) 0%, transparent 60%);

/* Product Name Accent (shown in blue in light mode per reference) */
--color-product-name: #2563eb;
```
**Reference**: Check `Design/Light Mode.png` — product names are underlined blue, hero has subtle blue glow.  
**Commit**: `git commit -m "[1.3.2.2] Extend light theme CSS variables"`

---

### Stage 1.3.2 Checkpoint
> **Low intelligence check**: Run `npm run lint` — zero errors. Confirm the 5 new variables appear in both theme files. The app should still render correctly.

---

### Stage 1.3.3 — Animation System

#### Task 1.3.3.1 — Extend animations.css with Scroll-Reveal Keyframes
**Files**: `src/styles/animations.css`  
**What to do**: Append after the existing content:
```css
@keyframes slideUp {
  from { opacity: 0; transform: translateY(28px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-28px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(28px); }
  to   { opacity: 1; transform: translateX(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}

/* Reveal utility — elements start hidden, become visible when .is-visible is added by JS */
.reveal {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.55s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.55s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal.is-visible {
  opacity: 1;
  transform: none;
}
.reveal-left  { transform: translateX(-28px); }
.reveal-right { transform: translateX(28px); }
.reveal-scale { transform: scale(0.95); }

/* Stagger delays */
.delay-100 { transition-delay: 100ms; }
.delay-200 { transition-delay: 200ms; }
.delay-300 { transition-delay: 300ms; }
.delay-400 { transition-delay: 400ms; }
.delay-500 { transition-delay: 500ms; }
```
**Commit**: `git commit -m "[1.3.3.1] Add scroll-reveal keyframes and utility classes to animations.css"`

---

#### Task 1.3.3.2 — Create useScrollReveal Hook
**Files**: `src/hooks/useScrollReveal.ts` (new)  
**What to do**: Create the directory `src/hooks/` and the file:
```typescript
import { useEffect, useRef } from 'react';

interface ScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
}

/**
 * Attaches an IntersectionObserver to the returned ref.
 * Adds 'is-visible' class to the element when it enters the viewport.
 * Use alongside the .reveal CSS class from animations.css.
 */
export function useScrollReveal<T extends Element = HTMLDivElement>(
  options: ScrollRevealOptions = {}
) {
  const { threshold = 0.15, rootMargin = '0px 0px -50px 0px' } = options;
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.disconnect(); // only trigger once
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return ref;
}
```
**Commit**: `git commit -m "[1.3.3.2] Create useScrollReveal hook with IntersectionObserver"`

---

### Stage 1.3.3 Checkpoint
> **Low intelligence check**: `src/hooks/useScrollReveal.ts` exists and exports `useScrollReveal`. `animations.css` contains the `.reveal`, `.is-visible` classes and stagger delays. `npm run lint` — zero errors.

---

### Sprint 1.3 Checkpoint
> **Medium intelligence check**:
> - `tokens.css` has the new z-index and layout tokens
> - Both theme files have the 5 new variables each
> - `animations.css` has all new keyframes + reveal utilities
> - `src/hooks/useScrollReveal.ts` exists and is correctly typed
> - `npm run lint` — zero errors
> - `npm run dev` — renders without errors

---

### Phase 1 Checkpoint
> **High intelligence check**: Full review of Phase 1 deliverables:
> 1. Git initialized, clean history with all task commits
> 2. `npm run lint` — zero errors
> 3. `npm run dev` — app renders without errors or console warnings
> 4. All 9+ assets exist in `public/assets/` and load correctly
> 5. `favicon.ico` displays in browser tab
> 6. Footer logo path fixed to `/assets/logo.png`
> 7. AvatarGroup uses local image files
> 8. Design tokens complete and well-organized
> 9. Both theme files have all required CSS variables
> 10. Animation/reveal system is in place
> 11. `useScrollReveal` hook is correctly implemented
> 12. AGENTS.md rules are still being honored (no hardcoded hex, no hardcoded text, etc.)

---

---

# PHASE 2 — UI Primitives & Layout
> Make every reusable UI component and layout wrapper pixel-match the reference designs.

---

## Sprint 2.1 — UI Primitive Components

### Stage 2.1.1 — Button

#### Task 2.1.1.1 — Restyle Button Component
**Files**: `src/components/ui/Button.tsx`  
**Reference**: Look at the "Join Waitlist →" button in `Design/Dark Mode.png` (top right header, and hero section) and `Design/Light Mode.png`.  
**What to do**:
- Dark mode primary button: warm gold gradient (`var(--color-accent-gradient)`), dark text (`var(--color-btn-text)`), pill shape, subtle gold glow shadow (`var(--shadow-glow)`)
- Light mode primary button: blue gradient, white text, blue glow shadow
- Hover: `transform: scale(1.03)`, brighter glow (`var(--shadow-glow)` opacity increase)
- Disabled: `opacity: 0.6`, `cursor: not-allowed`, no hover transform
- `ghost` variant: transparent background, accent-colored text
- All colors via CSS variables — NO hardcoded hex values anywhere in this file
- Add transition on transform for smooth hover

**Commit**: `git commit -m "[2.1.1.1] Restyle Button with correct variant styles and hover animation"`

---

### Stage 2.1.1 Checkpoint
> **Low intelligence check**: Run `npm run dev`. Visually check the "Join Waitlist" button in the header — it should be gold in dark mode and blue in light mode, pill shaped. Hover shows subtle scale. `npm run lint` — clean.

---

### Stage 2.1.2 — Input & Badge

#### Task 2.1.2.1 — Restyle Input Component
**Files**: `src/components/ui/Input.tsx`  
**Reference**: Email input field in Hero and Newsletter sections of both reference designs.  
**What to do**:
- Background: `var(--color-bg-input)`, border: `var(--color-border-card)`, text: `var(--color-text-primary)`, placeholder: `var(--color-text-muted)`
- Focus state: border becomes `var(--color-accent-primary)`, background becomes `var(--color-bg-input-focus)`, add `outline: none` + `box-shadow: 0 0 0 3px var(--color-bg-badge)` (subtle glow ring)
- Icon slot on the left already exists — verify it aligns correctly
- Pill shape (`border-radius: var(--radius-full)`)
- All colors via CSS variables

**Commit**: `git commit -m "[2.1.2.1] Restyle Input with focus states and correct theming"`

---

#### Task 2.1.2.2 — Restyle Badge Component
**Files**: `src/components/ui/Badge.tsx`  
**Reference**: "OUR GOAL", "OUR FIRST PRODUCTS", "WHAT WE BELIEVE IN" badges in both reference designs.  
**What to do**:
- Background: `var(--color-bg-badge)`, text: `var(--color-text-accent)`, border: `1px solid var(--color-border-subtle)`
- Uppercase, letter-spacing `0.06em`, `font-size: var(--font-size-xs)`, bold
- Pill shape
- All colors via CSS variables

**Commit**: `git commit -m "[2.1.2.2] Restyle Badge component"`

---

### Stage 2.1.2 Checkpoint
> **Low intelligence check**: Input field has correct border/background in both themes. Clicking into the input shows a focus glow. Badge text ("OUR GOAL" in Hero) renders in gold (dark) or blue (light) color. `npm run lint` — clean.

---

### Stage 2.1.3 — Card & Modal

#### Task 2.1.3.1 — Restyle Card Component
**Files**: `src/components/ui/Card.tsx`  
**Reference**: Product cards, values cards, and FAQ cards in both reference designs.  
**What to do**:
- The `glass-card` class in `global.css` already defines the base glassmorphism — the Card component should rely on it
- `interactive` prop: add `cursor: pointer` and CSS hover that lifts the card (`transform: translateY(-3px)`) and brightens the border to `var(--color-border-hover)`
- Transition: `transition: transform var(--transition-normal), border-color var(--transition-normal), box-shadow var(--transition-normal)`
- Hover shadow: `box-shadow: var(--shadow-glow)` on hover for interactive cards

**Commit**: `git commit -m "[2.1.3.1] Restyle Card with glassmorphism hover effects"`

---

#### Task 2.1.3.2 — Restyle Modal Component
**Files**: `src/components/ui/Modal.tsx`  
**What to do**:
- Overlay: `rgba(0, 0, 0, 0.72)` with `backdrop-filter: blur(8px)`
- Modal content: use `glass-card` class, max-width `600px`, `background: var(--color-bg-main)`, `border: 1px solid var(--color-border-hover)`
- Entry animation: add `animate-fade-in` class (already defined in animations.css) + `transform: scale(1)` end state
- Close button: `position: absolute`, top-right, hover changes color to `var(--color-text-primary)`
- Body scroll lock when open (already in the existing `useEffect`)
- z-index: use `var(--z-modal)` for modal, `var(--z-modal-overlay)` for overlay

**Commit**: `git commit -m "[2.1.3.2] Restyle Modal with z-index tokens and entry animation"`

---

### Stage 2.1.3 Checkpoint
> **Low intelligence check**: Product card in Products section — hover lifts it. Click "Learn more" — modal opens with glass background, close button visible. Press Escape — modal closes. `npm run lint` — clean.

---

### Stage 2.1.4 — ThemeToggle & Toast

#### Task 2.1.4.1 — Redesign ThemeToggle as Sliding Switch
**Files**: `src/components/ui/ThemeToggle.tsx`  
**Reference**: Look at the header area in `Design/Dark Mode.png` — the toggle appears as a pill-shaped track with a sliding knob.  
**What to do**: Replace the simple icon button with a sliding toggle switch:
```tsx
// Structure:
// <button> (pill-shaped track, ~52px × 28px)
//   <span> (circular knob, 22px, slides left or right based on theme)
//     <Sun or Moon icon, 12px>
//   </span>
// </button>
```
- Track background: dark in dark mode, light in light mode (use CSS variables)
- Knob slides from left (dark) to right (light) or vice versa with `transition: transform`
- All via CSS variables + inline styles — no hardcoded hex
- Still uses `useTheme()` hook

**Commit**: `git commit -m "[2.1.4.1] Redesign ThemeToggle as sliding switch"`

---

#### Task 2.1.4.2 — Restyle Toast Component
**Files**: `src/components/ui/Toast.tsx`  
**What to do**:
- Position: `fixed`, `bottom: 2rem`, `right: 2rem`, `z-index: var(--z-toast)`
- Background: `var(--color-bg-card)` with `backdrop-filter: blur(16px)`
- Border: `1px solid rgba(34, 197, 94, 0.35)` for success, `rgba(239, 68, 68, 0.35)` for error (these specific colors are acceptable as they are universal UX status colors, not brand colors)
- Entry animation: `animate-fade-in` class (already exists)
- Max width: `380px`

**Commit**: `git commit -m "[2.1.4.2] Restyle Toast with glass effect and z-index token"`

---

### Stage 2.1.4 Checkpoint
> **Low intelligence check**: Toggle the theme — the ThemeToggle switch slides smoothly. Submit an email in the Hero form — a toast notification appears bottom-right, fades in, auto-dismisses after 4 seconds. `npm run lint` — clean.

---

### Sprint 2.1 Checkpoint
> **Medium intelligence check**: Review all 8 UI primitives against both reference designs:
> - Button: correct gradient, glow, hover scale, dark/light variants
> - Input: correct background, border, focus glow
> - Badge: correct pill badge styling
> - Card: glassmorphism, hover lift and glow
> - Modal: correct overlay, glass body, entry animation, close button
> - ThemeToggle: sliding switch, smooth transition
> - Toast: glass effect, correct z-index, auto-dismiss
> - AvatarGroup: local images, correct overlap style
> - `npm run lint` — zero errors

---

## Sprint 2.2 — Layout Components

### Stage 2.2.1 — Header

#### Task 2.2.1.1 — Restyle Header to Match Reference
**Files**: `src/components/layout/Header.tsx`  
**Reference**: Header area in both `Design/Dark Mode.png` and `Design/Light Mode.png`.  
**What to do**:
- **Left**: Logo (`/assets/logo.png`) — height `38px`
- **Center**: Nav links "Products" and "Our Story" (smooth scroll to `#products` and `#our-story`)
- **Right**: Theme toggle slider, then Instagram icon, then Mail icon, then "Join Waitlist →" button
  - Note: Current code order is ToggleTheme, Instagram, Mail, Button — this order matches the reference
- Sticky header: `position: sticky`, `top: 0`, `z-index: var(--z-header)`
- On scroll: `border-bottom: 1px solid var(--color-border-card)`, glass background (`var(--color-bg-header)` + `backdrop-filter`)
- Mobile: hamburger icon (Menu/X from lucide-react, already imported) hidden on desktop via `.desktop-nav` / `.mobile-toggle` CSS classes already in `global.css`
- Mobile drawer: slides down below header, full-width nav links, closes on link click
- `height: var(--header-height)`

**Commit**: `git commit -m "[2.2.1.1] Restyle Header with sticky glass effect and mobile drawer"`

---

### Stage 2.2.1 Checkpoint
> **Low intelligence check**: Scroll down — header becomes glassy with border. Navbar links are visible on desktop. Shrink browser to mobile width — hamburger button appears, click it — nav links slide down. Click a link — drawer closes and page scrolls. `npm run lint` — clean.

---

### Stage 2.2.2 — Footer

#### Task 2.2.2.1 — Restyle Footer to Match Reference
**Files**: `src/components/layout/Footer.tsx`  
**Reference**: Bottom of both reference design images.  
**What to do**:
- 4-column grid: Brand info, Quick Links, Follow Us, For Business Inquiries
- Brand column: logo image (`/assets/logo.png`, height `42px`) + the motto below in muted text
- `border-top: 1px solid var(--color-border-subtle)`
- Bottom copyright bar: centered, muted text
- All link hover states: `color: var(--color-text-accent)` transition
- Responsive: `repeat(auto-fit, minmax(180px, 1fr))` grid (already in current code, verify it looks right)
- All colors via CSS variables

**Commit**: `git commit -m "[2.2.2.1] Restyle Footer with 4-column grid"`

---

### Stage 2.2.3 — SectionHeader

#### Task 2.2.3.1 — Restyle SectionHeader Component
**Files**: `src/components/layout/SectionHeader.tsx`  
**Reference**: Every section header across both reference designs ("OUR FIRST PRODUCTS", "WHAT WE BELIEVE IN", etc.).  
**What to do**:
- Badge (small uppercase pill) above the heading — already implemented, verify it uses the Badge component
- Heading: `font-family: var(--font-family-heading)`, `font-size: var(--font-size-3xl)`, `color: var(--color-text-primary)`
- Subtitle: `font-size: var(--font-size-md)`, `color: var(--color-text-secondary)`, `line-height: 1.6`
- Centered layout with `max-width: 720px` and `margin: 0 auto`
- Bottom margin: `var(--space-12)` before section content

**Also**: In `ProductsSection.tsx`, the heading "We're starting with **Protein Chivda**, **Muesli**, and **Protein Bars**." needs the product names in accent color with text-decoration underline. Since `SectionHeader` accepts a string `title`, either:
  - Change `title` prop to `React.ReactNode` so JSX can be passed in, OR
  - Have ProductsSection render its own heading instead of using SectionHeader

**Recommended**: Change the `title` prop type in `SectionHeader` to `React.ReactNode`. Update `SectionHeaderProps` in `src/components/layout/SectionHeader.tsx`. This keeps the component flexible without breaking existing usage.

**Commit**: `git commit -m "[2.2.3.1] Restyle SectionHeader, support ReactNode title for accent product names"`

---

### Stage 2.2.3 Checkpoint
> **Low intelligence check**: Products section heading shows product names in gold/blue with underline. Values section, FAQ section, Newsletter section all have correctly styled badge + heading. `npm run lint` — clean.

---

### Sprint 2.2 Checkpoint
> **Medium intelligence check**: All layout components match the reference:
> - Header: sticky glass, correct element order, mobile drawer works
> - Footer: 4-column grid, correct logo, all links functional
> - SectionHeader: badge + heading + subtitle renders correctly, ReactNode title supported
> - `npm run lint` — zero errors
> - Both themes render correctly for all components

---

### Phase 2 Checkpoint
> **High intelligence check**: Full review of all UI primitives and layout components:
> 1. Every component uses CSS variables only — grep for hardcoded hex (`#[0-9a-fA-F]{3,6}`) in all files under `src/components/ui/` and `src/components/layout/` — should be zero (except the hardcoded toast status colors which are acceptable)
> 2. Both themes render correctly for all components
> 3. ThemeToggle is a sliding switch
> 4. Modal traps focus, closes on Escape and backdrop click
> 5. Header is sticky with glass on scroll
> 6. Footer renders 4-column grid
> 7. `npm run lint` — zero errors
> 8. No domain logic in `src/components/ui/` files

---

---

# PHASE 3 — Section Components
> Build out every landing page section to pixel-match the reference designs.

---

## Sprint 3.1 — Hero & Products

### Stage 3.1.1 — Hero Section

#### Task 3.1.1.1 — Rebuild HeroSection to Match Reference
**Files**: `src/components/sections/HeroSection.tsx`  
**Reference**: Top section of both `Design/Dark Mode.png` and `Design/Light Mode.png`.  
**What to do**:
- 2-column grid (left ~55%, right ~45%):
  - **Left column**:
    - `Badge` component: "OUR GOAL"
    - `<h1>`: "To make `<span class="text-gradient">natural, high quality</span>` nutrition available and affordable to everyone." — the words "natural, high quality" use the `.text-gradient` utility class
    - Subtitle `<p>`: `siteConfig.motto` text
    - Email form: `Input` + `Button` in a flex row
    - `AvatarGroup` below the form
  - **Right column**:
    - `<img src="/assets/hero-composition.png">` inside a `glass-card` div with `animate-float` class
- Section background: `background: var(--color-hero-gradient)` (the subtle radial glow)
- Apply `useScrollReveal` to the section wrapper for fade-in entrance
- Top padding: `calc(var(--section-padding-y) * 0.75)` (slightly less since it's right after the header)
- All data from `siteConfig` and `useWaitlist()` hook

**Commit**: `git commit -m "[3.1.1.1] Rebuild HeroSection with correct 2-column layout and gradient heading"`

---

### Stage 3.1.1 Checkpoint
> **Low intelligence check**: Hero shows "OUR GOAL" badge, large heading with gradient text on "natural, high quality", subtitle, email form, avatars, and floating hero image. Both themes look correct. `npm run lint` — clean.

---

### Stage 3.1.2 — Products Section

#### Task 3.1.2.1 — Rebuild ProductsSection with Product Images
**Files**: `src/components/sections/ProductsSection.tsx`  
**Reference**: Products grid in both reference designs — look carefully at the card structure.  
**Current gap**: Product cards currently show icon → title → description with NO product image.  
**What to do**: Rebuild the product card layout:
1. **Card top**: Product image (`product.image` — e.g., `/assets/product-chivda.png`) with `border-radius: var(--radius-lg)`, `width: 100%`, `aspect-ratio: 4/3`, `object-fit: cover`
2. **Icon badge**: A small circle in the top-right of the image area (absolute positioned, overlapping) with the icon inside
3. **Arrow**: Top-right arrow icon (→) or implicit via the button at bottom
4. **Product name**: Below image, in `var(--color-product-name)` (gold in dark, blue in light) — this is the `--color-product-name` variable added in Sprint 1.3
5. **Short description**: `var(--color-text-secondary)`, `font-size: var(--font-size-sm)`, `line-height: 1.6`
6. **"Learn more →" button**: `variant="ghost"`, `color: var(--color-text-accent)`
- Apply `useScrollReveal` with stagger delays to each card (delay-100, delay-200, delay-300)
- Section heading: use the updated `SectionHeader` with ReactNode title — product names in accent color with underline (e.g. `<span style={{ color: 'var(--color-product-name)', textDecoration: 'underline' }}>Protein Chivda</span>`)
- Section `id="products"` for smooth scroll

**Commit**: `git commit -m "[3.1.2.1] Rebuild ProductsSection with product images and accent card layout"`

---

### Stage 3.1.2 Checkpoint
> **Low intelligence check**: 3 product cards show product photography images at the top, product name in gold/blue below, short description, and "Learn more →" button. Clicking a card opens ProductDetailModal. Section heading shows product names in accent color with underline. `npm run lint` — clean.

---

### Sprint 3.1 Checkpoint
> **Medium intelligence check**:
> - Hero 2-column layout is correct, gradient heading text works in both themes
> - Hero image floats with animation
> - Products grid shows images prominently
> - Product card hover lifts slightly (Card component `interactive` prop)
> - Scroll-reveal animations trigger as sections enter view
> - `npm run lint` — zero errors

---

## Sprint 3.2 — Values, Story & FAQ

### Stage 3.2.1 — Values Section

#### Task 3.2.1.1 — Restyle ValuesSection with Theme-Aware Layout
**Files**: `src/components/sections/ValuesSection.tsx`  
**Reference**: "WHAT WE BELIEVE IN" section in both designs — critical: layouts differ between themes!  
- **Dark mode** (`Design/Dark Mode.png`): 3 columns, each with a centered icon circle at top, then title in gold below, then description. Vertical layout.
- **Light mode** (`Design/Light Mode.png`): 3 glass-card boxes side-by-side, each with icon circle on the LEFT and title + description text on the RIGHT. Horizontal layout within each card.

**What to do**:
- Use `useTheme()` hook to read current theme
- Render different layouts based on theme:
  - Dark: `flexDirection: 'column'`, icon centered, text centered
  - Light: `flexDirection: 'row'`, icon left, text right
- OR use CSS `[data-theme="dark"] .values-card { flex-direction: column; }` etc.
- CSS approach is preferred to avoid re-renders
- All 3 values from `valuesData` in `src/data/values.ts`
- Icon circle: `background: var(--color-bg-badge)`, accent-colored icon inside
- Apply `useScrollReveal` with stagger

**Commit**: `git commit -m "[3.2.1.1] Restyle ValuesSection with theme-aware vertical/horizontal layout"`

---

### Stage 3.2.1 Checkpoint
> **Low intelligence check**: Toggle theme. In dark mode: values show icon above, title below, vertical. In light mode: values show icon left, text right, horizontal card layout. `npm run lint` — clean.

---

### Stage 3.2.2 — Story Section

#### Task 3.2.2.1 — Extract Story Text to Data Layer and Restyle StorySection
**Files**: `src/components/sections/StorySection.tsx`, `src/data/siteConfig.ts`  
**Current violation**: Story paragraphs are hardcoded strings directly in `StorySection.tsx` — violates the data separation rule in AGENTS.md.  
**What to do**:
1. In `src/data/siteConfig.ts`, add a `story` object:
   ```typescript
   story: {
     heading: "Why we started Shah's Nutrition.",
     paragraphs: [
       "We looked around and realized most nutrition foods were either packed with artificial ingredients, ridiculously expensive, or just didn't taste good.",
       "We wanted to change that.",
       "Shah's Nutrition was born out of a simple idea - to make natural, high quality nutrition that fits into everyday life and is affordable for everyone.",
       "This is just the beginning.",
     ],
     boldLastParagraph: true,
   }
   ```
2. In `StorySection.tsx`, import `siteConfig` and use `siteConfig.story.paragraphs` — remove all hardcoded strings
3. Layout (2-column grid, already correct):
   - Left: "OUR STORY" Badge, heading (`siteConfig.story.heading`), story paragraphs (last one bold)
   - Right: `<img src="/assets/story-kitchen.png">` inside a Card
4. Apply `useScrollReveal` to left (slide from left) and right (slide from right)
5. Section `id="our-story"` for smooth scroll

**Commit**: `git commit -m "[3.2.2.1] Extract story text to siteConfig and restyle StorySection"`

---

### Stage 3.2.2 Checkpoint
> **Low intelligence check**: Story section shows 2-column layout — story text left, kitchen image right. No hardcoded strings remain in `StorySection.tsx`. Run `grep -n "We looked"` in `StorySection.tsx` — should return nothing. `npm run lint` — clean.

---

### Stage 3.2.3 — FAQ Section

#### Task 3.2.3.1 — Restyle FAQSection with Animated Accordion
**Files**: `src/components/sections/FAQSection.tsx`  
**Current gap**: The accordion expand/collapse is instant (no animation) — the answer just appears and disappears.  
**What to do**:
- Use CSS `max-height` transition for smooth height animation:
  - Closed: `max-height: 0; overflow: hidden; transition: max-height 0.3s ease`
  - Open: `max-height: 500px` (large enough to show any answer)
- Open FAQ item: add background tint `var(--color-bg-faq-active)`
- ChevronDown icon: rotate 180° when open (already implemented — verify CSS transition works)
- Section `id="faq"` for potential future scroll links
- Apply `useScrollReveal` to the FAQ container

**Commit**: `git commit -m "[3.2.3.1] Restyle FAQSection with smooth animated accordion"`

---

### Stage 3.2.3 Checkpoint
> **Low intelligence check**: Click a FAQ question — answer slides down smoothly (not instant). Click again — slides back up. Open FAQ has a subtle tinted background. Chevron rotates. `npm run lint` — clean.

---

### Sprint 3.2 Checkpoint
> **Medium intelligence check**:
> - Values shows correct layout per theme (vertical dark, horizontal light)
> - StorySection has no hardcoded text — all from `siteConfig.story`
> - FAQ accordion animates smoothly
> - `npm run lint` — zero errors

---

## Sprint 3.3 — Newsletter, Modals & Toast

### Stage 3.3.1 — Newsletter Section

#### Task 3.3.1.1 — Restyle NewsletterSection to Match Reference
**Files**: `src/components/sections/NewsletterSection.tsx`  
**Reference**: Bottom CTA section in both designs.  
**What to do**:
- Centered glass card container (`max-width: 840px`, `margin: 0 auto`)
- Inside the card: Mail icon circle → "Be the first to know." heading → subtitle → email form → AvatarGroup
- Light mode special: The newsletter section in `Design/Light Mode.png` has a vivid blue/indigo gradient glow behind it. Add a decorative `<div>` with `position: absolute, inset: 0, background: var(--color-hero-gradient), filter: blur(60px), z-index: -1` to the outer section wrapper for the light mode glow
- Section `id="waitlist"` (already present — verify)
- Apply `useScrollReveal` to the card

**Commit**: `git commit -m "[3.3.1.1] Restyle NewsletterSection with centered glass card and gradient glow"`

---

### Stage 3.3.1 Checkpoint
> **Low intelligence check**: Newsletter shows mail icon, heading, subtitle, working form. In light mode there's a blue background glow. In dark mode it sits cleanly on the dark background. `npm run lint` — clean.

---

### Stage 3.3.2 — Modals

#### Task 3.3.2.1 — Restyle ProductDetailModal
**Files**: `src/components/modals/ProductDetailModal.tsx`  
**Current gap**: Missing `ingredients` list and `weightOptions` display. The data exists in `src/data/products.ts` but isn't rendered.  
**What to do**: Add two new sections to the modal content:
1. After the "KEY HIGHLIGHTS" section, add **Ingredients list**:
   ```tsx
   <div>
     <h4 style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
       INGREDIENTS
     </h4>
     <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
       {selectedProduct.ingredients.join(', ')}
     </p>
   </div>
   ```
2. After nutrition table, add **Weight Options**:
   ```tsx
   <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
     {selectedProduct.weightOptions.map((opt, i) => (
       <span key={i} style={{ padding: '0.3rem 0.7rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-card)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
         {opt}
       </span>
     ))}
   </div>
   ```
3. Ensure the modal scrolls smoothly for long content (`max-height: 85vh; overflow-y: auto`)

**Commit**: `git commit -m "[3.3.2.1] Add ingredients and weight options to ProductDetailModal"`

---

#### Task 3.3.2.2 — Restyle WaitlistModal
**Files**: `src/components/modals/WaitlistModal.tsx`  
**What to do**: The modal is functionally complete — add visual polish:
- Sparkle icon at top in an accent-tinted badge circle (already exists — verify it looks premium)
- Wait count text with bold accent number
- Full-width submit button
- Ensure all colors use CSS variables

**Commit**: `git commit -m "[3.3.2.2] Polish WaitlistModal styling"`

---

### Stage 3.3.2 Checkpoint
> **Low intelligence check**: Click "Learn more" on a product — modal shows full product info including ingredients and weight options. Click "Join Waitlist" in header — modal opens with Sparkle icon and count text. Submit an email — modal closes, toast appears. `npm run lint` — clean.

---

### Sprint 3.3 Checkpoint
> **Medium intelligence check**:
> - Newsletter section renders correctly with glass card
> - ProductDetailModal shows all product fields: description, highlights, nutrition, ingredients, weight options, waitlist form
> - WaitlistModal is polished
> - Toast works correctly in all scenarios (success, duplicate, error)
> - `npm run lint` — zero errors

---

### Phase 3 Checkpoint
> **High intelligence check**: Open `Design/Dark Mode.png` and `Design/Light Mode.png` alongside the running dev server. Systematically compare every section:
> 1. **Hero**: 2-column, gradient heading, email form, avatars, floating hero image ✓
> 2. **Products**: 3-column grid with images, product names in accent color with underline ✓
> 3. **Values**: Vertical (dark) / horizontal card (light) layout ✓
> 4. **Story**: 2-column, text left, kitchen image right ✓
> 5. **FAQ**: Animated accordion ✓
> 6. **Newsletter**: Centered glass card, glow background in light ✓
> 7. **Footer**: 4-column grid ✓
> 8. **NO "Building in Public" section exists** — CRITICAL ✓
> 9. All text content comes from `src/data/` — grep check ✓
> 10. `npm run lint` — zero errors ✓

---

---

# PHASE 4 — Responsive, Animations & Polish
> Every device, smooth animations, premium feel.

---

## Sprint 4.1 — Responsive Design

### Stage 4.1.1 — Responsive CSS Foundation

#### Task 4.1.1.1 — Create responsive.css
**Files**: `src/styles/responsive.css` (new), `src/styles/global.css`  
**What to do**:
1. Create `src/styles/responsive.css`
2. Add `@import './responsive.css';` at the bottom of `global.css`
3. File contents:
```css
/* Tablet landscape */
@media (max-width: 1024px) {
  :root {
    --font-size-4xl: 2.75rem;
    --font-size-3xl: 2.25rem;
    --container-max-width: 960px;
  }
}

/* Tablet portrait / large mobile */
@media (max-width: 768px) {
  :root {
    --font-size-4xl: 2.25rem;
    --font-size-3xl: 1.875rem;
    --section-padding-y: var(--space-12);
  }
  .desktop-nav {
    display: none !important;
  }
  .mobile-toggle {
    display: flex !important;
  }
}

/* Small mobile */
@media (max-width: 480px) {
  :root {
    --font-size-4xl: 1.875rem;
    --font-size-3xl: 1.625rem;
    --container-padding-x: var(--space-4);
  }
}
```
**Commit**: `git commit -m "[4.1.1.1] Create responsive.css with breakpoint overrides"`

---

### Stage 4.1.2 — Section-Level Responsiveness

#### Task 4.1.2.1 — Make Hero Section Responsive
**Files**: `src/components/sections/HeroSection.tsx`  
**What to do**:
- The `gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'` already handles column stacking at narrow widths — verify it works
- At mobile: email form should stack (input full-width, button below it) — add `flexWrap: 'wrap'` to the form (already present)
- Hero image column: ensure it renders below text on mobile (grid auto-fit handles this)
- Test at 375px — confirm no overflow

**Commit**: `git commit -m "[4.1.2.1] Verify and fix Hero section mobile layout"` (only commit if changes made)

---

#### Task 4.1.2.2 — Make Products Section Responsive
**Files**: `src/components/sections/ProductsSection.tsx`  
**What to do**:
- Grid: `repeat(auto-fit, minmax(280px, 1fr))` — verify cards stack correctly at 768px (2-col) and 480px (1-col)
- Product card images: must remain prominent at all sizes
- If `minmax(280px, 1fr)` causes 2 narrow cards on tablet, adjust to `minmax(300px, 1fr)` or use explicit breakpoint

**Commit**: `git commit -m "[4.1.2.2] Make Products section responsive across breakpoints"`

---

#### Task 4.1.2.3 — Make Values Section Responsive
**Files**: `src/components/sections/ValuesSection.tsx`  
**What to do**:
- On mobile: regardless of theme, stack values vertically (1 column)
- Add `@media (max-width: 768px)` override in `responsive.css` if CSS approach was used, or add inline media handling

**Commit**: `git commit -m "[4.1.2.3] Make Values section stack vertically on mobile"`

---

#### Task 4.1.2.4 — Make Story, FAQ & Newsletter Responsive
**Files**: `src/components/sections/StorySection.tsx`, `src/components/sections/FAQSection.tsx`, `src/components/sections/NewsletterSection.tsx`  
**What to do**:
- Story: `auto-fit` grid already stacks — verify kitchen image stacks below text on mobile
- FAQ: Cards are full-width already — verify comfortable padding on mobile
- Newsletter: Form stacks on mobile (input full-width, button below) — verify

**Commit**: `git commit -m "[4.1.2.4] Verify Story, FAQ, Newsletter responsive layout"`

---

#### Task 4.1.2.5 — Make Footer Responsive
**Files**: `src/components/layout/Footer.tsx`  
**What to do**:
- Footer grid: `repeat(auto-fit, minmax(180px, 1fr))` — verify it collapses to 2 then 1 column correctly
- At 1-column: center-align text and links

**Commit**: `git commit -m "[4.1.2.5] Make Footer responsive"`

---

### Stage 4.1.2 Checkpoint
> **Low intelligence check**: Resize browser from 1440px → 768px → 375px. At each size confirm:
> - No horizontal scrollbar
> - No text overflow
> - Cards stack correctly
> - Form inputs remain usable
> - Images don't get cut off
> `npm run lint` — clean.

---

### Stage 4.1.3 — Mobile Header

#### Task 4.1.3.1 — Polish Mobile Hamburger Menu
**Files**: `src/components/layout/Header.tsx`  
**What to do**:
- On mobile: hamburger button visible, `X` icon when open (already implemented)
- Drawer: smooth `max-height` transition slide-down (currently renders instantly)
- Add body scroll lock when drawer is open: `document.body.style.overflow = 'hidden'` on open, `''` on close
- Close on Escape key press
- Close on outside click (add event listener for clicks outside the header)
- All links in drawer: full width, comfortable tap targets (min height 44px)

**Commit**: `git commit -m "[4.1.3.1] Polish mobile hamburger drawer with animations and accessibility"`

---

### Stage 4.1.3 Checkpoint
> **Low intelligence check**: At 375px width — hamburger opens with slide-down animation. Nav links are easy to tap. Click a link — page scrolls to section, drawer closes. Press Escape — drawer closes. `npm run lint` — clean.

---

### Sprint 4.1 Checkpoint
> **Medium intelligence check**: Full responsive test across 5 widths (1440, 1024, 768, 480, 375):
> - No horizontal overflow at any width
> - All sections reflow correctly
> - Hamburger menu works
> - Images load and display correctly
> - Form inputs are usable
> - `npm run lint` — zero errors

---

## Sprint 4.2 — Animations & Micro-Interactions

### Stage 4.2.1 — Scroll Reveal

#### Task 4.2.1.1 — Wire Scroll Reveals to All Sections
**Files**: All section files + layout sections in `src/components/sections/`  
**Context**: `useScrollReveal` hook and `.reveal` CSS class were created in Phase 1. Now wire them up.  
**What to do**: For each section that doesn't already have it (from Phase 3 tasks):
- Add the hook: `const ref = useScrollReveal();`
- Add `ref={ref}` to the section wrapper
- Add `className="reveal"` to the wrapper
- For staggered children (e.g. product cards, value cards, FAQ items), add `reveal delay-100`, `reveal delay-200`, etc. to individual children with separate `useScrollReveal` refs OR apply CSS stagger via the parent using `nth-child` selectors

**Stagger strategy** (cleaner): Add a parent ref with `useScrollReveal`, and style children with:
```css
.reveal.is-visible > *:nth-child(1) { transition-delay: 0ms; }
.reveal.is-visible > *:nth-child(2) { transition-delay: 100ms; }
.reveal.is-visible > *:nth-child(3) { transition-delay: 200ms; }
```
Add this to `animations.css` or `responsive.css`.

**Commit**: `git commit -m "[4.2.1.1] Wire scroll-reveal animations to all sections with stagger"`

---

### Stage 4.2.1 Checkpoint
> **Low intelligence check**: Open the page, scroll down slowly. Each section fades/slides into view as it enters the viewport. Product cards stagger in one by one. `npm run lint` — clean.

---

### Stage 4.2.2 — Hover Micro-Interactions

#### Task 4.2.2.1 — Add Hover Effects to Product Cards
**Files**: `src/components/sections/ProductsSection.tsx` or a new `src/styles/sections.css`  
**What to do**:
- Product card hover: `transform: translateY(-4px)`, `border-color: var(--color-border-hover)`, `box-shadow: var(--shadow-glow)`
- "Learn more →" text: on card hover, the arrow shifts right by 3px
- These should be CSS-based (using `.glass-card:hover` already defined in `global.css`) + any additional overrides

**Commit**: `git commit -m "[4.2.2.1] Add hover lift and glow to product cards"`

---

#### Task 4.2.2.2 — Add Hover to Nav Links and Footer Links
**Files**: `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx`  
**What to do**:
- Nav links: on hover, `color: var(--color-text-primary)` (subtle darkening)
- Footer links: on hover, `color: var(--color-text-accent)` transition
- Add `transition: color var(--transition-fast)` to all link elements

**Commit**: `git commit -m "[4.2.2.2] Add hover color transitions to nav and footer links"`

---

#### Task 4.2.2.3 — Add Smooth Theme Color Transitions
**Files**: `src/styles/global.css`  
**What to do**:
- Add CSS transitions for theme switching to the cards and other elements (body already has it):
  ```css
  .glass-card {
    transition: background-color var(--transition-theme),
                border-color var(--transition-theme),
                box-shadow var(--transition-normal);
  }
  ```
- Verify `body` transition already covers `color` and `background-color`
- Add to `.badge` class as well

**Commit**: `git commit -m "[4.2.2.3] Add theme-transition CSS to cards, badges, and interactive elements"`

---

### Stage 4.2.2 Checkpoint
> **Low intelligence check**: Hover over product cards — they lift smoothly. Hover over nav links — color changes. Toggle the theme rapidly — all colors transition smoothly without flash. `npm run lint` — clean.

---

### Sprint 4.2 Checkpoint
> **Medium intelligence check**:
> - Scroll reveals work on all sections with stagger
> - Product cards have hover lift + glow
> - Nav and footer links have hover color transitions
> - Theme toggle transitions all colors smoothly
> - Animations feel premium (not too fast, not too slow)
> - `npm run lint` — zero errors

---

### Phase 4 Checkpoint
> **High intelligence check**: Full polish and responsive review:
> 1. Test all 5 breakpoints (1440, 1024, 768, 480, 375) — no horizontal overflow
> 2. Scroll through the page slowly — all sections animate into view
> 3. Hover over every interactive element — feedback is present
> 4. Toggle theme — smooth transition on everything
> 5. Mobile hamburger works with slide animation
> 6. `npm run lint` — zero errors
> 7. App feels premium and production-ready visually

---

---

# PHASE 5 — Accessibility, SEO & Production Hardening

---

## Sprint 5.1 — Accessibility

### Stage 5.1.1 — Semantic HTML & ARIA

#### Task 5.1.1.1 — Add Skip-to-Content Link
**Files**: `src/App.tsx`, `src/styles/global.css`  
**What to do**:
1. Add a skip link as the very first element inside `<body>`:
   ```tsx
   <a href="#main-content" className="skip-link">Skip to main content</a>
   ```
2. Add `id="main-content"` to the `<main>` element in `App.tsx`
3. Add CSS in `global.css`:
   ```css
   .skip-link {
     position: absolute;
     top: -100%;
     left: 1rem;
     background: var(--color-accent-primary);
     color: var(--color-btn-text);
     padding: 0.5rem 1rem;
     border-radius: var(--radius-sm);
     font-size: var(--font-size-sm);
     font-weight: 600;
     z-index: 9999;
     transition: top var(--transition-fast);
   }
   .skip-link:focus {
     top: 1rem;
   }
   ```
**Commit**: `git commit -m "[5.1.1.1] Add skip-to-content link for keyboard users"`

---

#### Task 5.1.1.2 — Add ARIA Labels to Sections and Interactive Elements
**Files**: All section components, `Modal.tsx`, `FAQSection.tsx`, `Toast.tsx`, `ThemeToggle.tsx`  
**What to do**:
- Each `<section>` element: add `aria-label="[section name]"` (e.g. `aria-label="Our Products"`)
- FAQ accordion items: each toggle button needs `aria-expanded={isOpen}`, `aria-controls="faq-answer-{id}"`, and the answer div needs `id="faq-answer-{id}"`
- Modal: add `role="dialog"`, `aria-modal="true"`, `aria-labelledby="modal-title-{id}"`, focus should move to modal on open
- Toast: add `role="alert"` and `aria-live="polite"`
- ThemeToggle button: `aria-label` should describe action, e.g. `"Switch to light mode"` / `"Switch to dark mode"`
- All icon-only buttons (Instagram, Mail in header): already have `aria-label` — verify they're present

**Commit**: `git commit -m "[5.1.1.2] Add ARIA labels, roles, and expanded states"`

---

### Stage 5.1.2 — Keyboard & Focus

#### Task 5.1.2.1 — Implement Focus Trap in Modal
**Files**: `src/components/ui/Modal.tsx`  
**What to do**:
- When modal opens: move focus to the first focusable element inside it (the close button or the first input)
- Add focus trap: Tab and Shift+Tab cycle only within the modal when open
- When modal closes: return focus to the element that triggered it
- Use a `useEffect` that queries `[modal-root] button, [modal-root] input, [modal-root] a[href]` and manages focus

**Commit**: `git commit -m "[5.1.2.1] Implement focus trap and focus restoration in Modal"`

---

#### Task 5.1.2.2 — Style Focus Indicators
**Files**: `src/styles/global.css`  
**What to do**: Add visible focus outlines for all interactive elements:
```css
/* Custom focus indicators */
:focus-visible {
  outline: 2px solid var(--color-accent-primary);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}

/* Remove default focus for mouse users */
:focus:not(:focus-visible) {
  outline: none;
}
```
**Commit**: `git commit -m "[5.1.2.2] Add :focus-visible indicator styles"`

---

### Stage 5.1.2 Checkpoint
> **Low intelligence check**: Tab through the entire page using only the keyboard. Every interactive element (links, buttons, inputs) must show a visible focus ring. Open a modal — Tab cycles within the modal only. Close modal — focus returns to the trigger.

---

### Sprint 5.1 Checkpoint
> **Medium intelligence check**:
> - Skip-to-content link works (Tab from top of page)
> - ARIA landmarks on all sections
> - FAQ accordion has `aria-expanded` and `aria-controls`
> - Modal has focus trap and focus restoration
> - Toast has `role="alert"`
> - Focus indicators visible on all interactive elements
> - `npm run lint` — zero errors

---

## Sprint 5.2 — SEO & Meta

### Stage 5.2.1 — SEO Meta Tags

#### Task 5.2.1.1 — Add Full SEO Head
**Files**: `index.html`, `public/robots.txt` (new), `public/sitemap.xml` (new)  
**What to do**:
1. Update `index.html` `<head>` with:
   ```html
   <!-- Open Graph -->
   <meta property="og:type" content="website" />
   <meta property="og:title" content="Shah's Nutrition — Real Nutrition. Real Ingredients. Real Good." />
   <meta property="og:description" content="Natural, high quality nutrition available and affordable to everyone. Protein Chivda, Muesli, and Protein Bars." />
   <meta property="og:image" content="/assets/hero-composition.png" />
   <meta property="og:url" content="https://shahsnutrition.com" />

   <!-- Twitter Card -->
   <meta name="twitter:card" content="summary_large_image" />
   <meta name="twitter:title" content="Shah's Nutrition" />
   <meta name="twitter:description" content="Natural, high quality nutrition for everyone." />
   <meta name="twitter:image" content="/assets/hero-composition.png" />

   <!-- Theme Color -->
   <meta name="theme-color" content="#d4af37" />

   <!-- Structured Data -->
   <script type="application/ld+json">
   {
     "@context": "https://schema.org",
     "@type": "Organization",
     "name": "Shah's Nutrition",
     "url": "https://shahsnutrition.com",
     "logo": "/assets/logo.png",
     "description": "Natural, high quality nutrition available and affordable to everyone.",
     "sameAs": ["https://instagram.com/shahsnutrition"]
   }
   </script>
   ```
2. Create `public/robots.txt`:
   ```
   User-agent: *
   Allow: /
   Sitemap: https://shahsnutrition.com/sitemap.xml
   ```
3. Create `public/sitemap.xml`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <url>
       <loc>https://shahsnutrition.com/</loc>
       <lastmod>2024-01-01</lastmod>
       <priority>1.0</priority>
     </url>
   </urlset>
   ```
**Commit**: `git commit -m "[5.2.1.1] Add OG tags, Twitter cards, JSON-LD, robots.txt, sitemap"`

---

### Stage 5.2.1 Checkpoint
> **Low intelligence check**: Open `index.html` and verify all meta tags are present. Verify `public/robots.txt` and `public/sitemap.xml` exist with correct content. `npm run lint` — clean.

---

### Sprint 5.2 Checkpoint
> **Medium intelligence check**: OG tags, Twitter Card, JSON-LD structured data, robots.txt, sitemap — all present and correct. `npm run lint` — clean.

---

## Sprint 5.3 — Build Hardening

### Stage 5.3.1 — Image Optimization

#### Task 5.3.1.1 — Add Lazy Loading and Image Dimensions
**Files**: All section files that render `<img>` elements  
**What to do**:
- Hero image: `fetchPriority="high"` (since it's LCP element), no `loading="lazy"`
- Logo in header: `loading="eager"`, no lazy
- All other images (`product-chivda.png`, `product-muesli.png`, `product-bars.png`, `story-kitchen.png`, avatars): add `loading="lazy"`
- All `<img>` elements should have explicit `width` and `height` attributes to prevent layout shift (CLS). Use the actual intrinsic dimensions or approximate values.

**Commit**: `git commit -m "[5.3.1.1] Add lazy loading, fetchPriority, and dimensions to all images"`

---

### Stage 5.3.2 — Error Boundaries

#### Task 5.3.2.1 — Create React Error Boundary
**Files**: `src/components/ui/ErrorBoundary.tsx` (new), `src/App.tsx`  
**What to do**:
1. Create `src/components/ui/ErrorBoundary.tsx`:
```tsx
import React from 'react';
import { AnalyticsService } from '../../services/analyticsService';

interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    AnalyticsService.trackEvent('render_error', { error: error.message, componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <p>Something went wrong loading this section.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
```
2. Wrap each `<section>` component in `App.tsx` with `<ErrorBoundary>`:
```tsx
<ErrorBoundary><HeroSection /></ErrorBoundary>
```

**Commit**: `git commit -m "[5.3.2.1] Add React ErrorBoundary wrapping all section components"`

---

#### Task 5.3.2.2 — Test Production Build
**Files**: none  
**What to do**:
1. Run `npm run build`
2. Must complete with zero errors
3. Run `npm run preview` — visit `http://localhost:4173`
4. Verify both themes work, all sections render, modals open, waitlist form submits
5. Check browser DevTools Network tab — no 404 errors for any asset
6. If any errors found, fix them

**Commit**: `git commit -m "[5.3.2.2] Fix production build issues"` (only if fixes needed)

---

### Stage 5.3.2 Checkpoint
> **Low intelligence check**: `npm run build` exits with code 0. `npm run preview` shows a working site. No 404s in DevTools Network tab. Both themes work on the preview build.

---

### Sprint 5.3 Checkpoint
> **Medium intelligence check**:
> - Images have lazy loading, explicit dimensions, fetchPriority on hero
> - ErrorBoundary wraps all sections in App.tsx
> - `npm run build` — succeeds
> - `npm run preview` — site works completely
> - `npm run lint` — zero errors

---

### Phase 5 Checkpoint
> **High intelligence check**: Production readiness review:
> 1. Full keyboard navigation works end-to-end
> 2. All ARIA attributes present (sections, modals, FAQ, toast)
> 3. Skip-to-content link works
> 4. Focus trap works in modals
> 5. SEO meta tags all present in `index.html`
> 6. `robots.txt` and `sitemap.xml` exist
> 7. Images have lazy loading and dimensions
> 8. `npm run build` succeeds
> 9. `npm run preview` — fully functional
> 10. `npm run lint` — zero errors

---

---

# PHASE 6 — Final QA & Deployment

---

## Sprint 6.1 — Visual QA

### Stage 6.1.1 — Theme Visual Comparison

#### Task 6.1.1.1 — Dark Mode Visual QA
**Files**: varies — fix anything that doesn't match  
**What to do**: Open `Design/Dark Mode.png` and the running dev server side-by-side. Compare each section systematically:
- [ ] Header: logo, nav links, theme toggle, social icons, Join Waitlist button
- [ ] Hero: badge, heading gradient, subtitle, email form, avatar group, floating hero image
- [ ] Products: section badge + heading with accent product names, 3 cards with images, icon badges, Learn more links
- [ ] Values: icon circles, gold titles, descriptions, correct vertical layout
- [ ] Story: badge, heading, paragraphs, bold last paragraph, kitchen image
- [ ] FAQ: badge, heading, accordion items, chevron rotation
- [ ] Newsletter: mail icon, heading, form, avatar group
- [ ] Footer: 4 columns, logo, links, copyright

Fix any discrepancies found.  
**Commit**: `git commit -m "[6.1.1.1] Dark mode visual QA fixes"` (only if changes made)

---

#### Task 6.1.1.2 — Light Mode Visual QA
**Files**: varies — fix anything that doesn't match  
**What to do**: Switch to light mode. Open `Design/Light Mode.png` side-by-side. Same checklist as dark mode, plus:
- [ ] Values: horizontal card layout (icon left, text right)
- [ ] Newsletter: blue gradient glow behind the section
- [ ] Hero: blue gradient heading text
- [ ] Background gradient on the overall page

Fix any discrepancies.  
**Commit**: `git commit -m "[6.1.1.2] Light mode visual QA fixes"` (only if changes made)

---

### Stage 6.1.1 Checkpoint
> **Low intelligence check**: Visual diff between running app and reference designs is minimal. No obvious layout breaks or color mismatches.

---

### Stage 6.1.2 — Interaction Testing

#### Task 6.1.2.1 — Full Interaction Regression Test
**Files**: varies — fix any bugs found  
**Test every interaction**:
- [ ] Theme toggle slides, changes all colors smoothly
- [ ] "Products" nav link smooth-scrolls to `#products`
- [ ] "Our Story" nav link smooth-scrolls to `#our-story`
- [ ] Instagram link opens `https://instagram.com/shahsnutrition` in new tab
- [ ] Mail link opens `mailto:hello@shahsnutrition.com`
- [ ] Hero email form: empty submit is blocked, invalid email is blocked, valid email submits, shows success toast, input clears
- [ ] Product card click opens ProductDetailModal with correct product
- [ ] ProductDetailModal: shows all fields (description, highlights, nutrition, ingredients, weight options, waitlist form)
- [ ] ProductDetailModal waitlist form works
- [ ] Header "Join Waitlist" opens WaitlistModal
- [ ] WaitlistModal submit: success closes modal, shows toast
- [ ] Newsletter form: same validation as hero form
- [ ] Duplicate email shows "already on waitlist" message (not an error)
- [ ] FAQ accordion: click to open, click to close, smooth animation, only one open at a time (or multiple — current behavior allows multiple, verify it's consistent)
- [ ] Footer links: "Products" scrolls to section, "Our Story" scrolls to section
- [ ] Toast auto-dismisses after 4 seconds
- [ ] Toast can be manually closed
- [ ] Hamburger menu (at mobile width): opens, links work, closes on link click, closes on Escape

Fix any bugs found.  
**Commit**: `git commit -m "[6.1.2.1] Fix bugs from interaction regression test"` (only if changes made)

---

### Stage 6.1.2 Checkpoint
> **Low intelligence check**: Every item in the interaction checklist above passes. No console errors during any interaction.

---

### Sprint 6.1 Checkpoint
> **Medium intelligence check**: Full visual and interaction QA complete. App matches references. All interactions work. No console errors. `npm run lint` clean. `npm run build` succeeds.

---

## Sprint 6.2 — Deployment

### Stage 6.2.1 — Deployment Configuration

#### Task 6.2.1.1 — Create Deployment Config
**Files**: `vercel.json` (or `netlify.toml` — pick one)  
**Recommended**: Vercel (zero-config for Vite, fast CDN)  
**What to do**:
Create `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```
**Commit**: `git commit -m "[6.2.1.1] Add Vercel deployment configuration"`

---

#### Task 6.2.1.2 — Final Production Deployment
**Files**: none  
**What to do**:
1. Run `npm run build` — confirm success
2. Deploy: `npx vercel --prod` (or push to git repo connected to Vercel/Netlify)
3. Visit the live production URL
4. Verify: both themes work, all sections load, images load (no 404s), modals work, forms work
5. Test on a real mobile device or BrowserStack
6. Record the live URL

**Commit**: `git commit -m "[6.2.1.2] Final build verification before deployment"` (if any last fixes)

---

### Stage 6.2.1 Checkpoint
> **Low intelligence check**: Site is live at the production URL. Both themes work. No broken images. Waitlist form submits and shows toast.

---

### Sprint 6.2 Checkpoint
> **Medium intelligence check**: Deployment is live and functional. Both themes work on production. Mobile experience is good. No 404s or console errors.

---

### Phase 6 Checkpoint
> **High intelligence check**: Final production verification:
> 1. Site loads at live URL
> 2. LCP < 3 seconds (check DevTools Lighthouse or WebPageTest)
> 3. Both themes work perfectly on production
> 4. All user interactions work on production
> 5. Mobile responsive on real device
> 6. No console errors in production
> 7. Favicon displays in browser tab
> 8. OG image appears when pasting URL into Slack/Twitter

---

---

## ALL PHASES COMPLETE — Final End-to-End Review

> **Higher intelligence model** — run a comprehensive final review:
>
> **Architecture Compliance** (AGENTS.md):
> - [ ] No "Building in Public" section exists anywhere in the codebase
> - [ ] Section flow: Hero → Products → Core Values → Our Story → FAQ → Newsletter → Footer
> - [ ] All colors in components use CSS variables — run `grep -rn '#[0-9a-fA-F]' src/components/` and verify only acceptable exceptions
> - [ ] All text content in `src/data/` — run `grep -rn '"We looked'` in `src/components/` → should be empty
> - [ ] All waitlist operations via `useWaitlist()` — no direct localStorage in components
> - [ ] `src/components/ui/` has no context access (`grep -rn 'useContext\|useModal\|useWaitlist\|useTheme' src/components/ui/` → should be empty except ThemeToggle and AvatarGroup which are allowed)
> - [ ] No `any` types — run `grep -rn ': any' src/`
>
> **Code Quality**:
> - [ ] `npm run lint` — zero errors
> - [ ] `npm run build` — succeeds
>
> **Final Visual Check**:
> - [ ] Compare production site against both reference designs
> - [ ] Both themes match reference perfectly
>
> **Production**:
> - [ ] Live URL accessible
> - [ ] `npm run preview` works
> - [ ] No console errors
>
> **Commit**: `git commit -m "[FINAL] End-to-end review and production sign-off"`

---

## Quick Reference — Task Index

| Phase | Sprint | Stage | Task | Short Description |
|-------|--------|-------|------|-------------------|
| 1 | 1.1 | 1.1.1 | 1.1.1.1 | Initialize git repo |
| 1 | 1.1 | 1.1.1 | 1.1.1.2 | Verify TS compilation |
| 1 | 1.1 | 1.1.2 | 1.1.2.1 | Verify dev server |
| 1 | 1.2 | 1.2.1 | 1.2.1.1 | Fix Footer logo path |
| 1 | 1.2 | 1.2.1 | 1.2.1.2 | Create favicon |
| 1 | 1.2 | 1.2.2 | 1.2.2.1 | Generate hero image |
| 1 | 1.2 | 1.2.2 | 1.2.2.2 | Generate chivda image |
| 1 | 1.2 | 1.2.2 | 1.2.2.3 | Generate muesli image |
| 1 | 1.2 | 1.2.2 | 1.2.2.4 | Generate bars image |
| 1 | 1.2 | 1.2.2 | 1.2.2.5 | Generate story image |
| 1 | 1.2 | 1.2.3 | 1.2.3.1 | Generate avatar images |
| 1 | 1.2 | 1.2.3 | 1.2.3.2 | Update AvatarGroup to local |
| 1 | 1.3 | 1.3.1 | 1.3.1.1 | Add missing design tokens |
| 1 | 1.3 | 1.3.2 | 1.3.2.1 | Extend dark theme vars |
| 1 | 1.3 | 1.3.2 | 1.3.2.2 | Extend light theme vars |
| 1 | 1.3 | 1.3.3 | 1.3.3.1 | Extend animations.css |
| 1 | 1.3 | 1.3.3 | 1.3.3.2 | Create useScrollReveal hook |
| 2 | 2.1 | 2.1.1 | 2.1.1.1 | Restyle Button |
| 2 | 2.1 | 2.1.2 | 2.1.2.1 | Restyle Input |
| 2 | 2.1 | 2.1.2 | 2.1.2.2 | Restyle Badge |
| 2 | 2.1 | 2.1.3 | 2.1.3.1 | Restyle Card |
| 2 | 2.1 | 2.1.3 | 2.1.3.2 | Restyle Modal |
| 2 | 2.1 | 2.1.4 | 2.1.4.1 | Redesign ThemeToggle |
| 2 | 2.1 | 2.1.4 | 2.1.4.2 | Restyle Toast |
| 2 | 2.2 | 2.2.1 | 2.2.1.1 | Restyle Header |
| 2 | 2.2 | 2.2.2 | 2.2.2.1 | Restyle Footer |
| 2 | 2.2 | 2.2.3 | 2.2.3.1 | Restyle SectionHeader |
| 3 | 3.1 | 3.1.1 | 3.1.1.1 | Rebuild HeroSection |
| 3 | 3.1 | 3.1.2 | 3.1.2.1 | Rebuild ProductsSection |
| 3 | 3.2 | 3.2.1 | 3.2.1.1 | Restyle ValuesSection |
| 3 | 3.2 | 3.2.2 | 3.2.2.1 | Restyle StorySection |
| 3 | 3.2 | 3.2.3 | 3.2.3.1 | Restyle FAQSection |
| 3 | 3.3 | 3.3.1 | 3.3.1.1 | Restyle NewsletterSection |
| 3 | 3.3 | 3.3.2 | 3.3.2.1 | Restyle ProductDetailModal |
| 3 | 3.3 | 3.3.2 | 3.3.2.2 | Restyle WaitlistModal |
| 4 | 4.1 | 4.1.1 | 4.1.1.1 | Create responsive.css |
| 4 | 4.1 | 4.1.2 | 4.1.2.1 | Hero responsive |
| 4 | 4.1 | 4.1.2 | 4.1.2.2 | Products responsive |
| 4 | 4.1 | 4.1.2 | 4.1.2.3 | Values responsive |
| 4 | 4.1 | 4.1.2 | 4.1.2.4 | Story/FAQ/Newsletter responsive |
| 4 | 4.1 | 4.1.2 | 4.1.2.5 | Footer responsive |
| 4 | 4.1 | 4.1.3 | 4.1.3.1 | Polish mobile hamburger |
| 4 | 4.2 | 4.2.1 | 4.2.1.1 | Wire scroll reveals |
| 4 | 4.2 | 4.2.2 | 4.2.2.1 | Product card hover effects |
| 4 | 4.2 | 4.2.2 | 4.2.2.2 | Nav and footer link hover |
| 4 | 4.2 | 4.2.2 | 4.2.2.3 | Theme transition CSS |
| 5 | 5.1 | 5.1.1 | 5.1.1.1 | Skip-to-content link |
| 5 | 5.1 | 5.1.1 | 5.1.1.2 | ARIA labels and roles |
| 5 | 5.1 | 5.1.2 | 5.1.2.1 | Focus trap in modal |
| 5 | 5.1 | 5.1.2 | 5.1.2.2 | Focus indicator styles |
| 5 | 5.2 | 5.2.1 | 5.2.1.1 | SEO meta tags + robots + sitemap |
| 5 | 5.3 | 5.3.1 | 5.3.1.1 | Lazy loading images |
| 5 | 5.3 | 5.3.2 | 5.3.2.1 | React ErrorBoundary |
| 5 | 5.3 | 5.3.2 | 5.3.2.2 | Test production build |
| 6 | 6.1 | 6.1.1 | 6.1.1.1 | Dark mode visual QA |
| 6 | 6.1 | 6.1.1 | 6.1.1.2 | Light mode visual QA |
| 6 | 6.1 | 6.1.2 | 6.1.2.1 | Interaction regression test |
| 6 | 6.2 | 6.2.1 | 6.2.1.1 | Deployment config |
| 6 | 6.2 | 6.2.1 | 6.2.1.2 | Final deployment |

---

> *"Real nutrition. Real ingredients. Real good."* 🚀
