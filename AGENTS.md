# AGENTS.md: Shah's Nutrition

The one-page guide for anyone (agent or person) working in this repo. Read it before you change anything.

## What this is

Shah's Nutrition is a small Indian food brand (Raggi Jaggi, Muesli, Date Bites) from Satara. This repo is its website: a single landing page plus a small admin area. The brand launched on 2026-09-23. People **order on WhatsApp** (there's no cart or checkout), and they can join an email list for news.

The voice is first-person founder (Pranjali): warm, honest, everyday Indian. Not corporate, not gym talk. `SPEC.md` has the full brand, color and component spec. It's the source of truth for the product.

## Stack and commands

React 18 + TypeScript + Vite + plain CSS + Lucide icons. Supabase handles data and admin. Loops and Resend handle email. The site is hosted on Vercel.

```bash
npm run dev      # local dev server (Vite)
npm run build    # tsc + vite build → dist/  (run this before every commit)
npm run lint     # type check only
```

**A push to `main` deploys to production** (https://shahsprotein.vercel.app). There's no staging. Check your work in a browser at phone and desktop sizes, in light and dark, before you push.

## Where things live

```
src/
├── App.tsx              # Routes: "/" landing page, "/admin/*" admin (Supabase auth)
├── components/
│   ├── layout/          # Header (with mobile drawer + Order button), Footer, Container
│   ├── sections/        # Hero, Products (cards + product popup), Values, Story, FAQ, Newsletter
│   ├── ui/              # Primitives: Button, Input, Modal, ThemeToggle, Toast, OrderLink, CustomerCareLinks…
│   └── admin/           # Admin dashboard, waitlist CRM, campaigns, analytics
├── data/                # ALL copy and content: products, faqs, values, siteConfig (phone numbers, wa.me links)
├── context/             # ThemeContext, WaitlistContext
├── services/            # waitlistService (signup), analyticsService (incl. WhatsApp order clicks)
├── hooks/               # useScrollReveal, use3DTilt
├── styles/              # global.css imports tokens → themes → animations → responsive
└── types/
supabase/                # migrations, edge functions, README (backend setup and secrets)
public/assets/           # images used by the site
Design/, Assets/         # reference designs and asset prompts, not shipped
```

## Rules

- **Copy and data live in `src/data/`, never in JSX.** Phone numbers live only in `siteConfig`. Build WhatsApp links with the helper there.
- **Colors come from tokens** (`tokens.css`, `light-theme.css`, `dark-theme.css`). No hex in components. The only exception is success/error colors in Toast.
- **Both themes must look right.** Theme is set with `data-theme` on `<html>`.
- **Don't change nutrition panels or product facts** without the founder. Some were restored on purpose.
- **Don't invent facts** such as prices, delivery promises or storage advice. Leave them out until they're confirmed.
- **Section order is fixed:** Hero → Products → Values → Story → FAQ → Newsletter → Footer. No "building in public" section, even though the reference designs show one.
- The email list code is still named "waitlist" (`useWaitlist`, `waitlistService`, admin screens). That's intentional. Don't rename it.
- Accessibility basics stay: `aria-label` on each section, focus trap and restore in Modal, 44px touch targets on phones, and `:focus-visible` rings.

## Gotchas

- **Full-screen sections with scroll snap.** On desktop, every section is `min-height: 100vh` with mandatory snap. Snap is **off** at ≤900px wide or ≤600px tall, because phone sections are taller than the screen and snap fights the user. Don't turn it back on for phones.
- **The reveal animation moves the inner `.container`, not the section.** Moving the section's box breaks anchor links (the heading lands under the fixed header) and makes the page load already scrolled. See the end of `animations.css`.
- **CSS cascade order:** `responsive.css` is imported *before* the rest of `global.css`, so `global.css` wins every tie. That's why old rules use `!important`. Phone fixes go in the **mobile block at the end of `global.css`**. Don't add more `!important` to `responsive.css`.
- **Inline styles in components** (Hero, Header drawer) beat CSS. A few mobile rules need `!important` for that reason. Prefer moving a value from inline to a class.
- **Product popup on phones:** the title and close button form a sticky row (`.modal-head`). The Order button is pinned to the bottom. Test scrolling inside the popup at 320px.
- **Several sessions may share this folder.** Other agents or people may have uncommitted work here. Don't `checkout`, `stash` or `reset` a tree you didn't start in. For parallel work, use a `git worktree` in a sibling folder, and leave untracked files you don't own alone (for example `public/assets/packaging/`, `public/assets/story-ideas/`, `*.xlsx`).
- `temp/` is scratch space for working notes. It isn't product docs.

## Backend (email list and analytics)

- Supabase is the source of truth for sign-ups, admin access, CRM and analytics. Signups go through the Supabase RPC in `waitlistService.ts`, then the `sync-waitlist-loops` edge function.
- Loops runs double opt-in and the mailing list. `loops-webhook` syncs confirm, unsubscribe and bounce events back.
- WhatsApp order clicks are recorded through a rate-limited RPC into `site_events`, fire and forget.
- Secrets live only in Supabase. Never put them in frontend env vars or commits. Setup and deploy details are in `supabase/README.md`.
