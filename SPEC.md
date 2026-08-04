# Shah's Nutrition Landing Page — Technical Specification (SPEC.md)

This specification document outlines the complete technical blueprint, visual details, component contracts, data schemas, and styling specifications for building the **Shah's Nutrition** website.

---

## 1. Product Requirements & Design Analysis

### Brand Identity
- **Brand Name**: Shah's Nutrition
- **Tagline**: *Healthy Food that Tastes Unhealthy 😉*
- **Core Value Proposition**: *Complete, everyday nutrition made normal — tasty enough that kids eat it, honest enough that you know what's inside, affordable for the whole household.*
- **Goal**: Make complete, everyday nutrition normal again — one familiar food at a time.
- **Voice**: First-person founder (Pranjali). Warm, playful, honest, everyday-Indian. Not corporate, not gym-coded.

### Color Palettes & Aesthetics

#### Dark Theme (`data-theme="dark"`)
- Background Base: `#0e1114` to `#161a1e` smooth subtle radial gradient
- Section Containers: `#1c2127` with `1px solid rgba(255, 255, 255, 0.08)` border
- Accent Colors: Warm Gold `#d4af37` / `#e5c158`
- Primary Button: Warm Gold `#d4af37` gradient to `#b89327` with dark text (`#0e1114`)
- Text Primary: `#ffffff`
- Text Secondary: `#9ca3af`
- Glassmorphism: `background: rgba(28, 33, 39, 0.75)`, `backdrop-filter: blur(16px)`

#### Light Theme (`data-theme="light"`)
- Background Base: Luminous soft indigo/sky gradient background (`#e0f2fe` -> `#dbeafe` -> `#f1f5f9`)
- Section Containers: Frosted glass white `rgba(255, 255, 255, 0.7)` with `1px solid rgba(255, 255, 255, 0.8)`
- Accent Colors: Electric Blue `#3b82f6` & Emerald Aqua `#0ea5e9`
- Primary Button: Radiant Blue `#3b82f6` gradient to `#2563eb` with white text
- Text Primary: `#0f172a`
- Text Secondary: `#475569`
- Glassmorphism: `background: rgba(255, 255, 255, 0.65)`, `backdrop-filter: blur(16px)`

---

## 2. Component Blueprint & Data Contracts

### A. Data Schemas (`src/types/`)

#### Product Schema (`src/types/product.ts`)
```typescript
export interface NutritionFact {
  label: string; // e.g. "Protein", "Calories"
  value: string; // e.g. "15g", "180 kcal"
}

export interface Product {
  id: string;
  name: string; // "Protein Chivda", "Muesli", "Protein Bars"
  tagline: string;
  shortDescription: string;
  fullDescription: string;
  badgeIcon: 'leaf' | 'wheat' | 'dumbbell';
  image: string;
  features: string[];
  ingredients: string[];
  nutritionFacts: NutritionFact[];
  weightOptions: string[]; // ["250g", "500g", "Pack of 3"]
  isPopular?: boolean;
}
```

#### Value Schema (`src/types/values.ts`)
```typescript
export type ValueIconType = 'utensils' | 'scan-search' | 'users-round';

export interface BrandValue {
  id: string;
  title: string;
  description: string;
  iconType: ValueIconType;
}
```

#### FAQ Schema (`src/types/faqs.ts`)
```typescript
export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category?: string;
}
```

---

## 3. UI Section Breakdown & Requirements

### 1. Sticky Navigation Header (`Header.tsx`)
- Left: Shah's Nutrition logo image & brand name text.
- Center: Quick navigation links (`Products`, `Our Story`). Smooth scroll to `#products` and `#our-story`.
- Right:
  - Theme Toggle Switch (Sun / Moon icon with smooth slider transition).
  - Social Icon Links (Instagram `@shahsnutrition`, Email `pranjalishah25@gmail.com` until a branded inbox is configured).
  - `Join Waitlist →` button trigger opening `WaitlistModal`.

### 2. Hero Section (`HeroSection.tsx`)
- Badge: `OUR GOAL` pill badge.
- Main Heading: `To make tasty and healthy food for you and your family` with gradient accent on **"tasty"**, **"healthy"**, **"you"**, and **"family"**. The heading lives in `siteConfig.heroHeading` as an array of `TextSegment`s (`src/types/content.ts`); highlighted segments render with the `text-gradient` class.
- Subtitle: `Complete Nutrition for Every Day and Every One` (from `siteConfig.motto`).
- Waitlist Form: Email text input + `Join Waitlist →` submit button.
- Live Social Proof Stack: 4 overlapping avatar thumbnails + `500+ people have already joined!` counter text.
- Hero Visual: Composition of product pouch, natural ingredients bowl, and floating spices.

### 3. Product Showcase (`ProductsSection.tsx`)
- Section Header: `OUR FIRST PRODUCTS` — `We're starting with Protein Chivda, Muesli, and Protein Bars.`
- Grid of 3 Product Cards:
  - Product image showcase.
  - Icon badge.
  - Title & short description.
  - `Learn more →` button opening `ProductDetailModal`.

### 4. Brand Values (`ValuesSection.tsx`)
- Section Header: `What we believe` (from `valuesHeading` in `src/data/values.ts`).
- 3 Glass Cards (data-driven from `valuesData`), 3-column grid on desktop, stacked on mobile:
  - **Good Tastes Only** (icon: `Utensils`): "Healthy should never taste like a downgrade."
  - **Know What's Inside** (icon: `ScanSearch`): "I'll always keep the ingredients clear, so you know what you're eating."
  - **For Every Day and Every One** (icon: `UsersRound`): "Complete, honest nutrition at a price that works for the whole household, every ordinary day."
- Each card: restrained single-color icon in a circle, title, supporting line, subtle hover lift/glow. Theme-aware via `--color-bg-card`, `--glass-backdrop`, `--color-text-accent`.

### 5. Our Story Section (`StorySection.tsx`)
- Section Header: `OUR STORY` — `Making healthy food that tastes unhealthy.`
- Story Paragraphs (first-person founder voice, from `siteConfig.story`): pain → belief → decision arc. Opens with the modern Indian diet failing nutrition and healthy food feeling like a downgrade; the belief that healthy shouldn't mean a downgrade (the son's "betrayal"); and the decision to build Shah's Nutrition so complete everyday nutrition feels normal again.
- Selective highlights: paragraphs are arrays of `TextSegment`s; the key phrases render with the `.story-highlight` class (gradient text + 2px underline). Highlighted phrases: "It tastes...healthy.", "Healthy food shouldn't feel like a downgrade.", "healthy food that tastes unhealthy", "This is just the beginning". No whole-paragraph bolding.
- Image: High quality founders kitchen / preparation photograph.

### 6. Interactive FAQ Accordion (`FAQSection.tsx`)
- Common customer questions regarding launch dates, pre-orders, ingredient sourcing, shipping, and dietary suitability.

### 7. Newsletter CTA Banner (`NewsletterSection.tsx`)
- Mail icon badge.
- Heading: `Be the first to know.`
- Subtitle: `New products, early access, and exclusive updates.`
- Reusable Waitlist Form & Avatar Stack.

### 8. Footer (`Footer.tsx`)
- Left: Logo + Tagline (`Healthy Food that Tastes Unhealthy 😉` from `siteConfig.tagline`).
- Columns: Quick Links, Follow Us, For Business Inquiries (`pranjalishah25@gmail.com` until branded inboxes are configured).
- Copyright statement.
