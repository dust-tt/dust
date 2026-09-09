"""Render Pompon: an original fluffy purple ball, drawn procedurally.

Every pixel comes out of the maths below -- nothing is traced, sampled or
resampled from existing art. The silhouette is a union of overlapping circles
(a core plus a ring of tufts), which is what gives it a fluffy pom-pom edge
rather than a smooth blob. Frames are drawn directly at their final squash
instead of being scaled, so the 1px face and rim never lose a row.
"""

import math
import os
import struct
import zlib

CANVAS = 512

OUTLINE = (30, 18, 46, 255)
BASE = (140, 92, 214, 255)
LIGHT = (176, 134, 236, 255)
SHADE = (104, 62, 168, 255)
TIP = (214, 190, 250, 255)
DARK = (28, 18, 40, 255)
WHITE = (255, 255, 255, 255)
BOLT = (252, 214, 58, 255)
BOLT_SHADE = (222, 166, 24, 255)
PINK = (255, 138, 200, 255)
PINK_LIGHT = (255, 206, 234, 255)
CLEAR = (0, 0, 0, 0)


def write_png(path, pixels, w, h):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter: none
        for x in range(w):
            raw.extend(pixels[y][x])

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.cells = [[None] * w for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.cells[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.cells[y][x]
        return None


def tuft_circles(cx, cy, rx, ry, phase, n=7, ring=0.80, tuft=0.38, core=0.62):
    """Small core ellipse plus a ring of tufts that scallop past it -- the fluff."""
    circles = [(cx, cy, rx * core, ry * core)]
    for i in range(n):
        a = 2 * math.pi * i / n + 0.10 * phase - math.pi / 2
        wob = 1.0 + 0.18 * math.sin(3 * a + phase)
        # The tuft sitting on top is a touch larger: Pompon's crest.
        crest = 1.30 if abs(((a + math.pi / 2) % (2 * math.pi)) - 0) < 0.35 else 1.0
        tr = tuft * wob * crest
        circles.append((cx + math.cos(a) * rx * ring,
                        cy + math.sin(a) * ry * ring,
                        rx * tr, ry * tr))
    return circles


def draw_ball(g, cx, cy, rx, ry, phase, ring=0.80, tuft=0.38, n=7, core=0.62):
    circles = tuft_circles(cx, cy, rx, ry, phase, n, ring, tuft, core)

    inside = set()
    for y in range(g.h):
        for x in range(g.w):
            px, py = x + 0.5, y + 0.5
            for (ox, oy, orx, ory) in circles:
                if ((px - ox) / orx) ** 2 + ((py - oy) / ory) ** 2 <= 1.0:
                    inside.add((x, y))
                    break

    for (x, y) in inside:
        g.set(x, y, BASE)

    # Distance from the silhouette edge, so shading can follow the fluff
    # instead of being cut by a straight line.
    depth = {}
    frontier = [c for c in inside
                if any((c[0] + dx, c[1] + dy) not in inside
                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for c in frontier:
        depth[c] = 1
    while frontier:
        nxt = []
        for (x, y) in frontier:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c = (x + dx, y + dy)
                if c in inside and c not in depth:
                    depth[c] = depth[(x, y)] + 1
                    nxt.append(c)
        frontier = nxt

    # Shadow is a crescent hugging the underside, not a band across the body.
    for (x, y) in inside:
        if y + 0.5 > cy + 0.06 * ry and depth[(x, y)] <= 3:
            g.set(x, y, SHADE)

    # 1px inner rim: lit across the top, dark under the belly.
    for (x, y) in inside:
        if depth[(x, y)] == 1:
            g.set(x, y, LIGHT if y + 0.5 < cy + 0.06 * ry else SHADE)

    # Sheen on the upper left, with a brighter core.
    hx, hy = cx - 0.40 * rx, cy - 0.44 * ry
    for (x, y) in inside:
        d = ((x + 0.5 - hx) / (rx * 0.26)) ** 2 + ((y + 0.5 - hy) / (ry * 0.22)) ** 2
        if d <= 1.0:
            g.set(x, y, TIP if d <= 0.38 else LIGHT)

    # Hard outline, one cell outside the silhouette.
    for (x, y) in inside:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                       (1, 1), (1, -1), (-1, 1), (-1, -1)):
            if (x + dx, y + dy) not in inside:
                g.set(x + dx, y + dy, OUTLINE)
    return inside


def draw_face(g, cx, cy, rx, ry, mood):
    """Stamped on after the body is squashed, never scaled with it."""
    ey = int(cy - 0.18 * ry)
    for side in (-1, 1):
        ex = int(round(cx + side * 0.36 * rx))
        if mood == "sleep":
            for dx in (-1, 0, 1):
                g.set(ex + dx, ey, DARK)
            g.set(ex - 2, ey - 1, DARK)
            g.set(ex + 2, ey - 1, DARK)
        else:
            tall = 4 if mood == "alert" else 3
            for dy in range(tall):
                for dx in (-1, 0, 1):
                    g.set(ex + dx, ey + dy, DARK)
            g.set(ex - 1, ey, WHITE)  # glint

    my = int(cy + 0.40 * ry)
    if mood == "alert":
        for dy in range(2):
            for dx in (-1, 0, 1):
                g.set(int(cx) + dx, my + dy, DARK)
    elif mood == "sleep":
        for dx in (-1, 0, 1):
            g.set(int(cx) + dx, my, DARK)
    else:
        for dx, dy in ((-2, 0), (-1, 1), (0, 1), (1, 1), (2, 0)):
            g.set(int(cx) + dx, my + dy, DARK)


def draw_zs(g, x, y):
    """Three rising z's for the sleep pose."""
    for ox, oy, s in ((0, 0, 3), (4, -4, 4), (9, -8, 5)):
        bx, by = x + ox, y + oy
        for dx in range(s):
            g.set(bx + dx, by, DARK)
            g.set(bx + dx, by + s - 1, DARK)
        for d in range(s):
            g.set(bx + s - 1 - d, by + d, DARK)


# Yellow zigzag, outlined like the body so it reads against any desktop.
BOLT_ART = (
    "..##",
    ".##.",
    "##..",
    "####",
    "..##",
    ".##.",
    "#...",
)


def draw_bolt(g, x, y):
    """Lightning bolt for the alert pose."""
    cells = {(x + dx, y + dy)
             for dy, row in enumerate(BOLT_ART)
             for dx, ch in enumerate(row) if ch == "#"}
    for (bx, by) in cells:
        for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                       (1, 1), (1, -1), (-1, 1), (-1, -1)):
            if (bx + ox, by + oy) not in cells:
                g.set(bx + ox, by + oy, OUTLINE)
    for (bx, by) in cells:
        # Lower half a shade deeper, so the bolt has some weight.
        g.set(bx, by, BOLT_SHADE if by - y >= 4 else BOLT)


def draw_sparkle(g, x, y, size=1):
    """Four-point pink sparkle."""
    for d in range(1, size + 1):
        g.set(x, y - d, PINK)
        g.set(x, y + d, PINK)
        g.set(x - d, y, PINK)
        g.set(x + d, y, PINK)
    g.set(x, y, PINK_LIGHT)


def rasterize(g, scale, path):
    ox = (CANVAS - g.w * scale) // 2
    oy = (CANVAS - g.h * scale) // 2
    pixels = [[CLEAR] * CANVAS for _ in range(CANVAS)]
    for gy in range(g.h):
        for gx in range(g.w):
            c = g.cells[gy][gx]
            if c is None:
                continue
            for y in range(oy + gy * scale, oy + (gy + 1) * scale):
                for x in range(ox + gx * scale, ox + (gx + 1) * scale):
                    if 0 <= x < CANVAS and 0 <= y < CANVAS:
                        pixels[y][x] = c
    write_png(path, pixels, CANVAS, CANVAS)


# --- frames -----------------------------------------------------------------
# 6-frame hop. The bottom of the body is pinned to a baseline so Pompon
# squashes against the ground instead of floating.
GW, GH, SCALE = 38, 32, 13
BASELINE = 28.0
RX, RY = 9.2, 8.8

HOP = [
    # (rx scale, ry scale, lift)
    (1.06, 0.94, 0.0),
    (0.96, 1.06, 1.2),
    (0.99, 1.02, 3.0),
    (1.00, 1.00, 2.2),
    (1.12, 0.88, 0.0),
    (1.04, 0.96, 0.4),
]

# While walking, Pompon lets go of a single sparkle that drifts up and away.
# Only three of the six frames carry it, so it reads as an occasional puff
# rather than a permanent decoration.
WALK_SPARKLE = {
    2: (1.24, 0.18, 1),
    3: (1.38, -0.38, 2),
    4: (1.52, -0.92, 1),
}

NOTIF = [
    (1.10, 0.90, 0.0),
    (0.94, 1.10, 2.0),
    (0.98, 1.04, 4.0),
    (1.00, 1.00, 3.0),
    (1.14, 0.86, 0.0),
    (1.05, 0.95, 0.8),
]

# Sparkles scattered around the bolt, shuffled per frame so they twinkle.
NOTIF_SPARKLES = (
    ((-1.32, -0.62, 2), (1.16, 0.62, 1)),
    ((-1.10, -1.00, 1), (1.34, 0.16, 2)),
    ((-1.38, -0.30, 1), (1.20, 0.78, 1)),
    ((-1.16, -0.88, 2), (1.30, 0.34, 1)),
    ((-1.30, -0.52, 1), (1.12, 0.70, 2)),
    ((-1.20, -0.96, 1), (1.32, 0.46, 1)),
)


def body_frame(g, i, mood, cfg, gw=GW, baseline=BASELINE, rx0=RX, ry0=RY, **kw):
    sx, sy, lift = cfg
    rx, ry = rx0 * sx, ry0 * sy
    cx = gw / 2.0
    cy = baseline - ry * 1.18 - lift
    draw_ball(g, cx, cy, rx, ry, i * 1.05, **kw)
    draw_face(g, cx, cy, rx, ry, mood)
    return cx, cy, rx, ry


def gen_pet(outdir, name):
    os.makedirs(outdir, exist_ok=True)
    for i, cfg in enumerate(HOP):
        g = Grid(GW, GH)
        cx, cy, rx, ry = body_frame(g, i, "walk", cfg)
        if i in WALK_SPARKLE:
            fx, fy, size = WALK_SPARKLE[i]
            draw_sparkle(g, int(cx + rx * fx), int(cy + ry * fy), size)
        rasterize(g, SCALE, f"{outdir}/{i:02d}_{name}_walk.png")

    # Notification: taller, snappier bounce, wide eyes, open mouth, and a
    # yellow bolt with pink sparkles around it.
    for i, cfg in enumerate(NOTIF):
        g = Grid(GW, GH)
        cx, cy, rx, ry = body_frame(g, i, "alert", cfg)
        draw_bolt(g, int(cx + rx * 1.18) + 2, int(cy - ry * 1.05) - (i % 2))
        for fx, fy, size in NOTIF_SPARKLES[i]:
            draw_sparkle(g, int(cx + rx * fx), int(cy + ry * fy), size)
        rasterize(g, SCALE, f"{outdir}/{i:02d}_{name}_notification.png")

    # Sleep: flattened, eyes closed, z's drifting up.
    g = Grid(GW, GH)
    cx, cy, rx, ry = body_frame(g, 0, "sleep", (1.22, 0.70, 0.0))
    draw_zs(g, int(cx + rx * 0.30), int(cy - ry * 1.18) - 2)
    rasterize(g, SCALE, f"{outdir}/00_{name}_sleep.png")


def gen_statusbar(outdir):
    """Coarser grid: these are read at 22pt, so fewer, chunkier pixels, and
    no bolt or sparkles -- they turn to noise at that size."""
    os.makedirs(outdir, exist_ok=True)
    gw, gh, scale = 24, 22, 20
    baseline, rx0, ry0 = 20.0, 7.2, 6.8
    kw = dict(n=6, ring=0.76, tuft=0.42, core=0.60)

    g = Grid(gw, gh)
    body_frame(g, 0, "sleep", (1.22, 0.74, 1.0), gw, baseline, rx0, ry0, **kw)
    rasterize(g, scale, f"{outdir}/icon_idle.png")

    for i, (sx, sy, lift) in enumerate(HOP):
        g = Grid(gw, gh)
        body_frame(g, i, "walk", (sx, sy, lift * 0.5 + 1.0),
                   gw, baseline, rx0, ry0, **kw)
        rasterize(g, scale, f"{outdir}/icon_{i + 1}.png")


if __name__ == "__main__":
    import sys
    root = sys.argv[1]
    gen_pet(f"{root}/pompon", "pompon")
    gen_statusbar(f"{root}/statusbar/pompon")
    print("done")
