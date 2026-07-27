"""Build the square favicon from the extracted symbol mark."""

from pathlib import Path

from PIL import Image, ImageDraw


SOURCE = Path("Design/Separated Logos/Shahs-Nutrition-Symbol-Large.png")
DESIGN_OUTPUT = Path("Design/Separated Logos/Shahs-Nutrition-Favicon.png")
PUBLIC_DARK_OUTPUT = Path("public/favicon-dark.png")
PUBLIC_LIGHT_OUTPUT = Path("public/favicon-light.png")
PUBLIC_DARK_32 = Path("public/favicon-dark-32x32.png")
PUBLIC_LIGHT_32 = Path("public/favicon-light-32x32.png")
PUBLIC_DARK_APPLE = Path("public/apple-touch-icon-dark.png")
PUBLIC_LIGHT_APPLE = Path("public/apple-touch-icon-light.png")
PUBLIC_DARK_ICO = Path("public/favicon-dark.ico")
PUBLIC_LIGHT_ICO = Path("public/favicon-light.ico")

CANVAS_SIZE = 512
BACKGROUND = (28, 33, 39, 255)
# Match the site's light-mode surface instead of using the old warm-white tile.
LIGHT_BACKGROUND = (238, 244, 252, 255)
IVORY = (247, 243, 234)
CHARCOAL = (28, 33, 39)


def is_gold(red: int, green: int, blue: int) -> bool:
    return red > green + 8 and green > blue + 18


def recolor_symbol(source: Image.Image, mark_color: tuple[int, int, int]) -> Image.Image:
    pixels = []
    for red, green, blue, alpha in source.convert("RGBA").getdata():
        if alpha and not is_gold(red, green, blue):
            pixels.append((*mark_color, alpha))
        else:
            pixels.append((red, green, blue, alpha))

    output = Image.new("RGBA", source.size)
    output.putdata(pixels)
    return output


def make_favicon(background: tuple[int, int, int, int], mark_color: tuple[int, int, int]) -> Image.Image:
    symbol = recolor_symbol(Image.open(SOURCE), mark_color)
    bbox = symbol.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("Symbol contains no visible pixels")

    # Keep a little breathing room around the mark so it remains legible at 16px.
    left, top, right, bottom = bbox
    symbol = symbol.crop((left - 4, top - 4, right + 4, bottom + 4))
    max_height = 392
    symbol.thumbnail((max_height, max_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        (16, 16, CANVAS_SIZE - 16, CANVAS_SIZE - 16),
        radius=104,
        fill=background,
    )
    canvas.alpha_composite(
        symbol,
        ((CANVAS_SIZE - symbol.width) // 2, (CANVAS_SIZE - symbol.height) // 2),
    )
    return canvas


def main() -> None:
    dark_favicon = make_favicon(BACKGROUND, IVORY)
    light_favicon = make_favicon(LIGHT_BACKGROUND, CHARCOAL)
    DESIGN_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_DARK_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    dark_favicon.save(DESIGN_OUTPUT, "PNG", optimize=True)
    dark_favicon.save(PUBLIC_DARK_OUTPUT, "PNG", optimize=True)
    light_favicon.save(PUBLIC_LIGHT_OUTPUT, "PNG", optimize=True)
    dark_favicon.resize((32, 32), Image.Resampling.LANCZOS).convert("RGB").save(PUBLIC_DARK_32, "PNG", optimize=True)
    light_favicon.resize((32, 32), Image.Resampling.LANCZOS).convert("RGB").save(PUBLIC_LIGHT_32, "PNG", optimize=True)
    dark_favicon.resize((180, 180), Image.Resampling.LANCZOS).convert("RGB").save(PUBLIC_DARK_APPLE, "PNG", optimize=True)
    light_favicon.resize((180, 180), Image.Resampling.LANCZOS).convert("RGB").save(PUBLIC_LIGHT_APPLE, "PNG", optimize=True)
    dark_favicon.save(PUBLIC_DARK_ICO, "ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    light_favicon.save(PUBLIC_LIGHT_ICO, "ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"saved dark and light favicon families ({CANVAS_SIZE}x{CANVAS_SIZE})")


if __name__ == "__main__":
    main()
