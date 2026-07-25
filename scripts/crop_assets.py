import os
from PIL import Image

def slice_assets():
    os.makedirs('public/assets', exist_ok=True)
    os.makedirs('public/assets/journey', exist_ok=True)

    dark = Image.open('Design/Dark Mode.png')
    w, h = dark.size

    # 1. Hero Composition
    # Hero bowl + package on top right
    hero_crop = dark.crop((int(w * 0.45), int(h * 0.03), int(w * 0.98), int(h * 0.16)))
    hero_crop.save('public/assets/hero-composition.png')

    # 2. Product Card Images (From Dark Mode)
    # Row at ~ 20% to 32% height
    chivda = dark.crop((int(w * 0.07), int(h * 0.185), int(w * 0.33), int(h * 0.245)))
    chivda.save('public/assets/product-chivda.png')

    muesli = dark.crop((int(w * 0.37), int(h * 0.185), int(w * 0.62), int(h * 0.245)))
    muesli.save('public/assets/product-muesli.png')

    bars = dark.crop((int(w * 0.67), int(h * 0.185), int(w * 0.92), int(h * 0.245)))
    bars.save('public/assets/product-bars.png')

    # 3. Journey Steps (01 - 05)
    # Row at ~ 34% to 40% height
    j1 = dark.crop((int(w * 0.06), int(h * 0.335), int(w * 0.23), int(h * 0.375)))
    j1.save('public/assets/journey/step-1.png')

    j2 = dark.crop((int(w * 0.24), int(h * 0.335), int(w * 0.41), int(h * 0.375)))
    j2.save('public/assets/journey/step-2.png')

    j3 = dark.crop((int(w * 0.42), int(h * 0.335), int(w * 0.59), int(h * 0.375)))
    j3.save('public/assets/journey/step-3.png')

    j4 = dark.crop((int(w * 0.60), int(h * 0.335), int(w * 0.77), int(h * 0.375)))
    j4.save('public/assets/journey/step-4.png')

    j5 = dark.crop((int(w * 0.78), int(h * 0.335), int(w * 0.95), int(h * 0.375)))
    j5.save('public/assets/journey/step-5.png')

    # 4. Founders Story Kitchen Photo
    story = dark.crop((int(w * 0.40), int(h * 0.39), int(w * 0.95), int(h * 0.46)))
    story.save('public/assets/story-kitchen.png')

    # 5. Copy Logo
    logo = Image.open('Design/Logo.png')
    logo.save('public/assets/logo.png')

    print('Assets sliced and saved to public/assets/ successfully!')

if __name__ == '__main__':
    slice_assets()
