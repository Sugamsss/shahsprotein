"""Create an exact dark-mode colorway without changing the logo artwork."""

from pathlib import Path

from PIL import Image


SOURCE = Path("Design/Separated Logos/Shahs-Nutrition-Horizontal.png")
DESIGN_OUTPUT = Path("Design/Separated Logos/Shahs-Nutrition-Horizontal-Dark.png")
PUBLIC_OUTPUT = Path("public/assets/logo-dark.png")

IVORY = (247, 243, 234)


def is_gold(red: int, green: int, blue: int) -> bool:
    # Gold areas have a noticeably warm hue; this keeps them untouched.
    return red > green + 8 and green > blue + 18


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
        
    pixels = []
    for red, green, blue, alpha in image.getdata():
        if alpha and not is_gold(red, green, blue):
            pixels.append((*IVORY, alpha))
        else:
            pixels.append((red, green, blue, alpha))

    output = Image.new("RGBA", image.size)
    output.putdata(pixels)
    DESIGN_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    output.save(DESIGN_OUTPUT, "PNG", optimize=True)
    output.save(PUBLIC_OUTPUT, "PNG", optimize=True)
    print(f"saved {PUBLIC_OUTPUT} ({output.width}x{output.height})")


if __name__ == "__main__":
    main()
