"""יוצר את תמונת השיתוף (OG) 1200x630: python3 scripts/assets/make_og.py  (מתיקיית השורש)"""
import random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

A = 'site/src/assets/'
FONT = 'site/public/fonts/rubik-hebrew.woff2'
W, H = 1200, 630

bg = Image.new('RGB', (W, H), (4, 17, 26))
glow = Image.new('RGB', (W, H), (0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse((520, 40, 1180, 640), fill=(25, 140, 140))
g.ellipse((40, 260, 520, 700), fill=(60, 40, 150))
bg = Image.blend(bg, glow.filter(ImageFilter.GaussianBlur(120)), 0.55)
random.seed(7)
d = ImageDraw.Draw(bg)
for _ in range(260):
    x, y = random.randrange(W), random.randrange(H)
    r = random.choice([0, 0, 0, 1, 1, 2])
    d.ellipse((x - r, y - r, x + r, y + r), fill=random.choice([(255, 255, 255), (138, 245, 234), (255, 224, 138)]))
bg = bg.convert('RGBA')


def paste(path, w, xy, rot=0):
    im = Image.open(path).convert('RGBA')
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    if rot:
        im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    shadow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    shadow.putalpha(im.getchannel('A').point(lambda a: int(a * 0.6)))
    bg.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(14)), (xy[0] + 10, xy[1] + 18))
    bg.alpha_composite(im, xy)


paste(A + 'photos/box-front.webp', 470, (660, 150), -6)
paste(A + 'chars/robot-fly.webp', 200, (990, 40))
paste(A + 'chars/flora-warrior.webp', 150, (640, 20))
paste(A + 'chars/guy-fly.webp', 200, (640, 380))
paste(A + 'brand/title-3d.webp', 560, (40, 70))


def font(size, wght):
    f = ImageFont.truetype(FONT, size, layout_engine=ImageFont.Layout.RAQM)
    f.set_variation_by_axes([wght])
    return f


overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
o = ImageDraw.Draw(overlay)
d = ImageDraw.Draw(bg)
R = 590


def rtext(draw, y, txt, f, fill):
    w = draw.textlength(txt, font=f, direction='rtl', language='he')
    draw.text((R - w, y), txt, font=f, fill=fill, direction='rtl', language='he')
    return w


rtext(d, 230, 'לא עוד קרבות', font(64, 800), (243, 251, 255))
rtext(d, 305, 'על הצחצוח', font(64, 800), (243, 251, 255))
rtext(d, 392, 'עכשיו זה זמן הרפתקאות', font(44, 800), (255, 201, 74))
f = font(30, 700)
# בתת־הקבוצה העברית של הגופן אין פיסוק לטיני, אז מפרידים בכוכב מצויר
a, b = 'הערכה במתנה', 'משלמים רק משלוח'
wa = d.textlength(a, font=f, direction='rtl', language='he')
wb = d.textlength(b, font=f, direction='rtl', language='he')
gap = 34
w = wa + gap + wb
o.rounded_rectangle((R - w - 40, 470, R, 530), radius=30, fill=(255, 201, 74, 45), outline=(255, 201, 74, 255), width=2)
bg.alpha_composite(overlay)
d = ImageDraw.Draw(bg)
d.text((R - 20 - wa, 479), a, font=f, fill=(255, 224, 138), direction='rtl', language='he')
cx, cy = R - 20 - wa - gap / 2, 500
d.polygon([(cx, cy - 8), (cx + 2.5, cy - 2.5), (cx + 8, cy), (cx + 2.5, cy + 2.5), (cx, cy + 8), (cx - 2.5, cy + 2.5), (cx - 8, cy), (cx - 2.5, cy - 2.5)], fill=(255, 224, 138))
d.text((R - 20 - wa - gap - wb, 479), b, font=f, fill=(243, 251, 255), direction='rtl', language='he')
bg.convert('RGB').save('site/public/og.jpg', quality=86)
print('site/public/og.jpg')
