# AGENTS.md — Shah's Nutrition Architectural Rules & Reference

---

## 0. Project Status

> **BUILD COMPLETE.** All 47 tasks across 6 phases have been executed and verified.
> The site is production-ready. This file serves as the living architectural reference for all future maintenance and feature work.

---

## 1. Project Context

**Shah's Nutrition** is a direct-to-consumer landing page built with **React 18 + TypeScript + Vite + Vanilla CSS + Lucide Icons**. It features dual Light/Dark theme parity, product showcase with nutrition modals, brand story, core values, FAQ, and email waitlist system.

### Architecture Map

```
src/
├── App.tsx                    # Root shell — providers, ErrorBoundary-wrapped sections, modals, toast
├── main.tsx                   # React entry point
├── components/
│   ├── ui/                    # Pure primitives: Button, Input, Badge, Card, Modal, ThemeToggle, Toast, AvatarGroup, ErrorBoundary
│   ├── layout/                # Header, Footer, Container, SectionHeader
│   ├── sections/              # HeroSection, ProductsSection, ValuesSection, StorySection, FAQSection, NewsletterSection
│   └── modals/                # ProductDetailModal, WaitlistModal
├── context/                   # ThemeContext, WaitlistContext, ModalContext
├── data/                      # products.ts, faqs.ts, values.ts, siteConfig.ts
├── hooks/                     # useScrollReveal.ts
├── services/                  # waitlistService.ts, analyticsService.ts
├── styles/                    # global.css, tokens.css, dark-theme.css, light-theme.css, animations.css, responsive.css
└── types/                     # product.ts, faq.ts, values.ts, theme.ts, waitlist.ts
```

### Section Flow (enforced)
`Hero` → `Products` → `Core Values` → `Our Story` → `FAQ` → `Newsletter` → `Footer`

### Reference Files

| File | Purpose |
|------|---------|
| `SPEC.md` | Full product spec: color palettes, component contracts, section breakdown |
| `Design/Dark Mode.png` | Dark theme reference design (pixel truth) |
| `Design/Light Mode.png` | Light theme reference design (pixel truth) |
| `Design/Logo.png` | Brand logo source file |
| `Assets/ASSET_GENERATION_SPEC.md` | AI prompts + specs for every image asset |

---

## 2. Core Rules

### A. Excluded Sections & Scope
- **CRITICAL**: **No "Building in Public" / Journey Section**. Do NOT include or build any public roadmap or building-in-public timeline section, **EVEN IF IT APPEARS IN THE REFERENCE DESIGN IMAGES**. The page layout flows: `Hero` → `Products` → `Core Values` → `Our Story` → `FAQ` → `Newsletter` → `Footer`.

### B. Theme System (`data-theme`)
- Theme state is toggled via `document.documentElement.setAttribute('data-theme', 'light' | 'dark')`.
- **CRITICAL**: Never hardcode hex color values in inline styles or component CSS. Always use design token CSS variables (e.g., `var(--color-bg-card)`, `var(--color-text-primary)`, `var(--color-accent-gradient)`).
- **Allowed exception**: Universal UX status colors (`#22c55e` green for success, `#ef4444` red for error) are permitted in `Toast.tsx` and success confirmation messages in modals.

### C. Content & Data Separation
- **CRITICAL**: All text, product details, FAQs, values, and site configuration live strictly inside `src/data/*.ts`.
- Never hardcode text content directly inside section components. Modifying `src/data/products.ts` or `src/data/faqs.ts` must update the site without changing JSX components.

### D. Backend API Encapsulation
- All email submission logic, validation, and count state MUST go through `src/services/waitlistService.ts`.
- Components MUST use `useWaitlist()` context hook. Do not fetch or mutate local storage directly inside UI components.

### E. Layered Component Scope
- `src/components/ui/`: Pure primitives only (`Button`, `Input`, `Badge`, `Card`, `Modal`). No domain logic, no context access.
  - **Documented exceptions**: `ThemeToggle` uses `useTheme()`, `AvatarGroup` uses `useWaitlist()` for count display, `Toast` uses `useWaitlist()` for toast state. These are acceptable since they are global-scope utilities, not domain-specific components.
- `src/components/sections/`: Compose UI primitives and pull data from props or `src/data/`.
- `src/components/modals/`: Render popups using global `ModalContext`.

### F. Accessibility
- Every `<section>` has `aria-label`.
- FAQ accordion uses `aria-expanded` and `aria-controls`.
- Modal has `role="dialog"`, `aria-modal="true"`, focus trap, and focus restoration.
- Toast has `role="alert"` and `aria-live="polite"`.
- All icon-only buttons have `aria-label`.
- Skip-to-content link is present as the first element.
- `:focus-visible` indicators styled globally.

### G. Performance & SEO
- Hero image uses `fetchPriority="high"` (LCP element).
- All other images use `loading="lazy"` with explicit `width`/`height`.
- Every section wrapped in `<ErrorBoundary>`.
- Full SEO meta: OG tags, Twitter Cards, JSON-LD structured data, `robots.txt`, `sitemap.xml`.

### H. Deployment
- **Platform**: Vercel (configured via `vercel.json`).
- **Build**: `npm run build` → `tsc && vite build` → `dist/`.
- **Assets**: Cached with `Cache-Control: public, max-age=31536000, immutable`.
- **SPA routing**: All routes rewrite to `/index.html`.

---

## 3. High-Quality Code Principles

1. **Right Level of Abstraction**: Extract a component only if reused 2+ times or if doing so reduces a file exceeding 150 lines.
2. **Strict Typing**: Use explicit interfaces from `src/types/`. Avoid `any`.
3. **Responsive Glassmorphism**: Cards and headers rely on `backdrop-filter: var(--glass-backdrop)`. Maintain container width limits (`var(--container-max-width)`).
4. **CSS Variables Only**: All colors, spacing, radii, transitions, and z-indexes come from `src/styles/tokens.css` and theme files. No magic numbers.
5. **Scroll Reveal**: Use `useScrollReveal()` hook + `.reveal` CSS class for entrance animations. Stagger children with `.delay-100` through `.delay-500`.
