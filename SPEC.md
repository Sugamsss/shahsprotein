# Shah's Nutrition Landing Page — Technical Specification (SPEC.md)

This specification document outlines the complete technical blueprint, visual details, component contracts, data schemas, and styling specifications for building the **Shah's Nutrition** website.

---

## 1. Product Requirements & Design Analysis

### Brand Identity
- **Brand Name**: Shah's Nutrition
- **Tagline**: *Natural. Honest. Accessible.*
- **Core Value Proposition**: *Real nutrition. Real ingredients. Real good.*
- **Goal**: Make natural, high-quality nutrition available and affordable to everyone.

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
export interface BrandValue {
  id: string;
  title: string; // "Natural Ingredients"
  description: string;
  icon: 'leaf' | 'dumbbell' | 'currency';
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
  - Social Icon Links (Instagram `@shahsnutrition`, Email `hello@shahsnutrition.com`).
  - `Join Waitlist →` button trigger opening `WaitlistModal`.

### 2. Hero Section (`HeroSection.tsx`)
- Badge: `OUR GOAL` pill badge.
- Main Heading: `To make natural, high quality nutrition available and affordable to everyone.` with gradient accent on key words.
- Subtitle: `Real nutrition. Real ingredients. Real good.`
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
- Section Header: `WHAT WE BELIEVE IN`
- 3 Column Cards:
  - **Natural Ingredients**: "Real food first. No artificial additives, ever."
  - **Meaningful Nutrition**: "High in protein. Made to support your everyday."
  - **Honest Pricing**: "Premium quality shouldn't come with a premium price tag."

### 5. Our Story Section (`StorySection.tsx`)
- Section Header: `OUR STORY` — `Why we started Shah's Nutrition.`
- Story Paragraphs: Founders journey narrative explaining the mission to eliminate fake ingredients and high markups.
- Image: High quality founders kitchen / preparation photograph.

### 6. Interactive FAQ Accordion (`FAQSection.tsx`)
- Common customer questions regarding launch dates, pre-orders, ingredient sourcing, shipping, and dietary suitability.

### 7. Newsletter CTA Banner (`NewsletterSection.tsx`)
- Mail icon badge.
- Heading: `Be the first to know.`
- Subtitle: `New products, early access, and exclusive updates.`
- Reusable Waitlist Form & Avatar Stack.

### 8. Footer (`Footer.tsx`)
- Left: Logo + Tagline (`Natural. Honest. Accessible.`).
- Columns: Quick Links, Follow Us, For Business Inquiries (`business@shahsnutrition.com`).
- Copyright statement.
