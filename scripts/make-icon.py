"""
Ricava l'icona dell'app dal logo di riferimento (reference.png).

- segmenta la figura azzurra (testa, busto, braccia, entrambe le gambe) e la scia scura della gamba tesa
- scarta sfondo arancione, linee di velocità e scritta
- tutta la figura diventa nera (compresa la scia sotto la gamba tesa), tranne le estremità, azzurre:
  le due mani e i due piedi (punta della scia della gamba tesa e punta dell'uncino della gamba piegata),
  trovate come punte dello scheletro della sagoma, colorando un breve tratto di corpo vicino a ciascuna
- vettorializza i contorni (ingranditi e smussati) in public/logo.svg su sfondo bianco

Uso:  python3 scripts/make-icon.py [reference.png] [public/logo.svg]
"""
import sys

import cv2
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "reference.png"
OUT = sys.argv[2] if len(sys.argv) > 2 else "public/logo.svg"

BLACK = "#111111"
AZURE = "#38bdf8"
SCALE = 8  # ingrandimento prima della vettorializzazione

im = np.array(Image.open(SRC).convert("RGB")).astype(float)
H, W, _ = im.shape
R, G, B = im[..., 0], im[..., 1], im[..., 2]
lum = (R + G + B) / 3

top = np.zeros((H, W), bool)
top[:165] = True  # sotto c'è la scritta "TAEKWONDO TIGULLIO"

# 1. Maschere morbide (0..1) per non perdere i bordi sfumati
blueness = np.clip((B - R - 15) / 50, 0, 1) * np.clip((B - 90) / 40, 0, 1)
darkness = np.clip((140 - lum) / 50, 0, 1)
blue_hard = (blueness > 0.5) & top
dark_hard = (darkness > 0.5) & ~blue_hard & top

# 2. Figura = componenti azzurre grandi (testa, busto e braccia, entrambe le gambe)
n, lab, st, _ = cv2.connectedComponentsWithStats(blue_hard.astype(np.uint8), 8)
body = np.zeros((H, W), bool)
for i in range(1, n):
    if st[i][4] > 200:
        body |= lab == i

# 3. Onda = la scia scura attaccata alla gamba tesa (le parti scure staccate sono le linee di velocità: scartate)
n, lab, st, _ = cv2.connectedComponentsWithStats(dark_hard.astype(np.uint8), 8)
grown = cv2.dilate(body.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
wave = np.zeros((H, W), bool)
for i in range(1, n):
    comp = lab == i
    if st[i][4] > 100 and (comp & grown).any():
        wave |= comp

# 3b. Estremità: punte dello scheletro della figura (testa esclusa: è un pezzo a parte, rotondo)
skel = cv2.ximgproc.thinning(body.astype(np.uint8) * 255) > 0
neighbours = cv2.filter2D(skel.astype(np.uint8), -1, np.ones((3, 3), np.float32)) - 1
tips = [(int(x), int(y)) for y, x in np.argwhere(skel & (neighbours == 1))]
near_wave = cv2.dilate(wave.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
tips = [(x, y) for x, y in tips if not near_wave[y, x]]  # il raccordo tra gamba tesa e scia non è una punta
# la testa è un pezzo a parte (il componente più in alto): la sua "punta" non è un'estremità
_, comp = cv2.connectedComponents(body.astype(np.uint8), connectivity=8)
head_id = comp[tuple(np.argwhere(body)[0])]  # primo pixel dall'alto
tips = [(x, y) for x, y in tips if comp[y, x] != head_id]
rows = np.argwhere(body)[:, 0]
mid_x = np.argwhere(body)[:, 1].mean()
torso_y = rows.mean()
upper = [t for t in tips if t[1] < torso_y]
lower = [t for t in tips if t[1] > rows.min() + (rows.max() - rows.min()) * 2 / 3]  # terzo più basso: gamba piegata
hand_r = max(upper, key=lambda t: t[0])  # punta del braccio teso
# braccio in guardia: la punta più a sinistra è il gomito; il pugno è la punta interna, vicino al busto
hand_l = max([t for t in upper if t[0] < mid_x], key=lambda t: t[0])
foot = max(lower, key=lambda t: t[0])    # punta dell'uncino della gamba piegata (il ginocchio sta più a sinistra)
ys, xs = np.where(wave)
leg_tip = (int(xs.max()), int(ys[xs.argmax()]))  # punta della scia della gamba tesa
figure = body | wave

def along_body(tip, reach, mask=None):
    """Parte della figura raggiungibile dalla punta entro `reach` pixel camminando dentro la figura"""
    body = figure if mask is None else mask
    dist = np.full(body.shape, np.inf)
    dist[tip[1], tip[0]] = 0
    queue = [tip]
    for x, y in queue:
        d = dist[y, x]
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H and body[ny, nx]:
                    nd = d + (1.414 if dx and dy else 1)
                    if nd <= reach and nd < dist[ny, nx]:
                        dist[ny, nx] = nd
                        queue.append((nx, ny))
    return dist <= reach

hand_r_tip = along_body(hand_r, 11)
# pugno in guardia: nel logo il braccio piegato non ha una punta sua (il pugno torna sul busto), quindi davanti
# al busto, nel punto del pugno, si mette la stessa forma della mano del braccio teso, rivolta in avanti
# rimpicciolita allo spessore dell'avambraccio (più stretto del braccio teso), misurato sotto la tacca bianca
# tra braccio e busto, e allineata alla fascia dell'avambraccio, attaccata dove l'avambraccio incontra il busto
filled = figure.copy().astype(np.uint8)
cv2.floodFill(filled, None, (0, 0), 1)
holes = (filled == 0)  # buchi bianchi dentro la figura
n_h, lab_h, st_h, _ = cv2.connectedComponentsWithStats(holes.astype(np.uint8), 8)
notch = min(range(1, n_h), key=lambda i: np.hypot(*(np.argwhere(lab_h == i).mean(0)[::-1] - np.array(hand_l))))
hy, hx = np.where(lab_h == notch)
col = int(np.median(hx))
band_top = hy.max() + 1  # sotto la tacca
band_bot = band_top
while band_bot + 1 < H and figure[band_bot + 1, col]:
    band_bot += 1
band = band_bot - band_top + 1  # spessore dell'avambraccio
# forma a punta come le altre estremità: spessa quanto l'avambraccio, si assottiglia in avanti verso un punto
# arrotondato; disegnata 8 volte più grande e rimpicciolita (bordi morbidi)
x_start = hx.max() + 1  # bordo destro della tacca: lì l'avambraccio incontra il busto
L = band * 2.3
poly = np.array([
    (x_start, band_top), (x_start + L * 0.55, band_top + band * 0.04), (x_start + L * 0.9, band_top + band * 0.25),
    (x_start + L, band_top + band * 0.5), (x_start + L * 0.9, band_bot + 1 - band * 0.2),
    (x_start + L * 0.55, band_bot + 1), (x_start, band_bot + 1),
])
k8 = 8
big = np.zeros((H * k8, W * k8), np.uint8)
cv2.fillPoly(big, [(poly * k8).astype(np.int32)], 255, lineType=cv2.LINE_AA)
fist = cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA).astype(float) / 255
ends = hand_r_tip | along_body(foot, 15) | along_body(leg_tip, 22)
azure_hard = ends | (fist > 0.5)
# corpo nero = figura (scia compresa) meno le estremità, con un sottile stacco bianco
body = figure & ~cv2.dilate(azure_hard.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
wave = ends

# Maschere morbide finali (riprendono i bordi sfumati attorno alle parti scelte)
soft = np.maximum(blueness, darkness * dark_hard.astype(float))
def soften(mask):
    near = cv2.dilate(mask.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    return np.where(mask, 1.0, np.where(near, soft, 0.0))

def contours_path(mask_soft, x0, y0):
    big = cv2.resize(mask_soft.astype(np.float32), (W * SCALE, H * SCALE), interpolation=cv2.INTER_CUBIC)
    big = cv2.GaussianBlur(big, (0, 0), SCALE * 1.1)  # leviga i gradini dei pixel originali
    binary = (big > 0.5).astype(np.uint8)
    cnts, hier = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    d = []
    for c in cnts:
        if cv2.contourArea(c) < (SCALE * SCALE * 6):
            continue
        c = cv2.approxPolyDP(c, SCALE * 0.18, True)
        pts = [(p[0][0] / SCALE - x0, p[0][1] / SCALE - y0) for p in c]
        d.append("M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + " Z")
    return " ".join(d)

# 4. Inquadratura quadrata attorno alla figura, con margine
ys, xs = np.where(body | wave)
x_min, x_max, y_min, y_max = xs.min(), xs.max(), ys.min(), ys.max()
side = max(x_max - x_min, y_max - y_min) * 1.22
cx, cy = (x_min + x_max) / 2, (y_min + y_max) / 2
x0, y0 = cx - side / 2, cy - side / 2

body_d = contours_path(soften(body), x0, y0)
wave_d = contours_path(np.maximum(soften(wave), fist), x0, y0)

s = f"{side:.1f}"
svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s} {s}">
  <!-- Generato da scripts/make-icon.py a partire da reference.png -->
  <rect width="{s}" height="{s}" rx="{side * 0.2:.1f}" fill="#ffffff"/>
  <path fill="{AZURE}" fill-rule="evenodd" d="{wave_d}"/>
  <path fill="{BLACK}" fill-rule="evenodd" d="{body_d}"/>
</svg>
"""
open(OUT, "w").write(svg)
print(f"Scritto {OUT} ({len(svg)} byte)")
