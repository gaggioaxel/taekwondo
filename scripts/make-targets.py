"""
Scontorna le immagini dei colpitori (racchette) per la tipologia Corpo e le salva in public/targets/.

  python3 scripts/make-targets.py assets/pugno.jpeg pugno
  python3 scripts/make-targets.py "assets/calcio a colpitore.jpeg" calcio

- sfondo chiaro collegato ai bordi → trasparente
- buchi chiari chiusi (es. tra cinghia e racchetta) → trasparenti, ma SOLO fuori dalla testa della racchetta
  (così il pugno bianco disegnato sulla testa resta)
- ritaglio sul contorno, larghezza 720 px, WebP
Stampa il centro e il raggio della testa della racchetta (frazioni dell'immagine): vanno in src/utils/targets.ts.
"""
import sys
import cv2
import numpy as np

src, name = sys.argv[1], sys.argv[2]
img = cv2.imread(src)
h, w = img.shape[:2]
light = (img.min(axis=2) > 225).astype(np.uint8)

bg = np.zeros((h, w), np.uint8)
for (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
    if light[y, x]:
        m = np.zeros((h + 2, w + 2), np.uint8)
        cv2.floodFill(light.copy(), m, (x, y), 2, flags=4 | (255 << 8) | cv2.FLOODFILL_MASK_ONLY)
        bg |= m[1:-1, 1:-1]
fg = (bg == 0).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
fg = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

# testa della racchetta = cerchio più grande inscritto nella sagoma
dt = cv2.distanceTransform(fg, cv2.DIST_L2, 5)
hy, hx = np.unravel_index(np.argmax(dt), dt.shape)
hr = dt.max()

# buchi chiari chiusi fuori dalla testa
yy, xx = np.mgrid[0:h, 0:w]
outside_head = (xx - hx) ** 2 + (yy - hy) ** 2 > (hr * 1.05) ** 2
holes = ((img.min(axis=2) > 215) & (fg == 1)).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(holes, connectivity=4)
for i in range(1, n):
    comp = lab == i
    if st[i, cv2.CC_STAT_AREA] > 0.0003 * h * w and outside_head[comp].mean() > 0.9:
        fg[cv2.dilate(comp.astype(np.uint8), np.ones((3, 3), np.uint8)) == 1] = 0

alpha = cv2.GaussianBlur(fg.astype(np.float32) * 255, (3, 3), 0).astype(np.uint8)
ys, xs = np.where(fg)
pad = 6
x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
x1, y1 = min(w, xs.max() + 1 + pad), min(h, ys.max() + 1 + pad)
rgba = np.dstack([img, alpha])[y0:y1, x0:x1]
W, H = x1 - x0, y1 - y0
out = cv2.resize(rgba, (720, round(H * 720 / W)), interpolation=cv2.INTER_AREA)
cv2.imwrite(f'public/targets/{name}.webp', out, [cv2.IMWRITE_WEBP_QUALITY, 88])
print(f"{name}: testa cx={(hx - x0) / W:.3f} cy={(hy - y0) / H:.3f} r={hr / W:.3f}  → public/targets/{name}.webp")
