"""Prepara i disegni di Luna (art/luna/*.png, fatti con ChatGPT) per il sito e le sagome.
- ritaglia lo spazio vuoto, crea la versione da colorare (solo contorni)
- scrive le texture del 3D in public/paper-pet e le icone in public/icons
Uso: python3 scripts/process-luna-art.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
ART = os.path.join(ROOT, 'art', 'luna')
PET = os.path.join(ROOT, 'public', 'paper-pet')
ICONS = os.path.join(ROOT, 'public', 'icons')
NAMES = {'faccia': 'face', 'coda': 'tail', 'zampa': 'paw'}


def trim(im):
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 20)
    pad = 6
    return im.crop((max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad + 1, im.width), min(ys.max() + pad + 1, im.height)))


def lineart(im):
    """Contorni scuri → neri, tutto il resto dentro la forma → bianco. Fuori resta trasparente."""
    px = np.array(im).astype(float)
    lum = 0.299 * px[:, :, 0] + 0.587 * px[:, :, 1] + 0.114 * px[:, :, 2]
    out = np.zeros_like(px)
    inside = px[:, :, 3] > 20
    dark = lum < 135
    out[inside] = [255, 255, 255, 255]
    out[inside & dark] = [43, 41, 46, 255]
    out[:, :, 3] = np.where(inside, px[:, :, 3], 0)
    return Image.fromarray(out.astype(np.uint8))


def fit(im, maxside):
    s = maxside / max(im.size)
    return im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS) if s < 1 else im


if __name__ == '__main__':
    for it, en in NAMES.items():
        im = trim(Image.open(os.path.join(ART, it + '.png')).convert('RGBA'))
        im.save(os.path.join(ART, it + '-trim.png'))
        lineart(im).save(os.path.join(ART, it + '-linea.png'))
        fit(im, 1024).save(os.path.join(PET, f'luna-{en}.png'), optimize=True)
        fit(im, 160).save(os.path.join(ICONS, 'luna.png' if en == 'face' else f'luna-{en}.png'), optimize=True)
        print(it, im.size)
