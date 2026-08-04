# Shah's Nutrition — Image Asset Generation Specification (`ASSET_GENERATION_SPEC.md`)

This document provides an **exhaustive, pixel-faithful specification** for generating all visual assets for the **Shah's Nutrition** landing page. Every prompt, framing rule, composition layout, color grade, and lighting instruction has been extracted directly from the reference design mockups ([Dark Mode.png](file:///Users/sugam/0.%20Production%20Projects/shahsprotein/Design/Dark%20Mode.png) and [Light Mode.png](file:///Users/sugam/0.%20Production%20Projects/shahsprotein/Design/Light%20Mode.png)).

---

## 📐 General Composition & Style Guidelines

1. **Aesthetic**: Premium Direct-to-Consumer (D2C) food & wellness brand photography. Clean, authentic, appetite-appealing, with tactile natural textures (roasted nuts, whole grains, raw spices, slate, ceramic, warm wood).
2. **Lighting**: Soft directional studio lighting combined with warm ambient glows. Avoid harsh flat flash or artificial CGI looks.
3. **Packaging Detail**: Stand-up pouches should be craft matte paper finish in warm neutral/beige tones featuring the **Shah's Nutrition** logo and clean typography ("Healthy Food that Tastes Unhealthy").
4. **Vignette & Framing Rules**:
   - For **Hero Composition**: The main subjects (bowl & pouch) must be positioned strictly on the **right half (50% to 95% of frame)**, leaving the **left half (0% to 45% of frame) empty, dark, and softly faded** to accommodate headline text and CTA forms seamlessly.

---

## 🖼️ Exhaustive Asset Generation Directory & Prompts

---

### Asset 1: Hero Section Main Composition Image
- **Filename**: `public/assets/hero-composition.png`
- **Aspect Ratio**: `4:3` (Recommended resolution: 1600x1200)
- **Reference Location**: Top right hero area in `Dark Mode.png` and `Light Mode.png`
- **Composition & Layout**:
  - **Left Side (0% - 45%)**: Empty, dark, softly faded vignette background with subtle ambient shadow/gradient. No key subjects on the left half.
  - **Right Side (45% - 95%)**: High-resolution studio product shot featuring a white ceramic bowl filled to the brim with a vibrant mix of roasted peanuts, puffed legumes, whole almonds, green pumpkin seeds, and golden Indian spices. Standing immediately behind and to the right of the bowl is a matte beige stand-up pouch labeled "Shah's Nutrition" with minimalist dark serif typography.
  - **Foreground Detail**: Scattered roasted peanuts, chickpeas, and spice grains falling out of the bowl spilling towards the left foreground on a dark charcoal slate surface.
- **AI Prompt**:
  > *"Professional studio product photography of a healthy D2C food brand setup, right-aligned composition. On the right side of the image, a large white ceramic bowl is filled with a colorful mix of roasted peanuts, puffed legume crispies, almonds, and traditional Indian spices. Standing behind the bowl on the right is a standing matte beige craft-paper pouch with minimalist black branding 'Shah's Nutrition'. Loose roasted peanuts and spices scattered in the foreground. The left 45% of the image is completely empty, dark charcoal, softly faded with dark vignette for text overlay. Warm studio side lighting, shallow depth of field, 8k resolution, photorealistic."*

---

### Asset 2: Product Card 1 — Protein Chivda
- **Filename**: `public/assets/product-chivda.png`
- **Aspect Ratio**: `4:3` (Recommended resolution: 1200x900)
- **Reference Location**: First Product Card under "OUR FIRST PRODUCTS"
- **Composition & Layout**:
  - Centered-to-right balanced framing inside a dark card container.
  - **Left**: A small round white ceramic bowl overflowing with crispy, golden-brown savory Indian protein chivda (roasted peanuts, puffed chickpea crispies, golden turmeric spices, curry leaves).
  - **Right**: A standing matte craft pouch labeled "Shah's Nutrition Protein Chivda".
  - **Background**: Smooth dark obsidian charcoal backdrop with subtle radial glow behind the product.
- **AI Prompt**:
  > *"Studio food product shot of Indian savory snack. A white ceramic bowl overflowing with golden crunchy protein chivda made of roasted peanuts, puffed legumes, and spices, placed next to a sleek beige stand-up food pouch labeled 'Shah's Nutrition Protein Chivda'. Dark charcoal studio background with soft warm lighting, macro detail, photorealistic, 8k."*

---

### Asset 3: Product Card 2 — Muesli
- **Filename**: `public/assets/product-muesli.png`
- **Aspect Ratio**: `4:3` (Recommended resolution: 1200x900)
- **Reference Location**: Second Product Card under "OUR FIRST PRODUCTS"
- **Composition & Layout**:
  - **Left**: White ceramic breakfast bowl filled with clean protein muesli (rolled oats, whole almonds, green pumpkin seeds, chia seeds, and dried red cranberries).
  - **Right**: Standing beige pouch with "Shah's Nutrition Muesli" logo and clean wheat graphic.
  - **Background**: Neutral dark charcoal gradient with soft top-down lighting highlighting oat textures and seeds.
- **AI Prompt**:
  > *"Studio food photography of breakfast muesli. A white ceramic bowl filled with clean protein muesli containing rolled oats, sliced almonds, green pumpkin seeds, chia seeds, and dried cranberries. Next to the bowl is a standing food pouch labeled 'Shah's Nutrition Muesli'. Dark moody background, natural soft lighting, food styling, 8k resolution."*

---

### Asset 4: Product Card 3 — Protein Bars
- **Filename**: `public/assets/product-bars.png`
- **Aspect Ratio**: `4:3` (Recommended resolution: 1200x900)
- **Reference Location**: Third Product Card under "OUR FIRST PRODUCTS"
- **Composition & Layout**:
  - **Foreground**: Stacked soft-baked dark chocolate protein bars cut into rectangular slices showing soft dense texture, alongside unwrapped bars, broken dark chocolate blocks, and roasted peanuts.
  - **Background**: Standing matte pouch labeled "Shah's Nutrition Protein Bars" and wrapped snack bars on a dark wooden board.
- **AI Prompt**:
  > *"Studio food photography of artisan chocolate protein bars. Stacked rectangular soft-baked protein bars showing rich dark chocolate texture, surrounded by cocoa powder dusting, dark chocolate chunks, and roasted peanuts on a dark slate cutting board. A pouch labeled 'Shah's Nutrition Protein Bars' in the background. Warm moody studio lighting, shallow depth of field, 8k photorealistic."*

---

### Asset 5: Our Story — Founders Kitchen Photograph
- **Filename**: `public/assets/story-kitchen.png`
- **Aspect Ratio**: `16:9` (Recommended resolution: 1920x1080)
- **Reference Location**: "OUR STORY — Making healthy food that tastes unhealthy" right side image
- **Composition & Layout**:
  - Wide 16:9 panoramic shot set inside a modern, warm, naturally lit kitchen.
  - Two young Indian men (co-founders in their mid-20s) wearing simple black t-shirts standing behind a clean wooden kitchen island counter.
  - They are smiling genuinely while preparing ceramic cereal bowls with Shah's Nutrition pouches, glass storage jars filled with almonds and oats, and fresh ingredients on the counter.
  - Background shows modern kitchen cabinets with subtle soft depth blur.
- **AI Prompt**:
  > *"Authentic lifestyle brand photograph of two young Indian male co-founders in casual black t-shirts standing together behind a modern wooden kitchen island counter. They are smiling warmly at the camera while preparing healthy snack bowls with food pouches and glass jars of nuts and grains on the counter. Bright natural kitchen lighting, warm inviting mood, professional lifestyle photography, shallow depth of field, 8k resolution."*

---

### Asset 6 to 9: Social Proof Avatars (4 Headshots)
- **Filenames**:
  - `public/assets/avatar-1.png`
  - `public/assets/avatar-2.png`
  - `public/assets/avatar-3.png`
  - `public/assets/avatar-4.png`
- **Aspect Ratio**: `1:1` (Square headshots, 400x400)
- **Reference Location**: Hero section & Footer newsletter social proof stack ("500+ people joined!")
- **Prompts**:
  - **Avatar 1**: *"Close-up portrait of a friendly young Indian woman in her 20s smiling warmly, natural outdoor light, soft blurred background, square headshot."*
  - **Avatar 2**: *"Close-up portrait of a young Indian man in his late 20s with a confident warm smile, indoor studio lighting, neutral background, square headshot."*
  - **Avatar 3**: *"Close-up headshot of a young woman with a friendly smile, clean minimalist lighting, square portrait."*
  - **Avatar 4**: *"Close-up portrait of a fitness-conscious young Indian man smiling casually, soft natural light, square headshot."*

---

### Asset 10 & 11: Brand Logo & Symbol
- **Filenames**:
  - `public/assets/logo.png`
  - `public/assets/logo-symbol.png`
- **Aspect Ratio**: `16:9` (Logo) / `1:1` (Symbol)
- **Reference Location**: Header, Footer, and Favicon
- **Description**:
  - Stylized capital letter "S" with a bowl shape forming the bottom curve and three natural leaf sprouts growing inside the letterform.
  - Serif wordmark "SHAH'S NUTRITION" below with horizontal accent lines and tagline "NATURAL • HONEST • ACCESSIBLE".
- **Color Palette**: Warm Gold (`#d4af37`) and Dark Charcoal (`#1c2127`).

---

## 🛠️ How to Generate & Replace

To generate these images using an automated AI image generator subagent:
1. Point your agent to this file: `Assets/ASSET_GENERATION_SPEC.md`.
2. Run the `generate_image` tool with the provided prompts and aspect ratios.
3. Save output files directly to `public/assets/` using the specified filenames.
