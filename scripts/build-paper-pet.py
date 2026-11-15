"""Genera le sagome da stampare di Luna che scodinzola (A4, misure in mm) e il PDF.
Uso: python3 scripts/build-paper-pet.py  → public/paper-pet/luna-sagome.pdf
Progetto originale di The London Academy, ispirato all'idea del "Paper Pet".
"""
import math, re, subprocess, os
from pypdf import PdfWriter, PdfReader

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'paper-pet')
CUT, FOLD, GLUE = '#1D1C1F', '#B83A00', '#EBBC4A'
FONT = "font-family='Lexend, Arial, sans-serif'"


def inner(svgfile):
    s = open(os.path.join(OUT, svgfile)).read()
    vb = re.search(r'viewBox="([^"]+)"', s).group(1)
    body = re.sub(r'^.*?<svg[^>]*>', '', s, flags=re.S).replace('</svg>', '')
    return vb, body


def place(svgfile, x, y, w, h):
    vb, body = inner(svgfile)
    return f"<svg x='{x}' y='{y}' width='{w}' height='{h}' viewBox='{vb}'>{body}</svg>"


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
    ly = 287
    s.append(f"<line x1='14' y1='{ly}' x2='26' y2='{ly}' stroke='{CUT}' stroke-width='0.5'/>" + text(28, ly + 1.2, 'taglia', 3.2, 'start'))
    s.append(line(52, ly, 64, ly) + text(66, ly + 1.2, 'piega', 3.2, 'start'))
    s.append(f"<rect x='88' y='{ly - 2.5}' width='12' height='5' fill='{GLUE}55' stroke='{CUT}' stroke-width='0.3'/>" + text(102, ly + 1.2, 'colla', 3.2, 'start'))
    s.append(text(196, ly + 1.2, 'Stampa al 100%, senza adattare alla pagina', 2.8, 'end', '#69727D', 500))
    s.append(text(105, 294, 'The London Academy · Make &amp; Code Lab', 2.4, color='#69727D', weight=500))
    return s


def page2():
    s = [text(105, 12, 'LUNA CHE SCODINZOLA · faccia, coda e zampe', 4.6, weight=800)]
    # faccia a colori e da colorare (60 × 60 mm)
    s.append(text(52, 24, 'Faccia a colori', 3.4, weight=700) + text(158, 24, 'Faccia da colorare', 3.4, weight=700))
    s.append(f"<rect x='22' y='28' width='60' height='60' rx='4' fill='none' stroke='{CUT}' stroke-width='0.4'/>" + place('luna-face.svg', 23, 29, 58, 58))
    s.append(f"<rect x='128' y='28' width='60' height='60' rx='4' fill='none' stroke='{CUT}' stroke-width='0.4'/>" + place('luna-face-line.svg', 129, 29, 58, 58))
    # coda con tasca per il braccio del servo
    for i, (cx, file) in enumerate(((52, 'luna-tail.svg'), (158, 'luna-tail-line.svg'))):
        s.append(text(cx, 100, 'Coda' + (' da colorare' if i else ' a colori'), 3.4, weight=700))
        s.append(f"<rect x='{cx - 17}' y='104' width='34' height='70' rx='3' fill='none' stroke='{CUT}' stroke-width='0.4'/>" + place(file, cx - 16, 105, 32, 56))
        s.append(line(cx - 17, 162, cx + 17, 162) + f"<rect x='{cx - 17}' y='162' width='34' height='12' fill='{GLUE}55' stroke='none'/>")
        s.append(text(cx, 169.5, 'piega: tasca per il braccio', 2.6))
    # zampe (4) 26 × 20 mm con linguetta
    s.append(text(105, 186, 'Zampe (4)', 3.4, weight=700))
    for k in range(4):
        x = 30 + k * 40
        s.append(f"<rect x='{x}' y='192' width='28' height='30' rx='3' fill='none' stroke='{CUT}' stroke-width='0.4'/>" + place('luna-paw.svg', x + 1, 193, 26, 20))
        s.append(line(x, 214, x + 28, 214) + f"<rect x='{x}' y='214' width='28' height='8' fill='{GLUE}55' stroke='none'/>")
    s.append(text(105, 228, 'Piega la linguetta e incollala sotto la pancia: due zampe davanti, due dietro.', 2.8, color='#5E5A60', weight=500))
    # istruzioni brevi
    steps = [
        '1. Ritaglia tutti i pezzi. Un adulto ritaglia la finestra del servo e l\'uscita dei cavi.',
        '2. Piega lungo le righe tratteggiate e incolla il corpo con le linguette gialle.',
        '3. Infila il servo da dentro nella finestra: si ferma con le alette. Il cavo esce dietro.',
        '4. Collega: arancione → pin 0, rosso → 3V, marrone → GND. Carica il codice e premi A.',
        '5. Incolla faccia e zampe. Infila la tasca della coda sul braccio del servo.',
        '6. Incolla la stagnola (3,5 × 2 cm) sulla schiena e collegala al pin 1 con un coccodrillo.',
        '7. Accarezza la schiena di Luna: la coda scodinzola!',
    ]
    for i, t in enumerate(steps):
        s.append(text(18, 240 + i * 6.2, t, 3.2, 'start', weight=500))
    s.append(text(105, 290, 'Progetto originale The London Academy · ispirato all\'idea "Paper Pet" · Make &amp; Code Lab', 2.6, color='#69727D', weight=500))
    return s


def lineart(src, dst):
    """Versione da colorare: stesse forme, solo contorni."""
    s = open(os.path.join(OUT, src)).read()
    s = re.sub(r'fill="(#[0-9A-Fa-f]{6})"', lambda m: 'fill="#FFFFFF" stroke="#2B292E" stroke-width="2.4"' if m.group(1).upper() not in ('#2B1D16', '#FFFFFF') else f'fill="{m.group(1)}"', s)
    s = s.replace('opacity="0.6"', 'opacity="0"')
    s = re.sub(r'stroke="#(?!2B292E)[0-9A-Fa-f]{6}"', 'stroke="#2B292E"', s)
    open(os.path.join(OUT, dst), 'w').write(s)


def svg_page(items):
    return f"<svg xmlns='http://www.w3.org/2000/svg' width='210mm' height='297mm' viewBox='0 0 210 297'><rect width='210' height='297' fill='#FFFFFF'/>{''.join(items)}</svg>"


if __name__ == '__main__':
    lineart('luna-face.svg', 'luna-face-line.svg')
    lineart('luna-tail.svg', 'luna-tail-line.svg')
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
