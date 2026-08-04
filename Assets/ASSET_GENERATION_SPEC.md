# Shah's Nutrition — Image Asset Generation Specification (`ASSET_GENERATION_SPEC.md`)

This document provides an **exhaustive, pixel-faithful specification** for generating all visual assets for the **Shah's Nutrition** landing page. Every prompt, framing rule, composition layout, color grade, and lighting instruction has been extracted directly from the reference design mockups ([Dark Mode.png](file:///Users/sugam/0.%20Production%20Projects/shahsprotein/Design/Dark%20Mode.png) and [Light Mode.png](file:///Users/sugam/0.%20Production%20Projects/shahsprotein/Design/Light%20Mode.png)).

---

## 📐 General Composition & Style Guidelines

1. **Aesthetic**: Premium Direct-to-Consumer (D2C) food & wellness brand photography. Clean, authentic, appetite-appealing, with tactile natural textures (roasted nuts, whole grains, raw spices, slate, ceramic, warm wood). Think editorial food magazine covers — not stock photography.
2. **Photography Direction**: Shoot with the look of a 50mm or 85mm prime lens at f/2.8–f/4. Soft directional key light from the upper-left at ~45°, with a warm fill light and subtle rim/backlight to separate subjects from the background. Avoid harsh flat flash, on-camera flash, or overly CGI/rendered aesthetics.
3. **Packaging Detail**: The Shah's Nutrition pouch is a **matte kraft-paper stand-up pouch** in a warm beige/tan tone. It features the brand name "Shah's Nutrition" in clean, dark serif typography, with sub-text reading "Healthy Food that Tastes Unhealthy." The pouch has a clean, premium, minimal design — no busy graphics.
4. **Color Grading**: Warm, rich tones. Highlight warm golds, amber, and earth tones in the food. Shadows should lean warm charcoal (not cool blue/gray). Slight warm color cast across the frame.
5. **Vignette & Framing Rules**:
   - For **Hero Composition**: The main subjects (pouch & falling ingredients) must be positioned strictly on the **right half (50%–95% of frame)**, leaving the **left half (0%–45% of frame) empty and softly faded** to dark vignette for headline text and CTA overlay.
6. **Negative Guidance (apply to all)**: No text overlays, no watermarks, no logos rendered on images (the pouch label is part of the product, not a graphic overlay). No cartoonish or hyper-saturated looks. No people in food product shots unless specified.

---

## 🖼️ Exhaustive Asset Generation Directory & Prompts

---

### Asset 1: Hero Section Main Composition Image
- **Filename**: `public/assets/hero-composition.png`
- **Aspect Ratio**: `4:3` (Recommended resolution: 1600×1200)
- **Reference Location**: Top right hero area in `Dark Mode.png` and `Light Mode.png`
- **Composition & Layout**:
  - **Left Side (0%–45%)**: Empty, dark, softly faded vignette background — a smooth warm-to-dark gradient. No subjects on the left. This area is reserved for headline text overlay.
  - **Right Side (45%–95%)**: A large matte beige kraft stand-up pouch labeled "Shah's Nutrition" stands prominently, taking up significant vertical space. Above and around the pouch, an assortment of raw ingredients — roasted peanuts, whole almonds, green pumpkin seeds, chickpeas, golden spice granules — are **dynamically cascading and falling through mid-air**, as if being poured from above into/around the pouch. The ingredients are frozen in motion at various heights, creating a sense of energy and abundance.
  - **Surface**: The pouch sits on a dark charcoal slate surface. A few scattered ingredients have landed on the surface in the foreground.
  - **Lighting**: Warm directional key light from the upper-left illuminating the pouch and catching highlights on the falling nuts/seeds. Soft amber rim light on the right edge of the pouch. Background fades to deep charcoal.
- **AI Prompt**:
  > *"Premium D2C food brand studio photography, editorial quality. A large matte beige kraft-paper stand-up pouch labeled 'Shah's Nutrition' positioned on the right side of the frame. Assorted raw ingredients — roasted peanuts, whole almonds, green pumpkin seeds, chickpeas, golden turmeric granules — are dynamically cascading and falling through mid-air above and around the pouch, frozen in motion as if being poured from above. Ingredients at various heights creating a sense of abundance and energy. The pouch sits on a dark charcoal slate surface with a few scattered ingredients on the surface. The left 45% of the frame is completely empty with a smooth dark vignette gradient for text overlay. Warm directional key light from the upper-left, soft amber rim light on the pouch, deep charcoal background. Shot with 85mm lens, f/3.5, shallow depth of field. 8K resolution, photorealistic food photography, no text overlays."*

---

### Asset 2: Product Card 1 — Protein Chivda
- **Filename**: `public/assets/product-chivda.png`
- **Aspect Ratio**: `4:3` (Recommended resolution: 1200×900)
- **Reference Location**: First Product Card under "OUR FIRST PRODUCTS"
- **Composition & Layout**:
  - **Left-center**: A white ceramic bowl filled generously with Indian protein chivda — a savory snack mix featuring flat crispy pieces (thin sev strands and flattened rice flakes), roasted peanuts, puffed chickpea crispies, whole curry leaves, and golden turmeric-coated bits. The mix has a warm golden-brown color palette.
  - **Right/behind**: A standing matte beige craft pouch labeled "Shah's Nutrition" positioned beside and slightly behind the bowl.
  - **Foreground**: A few loose peanuts, crispy flakes, and spice bits scattered naturally on the dark surface in front of the bowl.
  - **Background**: Smooth dark charcoal/obsidian backdrop with a subtle radial warm glow behind the product group, creating depth.
- **AI Prompt**:
  > *"Editorial food photography of Indian savory protein snack. A white ceramic bowl filled with golden-brown protein chivda — a crunchy mix of thin sev strands, flattened rice flakes, roasted peanuts, puffed chickpea crispies, whole curry leaves, and turmeric-spiced bits. Next to the bowl stands a matte beige kraft stand-up food pouch labeled 'Shah's Nutrition'. A few loose peanuts and crispy flakes scattered naturally on the dark surface. Dark charcoal studio background with subtle warm radial glow behind subjects. Warm directional side lighting from upper-left, 50mm lens, f/3.5, shallow depth of field, macro detail on textures. 8K photorealistic food photography."*

---

### Asset 3: Product Card 2 — Muesli
- **Filename**: `public/assets/product-muesli.png`
- **Aspect Ratio**: `4:3` (Recommended resolution: 1200×900)
- **Reference Location**: Second Product Card under "OUR FIRST PRODUCTS"
- **Composition & Layout**:
  - **Left-center**: A white ceramic breakfast bowl filled with protein muesli — visible rolled oats, sliced almonds, whole pumpkin seeds, chia seeds, and dried red cranberries. The mix has an earthy, wholesome, breakfast-ready appearance.
  - **Garnish**: Fresh berries (strawberries, raspberries) placed as garnish near or on top of the bowl, adding pops of vivid red against the earthy oats. A few fresh blueberries as well.
  - **Right/behind**: A standing beige pouch with "Shah's Nutrition" branding, positioned behind the bowl.
  - **Background**: Dark charcoal gradient with soft top-down fill lighting that highlights the oat textures, seed surfaces, and the glossy skin of the fresh berries.
- **AI Prompt**:
  > *"Editorial breakfast food photography. A white ceramic bowl filled with protein muesli — rolled oats, sliced almonds, green pumpkin seeds, chia seeds, and dried red cranberries. Fresh strawberries and raspberries placed as colorful garnish near the bowl, adding vivid red pops of color. A matte beige kraft stand-up food pouch labeled 'Shah's Nutrition' stands behind the bowl. Dark moody charcoal background with soft warm top-down lighting highlighting oat textures and the glossy skin of fresh berries. Appetizing breakfast styling, 50mm lens, f/3.5, shallow depth of field. 8K photorealistic food photography, warm color grading."*

---

### Asset 4: Product Card 3 — Protein Bars
- **Filename**: `public/assets/product-bars.png`
- **Aspect Ratio**: `4:3` (Recommended resolution: 1200×900)
- **Reference Location**: Third Product Card under "OUR FIRST PRODUCTS"
- **Composition & Layout**:
  - **Foreground**: Stacked protein bars — **golden-brown, dense, peanut-studded** texture. Some bars are cut to show the cross-section revealing whole roasted peanuts embedded in a dense chewy matrix. Some bars are wrapped in simple kraft-style packaging, others unwrapped. The bars are NOT dark chocolate colored — they are a warm golden-brown/peanut-butter color.
  - **Scattered elements**: Whole roasted peanuts, a few chocolate chunks, and crumbled bar pieces arranged naturally around the stack on a dark slate board.
  - **Background**: A standing matte beige pouch labeled "Shah's Nutrition" visible in the soft-focus background.
- **AI Prompt**:
  > *"Editorial food photography of artisan protein bars. Stacked golden-brown, dense, peanut-studded protein bars — some cut in half to reveal cross-section with visible whole roasted peanuts embedded in a chewy matrix. Some bars wrapped in kraft paper, others unwrapped. Scattered whole roasted peanuts and a few dark chocolate chunks arranged naturally on a dark slate cutting board. A matte beige food pouch labeled 'Shah's Nutrition' in the soft-focus background. Warm moody studio lighting from upper-left, shallow depth of field emphasizing the front bar's texture, 85mm lens, f/2.8. 8K photorealistic food photography, warm golden tones."*

---

### Asset 5: Our Story — Founders Kitchen Photograph
- **Filename**: `public/assets/story-kitchen.png`
- **Aspect Ratio**: `16:9` (Recommended resolution: 1920×1080)
- **Reference Location**: "OUR STORY — Making healthy food that tastes unhealthy" right-side image
- **Composition & Layout**:
  - Wide 16:9 panoramic shot inside a modern, warmly lit kitchen.
  - Two young Indian men (co-founders, mid-20s) wearing casual black t-shirts, standing behind a clean wooden kitchen island counter.
  - **Candid, not posed**: One founder is actively pouring ingredients or preparing food in a bowl; the other stands beside him, engaged in the process — looking down at what they're making or at each other, **not directly at the camera**. The mood is authentic and in-the-moment.
  - On the counter: Shah's Nutrition pouches, ceramic bowls with muesli/snack mixes, a glass of milk, glass storage jars filled with nuts and oats.
  - Background: Modern kitchen cabinets, a small houseplant, with subtle depth-of-field blur on the background.
  - Lighting: Bright natural window light from the left/behind, supplemented with warm ambient kitchen lighting. The overall mood is inviting, genuine, and warm.
- **AI Prompt**:
  > *"Authentic lifestyle brand photograph, candid moment. Two young Indian men in their mid-20s wearing casual black t-shirts standing together behind a modern wooden kitchen island counter. One is actively pouring ingredients into a ceramic bowl while the other watches and engages — both looking at what they're preparing, not at the camera. On the counter: beige food pouches, ceramic bowls with granola and snack mixes, a glass of milk, glass jars filled with almonds and oats. Modern kitchen background with light wood cabinets, a small green houseplant, soft background blur. Bright natural window light from the left mixed with warm ambient kitchen lighting. Candid, genuine, warm lifestyle photography. Shot with 35mm lens, f/2.8, wide angle, shallow depth of field on background. 8K resolution, photorealistic."*

---

### Assets 6–9: Social Proof Avatars (4 Headshots)
- **Filenames**:
  - `public/assets/avatar-1.png`
  - `public/assets/avatar-2.png`
  - `public/assets/avatar-3.png`
  - `public/assets/avatar-4.png`
- **Aspect Ratio**: `1:1` (Square headshots, 400×400)
- **Reference Location**: Hero section & Footer newsletter social proof stack ("500+ people joined!")
- **Style Consistency**: All four headshots should share a consistent visual style — soft natural lighting, clean/minimal backgrounds, warm color grading, genuine friendly expressions. No corporate/LinkedIn headshot stiffness.
- **Prompts**:
  - **Avatar 1**: *"Close-up portrait headshot of a friendly young Indian woman in her early 20s with a warm genuine smile, soft natural outdoor light from the side, smooth softly blurred green/neutral background. Warm color grading, clean skin tones. Square crop, 85mm portrait lens, f/2.0, photorealistic."*
  - **Avatar 2**: *"Close-up portrait headshot of a young Indian man in his late 20s with a confident relaxed smile, soft warm indoor studio lighting, clean neutral cream background. Warm color grading, natural skin tones. Square crop, 85mm portrait lens, f/2.0, photorealistic."*
  - **Avatar 3**: *"Close-up portrait headshot of a young South Asian woman with a warm friendly smile, soft diffused window light, clean minimalist light background. Warm color grading, natural and approachable. Square crop, 85mm portrait lens, f/2.0, photorealistic."*
  - **Avatar 4**: *"Close-up portrait headshot of a fitness-conscious young Indian man in his mid-20s with a casual genuine smile, soft natural golden-hour light, smooth warm-toned blurred background. Warm color grading, healthy vibrant skin. Square crop, 85mm portrait lens, f/2.0, photorealistic."*

---

### Assets 10 & 11: Brand Logo & Symbol
- **Filenames**:
  - `public/assets/logo.png`
  - `public/assets/logo-symbol.png`
- **Aspect Ratio**: `16:9` (Full logo lockup) / `1:1` (Symbol mark only)
- **Reference Location**: Header, Footer, and Favicon
- **Reference Files**: [Logo.png](file:///Users/sugam/0.%20Production%20Projects/shahsprotein/Design/Logo.png) and [Logos.png](file:///Users/sugam/0.%20Production%20Projects/shahsprotein/Design/Logos.png)
- **Description**:
  - **Symbol Mark**: A stylized capital serif letter "S" in dark charcoal/black. The bottom curve of the S forms a bowl shape. Nestled inside the bowl area is a warm gold/tan colored bowl with three wheat/grain leaf sprouts growing upward from it. The leaves are in warm gold (#d4af37) tones.
  - **Full Lockup**: The S symbol mark to the left, followed by "SHAH'S" in bold dark serif capitals and "NUTRITION" below in lighter spaced serif caps, flanked by thin horizontal accent lines on either side. Beneath that, the tagline "NATURAL • HONEST • ACCESSIBLE" in small spaced gold lettering.
  - **Variants** (from [Logos.png](file:///Users/sugam/0.%20Production%20Projects/shahsprotein/Design/Logos.png)): Horizontal lockup (symbol + wordmark + tagline), vertical/stacked lockup (symbol above wordmark), symbol only, wordmark only (no symbol).
- **Color Palette**: Warm Gold (`#d4af37`) for bowl and leaves, Dark Charcoal (`#1c2127`) for letterforms.
- **Note**: Logo assets are best created in vector design tools (Figma, Illustrator) rather than AI image generation. Use the reference files directly or recreate in vector format.

---

## 🛠️ How to Generate & Replace

To generate these images using an automated AI image generator subagent:
1. Point your agent to this file: `Assets/ASSET_GENERATION_SPEC.md`.
2. Run the `generate_image` tool with the provided prompts and aspect ratios.
3. Save output files directly to `public/assets/` using the specified filenames.
4. **Quality Check**: After generation, visually compare each output against the reference mockups to verify composition, color, and layout accuracy.
