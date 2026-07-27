"""Extract the four transparent logo variants from Design/Logos.png."""

from pathlib import Path

from PIL import Image


SOURCE = Path("Design/Logos.png")
DESIGN_OUTPUT = Path("Design/Separated Logos")
PUBLIC_OUTPUT = Path("public/assets")


VARIANTS = {
    "horizontal": ((0, 0, 768, 512), "Shahs-Nutrition-Horizontal.png"),
    "symbol-large": ((768, 0, 1536, 512), "Shahs-Nutrition-Symbol-Large.png"),
    "wordmark": ((0, 512, 768, 1024), "Shahs-Nutrition-Wordmark.png"),
    "symbol-small": ((768, 512, 1536, 1024), "Shahs-Nutrition-Symbol-Small.png"),
}


def trim_transparency(image: Image.Image, padding: int = 12) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > 5 else 0).getbbox()
    if bbox is None:
        raise ValueError("Logo crop contains no visible pixels")

    left, top, right, bottom = bbox
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(image.width, right + padding)
    bottom = min(image.height, bottom + padding)
    return image.crop((left, top, right, bottom))


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    DESIGN_OUTPUT.mkdir(parents=True, exist_ok=True)
    PUBLIC_OUTPUT.mkdir(parents=True, exist_ok=True)

    for key, (crop_box, design_name) in VARIANTS.items():
        logo = trim_transparency(source.crop(crop_box))
        logo.save(DESIGN_OUTPUT / design_name, "PNG", optimize=True)

        public_name = {
            "horizontal": "logo.png",
            "symbol-large": "logo-symbol.png",
            "wordmark": "logo-wordmark.png",
            "symbol-small": "logo-symbol-small.png",
        }[key]
        logo.save(PUBLIC_OUTPUT / public_name, "PNG", optimize=True)
        print(f"{key}: {logo.width}x{logo.height}")


if __name__ == "__main__":
    main()
