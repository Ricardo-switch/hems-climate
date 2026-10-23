"""Het icoon van de beta op de NAS: hetzelfde huis, met een label BETA eronder.

Zo staan de app van de NAS (beta) en die van de Pi niet als twee gelijke
iconen op je startscherm. Het label staat binnen de veilige cirkel van een
maskable icoon (80% van de breedte), zodat Android het nooit wegsnijdt.

Draaien vanuit `frontend/`: `python tools/beta-icoon.py`. Maakt
`src/icoon-beta-192.png`, `src/icoon-beta-512.png` en
`src/icoon-beta-512-maskable.png` uit de gewone iconen.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC = Path(__file__).resolve().parent.parent / 'src'
NACHT = (11, 20, 36, 255)
WIT = (255, 255, 255, 255)
LETTER = next((p for p in ['C:/Windows/Fonts/arialbd.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'] if Path(p).exists()), None)


def met_label(bron: Path) -> Image.Image:
    img = Image.open(bron).convert('RGBA')
    assert img.size == (512, 512), bron
    teken = ImageDraw.Draw(img)
    # Een pil onder het huis: het huis loopt tot ongeveer y = 352.
    links, boven, rechts, onder = 166, 378, 346, 430
    teken.rounded_rectangle((links, boven, rechts, onder), radius=26, fill=NACHT)
    letter = ImageFont.truetype(LETTER, 34) if LETTER else ImageFont.load_default()
    tekst = 'BETA'
    vak = teken.textbbox((0, 0), tekst, font=letter)
    b, h = vak[2] - vak[0], vak[3] - vak[1]
    teken.text(((links + rechts - b) / 2 - vak[0], (boven + onder - h) / 2 - vak[1]), tekst, font=letter, fill=WIT)
    return img


groot = met_label(SRC / 'icoon-512.png')
groot.save(SRC / 'icoon-beta-512.png', optimize=True)
groot.resize((192, 192), Image.LANCZOS).save(SRC / 'icoon-beta-192.png', optimize=True)
met_label(SRC / 'icoon-512-maskable.png').save(SRC / 'icoon-beta-512-maskable.png', optimize=True)
print('klaar')
