# AGENTS.md — Shah's Nutrition Core Architectural Gotchas & Rules

---

## 0. BUILD PLAN — Read This First

> **All implementation work is tracked in [`BUILD_PLAN.md`](../BUILD_PLAN.md) at the repo root.**

If you were sent here to execute a task, sprint, stage, or phase:

1. **Open [`BUILD_PLAN.md`](../BUILD_PLAN.md)** and find your specific task by its ID (e.g. `2.1.1.1`).
2. **Read the task description fully** — it contains the files to change, what to do, reference design pointers, and the exact commit message.
3. **Read the rules in this file (sections 1–3 below)** — they apply to every task, every time.
4. **Reference designs** live in `Design/Dark Mode.png` and `Design/Light Mode.png` — pixel truth for every visual decision.
5. **After completing your task**, commit with the exact message format specified: `[X.X.X.X] short description`.

### How to execute a checkpoint
- **Stage checkpoint** → run only the verification steps listed under "Stage X.X.X Checkpoint" in `BUILD_PLAN.md`. Fix anything that fails.
- **Sprint checkpoint** → run the verification steps under "Sprint X.X Checkpoint". Do a code review of all changes in that sprint.
- **Phase checkpoint** → run the verification steps under "Phase X Checkpoint". Full audit of the phase.

---


## 1. Project Context
**Shah's Nutrition** is a direct-to-consumer landing page with dual Light/Dark theme parity, product showcase with nutrition modals, brand story, core values, FAQ, and email waitlist system.

---

## 2. Core Gotchas & Mandatory Rules

### A. Excluded Sections & Scope
- **CRITICAL**: **No "Building in Public" / Journey Section**. Do NOT include or build any public roadmap or building-in-public timeline section in the landing page architecture or components, **EVEN IF IT APPEARS IN THE REFERENCE DESIGN IMAGES (`Dark Mode.png` / `Light Mode.png`)**. Skip the entire section and ensure the page layout flows seamlessly and naturally: `Hero` -> `Products` -> `Core Values` -> `Our Story` -> `FAQ` -> `Newsletter` -> `Footer`.

### B. Theme System (`data-theme`)
- Theme state is toggled via `document.documentElement.setAttribute('data-theme', 'light' | 'dark')`.
- **CRITICAL**: Never hardcode hex color values in inline styles or component CSS. Always use design token CSS variables (e.g., `var(--color-bg-card)`, `var(--color-text-primary)`, `var(--color-accent-gradient)`).

### C. Content & Data Separation
- **CRITICAL**: All text, product details, FAQs, and site configuration live strictly inside `src/data/*.ts`.
- Never hardcode text content directly inside section components. Modifying `src/data/products.ts` or `src/data/faqs.ts` must update the site without changing JSX components.

### D. Backend API Encapsulation
- All email submission logic, validation, and count state MUST go through `src/services/waitlistService.ts`.
- Components MUST use `useWaitlist()` context hook. Do not fetch or mutate local storage directly inside UI components.

### E. Layered Component Scope
- `src/components/ui/`: Pure primitives only (`Button`, `Input`, `Badge`, `Card`, `Modal`). No domain logic, no context access.
- `src/components/sections/`: Compose UI primitives and pull data from props or `src/data/`.
- `src/components/modals/`: Render popups using global `ModalContext`.

---

## 3. High-Quality Code Principles
1. **Right Level of Abstraction**: Extract a component only if reused 2+ times or if doing so reduces a file exceeding 150 lines.
2. **Strict Typing**: Use explicit interfaces from `src/types/`. Avoid `any`.
3. **Responsive Glassmorphism**: Cards and headers rely on `backdrop-filter: var(--glass-backdrop)`. Maintain container width limits (`var(--container-max-width)`).
