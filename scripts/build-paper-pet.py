"""Genera le sagome da stampare di Luna che scodinzola (A4, misure vere in mm) e il PDF.
Prima: python3 scripts/process-luna-art.py (prepara i disegni in art/luna).
Uso: python3 scripts/build-paper-pet.py  → public/paper-pet/luna-sagome.pdf
Progetto originale di The London Academy, ispirato all'idea del "Paper Pet".
"""
import base64, io, math, re, subprocess, os
import cv2
import numpy as np
from PIL import Image
from pypdf import PdfWriter, PdfReader

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'paper-pet')
ART = os.path.join(os.path.dirname(__file__), '..', 'art', 'luna')
CUT, FOLD, GLUE = '#1D1C1F', '#B83A00', '#EBBC4A'
FONT = "font-family='Lexend, Arial, sans-serif'"


def poly(pts, stroke=CUT, fill='none', dash=None, sw=0.4):
    d = ' '.join(f'{x:.2f},{y:.2f}' for x, y in pts)
    da = f" stroke-dasharray='{dash}'" if dash else ''
    return f"<polygon points='{d}' fill='{fill}' stroke='{stroke}' stroke-width='{sw}'{da}/>"


def line(x1, y1, x2, y2, fold=True):
    return f"<line x1='{x1:.2f}' y1='{y1:.2f}' x2='{x2:.2f}' y2='{y2:.2f}' stroke='{FOLD if fold else CUT}' stroke-width='0.45' stroke-dasharray='{'2.4,1.6' if fold else ''}'/>"


def text(x, y, t, size=3.2, anchor='middle', color='#2B292E', weight=600, rot=0):
    tr = f" transform='rotate({rot} {x} {y})'" if rot else ''
    return f"<text x='{x}' y='{y}' font-size='{size}' text-anchor='{anchor}' fill='{color}' font-weight='{weight}' {FONT}{tr}>{t}</text>"


def tab(p1, p2, depth=7, inset=0.25):
    """Linguetta di colla trapezoidale verso l'esterno del lato p1→p2 (esterno = a destra del verso)."""
    (x1, y1), (x2, y2) = p1, p2
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    nx, ny = dy / L, -dx / L
    ux, uy = dx / L, dy / L
    a = (x1 + ux * L * inset * 0.4 + nx * depth, y1 + uy * L * inset * 0.4 + ny * depth)
    b = (x2 - ux * L * inset * 0.4 + nx * depth, y2 - uy * L * inset * 0.4 + ny * depth)
    return poly([p1, a, b, p2], stroke=CUT, fill=GLUE + '55') + line(x1, y1, x2, y2)


# ---------- misure del corpo (mm) ----------
W, L, HF, HB, TOP = 46, 90, 50, 22, 40
SLOPE = math.hypot(L - TOP, HF - HB)
X0, X1 = 82, 82 + W
y = 12
yF0, yF1 = y, y + HF                # davanti
yT1 = yF1 + TOP                     # sopra (la schiena)
yS1 = yT1 + SLOPE                   # discesa con la finestra del servo
yB1 = yS1 + HB                      # dietro, con l'uscita dei cavi
yP1 = yB1 + L                       # sotto (pancia): y=yB1 dietro, y=yP1 davanti


def side(sign):
    base = X0 if sign < 0 else X1
    prof = [(0, 0), (L, 0), (L, HB), (TOP, HF), (0, HF)]
    pts = [(base + sign * h, yP1 - u) for u, h in prof]
    out = ''
    # linguette sui lati liberi (tutti tranne la piega sulla pancia)
    edges = [(pts[1], pts[2]), (pts[2], pts[3]), (pts[3], pts[4]), (pts[4], pts[0])]
    for p1, p2 in edges:
        out += tab(p1, p2) if sign > 0 else tab(p2, p1)
    out += poly(pts, fill='#FFF8EC')
    out += line(base, yB1, base, yP1)
    cx = base + sign * 20
    out += text(cx, yP1 - 40, 'fianco', 3.6, rot=-90 if sign < 0 else 90)
    return out


def page1():
    s = []
    s.append(text(105, 8, 'LUNA CHE SCODINZOLA · sagoma del corpo', 4.6, weight=800))
    # striscia del corpo
    s.append(poly([(X0, yF0), (X1, yF0), (X1, yP1), (X0, yP1)], fill='#FFF8EC'))
    for yy in (yF1, yT1, yS1, yB1):
        s.append(line(X0, yy, X1, yy))
    s.append(tab((X1, yP1), (X0, yP1)))  # linguetta sotto il davanti
    s.append(side(-1) + side(1))
    s.append(text(105, (yF0 + yF1) / 2, 'DAVANTI', 4, weight=800) + text(105, (yF0 + yF1) / 2 + 5, 'qui va la faccia', 3))
    s.append(text(105, yF1 + 10, 'SCHIENA', 4, weight=800))
    s.append(f"<rect x='{105 - 17.5}' y='{yF1 + 14}' width='35' height='20' fill='none' stroke='#69727D' stroke-width='0.4' stroke-dasharray='1,1'/>")
    s.append(text(105, yF1 + 25.5, 'stagnola qui', 3, color='#69727D'))
    # finestra del servo (ritagliare): 13 × 23,5 mm
    wy = yT1 + 9
    s.append(f"<rect x='{105 - 6.5}' y='{wy}' width='13' height='23.5' fill='#F5F0EA' stroke='{CUT}' stroke-width='0.5'/>")
    s.append(text(105, wy + 30, 'ritaglia la finestra', 2.8) + text(105, wy + 34, 'del servo', 2.8))
    s.append(text(105, yS1 - 6, 'DISCESA', 3.4, weight=800))
    # uscita dei cavi
    s.append(f"<rect x='{105 - 6}' y='{yB1 - 8}' width='12' height='8' fill='#F5F0EA' stroke='{CUT}' stroke-width='0.5'/>")
    s.append(text(105, yS1 + 6, 'DIETRO', 3.4, weight=800) + text(122, yB1 - 3, 'uscita cavi', 2.6, anchor='start'))
    s.append(text(105, (yB1 + yP1) / 2, 'PANCIA', 4, weight=800))
    # legenda
    ly = 282
    s.append(f"<line x1='14' y1='{ly}' x2='26' y2='{ly}' stroke='{CUT}' stroke-width='0.5'/>" + text(28, ly + 1.2, 'taglia', 3.2, 'start'))
    s.append(line(52, ly, 64, ly) + text(66, ly + 1.2, 'piega', 3.2, 'start'))
    s.append(f"<rect x='88' y='{ly - 2.5}' width='12' height='5' fill='{GLUE}55' stroke='{CUT}' stroke-width='0.3'/>" + text(102, ly + 1.2, 'colla', 3.2, 'start'))
    s.append(text(196, ly + 1.2, 'Stampa al 100%, senza adattare alla pagina', 2.8, 'end', '#69727D', 500))
    s.append(text(105, 288, 'The London Academy · Make &amp; Code Lab', 2.4, color='#69727D', weight=500))
    return s


PXMM = 10  # risoluzione per calcolare la riga di taglio


def sticker(name, x, y, w, tab=0, label=None):
    """Disegno di Luna largo w mm in (x, y), con la riga di taglio a 1,5 mm dal bordo.
    tab > 0: linguetta (colla) di tab mm sotto la base piatta, con la riga di piega."""
    im = Image.open(os.path.join(ART, name)).convert('RGBA')
    h = w * im.height / im.width
    # immagine a 300 dpi
    wp = round(w / 25.4 * 300)
    pr = im.resize((wp, round(wp * im.height / im.width)), Image.LANCZOS)
    buf = io.BytesIO(); pr.save(buf, 'PNG', optimize=True)
    href = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
    # maschera in mm*PXMM, con spazio attorno
    M = 4 * PXMM
    mw, mh = round(w * PXMM), round(h * PXMM)
    a = np.array(im.resize((mw, mh), Image.LANCZOS))[:, :, 3] > 40
    canvas = np.zeros((mh + 2 * M + round(tab * PXMM), mw + 2 * M), np.uint8)
    canvas[M:M + mh, M:M + mw] = a * 255
    out = ''
    if tab:
        rows = np.where(a.any(axis=1))[0]
        base = rows.max()
        cols = np.where(a[base - 3:base + 1].any(axis=0))[0]
        c0, c1 = cols.min(), cols.max()
        y0 = M + base
        canvas[y0:y0 + round(tab * PXMM), M + c0:M + c1 + 1] = 255
        fx0, fx1, fy = x + c0 / PXMM, x + (c1 + 1) / PXMM, y + base / PXMM
        out += f"<rect x='{fx0:.2f}' y='{fy:.2f}' width='{fx1 - fx0:.2f}' height='{tab}' fill='{GLUE}55'/>"
        out += line(fx0 - 1.5, fy, fx1 + 1.5, fy)
        if label:
            out += text((fx0 + fx1) / 2, fy + tab / 2 + 1, label, 2.4)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))  # 1,5 mm
    grown = cv2.dilate(canvas, k)
    cs, _ = cv2.findContours(grown, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    c = max(cs, key=cv2.contourArea)
    c = cv2.approxPolyDP(c, 1.5, True)
    d = 'M' + ' L'.join(f'{x + (px - M) / PXMM:.2f},{y + (py - M) / PXMM:.2f}' for px, py in c[:, 0]) + ' Z'
    img_tag = f"<image x='{x}' y='{y}' width='{w}' height='{h:.2f}' href='{href}' xlink:href='{href}' preserveAspectRatio='none'/>"
    return f"<path d='{d}' fill='#FFFFFF' stroke='{CUT}' stroke-width='0.4'/>" + img_tag + out, h


FACE_W, TAIL_W, PAW_W, TAIL_TAB, PAW_TAB = 52, 31, 22, 16, 8


def page2():
    s = [text(105, 15, 'LUNA CHE SCODINZOLA · faccia, coda e zampe', 4.6, weight=800)]
    s.append(text(105, 21, 'Scegli: a colori oppure da colorare. Ritaglia sulla riga continua.', 3, color='#5E5A60', weight=500))
    # faccia: 52 mm, sta sul davanti largo 46 mm (le orecchie escono un po')
    s.append(text(53, 30, 'Faccia a colori', 3.4, weight=700) + text(157, 30, 'Faccia da colorare', 3.4, weight=700))
    for cx, f in ((53, 'faccia-trim.png'), (157, 'faccia-linea.png')):
        svg, fh = sticker(f, cx - FACE_W / 2, 35, FACE_W)
        s.append(svg)
    # coda con la linguetta-tasca per il braccio del servo
    y = 92
    s.append(text(53, y - 4, 'Coda a colori', 3.4, weight=700) + text(157, y - 4, 'Coda da colorare', 3.4, weight=700))
    for cx, f in ((53, 'coda-trim.png'), (157, 'coda-linea.png')):
        svg, th = sticker(f, cx - TAIL_W / 2, y, TAIL_W, TAIL_TAB, 'tasca')
        s.append(svg)
    s.append(text(105, y + 30, 'Piega la tasca dietro.', 2.8, color='#5E5A60', weight=500) + text(105, y + 34, 'Colla solo sul fondo:', 2.8, color='#5E5A60', weight=500) + text(105, y + 38, 'il braccio del servo', 2.8, color='#5E5A60', weight=500) + text(105, y + 42, 'entra dentro.', 2.8, color='#5E5A60', weight=500))
    # zampe: 4 a colori e 4 da colorare, linguetta sotto la pancia
    for row, (f, lab) in enumerate((('zampa-trim.png', 'Zampe a colori (4)'), ('zampa-linea.png', 'Zampe da colorare (4)'))):
        yy = 168 + row * 36
        s.append(text(20, yy - 3, lab, 3.2, 'start', weight=700))
        for k in range(4):
            svg, ph = sticker(f, 24 + k * 44, yy, PAW_W, PAW_TAB)
            s.append(svg)
    steps = [
        '1. Ritaglia i pezzi. Un adulto ritaglia la finestra del servo e l\'uscita dei cavi.',
        '2. Piega lungo le righe tratteggiate e incolla il corpo con le linguette gialle.',
        '3. Infila il servo da dentro nella finestra: si ferma con le alette. Il cavo esce dietro.',
        '4. Collega: arancione → pin 0, rosso → 3V, marrone → GND. Carica il codice e premi A.',
        '5. Incolla faccia e zampe. Infila la tasca della coda sul braccio del servo.',
        '6. Incolla la stagnola (3,5 × 2 cm) sulla schiena e collegala al pin 1 con un coccodrillo.',
        '7. Accarezza la schiena di Luna: la coda scodinzola!',
    ]
    for i, t in enumerate(steps):
        s.append(text(18, 244 + i * 5.6, t, 3.1, 'start', weight=500))
    s.append(text(105, 287, 'Stampa su A4 al 100% (dimensioni reali), meglio su cartoncino · The London Academy · ispirato all\'idea "Paper Pet"', 2.4, color='#69727D', weight=500))
    return s


def svg_page(items):
    return f"<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='210mm' height='297mm' viewBox='0 0 210 297'><rect width='210' height='297' fill='#FFFFFF'/>{''.join(items)}</svg>"


if __name__ == '__main__':
    pdfs = []
    for i, items in enumerate((page1(), page2()), 1):
        p = os.path.join('/tmp', f'luna-p{i}.svg')
        open(p, 'w').write(svg_page(items))
        out = p.replace('.svg', '.pdf')
        subprocess.run(['rsvg-convert', '-f', 'pdf', '-o', out, p], check=True)
        subprocess.run(['rsvg-convert', '-w', '700', '-o', p.replace('.svg', '.png'), p], check=True)
        pdfs.append(out)
    w = PdfWriter()
    for p in pdfs:
        for pg in PdfReader(p).pages:
            w.add_page(pg)
    w.add_metadata({'/Title': 'Luna che scodinzola - sagome da stampare', '/Author': 'The London Academy'})
    with open(os.path.join(OUT, 'luna-sagome.pdf'), 'wb') as f:
        w.write(f)
    print('ok', os.path.getsize(os.path.join(OUT, 'luna-sagome.pdf')))
