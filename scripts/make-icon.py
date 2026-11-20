"""
Ricava l'icona dell'app dal logo di riferimento (reference.png).

- segmenta la figura azzurra (testa, busto, braccia, entrambe le gambe) e la scia scura della gamba tesa
- scarta sfondo arancione, linee di velocità e scritta
- tutta la figura diventa nera; la scia (onda) sotto la gamba tesa diventa azzurra
- anche le altre estremità diventano azzurre: le due mani e il piede della gamba piegata
  (trovate come punte dello scheletro della sagoma, colorando il tratto di corpo vicino a ciascuna)
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
# sottile stacco bianco tra gamba nera e onda azzurra
body &= ~cv2.dilate(wave.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)

# 3b. Estremità: punte dello scheletro della figura (testa esclusa: è un pezzo a parte, rotondo)
skel = cv2.ximgproc.thinning(body.astype(np.uint8) * 255) > 0
neighbours = cv2.filter2D(skel.astype(np.uint8), -1, np.ones((3, 3), np.float32)) - 1
tips = [(int(x), int(y)) for y, x in np.argwhere(skel & (neighbours == 1))]
near_wave = cv2.dilate(wave.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
tips = [(x, y) for x, y in tips if not near_wave[y, x]]  # la gamba tesa ha già la sua onda
rows = np.argwhere(body)[:, 0]
torso_y = rows.mean()
upper = [t for t in tips if t[1] < torso_y]
lower = [t for t in tips if t[1] > rows.min() + (rows.max() - rows.min()) * 2 / 3]  # terzo più basso: gamba piegata
hand_r = max(upper, key=lambda t: t[0])  # punta del braccio teso
hand_l = min(upper, key=lambda t: t[0])  # punta del braccio in guardia
foot = max(lower, key=lambda t: t[0])    # punta dell'uncino della gamba piegata (il ginocchio sta più a sinistra)

def along_body(tip, reach):
    """Parte del corpo raggiungibile dalla punta entro `reach` pixel camminando dentro la figura"""
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

ends = along_body(hand_r, 11) | along_body(hand_l, 11) | along_body(foot, 15)
body &= ~cv2.dilate(ends.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)  # stacco bianco come per l'onda
wave |= ends

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
wave_d = contours_path(soften(wave), x0, y0)

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
