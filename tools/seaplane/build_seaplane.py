# Blender 5.x, headless: the seaplane (a stylised Beaver-like high-wing floatplane, jade green and cream) built from
# code and exported to public/models/seaplane/Seaplane.glb, plus an optional preview render.
#   D:\blender\blender.exe -b --python tools/seaplane/build_seaplane.py -- public/models/seaplane/Seaplane.glb [preview.png]
#
# Everything is authored in the GAME frame (+Z forward, +Y up, +X port, metres, origin between the float keels at
# the centre of mass' station: src/features/seaplane/Flight.js GEOM uses the same numbers) and converted to Blender
# (X, -Z, Y) when the meshes are made; the glTF export (+Y up) turns that back into the game frame.
# Materials (names are read by src/features/seaplane/Model.js):
#   SeaplaneJade / SeaplaneCream (body, double-sided so the cabin has walls from inside), SeaplaneGlass (transparent:
#   StaticGLB keys on 'Glass'), SeaplaneDark, SeaplaneStrut, SeaplaneSeat, SeaplaneInterior,
#   SeaplaneProp / SeaplanePropTip: the propeller, its own node with the hub at GEOM.prop (spun in code about +Z).
# Nodes (wave 10, crashes: Model.js turns them into the parts a wreck sheds): Fuselage, Glass, Cabin, Struts (the
# fuselage), WingL / WingR, Tail, FloatL / FloatR, Propeller.
# Wave 8 (cockpit): a lower cowling and a wide windscreen with thin jade frames, big side windows and a roof light
# ahead of the wing, so the pilot's eye (GEOM.eye) sees the water ahead over the glare shield; the instrument panel
# housing sits just behind GEOM.panel, where src/features/seaplane/Cockpit.js puts its live (canvas) face. Every mesh
# carries a planar UV (the glass uses it for its reflection streak). The preview also renders the eye view without
# the glass (nothing of the cabin may block the view) and with it.
import bpy, bmesh, sys, os, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'Seaplane.glb'
PREVIEW = argv[1] if len(argv) > 1 else None

bpy.ops.wm.read_factory_settings(use_empty=True)

PROP = (0.0, 2.2, 3.85)
EYE = (0.32, 2.74, 1.2)  # GEOM.eye
# GEOM.panel: the face's centre, width, height and tilt (rad, top towards the nose)
PANEL_C = (0.0, 2.27, 2.40)
PANEL_W, PANEL_H, PANEL_TILT = 1.22, 0.40, 0.26


def B(p):
    return Vector((p[0], -p[2], p[1]))


def srgb(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


MATS = {}


def mat(name, rgb, rough=0.6, metal=0.0, double=False):
    m = bpy.data.materials.new(name)
    lin = srgb(rgb)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
    if b:
        b.inputs['Base Color'].default_value = (*lin, 1.0)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
    m.diffuse_color = (*lin, 1.0)
    m.roughness = rough
    m.use_backface_culling = not double
    MATS[name] = m
    return m


mat('SeaplaneJade', (0.05, 0.56, 0.44), 0.45, 0.0, True)
mat('SeaplaneCream', (0.95, 0.9, 0.76), 0.5, 0.0, True)
mat('SeaplaneGlass', (0.55, 0.7, 0.75), 0.1, 0.0, True)
mat('SeaplaneDark', (0.08, 0.09, 0.1), 0.6, 0.3)
mat('SeaplaneStrut', (0.32, 0.34, 0.35), 0.5, 0.6)
mat('SeaplaneSeat', (0.42, 0.25, 0.14), 0.8)
mat('SeaplaneInterior', (0.62, 0.58, 0.5), 0.85)
mat('SeaplaneProp', (0.1, 0.1, 0.11), 0.45, 0.4)
mat('SeaplanePropTip', (0.95, 0.75, 0.1), 0.5)


class Builder:
    # one mesh object: game-frame vertices, faces with a material name each

    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.m = []
        self.smooth = []

    def vert(self, p):
        self.v.append(tuple(p))
        return len(self.v) - 1

    def face(self, idx, m, smooth=True):
        self.f.append(list(idx))
        self.m.append(m)
        self.smooth.append(smooth)

    def loft(self, rings, matfn, cap0=True, cap1=True, smooth=True, closed=True):
        # rings: lists of game-frame points with the same count; quads between consecutive rings
        base = []
        for r in rings:
            base.append([self.vert(p) for p in r])
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for j in range(n if closed else n - 1):
                k = (j + 1) % n
                q = [base[i][j], base[i][k], base[i + 1][k], base[i + 1][j]]
                c = [sum(self.v[a][t] for a in q) / 4 for t in range(3)]
                m = matfn(c, i, j)
                if m:
                    self.face(q, m, smooth)
        for cap, ring in ((cap0, base[0]), (cap1, base[-1])):
            if not cap:
                continue
            c = [sum(self.v[a][t] for a in ring) / n for t in range(3)]
            m = matfn(c, -1, -1)
            if not m:
                continue
            ci = self.vert(c)
            for j in range(n):
                self.face([ring[j], ring[(j + 1) % n], ci], m, False)

    def box(self, c, h, m):
        x, y, z = c
        a, b, d = h
        idx = [self.vert((x + sx * a, y + sy * b, z + sz * d)) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.face([idx[i] for i in q], m, False)

    def rod(self, a, b, r, m, sides=6):
        a = Vector(a)
        b = Vector(b)
        d = (b - a).normalized()
        u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
        w = d.cross(u)
        ring = lambda p: [tuple(p + (u * math.cos(t) + w * math.sin(t)) * r) for t in (2 * math.pi * i / sides for i in range(sides))]
        self.loft([ring(a), ring(b)], lambda *a: m, True, True, True)

    def build(self, collection):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([B(p) for p in self.v], [], self.f)
        names = []
        for n in self.m:
            if n not in names:
                names.append(n)
        for n in names:
            me.materials.append(MATS[n])
        for p, n, s in zip(me.polygons, self.m, self.smooth):
            p.material_index = names.index(n)
            p.use_smooth = s
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        # planar UV from the game frame (u along the length and the height, v up): the glass streak reads it
        uv = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            for l in f.loops:
                c = l.vert.co  # Blender frame: (x, -z, y)
                l[uv].uv = (-c.y * 0.5 + c.x * 0.15, c.z * 0.5)
        bm.to_mesh(me)
        bm.free()
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        return ob


def sgn(v):
    return 1.0 if v >= 0 else -1.0


# the fuselage ring: a rounded box (superellipse) sampled at fixed angles, port half from the keel line up, then the
# starboard half mirrored, so rows of faces sit at known heights (windows, the cheat line, the belly)
ANG = [-90, -74, -58, -42, -26, -12, -6, 2, 12, 26, 40, 54, 68, 80]
STAR = [180 - a for a in [90] + ANG[:0:-1]]
RING_ANG = ANG + STAR  # 28 angles; face j joins RING_ANG[j] and RING_ANG[j + 1]


def superellipse(cx, cy, z, hw, top, bot, p=3.2):
    pts = []
    for d in RING_ANG:
        a = math.radians(d)
        c, s = math.cos(a), math.sin(a)
        x = hw * sgn(c) * abs(c) ** (2 / p)
        y = (top if s > 0 else bot) * sgn(s) * abs(s) ** (2 / p)
        pts.append((cx + x, cy + y, z))
    return pts


def face_band(j):
    # the angle band of face j folded onto the port side: (low, high) in degrees
    a, b = RING_ANG[j], RING_ANG[(j + 1) % len(RING_ANG)]
    f = lambda d: 180 - d if d > 90 else d
    a, b = f(a), f(b)
    return min(a, b), max(a, b)


col = bpy.context.scene.collection

# ---------------------------------------------------------------------------------------------- fuselage
# stations: z, bottom y, top y, half width (the cabin from z -1.2 to 2.6, the cowling ahead, the tail cone behind)
ST = [
    # wave 8: the cowling drops to 2.5 m so the eye sees over it; the windscreen rises from z 2.6 to the roof at z 2.0
    (3.72, 1.78, 2.36, 0.44), (3.55, 1.64, 2.42, 0.56), (3.2, 1.56, 2.46, 0.62), (2.85, 1.5, 2.5, 0.66), (2.6, 1.44, 2.56, 0.68),
    (2.45, 1.4, 2.7, 0.69), (2.3, 1.37, 2.83, 0.7), (2.15, 1.35, 2.94, 0.7), (2.0, 1.34, 3.03, 0.7), (1.75, 1.33, 3.1, 0.7),
    (1.45, 1.32, 3.13, 0.7), (1.2, 1.32, 3.13, 0.7), (1.08, 1.32, 3.13, 0.7), (0.85, 1.32, 3.13, 0.7), (0.55, 1.32, 3.13, 0.7),
    (0.25, 1.33, 3.12, 0.7), (0.02, 1.34, 3.12, 0.7), (-0.4, 1.38, 3.1, 0.69), (-1.2, 1.48, 3.04, 0.65), (-2.0, 1.66, 2.98, 0.56),
    (-2.9, 1.86, 2.92, 0.45), (-3.8, 2.04, 2.87, 0.34), (-4.6, 2.2, 2.83, 0.25), (-5.4, 2.33, 2.8, 0.17), (-6.0, 2.42, 2.76, 0.11),
    (-6.42, 2.5, 2.72, 0.06),
]
CY = lambda s: (s[1] + s[2]) / 2


def body_mat(c, i, j):
    x, y, z = c
    if j < 0:
        return 'SeaplaneDark' if z > 3 else 'SeaplaneJade'
    lo, hi = face_band(j)
    # side windows (rows 6..68 deg, a pillar between the front and the rear pair), the windscreen (every row above
    # 26 deg from the cowling at z 2.6 back to z 2.0, frames added below) and a roof light ahead of the wing
    if lo >= 6 and hi <= 68 and (0.05 < z < 1.02 or 1.14 < z < 2.0):
        return 'SeaplaneGlass'
    if lo >= 26 and 2.0 < z < 2.6:
        return 'SeaplaneGlass'
    if lo >= 68 and 1.5 < z < 2.0:
        return 'SeaplaneGlass'
    if z > 3.45:
        return 'SeaplaneDark' if hi <= -58 else 'SeaplaneJade'
    # the cream cheat line along the side and the cream belly
    if lo >= -12 and hi <= -6:
        return 'SeaplaneCream'
    if hi <= -58:
        return 'SeaplaneCream'
    return 'SeaplaneJade'


body = Builder('Fuselage')
glass = Builder('Glass')
rings = [superellipse(0, CY(s), s[0], s[3], (s[2] - s[1]) / 2, (s[2] - s[1]) / 2) for s in ST]
body.loft(rings, lambda c, i, j: None if body_mat(c, i, j) == 'SeaplaneGlass' else body_mat(c, i, j), True, True)
glass.loft(rings, lambda c, i, j: 'SeaplaneGlass' if body_mat(c, i, j) == 'SeaplaneGlass' else None, False, False)


def hull_point(z, deg, grow=1.012):
    # a point on the fuselage skin at station z (interpolated) and ring angle deg (port 0 = side, 90 = top), a hair outside
    for k in range(len(ST) - 1):
        a, b = ST[k], ST[k + 1]
        if a[0] >= z >= b[0]:
            t = (a[0] - z) / (a[0] - b[0]) if a[0] != b[0] else 0
            s = [a[n] + (b[n] - a[n]) * t for n in range(4)]
            break
    else:
        s = list(ST[0])
    hw, half, cy = s[3], (s[2] - s[1]) / 2, (s[1] + s[2]) / 2
    r = math.radians(deg)
    c, sn = math.cos(r), math.sin(r)
    x = hw * sgn(c) * abs(c) ** (2 / 3.2) * grow
    y = cy + half * sgn(sn) * abs(sn) ** (2 / 3.2) * grow
    return (x, y, z)


def frame_line(pts, r=0.011):
    for a, b in zip(pts, pts[1:]):
        body.rod(a, b, r, 'SeaplaneJade', 5)


# thin jade window frames: the windscreen's centre post and its A-pillars, the sills and heads of the side windows,
# the posts between them and round the roof light
ARC = [6, 12, 26, 40, 54, 68, 80, 90]
for side in (1, -1):
    deg = lambda d: d if side > 0 else 180 - d
    frame_line([hull_point(2.0, deg(d)) for d in ARC])  # A-pillar
    frame_line([hull_point(2.6, deg(d)) for d in ARC[2:]])  # windscreen base on the cowling
    for z0, z1 in ((0.05, 1.02), (1.14, 2.0)):
        zs = [z1 - (z1 - z0) * k / 4 for k in range(5)]
        frame_line([hull_point(z, deg(9)) for z in zs], 0.009)  # sill
        frame_line([hull_point(z, deg(68)) for z in zs], 0.009)  # head
        frame_line([hull_point(z0, deg(d)) for d in ARC[:6]], 0.009)
        frame_line([hull_point(z1, deg(d)) for d in ARC[:6]], 0.009)
    frame_line([hull_point(z, deg(68)) for z in (2.0, 1.75, 1.5)])
frame_line([hull_point(z, 90) for z in (2.6, 2.45, 2.3, 2.15, 2.0)], 0.009)  # centre post
frame_line([hull_point(1.5, d) for d in ARC[5:] + [100, 112]])  # roof light, rear edge
# the cowling's exhaust stub and the air scoop
body.rod((-0.5, 1.75, 2.95), (-0.62, 1.55, 2.6), 0.06, 'SeaplaneDark')
body.box((0, 1.6, 3.3), (0.18, 0.08, 0.25), 'SeaplaneDark')

# ---------------------------------------------------------------------------------------------- wing (high, 2 deg dihedral)


def airfoil(chord, t, n=10):
    # chordwise profile from the trailing edge over the top to the leading edge and back under: (distance from LE, y)
    us = [0.5 - 0.5 * math.cos(math.pi * i / n) for i in range(n + 1)]
    yt = lambda u: 5 * t * (0.2969 * math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4)
    camber = lambda u: 0.03 * (1 - (2 * u - 1) ** 2)
    top = [(u, camber(u) + yt(u)) for u in reversed(us)]
    bot = [(u, camber(u) - yt(u)) for u in us[1:-1]]
    return [(u * chord, y * chord) for u, y in top + bot]


def wing_ring(x, le_z, chord, y0, t):
    return [(x, y0 + y, le_z - u) for u, y in airfoil(chord, t)]


WY = 3.14  # wing root underside line
dih = math.tan(math.radians(2))
# wave 10 (crashes): one node per wing half (WingL = port, +X; WingR = starboard), so a wreck can shear them off
# (src/features/seaplane/Model.js maps the node names to wreck parts); each half is capped at the root (hidden in the
# other half while whole)
WS = [(0.0, 1.45, 1.7, 0.14), (3.6, 1.42, 1.62, 0.13), (7.05, 1.3, 1.3, 0.11), (7.3, 1.2, 1.18, 0.1)]
wings = []
for side, name in ((1, 'WingL'), (-1, 'WingR')):
    w = Builder(name)
    wrings = [wing_ring(side * x, le, ch, WY + x * dih, t) for x, le, ch, t in WS]
    w.loft(wrings, lambda c, *_: 'SeaplaneJade' if abs(c[0]) > 6.9 else 'SeaplaneCream', True, True)
    wings.append(w)

# ---------------------------------------------------------------------------------------------- tail
tail = Builder('Tail')
TS = [(-2.45, -5.2, 0.75), (-2.3, -5.0, 0.95), (0.0, -4.75, 1.25), (2.3, -5.0, 0.95), (2.45, -5.2, 0.75)]
trings = []
for x, le, ch in TS:
    trings.append([(x, 2.6 + yy * 0.6, le - u) for u, yy in airfoil(ch, 0.1, 8)])
tail.loft(trings, lambda c, *_: 'SeaplaneCream' if abs(c[0]) < 2.2 else 'SeaplaneJade', True, True)
# fin: symmetric-ish profile in (x, z), stations up the height
FS = [(2.7, -4.55, 1.8), (3.4, -5.05, 1.35), (4.0, -5.45, 0.95), (4.15, -5.6, 0.75)]
frings = []
for y, le, ch in FS:
    frings.append([(yy * 0.9, y, le - u) for u, yy in airfoil(ch, 0.11, 8)])
tail.loft(frings, lambda c, *_: 'SeaplaneJade' if c[1] < 3.7 else 'SeaplaneCream', True, True)

# ---------------------------------------------------------------------------------------------- floats (Edo-style, V bottom)
FL = [  # z, width factor, keel y, deck y
    (3.55, 0.12, 0.46, 0.56), (3.3, 0.45, 0.3, 0.6), (2.9, 0.72, 0.16, 0.62), (2.3, 0.9, 0.06, 0.62), (1.5, 1.0, 0.0, 0.62),
    (0.4, 1.0, 0.0, 0.62), (-0.3, 1.0, 0.0, 0.62), (-0.31, 0.98, 0.07, 0.62), (-1.0, 0.96, 0.1, 0.62), (-1.7, 0.92, 0.16, 0.62),
    (-2.5, 0.82, 0.25, 0.61), (-3.3, 0.6, 0.36, 0.6), (-3.9, 0.2, 0.47, 0.58),
]


def float_ring(cx, z, w, keel, deck):
    b = 0.4 * w
    chine = keel + 0.16 * (0.5 + 0.5 * w)
    pts = [(0, keel), (b * 0.55, keel + (chine - keel) * 0.55), (b, chine), (b, deck - 0.07), (b * 0.8, deck), (-b * 0.8, deck), (-b, deck - 0.07), (-b, chine), (-b * 0.55, keel + (chine - keel) * 0.55)]
    return [(cx + x, y, z) for x, y in pts]


# one node per float (FloatL = port, FloatR = starboard): a wreck can tear one off
floats = []
for cx, name in ((1.35, 'FloatL'), (-1.35, 'FloatR')):
    fb = Builder(name)
    floats.append(fb)
    fb.loft([float_ring(cx, *s) for s in FL], lambda c, *_: 'SeaplaneCream' if c[1] > 0.55 else 'SeaplaneJade', True, True, False)
    fb.box((cx, 0.3, -4.0), (0.02, 0.22, 0.14), 'SeaplaneDark')  # the water rudder at the heel
    for z in (3.0, -3.2):
        fb.box((cx, 0.66, z), (0.06, 0.04, 0.03), 'SeaplaneStrut')  # cleats

# ---------------------------------------------------------------------------------------------- struts
struts = Builder('Struts')
for s in (1, -1):
    # float struts (N) and the wing struts (V) from the lower fuselage to the wing at mid span
    struts.rod((s * 1.35, 0.62, 1.7), (s * 0.45, 1.36, 1.55), 0.045, 'SeaplaneStrut')
    struts.rod((s * 1.35, 0.62, 1.7), (s * 0.45, 1.36, 0.1), 0.04, 'SeaplaneStrut')
    struts.rod((s * 1.35, 0.62, -0.5), (s * 0.45, 1.4, -0.55), 0.045, 'SeaplaneStrut')
    struts.rod((s * 0.62, 1.5, 1.05), (s * 3.6, WY + 3.6 * dih + 0.02, 1.0), 0.05, 'SeaplaneStrut')
    struts.rod((s * 0.62, 1.5, 0.35), (s * 3.6, WY + 3.6 * dih + 0.02, 0.2), 0.05, 'SeaplaneStrut')
for z in (1.7, -0.5):
    struts.rod((1.35, 0.6, z), (-1.35, 0.6, z), 0.035, 'SeaplaneStrut')  # spreader bars
struts.box((0.95, 1.0, 1.2), (0.12, 0.015, 0.1), 'SeaplaneStrut')  # boarding step by the port door

# ---------------------------------------------------------------------------------------------- cabin interior
cab = Builder('Cabin')
cab.box((0, 1.42, 0.8), (0.62, 0.03, 1.7), 'SeaplaneInterior')  # floor (top = GEOM.seat y 1.45)
for x in (0.32, -0.32):
    cab.box((x, 1.87, 1.15), (0.24, 0.06, 0.24), 'SeaplaneSeat')  # cushion (top 1.93: the eye 0.8 m above, GEOM.eye)
    cab.box((x, 2.2, 0.88), (0.24, 0.32, 0.05), 'SeaplaneSeat')  # back
    cab.box((x, 1.66, 1.15), (0.2, 0.16, 0.2), 'SeaplaneDark')  # frame
    cab.rod((x, 1.98, 2.3), (x, 2.18, 1.98), 0.025, 'SeaplaneDark')  # yoke column (below the line of sight to the panel)
    cab.box((x, 2.2, 1.96), (0.14, 0.035, 0.02), 'SeaplaneDark')  # yoke
cab.box((0, 1.85, -0.1), (0.62, 0.06, 0.3), 'SeaplaneSeat')  # rear bench
cab.box((0, 2.2, -0.35), (0.62, 0.32, 0.05), 'SeaplaneSeat')


def quad_box(b, corners, back, m):
    # a box from four front corners (game frame) pushed back by the vector `back`
    f = [b.vert(p) for p in corners]
    k = [b.vert(tuple(p[n] + back[n] for n in range(3))) for p in corners]
    b.face(f, m, False)
    b.face(k[::-1], m, False)
    for i in range(4):
        j = (i + 1) % 4
        b.face([f[j], f[i], k[i], k[j]], m, False)


# the instrument panel housing just behind GEOM.panel (Cockpit.js draws the live face 6 mm in front of it), tilted back
# towards the pilot, under a glare shield whose lip sets the view over the nose (~11 deg down from the eye)
ct, st_ = math.cos(PANEL_TILT), math.sin(PANEL_TILT)
up = (0, ct, st_)
nb = (0, -st_ * 0.006, ct * 0.006)  # 6 mm behind the face
corners = []
for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
    corners.append(tuple(PANEL_C[n] + (sx * PANEL_W / 2 if n == 0 else 0) + sy * PANEL_H / 2 * up[n] + nb[n] for n in range(3)))
quad_box(cab, corners, (0, -st_ * 0.14, ct * 0.14), 'SeaplaneDark')
top_y = PANEL_C[1] + PANEL_H / 2 * ct
top_z = PANEL_C[2] + PANEL_H / 2 * st_
cab.box((0, top_y + 0.02, top_z + 0.09), (PANEL_W / 2 + 0.02, 0.018, 0.12), 'SeaplaneDark')  # glare shield
cab.box((0, 1.78, 2.56), (0.64, 0.3, 0.03), 'SeaplaneDark')  # firewall under the panel
cab.box((0, PANEL_C[1] - PANEL_H / 2 * ct - 0.03, PANEL_C[2] - 0.02), (0.14, 0.03, 0.06), 'SeaplaneStrut')  # throttle quadrant

# ---------------------------------------------------------------------------------------------- propeller (own node)
prop = Builder('Propeller')
px, py, pz = PROP
spin = []
for z, r in ((3.68, 0.24), (3.78, 0.25), (3.9, 0.23), (4.0, 0.18), (4.08, 0.11), (4.13, 0.04)):
    spin.append([(px + r * math.cos(a), py + r * math.sin(a), z) for a in (2 * math.pi * i / 16 for i in range(16))])
prop.loft(spin, lambda c, *_: 'SeaplaneProp', True, True)
for k in range(3):
    th = 2 * math.pi * k / 3 + 0.3
    ca, sa = math.cos(th), math.sin(th)
    brings = []
    for r, ch, tw in ((0.18, 0.16, 0.7), (0.5, 0.2, 0.45), (0.95, 0.17, 0.28), (1.22, 0.12, 0.2), (1.3, 0.07, 0.18)):
        ring = []
        for u, yy in airfoil(ch, 0.12, 6):
            # blade frame: span along the radius, chord along the tangent, twisted towards the axis
            cu = u - ch * 0.4
            t_ = cu * math.cos(tw)
            ax = -cu * math.sin(tw) + yy
            ring.append((px + ca * r - sa * t_, py + sa * r + ca * t_, pz + ax))
        brings.append(ring)
    prop.loft(brings, lambda c, *_: 'SeaplanePropTip' if math.hypot(c[0] - px, c[1] - py) > 1.12 else 'SeaplaneProp', False, True)

objs = [b.build(col) for b in (body, glass, *wings, tail, *floats, struts, cab, prop)]
pob = objs[-1]
# the propeller's origin at the hub, so the node carries the spin axis
pc = B(PROP)
pob.data.transform(Matrix.Translation(-pc))
pob.location = pc

tri = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
lo = [1e9] * 3
hi = [-1e9] * 3
for o in objs:
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        g = (w.x, w.z, -w.y)
        for k in range(3):
            lo[k] = min(lo[k], g[k])
            hi[k] = max(hi[k], g[k])
print('SEAPLANE tris', tri, 'game bbox', [round(a, 2) for a in lo], [round(a, 2) for a in hi])

os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_apply=True, export_animations=False,
                          export_skins=False, export_morph=False, export_cameras=False, export_lights=False)
print('EXPORTED', OUT, os.path.getsize(OUT))

if PREVIEW:
    sc = bpy.context.scene
    try:
        sc.render.engine = 'BLENDER_WORKBENCH'
        sc.display.shading.light = 'STUDIO'
        sc.display.shading.color_type = 'MATERIAL'
        sc.display.shading.show_shadows = True
        sc.display.shading.show_cavity = True
    except Exception as e:
        print('shading', e)
    sc.render.resolution_x = 1200
    sc.render.resolution_y = 800
    sc.world = bpy.data.worlds.new('w')
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    col.objects.link(cam)
    sc.camera = cam
    # a sea plane and a horizon line far ahead, so the eye renders show where the water starts over the nose
    sea = bpy.data.meshes.new('sea')
    sea.from_pydata([(-400, -400, 0.2), (400, -400, 0.2), (400, 400, 0.2), (-400, 400, 0.2)], [], [(0, 1, 2, 3)])
    sea_ob = bpy.data.objects.new('sea', sea)
    sea.materials.append(mat('PreviewSea', (0.1, 0.35, 0.5), 0.3))
    col.objects.link(sea_ob)
    glass_ob = next(o for o in objs if o.name == 'Glass')
    try:
        MATS['SeaplaneGlass'].diffuse_color = (*srgb((0.55, 0.7, 0.75)), 0.18)
    except Exception:
        pass
    shots = [('front3q', (12.0, -11.0, 6.0)), ('side', (16.0, 0.5, 2.2)), ('rear3q', (-10.0, 12.0, 7.0)), ('cockpit_clear', 'eye'), ('cockpit', 'eye'), ('cockpit_left', 'left')]
    base, ext = os.path.splitext(PREVIEW)
    for name, loc in shots:
        glass_ob.hide_render = name == 'cockpit_clear'
        sea_ob.hide_render = loc not in ('eye', 'left')
        if loc in ('eye', 'left'):
            # the game camera: 62 deg vertical field of view, the head pitched 4.6 deg down (Player helmPitch)
            sc.render.resolution_x, sc.render.resolution_y = 1600, 900
            cam.data.sensor_fit = 'VERTICAL'
            cam.data.angle = math.radians(62)
            cam.location = B(EYE)
            look = (EYE[0], EYE[1] - 0.08, EYE[2] + 1.0) if loc == 'eye' else (EYE[0] + 1.0, EYE[1] - 0.05, EYE[2] + 0.3)
            target = B(look)
        else:
            sc.render.resolution_x, sc.render.resolution_y = 1200, 800
            cam.data.sensor_fit = 'AUTO'
            cam.location = Vector(loc)
            target = Vector((0, 0.3, 2.0))
            cam.data.lens = 40
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = base + '_' + name + ext
        bpy.ops.render.render(write_still=True)
        print('PREVIEW', sc.render.filepath)
