# Blender 5.x, headless: the three fictional WW2-style fighters of wave 26A, built from code (original work, no outside
# assets) and exported to public/models/warbirds/<Name>.glb with three levels of detail each, plus preview renders.
#   D:\blender\blender.exe -b --python tools/warbirds/build_warbirds.py -- public/models/warbirds [preview_dir] [sabrewing|stormgull|bulwark|all]
#
#   Sabrewing  a nimble low-wing interceptor with an elliptical wing, a long inline-engine nose and a four-blade propeller
#   Stormgull  a rugged gull-wing carrier fighter: the inverted gull wing, a big radial and a long four-blade propeller
#   Bulwark    a stocky radial-engine brawler with a tight cowling and cooling fan, a bubble canopy, cannons in the wings
#   Kitewing   a two-seat dive bomber: a long greenhouse canopy, spatted fixed gear, a rear gunner's twin guns, a bomb
#   Seawarden  a three-seat torpedo and patrol bomber: a long canopy, a dorsal turret dome, a torpedo under the belly
#   Longreach  a four-seat twin-engine medium bomber: a glazed nose with its ball gun, a stepped cockpit, a top turret, a
#              twin tail
#
# Everything is authored in the GAME frame (+Z the nose, +Y up, +X the LEFT wing, metres, origin at the centre of mass;
# src/features/dogfight/Warbirds.js holds the same numbers: gear contacts, propeller hub, eye, sight, gun mounts) and
# converted to Blender (X, -Z, Y) when the meshes are made; the glTF export (+Y up) turns it back.
# Nodes: L<level>_<Part> with level 0 (full, the cockpit inside), 1 (about 40 %), 2 (about 12 %, no cockpit, no pilot).
# Parts (src/features/dogfight/Model.js): Fuselage, Glass, Interior, Sight (the reflector glass), Pilot (a figure for the
# others' and the AI's aircraft), WingL, WingR, AileronL, AileronR, Tail, Elevator, Rudder, GearL, GearR, GearT, Propeller,
# and on the crewed ones: Propeller2 (the twin's right engine), Crew1..3 (the crew figures, seat order), Turret<Id> / Guns<Id>
# (a turret's base and dome turning about up, its guns pitching; built at the turret's rest heading), Bomb.
# The moving parts (ailerons, elevator, rudder, gear) are baked in place; Model.js finds their hinge from their bounds.
# Materials: WbMain (upper camouflage), WbUnder (undersides), WbBand (spinner, tail band), WbTrim, WbInsignia (the white
# hexagon of the fictional Hyptile Island air arm), WbInsigniaCore (teal), WbInsigniaDot (gold), WbMetal, WbExhaust,
# WbDark, WbTyre, WbInterior, WbPanel, WbDial, WbGlass, WbSight, WbProp, WbPropTip, WbLeather, WbJacket, WbSkin.
import bpy, bmesh, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = argv[0] if argv else 'public/models/warbirds'
PREVIEW_DIR = argv[1] if len(argv) > 1 and argv[1] not in ('', '-') else None
ONLY = argv[2] if len(argv) > 2 else 'all'


def B(p):
    return Vector((p[0], -p[2], p[1]))


def srgb(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def lerp(a, b, t):
    return a + (b - a) * t


def sgn(v):
    return 1.0 if v >= 0 else -1.0


# ---------------------------------------------------------------------------------------------------- the airframes

TYPES = {
    'sabrewing': dict(
        name='Sabrewing', span=11.2, prop=(0, 0.18, 4.15), prop_r=1.6, blades=4, blade_chord=0.24,
        eye=(0, 0.84, -0.85), sight=(0, 0.86, -0.12), seat=(0, -0.45, -0.9),
        main=(1.0, -1.62, 0.55), tailw=(0, -0.4, -6.3), wheel_r=0.32, retract='out',
        main_c=(0.42, 0.46, 0.33), under_c=(0.62, 0.66, 0.68), band_c=(0.86, 0.72, 0.28), trim_c=(0.3, 0.32, 0.26),
        # fuselage stations: z, centre y, half width, top, bottom
        fus=[(4.72, 0.18, 0.04, 0.04, 0.04), (4.2, 0.18, 0.4, 0.42, 0.44), (3.6, 0.16, 0.46, 0.47, 0.52), (2.6, 0.13, 0.5, 0.52, 0.6),
             (1.4, 0.1, 0.54, 0.55, 0.68), (0.4, 0.07, 0.55, 0.56, 0.7), (-0.6, 0.05, 0.53, 0.53, 0.66), (-1.6, 0.05, 0.48, 0.49, 0.6),
             (-2.8, 0.07, 0.4, 0.42, 0.48), (-4.0, 0.11, 0.3, 0.33, 0.36), (-5.2, 0.17, 0.19, 0.24, 0.24), (-6.15, 0.22, 0.09, 0.13, 0.12),
             (-6.5, 0.24, 0.02, 0.03, 0.03)],
        nose='inline', cowl_until=1.3,
        # wing: root chord, the quarter-chord line z, dihedral (deg), root y, thickness root / tip, planform
        wing=dict(c0=2.45, zq=0.45, dih=6.0, y0=-0.42, t0=0.135, t1=0.08, plan='ellipse', root=0.5),
        ail=(0.55, 0.9), flap_x=0.76,
        tailplane=dict(c0=1.25, zq=-4.75, half=1.62, y0=0.16, t=0.1, plan='ellipse'),
        fin=dict(c0=1.45, zq=-4.95, y0=0.32, h=1.25, t=0.1, plan='ellipse'),
        canopy=dict(z0=0.16, z1=-1.75, w=0.3, h=0.55, frames=3, bubble=False),
        radiators=True, mast=True,
    ),
    'stormgull': dict(
        name='Stormgull', span=12.5, prop=(0, 0.05, 4.35), prop_r=2.0, blades=4, blade_chord=0.27,
        eye=(0, 0.86, -1.25), sight=(0, 0.88, -0.52), seat=(0, -0.43, -1.3),
        main=(1.95, -1.95, 0.75), tailw=(0, -0.6, -6.7), wheel_r=0.4, retract='back',
        main_c=(0.16, 0.24, 0.38), under_c=(0.72, 0.74, 0.76), band_c=(0.93, 0.93, 0.9), trim_c=(0.12, 0.17, 0.27),
        fus=[(4.72, 0.05, 0.05, 0.05, 0.05), (4.3, 0.05, 0.42, 0.42, 0.42), (3.85, 0.05, 0.74, 0.74, 0.74), (3.0, 0.05, 0.78, 0.78, 0.8),
             (1.8, 0.06, 0.72, 0.72, 0.78), (0.6, 0.07, 0.66, 0.64, 0.76), (-0.6, 0.07, 0.6, 0.58, 0.72), (-1.8, 0.07, 0.55, 0.53, 0.64),
             (-3.0, 0.1, 0.45, 0.45, 0.52), (-4.3, 0.15, 0.32, 0.34, 0.37), (-5.6, 0.2, 0.19, 0.23, 0.22), (-6.6, 0.24, 0.08, 0.11, 0.1),
             (-6.95, 0.26, 0.02, 0.03, 0.03)],
        nose='radial', cowl_until=2.3,
        wing=dict(c0=2.6, zq=0.62, dih=0.0, y0=-0.58, t0=0.15, t1=0.09, plan='taper', root=0.55, gull=(1.95, -13.0, 9.0), c1=1.25),
        ail=(0.62, 0.92), flap_x=0.75,
        tailplane=dict(c0=1.35, zq=-5.05, half=1.95, y0=0.2, t=0.1, plan='taper', c1=0.7),
        fin=dict(c0=1.55, zq=-5.25, y0=0.36, h=1.4, t=0.1, plan='round'),
        canopy=dict(z0=-0.24, z1=-2.15, w=0.32, h=0.55, frames=4, bubble=False),
        radiators=False, mast=True,
    ),
    'bulwark': dict(
        name='Bulwark', span=10.5, prop=(0, 0.0, 4.1), prop_r=1.65, blades=3, blade_chord=0.3,
        eye=(0, 0.86, -0.75), sight=(0, 0.88, -0.05), seat=(0, -0.43, -0.8),
        main=(1.75, -1.7, 0.6), tailw=(0, -0.5, -6.0), wheel_r=0.35, retract='in',
        main_c=(0.5, 0.42, 0.3), under_c=(0.66, 0.7, 0.72), band_c=(0.75, 0.2, 0.12), trim_c=(0.32, 0.36, 0.28),
        fus=[(4.55, 0.0, 0.05, 0.05, 0.05), (4.15, 0.0, 0.42, 0.42, 0.42), (3.75, 0.0, 0.66, 0.66, 0.66), (3.0, 0.0, 0.72, 0.72, 0.72),
             (1.9, 0.02, 0.68, 0.66, 0.72), (0.7, 0.04, 0.6, 0.58, 0.72), (-0.5, 0.05, 0.55, 0.54, 0.66), (-1.6, 0.06, 0.48, 0.47, 0.58),
             (-2.8, 0.09, 0.4, 0.4, 0.46), (-4.0, 0.13, 0.3, 0.32, 0.34), (-5.1, 0.18, 0.18, 0.22, 0.21), (-5.95, 0.22, 0.08, 0.11, 0.1),
             (-6.25, 0.24, 0.02, 0.03, 0.03)],
        nose='radial', cowl_until=1.9, fan=True,
        wing=dict(c0=2.3, zq=0.52, dih=5.5, y0=-0.4, t0=0.15, t1=0.09, plan='taper', root=0.5, c1=1.0),
        ail=(0.58, 0.9), flap_x=0.75,
        tailplane=dict(c0=1.2, zq=-4.6, half=1.65, y0=0.15, t=0.1, plan='taper', c1=0.62),
        fin=dict(c0=1.4, zq=-4.8, y0=0.3, h=1.2, t=0.1, plan='taper'),
        canopy=dict(z0=0.23, z1=-1.65, w=0.3, h=0.56, frames=1, bubble=True),
        radiators=False, mast=False,
    ),
    'kitewing': dict(
        name='Kitewing', span=13.6, prop=(0, 0.1, 4.6), prop_r=1.7, blades=3, blade_chord=0.3,
        eye=(0, 0.95, -0.55), sight=(0, 0.97, 0.15), seat=(0, -0.34, -0.6),
        main=(1.6, -2.0, 0.75), tailw=(0, -0.55, -6.4), wheel_r=0.38, retract='fixed',
        main_c=(0.38, 0.4, 0.3), under_c=(0.62, 0.66, 0.7), band_c=(0.95, 0.85, 0.3), trim_c=(0.3, 0.32, 0.26),
        fus=[(4.75, 0.1, 0.45, 0.45, 0.45), (4.4, 0.1, 0.78, 0.78, 0.78), (3.6, 0.1, 0.82, 0.82, 0.85), (2.4, 0.08, 0.78, 0.74, 0.82),
             (1.0, 0.06, 0.72, 0.62, 0.8), (-0.4, 0.05, 0.66, 0.58, 0.74), (-1.8, 0.06, 0.6, 0.55, 0.66), (-3.0, 0.08, 0.5, 0.5, 0.55),
             (-4.3, 0.12, 0.38, 0.4, 0.42), (-5.5, 0.18, 0.24, 0.28, 0.27), (-6.45, 0.22, 0.1, 0.13, 0.12), (-6.75, 0.24, 0.02, 0.03, 0.03)],
        nose='radial', cowl_until=3.0,
        wing=dict(c0=2.8, zq=0.55, dih=6.0, y0=-0.5, t0=0.15, t1=0.09, plan='taper', root=0.55, c1=1.3),
        ail=(0.6, 0.92), flap_x=0.75,
        tailplane=dict(c0=1.4, zq=-5.35, half=2.2, y0=0.2, t=0.1, plan='taper', c1=0.75),
        fin=dict(c0=1.6, zq=-5.55, y0=0.35, h=1.35, t=0.1, plan='taper'),
        canopy=dict(z0=0.45, z1=-2.75, w=0.36, h=0.6, frames=5, bubble=False, open_rear=True),
        radiators=False, mast=False, insignia_z=-4.3,
        seats=[((0, 0.95, -0.55), 0), ((0, 0.92, -2.35), math.pi)],
        turrets=[dict(id='Rear', at=(0, 0.72, -2.95), rest=math.pi, guns=[(0.09, 0.04, 0.85, 'light'), (-0.09, 0.04, 0.85, 'light')], dome=False, ring=0.42)],
        bomb=(0, -1.2, 0.3),
    ),
    'seawarden': dict(
        name='Seawarden', span=15.8, prop=(0, 0.1, 5.0), prop_r=2.0, blades=3, blade_chord=0.32,
        eye=(0, 1.12, 0.4), sight=(0, 1.14, 1.1), seat=(0, -0.17, 0.35),
        main=(2.3, -2.3, 0.9), tailw=(0, -0.65, -7.0), wheel_r=0.42, retract='back',
        main_c=(0.3, 0.4, 0.44), under_c=(0.8, 0.82, 0.82), band_c=(0.9, 0.42, 0.12), trim_c=(0.2, 0.28, 0.32),
        fus=[(5.15, 0.1, 0.48, 0.48, 0.48), (4.8, 0.1, 0.86, 0.86, 0.86), (4.0, 0.1, 0.92, 0.9, 0.92), (2.6, 0.08, 0.92, 0.86, 0.95),
             (1.0, 0.06, 0.9, 0.8, 0.98), (-0.6, 0.06, 0.86, 0.78, 0.95), (-2.0, 0.08, 0.78, 0.72, 0.85), (-3.4, 0.1, 0.64, 0.6, 0.68),
             (-4.8, 0.14, 0.46, 0.46, 0.48), (-6.1, 0.2, 0.28, 0.3, 0.3), (-7.1, 0.24, 0.1, 0.13, 0.12), (-7.4, 0.26, 0.02, 0.03, 0.03)],
        nose='radial', cowl_until=3.3,
        wing=dict(c0=3.1, zq=0.75, dih=6.0, y0=-0.55, t0=0.16, t1=0.1, plan='taper', root=0.6, c1=1.45),
        ail=(0.6, 0.92), flap_x=0.75,
        tailplane=dict(c0=1.5, zq=-5.85, half=2.5, y0=0.25, t=0.1, plan='taper', c1=0.8),
        fin=dict(c0=1.75, zq=-6.1, y0=0.4, h=1.5, t=0.1, plan='round'),
        canopy=dict(z0=1.3, z1=-1.9, w=0.4, h=0.6, frames=5, bubble=False),
        radiators=False, mast=True, insignia_z=-4.1,
        seats=[((0, 1.12, 0.4), 0), ((0, 1.38, -2.75), math.pi), ((0, 0.98, -1.25), 0)],
        turrets=[dict(id='Dorsal', at=(0, 1.2, -2.75), rest=math.pi, guns=[(0.13, 0.05, 0.95, 'heavy'), (-0.13, 0.05, 0.95, 'heavy')], dome=True, ring=0.6)],
        torpedo=(0, -1.12, 0.4),
    ),
    'longreach': dict(
        name='Longreach', span=20.5, prop=(3.4, -0.05, 3.7), prop_r=1.9, blades=3, blade_chord=0.3,
        props=[(3.4, -0.05, 3.7), (-3.4, -0.05, 3.7)],
        eye=(0.35, 1.25, 3.0), sight=(0.35, 1.27, 3.7), seat=(0.35, -0.04, 2.95),
        main=(3.4, -2.5, 1.6), tailw=(0, -0.75, -8.2), wheel_r=0.55, retract='back',
        main_c=(0.36, 0.38, 0.27), under_c=(0.66, 0.69, 0.7), band_c=(0.82, 0.78, 0.66), trim_c=(0.3, 0.32, 0.24),
        fus=[(7.15, 0.15, 0.08, 0.08, 0.08), (6.9, 0.12, 0.45, 0.45, 0.5), (6.3, 0.1, 0.78, 0.78, 0.85), (5.5, 0.08, 0.92, 0.9, 0.98),
             (4.4, 0.06, 1.0, 0.98, 1.05), (3.0, 0.05, 1.05, 1.0, 1.08), (1.0, 0.05, 1.05, 1.0, 1.08), (-1.0, 0.05, 1.0, 0.96, 1.04),
             (-3.0, 0.07, 0.86, 0.84, 0.9), (-5.0, 0.12, 0.66, 0.66, 0.68), (-6.8, 0.2, 0.44, 0.46, 0.44), (-8.3, 0.28, 0.2, 0.22, 0.2),
             (-8.8, 0.3, 0.03, 0.04, 0.04)],
        nose='glazed', glaze_from=5.55, cowl_until=99,
        wing=dict(c0=3.6, zq=1.1, dih=4.0, y0=-0.15, t0=0.16, t1=0.1, plan='taper', root=0.9, c1=1.6),
        ail=(0.62, 0.92), flap_x=0.75,
        tailplane=dict(c0=1.8, zq=-7.6, half=3.0, y0=0.35, t=0.1, plan='taper', c1=1.2),
        fin=dict(c0=1.6, zq=-7.85, y0=0.3, h=1.7, t=0.1, plan='round', xs=(2.75, -2.75)),
        canopy=dict(z0=3.9, z1=1.5, w=0.78, h=0.6, frames=4, bubble=False),
        radiators=False, mast=True, insignia_z=-5.0,
        nacelles=dict(xs=(3.4, -3.4), y=-0.05, z0=4.05, z1=-1.6, r=0.66),
        seats=[((0.35, 1.25, 3.0), 0), ((-0.4, 1.18, 2.1), 0), ((0, 0.45, 5.9), 0), ((0, 1.58, -0.6), math.pi)],
        turrets=[dict(id='Nose', at=(0, 0.25, 6.75), rest=0.0, guns=[(0, 0, 0.7, 'heavy')], dome=False, ring=0.0, ball=0.2),
                 dict(id='Top', at=(0, 1.4, -0.6), rest=math.pi, guns=[(0.14, 0.06, 1.0, 'heavy'), (-0.14, 0.06, 1.0, 'heavy')], dome=True, ring=0.62)],
    ),
}

# the gun mounts (Warbirds.js guns: x, y, z, kind)
GUNS = {
    'sabrewing': [(2.15, -0.12, 0.55, 'light'), (2.65, -0.1, 0.45, 'light'), (3.15, -0.08, 0.35, 'light')],
    'stormgull': [(2.6, -0.05, 0.6, 'heavy'), (2.95, -0.02, 0.55, 'heavy'), (3.3, 0.0, 0.5, 'heavy')],
    'bulwark': [(1.45, -0.3, 0.6, 'cannon'), (2.6, -0.22, 0.45, 'cannon')],
    'kitewing': [(2.7, -0.35, 0.75, 'light')],
    'seawarden': [(3.0, -0.35, 0.95, 'heavy')],
    'longreach': [],
}

MATS = {}


def mat(name, rgb, rough=0.6, metal=0.0, double=False, alpha=1.0, emit=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
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
        if alpha < 1:
            b.inputs['Alpha'].default_value = alpha
        if emit > 0:
            try:
                b.inputs['Emission Color'].default_value = (*lin, 1.0)
                b.inputs['Emission Strength'].default_value = emit
            except Exception:
                pass
    m.diffuse_color = (*lin, alpha)
    m.roughness = rough
    m.use_backface_culling = not double
    if alpha < 1:
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass
    MATS[name] = m
    return m


def materials(T):
    mat('WbMain', T['main_c'], 0.55, 0.15, True)
    mat('WbUnder', T['under_c'], 0.5, 0.15, True)
    mat('WbBand', T['band_c'], 0.45, 0.1)
    mat('WbTrim', T['trim_c'], 0.55, 0.15, True)
    mat('WbInsignia', (0.93, 0.92, 0.86), 0.5, 0.0, True)
    mat('WbInsigniaCore', (0.05, 0.47, 0.45), 0.5, 0.0, True)
    mat('WbInsigniaDot', (0.95, 0.7, 0.15), 0.45, 0.0, True)
    mat('WbMetal', (0.55, 0.56, 0.57), 0.35, 0.9)
    mat('WbExhaust', (0.22, 0.17, 0.14), 0.7, 0.7)
    mat('WbDark', (0.07, 0.075, 0.08), 0.6, 0.3)
    mat('WbTyre', (0.05, 0.05, 0.055), 0.92)
    mat('WbInterior', (0.3, 0.36, 0.3), 0.8, 0.0, True)
    mat('WbPanel', (0.06, 0.06, 0.065), 0.7, 0.1, True)
    mat('WbDial', (0.86, 0.84, 0.76), 0.4, 0.0, False, 1.0, 0.6)
    mat('WbGlass', (0.62, 0.72, 0.76), 0.06, 0.0, True, 0.16)
    mat('WbSight', (0.95, 0.7, 0.35), 0.05, 0.0, True, 0.3)
    mat('WbProp', (0.06, 0.06, 0.065), 0.5, 0.2)
    mat('WbPropTip', (0.95, 0.78, 0.12), 0.5)
    mat('WbLeather', (0.24, 0.14, 0.08), 0.75, 0.0)
    mat('WbJacket', (0.36, 0.28, 0.18), 0.85, 0.0)
    mat('WbSkin', (0.78, 0.58, 0.45), 0.6, 0.0)


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
        base = [[self.vert(p) for p in r] for r in rings]
        n = len(rings[0])
        for i in range(len(rings) - 1):
            for j in range(n if closed else n - 1):
                k = (j + 1) % n
                q = [base[i][j], base[i][k], base[i + 1][k], base[i + 1][j]]
                c = [sum(self.v[a][t] for a in q) / 4 for t in range(3)]
                m = matfn(c, i, j)
                if m:
                    self.face(q, m, smooth)
        for cap, ring, rev in ((cap0, base[0], True), (cap1, base[-1], False)):
            if not cap:
                continue
            c = [sum(self.v[a][t] for a in ring) / n for t in range(3)]
            m = matfn(c, -1, -1)
            if not m:
                continue
            ci = self.vert(c)
            for j in range(n):
                tri = [ring[j], ring[(j + 1) % n], ci]
                self.face(tri[::-1] if rev else tri, m, False)

    def box(self, c, h, m, rot=None):
        x, y, z = c
        a, b, d = h
        pts = []
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    p = Vector((sx * a, sy * b, sz * d))
                    if rot:
                        p = rot @ p
                    pts.append(self.vert((x + p.x, y + p.y, z + p.z)))
        for q in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
            self.face([pts[i] for i in q], m, False)

    def rod(self, a, b, r, m, sides=8, r2=None, cap=True):
        a = Vector(a)
        b = Vector(b)
        d = (b - a).normalized()
        u = d.cross(Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))).normalized()
        w = d.cross(u)
        r2 = r if r2 is None else r2

        def ring(p, rr):
            return [tuple(p + (u * math.cos(t) + w * math.sin(t)) * rr) for t in (2 * math.pi * i / sides for i in range(sides))]
        self.loft([ring(a, r), ring(b, r2)], lambda *x: m, cap, cap, True)

    def disc(self, c, normal, r, m, sides=16, up=None):
        # a flat disc facing `normal`
        n = Vector(normal).normalized()
        u = n.cross(Vector((0, 1, 0)) if abs(n.y) < 0.9 else Vector((1, 0, 0))).normalized()
        w = n.cross(u)
        c = Vector(c)
        ring = [self.vert(tuple(c + (u * math.cos(t) + w * math.sin(t)) * r)) for t in (2 * math.pi * i / sides for i in range(sides))]
        ci = self.vert(tuple(c))
        for j in range(sides):
            self.face([ring[j], ring[(j + 1) % sides], ci], m, False)

    def wheel(self, c, r, width, axis_x=True):
        # tyre (a lathe), hub caps
        cx, cy, cz = c
        prof = [(0.55, -0.5), (0.85, -0.5), (0.97, -0.38), (1.0, -0.15), (1.0, 0.15), (0.97, 0.38), (0.85, 0.5), (0.55, 0.5)]
        rings = []
        for rr, ww in prof:
            ring = []
            for i in range(20):
                t = 2 * math.pi * i / 20
                ring.append((cx + ww * width, cy + math.cos(t) * rr * r, cz + math.sin(t) * rr * r))
            rings.append(ring)
        self.loft(rings, lambda *a: 'WbTyre', False, False, True)
        for s in (-1, 1):
            self.disc((cx + s * 0.5 * width, cy, cz), (s, 0, 0), r * 0.56, 'WbMetal', 14)

    def build(self, collection):
        if not self.f:
            return None
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
        uv = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:
            for l in f.loops:
                c = l.vert.co
                l[uv].uv = (-c.y * 0.5 + c.x * 0.15, c.z * 0.5 + c.x * 0.3)
        bm.to_mesh(me)
        bm.free()
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        try:
            me.set_sharp_from_angle(angle=math.radians(38))
        except Exception as e:
            print('sharp edges', e)
        return ob


# ------------------------------------------------------------------------------------------------- shapes

# an airfoil's chord samples (0 = leading edge, 1 = trailing edge), shared by every station of a loft
XS = [0.0, 0.012, 0.035, 0.07, 0.12, 0.19, 0.28, 0.38, 0.49, 0.6, 0.7, 0.75, 0.8, 0.88, 0.95, 1.0]


def thick(x, t):
    x = max(0.0, min(1.0, x))
    return 5 * t * (0.2969 * math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4)


def camber(x, m=0.02, p=0.4):
    return m / p ** 2 * (2 * p * x - x * x) if x < p else m / (1 - p) ** 2 * ((1 - 2 * p) + 2 * p * x - x * x)


def section(x0, x1, t, cam=0.02):
    # a closed airfoil ring over chord fraction x0..x1: the upper surface from x1 to x0, the lower back to x1
    xs = [x for x in XS if x0 - 1e-6 <= x <= x1 + 1e-6]
    if xs[0] > x0 + 1e-6:
        xs = [x0] + xs
    if xs[-1] < x1 - 1e-6:
        xs = xs + [x1]
    up = [(x, camber(x, cam) + thick(x, t)) for x in reversed(xs)]
    lo = [(x, camber(x, cam) - thick(x, t)) for x in xs]
    if x1 >= 0.999:
        lo = lo[:-1]  # (the trailing edge point once)
    if x0 <= 0.001:
        up = up[:-1]
    return up + lo, len(up)


def ellipse_frac(s, half):
    return math.sqrt(max(0.0, 1.0 - (s / half) ** 2))


class Wing:
    # a wing half (side +1 left / -1 right) as stations: s outward, chord c(s), leading edge z, the reference line's y

    def __init__(self, T, W, side):
        self.T, self.W, self.side = T, W, side
        self.half = T['span'] / 2

    def chord(self, s):
        W, h = self.W, self.half
        if W['plan'] == 'ellipse':
            return max(0.28, W['c0'] * ellipse_frac(min(s, h * 0.995), h))
        tip = W.get('c1', W['c0'] * 0.45)
        k = s / h
        c = lerp(W['c0'], tip, k)
        if k > 0.93:  # a rounded tip
            c *= math.sqrt(max(0.05, 1 - ((k - 0.93) / 0.07) ** 2))
        return max(0.2, c)

    def lez(self, s):
        c = self.chord(s)
        return self.W['zq'] + 0.25 * c - (0.02 * s if self.W['plan'] != 'ellipse' else 0.0)

    def y(self, s):
        W = self.W
        g = W.get('gull')
        if g:
            knee, inner, outer = g
            if s <= knee:
                return W['y0'] + (s - W['root']) * math.tan(math.radians(inner))
            return W['y0'] + (knee - W['root']) * math.tan(math.radians(inner)) + (s - knee) * math.tan(math.radians(outer))
        return W['y0'] + (s - W['root']) * math.tan(math.radians(W['dih']))

    def t(self, s):
        return lerp(self.W['t0'], self.W['t1'], min(1.0, s / self.half))

    def point(self, s, u, v):
        # chord fraction u (0 LE .. 1 TE), v in chords above the reference line
        c = self.chord(s)
        return (self.side * s, self.y(s) + v * c, self.lez(s) - u * c)

    def surface(self, s, u, upper=True):
        t = self.t(s)
        v = camber(u) + (thick(u, t) if upper else -thick(u, t))
        return self.point(s, u, v)


def wing_loft(b, wing, s0, s1, x0, x1, n, mat_up, mat_lo, cap0=False, cap1=True):
    ss = [lerp(s0, s1, (i / n) ** 0.85) for i in range(n + 1)]
    rings = []
    nu = 0
    for s in ss:
        ring, nu = section(x0, x1, wing.t(s))
        rings.append([wing.point(s, u, v) for u, v in ring])
    if wing.side < 0:
        rings = [list(reversed(r)) for r in rings]
        n_ring = len(rings[0])

        def mf(c, i, j):
            if i < 0:
                return mat_up
            return mat_up if j >= n_ring - nu else mat_lo
    else:
        def mf(c, i, j):
            if i < 0:
                return mat_up
            return mat_up if j < nu - 1 else mat_lo
    b.loft(rings, mf, cap0, cap1, True)


def fin_loft(b, F, x0, x1, n, m, t):
    # the fin: sections in horizontal planes, from its root up
    rings = []
    for i in range(n + 1):
        k = i / n
        if F['plan'] == 'ellipse':
            c = max(0.25, F['c0'] * ellipse_frac(min(k, 0.995) * F['h'], F['h']))
        elif F['plan'] == 'round':
            c = F['c0'] * (1 - 0.45 * k) * (math.sqrt(max(0.08, 1 - ((k - 0.82) / 0.18) ** 2)) if k > 0.82 else 1)
        else:
            c = F['c0'] * (1 - 0.5 * k) * (math.sqrt(max(0.08, 1 - ((k - 0.88) / 0.12) ** 2)) if k > 0.88 else 1)
        c = max(0.2, c)
        y = F['y0'] + k * F['h']
        lez = F['zq'] + 0.25 * c - 0.25 * k * F['h'] * (0.0 if F['plan'] == 'ellipse' else 0.5)
        ring, _ = section(x0, x1, t, 0.0)
        rings.append([(v * c, y, lez - u * c) for u, v in ring])
    b.loft(rings, lambda *a: m, False, True, True)


# the fuselage: rounded rings at the stations, interpolated finely; the canopy sits on its sill (a fraction of the top)
RING = 28
SILL = 0.8


def fus_ring(st, t_ang=None):
    z, cy, hw, top, bot = st
    pts = []
    for i in range(RING):
        a = 2 * math.pi * i / RING - math.pi / 2  # from the keel, the left side up, over the top, down the right side
        c, s = math.cos(a), math.sin(a)
        p = 2.3
        x = hw * sgn(c) * abs(c) ** (2 / p)
        y = (top if s > 0 else bot) * sgn(s) * abs(s) ** (2 / p)
        pts.append((x, cy + y, z))
    return pts


def fus_stations(T, step=0.25):
    st = T['fus']
    out = []
    for i in range(len(st) - 1):
        a, b = st[i], st[i + 1]
        n = max(1, int(abs(a[0] - b[0]) / step))
        for k in range(n):
            t = k / n
            # smoothstep blend between the stations for a fair line
            t2 = t * t * (3 - 2 * t) * 0.5 + t * 0.5
            out.append(tuple(lerp(a[j], b[j], t2 if j else t) for j in range(5)))
    out.append(st[-1])
    return out


def fus_at(T, z):
    st = T['fus']
    for i in range(len(st) - 1):
        a, b = st[i], st[i + 1]
        if b[0] <= z <= a[0]:
            t = (a[0] - z) / (a[0] - b[0])
            return tuple(lerp(a[j], b[j], t) for j in range(5))
    return st[0] if z > st[0][0] else st[-1]


def fus_point(T, z, ang, off=0.0):
    # ang: 0 the left side, 90 the top, 180 the right side, -90 the keel
    zz, cy, hw, top, bot = fus_at(T, z)
    a = math.radians(ang)
    c, s = math.cos(a), math.sin(a)
    p = 2.3
    x = (hw + off) * sgn(c) * abs(c) ** (2 / p)
    y = ((top if s > 0 else bot) + off) * sgn(s) * abs(s) ** (2 / p)
    return (x, cy + y, z)


# ------------------------------------------------------------------------------------------------- one aircraft

def build_aircraft(key, col):
    T = TYPES[key]
    materials(T)
    parts = {}

    def P(name):
        if name not in parts:
            parts[name] = Builder('L0_' + name)
        return parts[name]

    cz0, cz1 = T['canopy']['z0'] + 0.05, T['canopy']['z1'] + 0.1
    cw = T['canopy']['w'] + 0.06
    holes = [(t['at'][0], t['at'][2], t['ring'] * 0.92) for t in T.get('turrets', []) if t.get('dome')]

    # ---- fuselage (the cockpit opening left open; the band and the cowling in their colours)
    stations = fus_stations(T)
    rings = [fus_ring(s) for s in stations]

    def fus_mat(c, i, j):
        x, y, z = c
        if i < 0:
            return 'WbBand' if z > 0 else 'WbMain'
        st = fus_at(T, z)
        rel = (y - st[1]) / max(0.05, st[3])
        if cz1 < z < cz0 and abs(x) < cw and rel > SILL - 0.06:
            return None  # the cockpit opening
        if rel > 0.3 and any(math.hypot(x - hx, z - hz) < hr for hx, hz, hr in holes):
            return None  # a turret's ring
        if T['nose'] == 'glazed' and z > T['glaze_from']:
            return 'WbGlass'
        if -4.0 < z < -3.6:
            return 'WbBand'
        if T['nose'] == 'radial' and z > T['cowl_until'] and z < T['fus'][1][0] - 0.05:
            return 'WbTrim' if rel > -0.2 else 'WbUnder'
        under = (y - st[1]) < -0.45 * st[4]
        return 'WbUnder' if under else 'WbMain'
    P('Fuselage').loft(rings, fus_mat, False, False, True)

    # the canopy rail (the sill) and the windscreen frame
    F = P('Fuselage')
    sill = []
    for k in range(9):
        z = lerp(cz0, cz1, k / 8)
        st = fus_at(T, z)
        sill.append(z)
    for s in (-1, 1):
        pts = []
        for z in sill:
            st = fus_at(T, z)
            yy = st[1] + st[3] * SILL
            pts.append((s * cw * 0.98, yy, z))
        for a, b in zip(pts, pts[1:]):
            F.rod(a, b, 0.025, 'WbDark', 6)

    # nose: the inline engine's long cowling with exhaust stubs, the radial's ring and cylinders, or a bomber's glazing
    if T['nose'] == 'glazed':
        z0g = T['glaze_from']
        zt = T['fus'][0][0]
        for k in range(8):
            a = 2 * math.pi * k / 8
            pts = [fus_point(T, lerp(z0g, zt - 0.08, i / 6), math.degrees(a), 0.012) for i in range(7)]
            for p0, p1 in zip(pts, pts[1:]):
                F.rod(p0, p1, 0.016, 'WbDark', 5)
        for zz in (z0g + 0.02, lerp(z0g, zt, 0.5)):
            ring = [fus_point(T, zz, 360 * i / 16, 0.012) for i in range(17)]
            for p0, p1 in zip(ring, ring[1:]):
                F.rod(p0, p1, 0.02, 'WbDark', 5)
    elif T['nose'] == 'inline':
        for s in (-1, 1):
            for k in range(6):
                z = 3.5 - k * 0.36
                p = fus_point(T, z, 90 - s * 58, 0.01)
                F.rod((p[0] - s * 0.02, p[1], p[2] + 0.04), (p[0] + s * 0.07, p[1] - 0.02, p[2] - 0.05), 0.032, 'WbExhaust', 6)
        # the chin intake
        p = fus_point(T, 2.7, -90, 0.0)
        F.box((0, p[1] - 0.1, 2.6), (0.18, 0.1, 0.35), 'WbUnder')
    else:
        z = T['fus'][1][0]
        st = fus_at(T, z - 0.05)
        F.disc((0, st[1], z - 0.12), (0, 0, 1), st[2] * 0.95, 'WbDark', 24)
        ncyl = 14 if key in ('stormgull', 'seawarden') else 9 if key == 'kitewing' else 12
        for k in range(ncyl):
            a = 2 * math.pi * k / ncyl
            r = st[2] * 0.62
            F.box((math.cos(a) * r, st[1] + math.sin(a) * r, z - 0.2), (0.07, 0.07, 0.12), 'WbMetal',
                  None)
        # cowl flaps / exhaust collector
        for s in (-1, 1):
            for k in range(3):
                p = fus_point(T, T['cowl_until'] - 0.1 - k * 0.12, 90 - s * (75 + k * 22), 0.01)
                F.box((p[0], p[1], p[2]), (0.05, 0.04, 0.1), 'WbExhaust')
        if T.get('fan'):
            for k in range(10):
                a = 2 * math.pi * k / 10
                F.box((math.cos(a) * 0.32, st[1] + math.sin(a) * 0.32, z - 0.06), (0.03, 0.12, 0.012), 'WbDark')

    if T.get('mast'):
        p = fus_point(T, cz1 - 0.55, 90, 0.0)
        F.rod(p, (0, p[1] + 0.42, p[2] - 0.12), 0.018, 'WbDark', 5, 0.008)

    # insignia: the white hexagon, the teal hexagon in it, the gold dot (fictional; on the fuselage sides and the wings)
    def hexagon(b, centre, ex, ey, r, m, sides=6, rot=0.0):
        c = Vector(centre)
        ring = []
        for i in range(sides):
            a = rot + 2 * math.pi * i / sides
            ring.append(b.vert(tuple(c + ex * (math.cos(a) * r) + ey * (math.sin(a) * r))))
        ci = b.vert(tuple(c))
        for i in range(sides):
            b.face([ring[i], ring[(i + 1) % sides], ci], m, False)

    def conformed(b, surf, r, m, sides, rot, lift):
        # a polygon on a curved skin: a polar grid in the surface's parameters, each vertex put back on the surface
        # the outline: each polygon edge cut in four, so the skin's curve is followed between the corners
        outline = []
        for i in range(sides):
            a0, a1 = rot + 2 * math.pi * i / sides, rot + 2 * math.pi * (i + 1) / sides
            for t in (0.0, 0.25, 0.5, 0.75):
                outline.append((lerp(math.cos(a0), math.cos(a1), t), lerp(math.sin(a0), math.sin(a1), t)))
        n = len(outline)
        rings = [[surf(ox * r * k, oy * r * k, lift) for ox, oy in outline] for k in (0.34, 0.67, 1.0)]
        c = b.vert(surf(0, 0, lift))
        ids = [[b.vert(p) for p in ring] for ring in rings]
        for i in range(n):
            j = (i + 1) % n
            b.face([ids[0][i], ids[0][j], c], m, False)
            for k in range(2):
                b.face([ids[k][i], ids[k + 1][i], ids[k + 1][j], ids[k][j]][::-1], m, False)

    for s in (-1, 1):
        zc = T.get('insignia_z', -2.25)

        def fsurf(du, dv, lift, s=s, zc=zc):
            # du along the fuselage (forward), dv up the side: the angle that height means at this station
            z = zc + du
            stz = fus_at(T, z)
            ang = math.degrees(math.asin(max(-0.95, min(0.95, dv / max(0.1, stz[3])))))
            return fus_point(T, z, 90 - s * (90 - ang), lift)
        conformed(F, fsurf, 0.36, 'WbInsignia', 6, math.pi / 6, 0.012)
        conformed(F, fsurf, 0.25, 'WbInsigniaCore', 6, math.pi / 6, 0.018)
        conformed(F, fsurf, 0.08, 'WbInsigniaDot', 12, 0.0, 0.024)

    # ---- wings: the main box (to the aileron line), the ailerons, the inboard trailing edge
    WG = T['wing']
    a0, a1 = T['ail']
    for side, nm in ((1, 'L'), (-1, 'R')):
        w = Wing(T, WG, side)
        h = w.half
        root = WG['root']
        bw = P('Wing' + nm)
        xa = 0.72
        wing_loft(bw, w, 0.12, h * a0, 0.0, 1.0, 11, 'WbMain', 'WbUnder', False, False)
        wing_loft(bw, w, h * a0, h * a1, 0.0, xa, 6, 'WbMain', 'WbUnder', False, False)
        wing_loft(bw, w, h * a1, h * 0.995, 0.0, 1.0, 6, 'WbMain', 'WbUnder', False, True)
        wing_loft(P('Aileron' + nm), w, h * a0 + 0.02, h * a1 - 0.02, xa + 0.01, 1.0, 5, 'WbMain', 'WbUnder', True, True)
        # the gun barrels out of the leading edge, the gun ports
        for gx, gy, gz, kind in GUNS[key]:
            if kind == 'heavy' and key == 'bulwark':
                continue
            x = side * gx
            ln = 0.75 if kind == 'cannon' else 0.32
            rr = 0.045 if kind == 'cannon' else 0.016
            s_ = abs(gx)
            le = w.surface(s_, 0.0)
            zle = le[2]
            bw.rod((x, gy, zle - 0.25), (x, gy, zle + ln), rr, 'WbDark', 8)
            if kind == 'cannon':
                bw.rod((x, gy, zle - 0.1), (x, gy, zle + 0.12), rr * 2.2, 'WbMain', 10)
        # wing insignia near the tip (upper and lower)
        s_ = h * 0.66
        rr = min(0.55, w.chord(s_) * 0.3)
        for upper in (True, False):
            def wsurf(du, dv, lift, upper=upper, w=w, s0=s_):
                # du along the span (outward), dv toward the nose: chord fraction from the local chord
                s1 = s0 + du
                u = max(0.02, min(0.98, 0.42 - dv / w.chord(s1)))
                p = w.surface(s1, u, upper)
                return (p[0], p[1] + (lift if upper else -lift), p[2])
            conformed(bw, wsurf, rr, 'WbInsignia', 6, 0.0, 0.012)
            conformed(bw, wsurf, rr * 0.7, 'WbInsigniaCore', 6, 0.0, 0.018)
            conformed(bw, wsurf, rr * 0.22, 'WbInsigniaDot', 12, 0.0, 0.024)
        N = T.get('nacelles')
        if N:
            nx = N['xs'][0 if side > 0 else 1]
            rings = []
            for i in range(12):
                f = i / 11
                z = lerp(N['z0'], N['z1'], f)
                rr = N['r'] * (0.82 + 0.18 * math.sin(math.pi * min(1, f * 3))) * (1 if f < 0.55 else max(0.25, 1 - (f - 0.55) / 0.45 * 0.75))
                rings.append([(nx + math.cos(2 * math.pi * j / 20) * rr, N['y'] + math.sin(2 * math.pi * j / 20) * rr * 1.05 - (0 if f < 0.5 else (f - 0.5) * 0.2), z) for j in range(20)])
            bw.loft(rings, lambda c, i, j: 'WbTrim' if c[2] > N['z0'] - 0.9 else ('WbUnder' if c[1] < N['y'] - N['r'] * 0.45 else 'WbMain'), False, True, True)
            bw.disc((nx, N['y'], N['z0'] - 0.03), (0, 0, 1), N['r'] * 0.78, 'WbDark', 20)
            for k in range(9):
                a = 2 * math.pi * k / 9
                bw.box((nx + math.cos(a) * N['r'] * 0.5, N['y'] + math.sin(a) * N['r'] * 0.5, N['z0'] - 0.15), (0.06, 0.06, 0.1), 'WbMetal')
            for k in range(3):
                bw.rod((nx + side * N['r'] * 0.9, N['y'] - 0.1 + k * 0.12, N['z0'] - 1.1), (nx + side * N['r'] * 1.0, N['y'] - 0.12 + k * 0.12, N['z0'] - 1.5), 0.04, 'WbExhaust', 6)
        if T.get('radiators'):
            s_ = 1.65
            pa = w.surface(s_, 0.35, False)
            bw.box((side * s_, pa[1] - 0.12, pa[2] - 0.1), (0.24, 0.12, 0.55), 'WbUnder')
            bw.box((side * s_, pa[1] - 0.13, pa[2] - 0.62), (0.22, 0.1, 0.03), 'WbDark')

    # ---- the tail: the stabiliser and its elevator, the fin and its rudder
    TP = T['tailplane']
    tb = P('Tail')
    for side in (1, -1):
        w = Wing(T, dict(TP, dih=0.0, y0=TP['y0'], root=0.0, t0=TP['t'], t1=TP['t'] * 0.8), side)
        w.half = TP['half']
        wing_loft(tb, w, 0.12, TP['half'] * 0.995, 0.0, 0.66, 8, 'WbMain', 'WbUnder', False, True)
        wing_loft(P('Elevator'), w, 0.16, TP['half'] * 0.97, 0.67, 1.0, 7, 'WbMain', 'WbUnder', True, True)
    FN = T['fin']
    if FN.get('xs'):
        for fx in FN['xs']:
            b0 = Builder('tmp')
            fin_loft(b0, dict(FN, y0=FN['y0'] - 0.6), 0.0, 1.0, 9, 'WbMain', FN['t'])
            base = len(tb.v)
            for p in b0.v:
                tb.v.append((p[0] + fx, p[1], p[2]))
            for fc, m, sm in zip(b0.f, b0.m, b0.smooth):
                tb.face([i + base for i in fc], m, sm)
    else:
        fin_loft(tb, FN, 0.0, 0.6, 9, 'WbMain', FN['t'])
        fin_loft(P('Rudder'), FN, 0.61, 1.0, 9, 'WbMain', FN['t'])
    # the tail band's stripe on the rudder
    rb = P('Rudder')

    # ---- the canopy glass and its frames
    C = T['canopy']
    g = P('Glass')
    zs = [lerp(C['z0'], C['z1'], k / 14) for k in range(15)]
    glass_rings = []
    for k, z in enumerate(zs):
        f = k / 14
        st = fus_at(T, z)
        sill_y = st[1] + st[3] * SILL
        # the profile: the windscreen rises over the first fifth, the hood is full, the rear fairs into the spine
        if f < 0.13:
            hgt = C['h'] * (0.55 + 0.45 * f / 0.13)
        elif f < 0.7 or C['bubble'] or C.get('open_rear'):
            hgt = C['h'] * (1.0 if not C['bubble'] else math.sqrt(max(0.05, 1 - ((f - 0.55) / 0.48) ** 2)))
        else:
            hgt = C['h'] * max(0.12, 1 - (f - 0.7) / 0.3 * 0.88)
        wid = C['w'] * (0.8 + 0.2 * min(1, f / 0.2)) * (1 if f < 0.75 or C['bubble'] or C.get('open_rear') else max(0.4, 1 - (f - 0.75) * 1.6))
        ring = []
        for i in range(13):
            a = math.pi * i / 12
            ring.append((math.cos(a) * wid, sill_y + math.sin(a) * hgt, z))
        glass_rings.append(ring)
    g.loft(glass_rings, lambda c, i, j: 'WbGlass', True, False, True, closed=False)
    # frames: the windscreen's arch, hoops, the centre bar on a framed hood
    fr = F
    for k in ([2] + ([9, 11] if C['frames'] >= 3 else []) + ([13] if C['frames'] >= 4 else []) + ([5, 7] if C['frames'] >= 5 else []) + ([14] if C['bubble'] or C.get('open_rear') else [])):
        ring = glass_rings[min(k, 14)]
        for a, b in zip(ring, ring[1:]):
            fr.rod(a, b, 0.016, 'WbMain' if not C['bubble'] else 'WbDark', 5)
    if not C['bubble']:
        ridge = [r[6] for r in glass_rings[9:]]
        for a, b in zip(ridge, ridge[1:]):
            fr.rod(a, b, 0.018, 'WbMain', 5)
    # the windscreen's armoured front pane frame
    ws = glass_rings[0]
    for a, b in zip(ws, ws[1:]):
        fr.rod(a, b, 0.03, 'WbDark', 5)

    # ---- the cockpit (LOD0 only): tub, seat, panel and dials, stick, the reflector sight
    ib = P('Interior')
    seat = T['seat']
    eye = T['eye']
    fl = seat[1]
    zf, zb = C['z0'] + 0.05, C['z1'] + 0.2
    st = fus_at(T, (zf + zb) / 2)
    hw = st[2] * 0.9
    topy = st[1] + st[3] * SILL
    # floor, walls, the rear bulkhead (the headrest armour), the firewall
    ib.face([ib.vert((hw, fl, zf)), ib.vert((-hw, fl, zf)), ib.vert((-hw, fl, zb)), ib.vert((hw, fl, zb))], 'WbInterior', False)
    for s in (-1, 1):
        ib.face([ib.vert((s * hw, fl, zf)), ib.vert((s * hw, fl, zb)), ib.vert((s * hw, topy, zb)), ib.vert((s * hw, topy, zf))], 'WbInterior', False)
    ib.face([ib.vert((hw, fl, zb)), ib.vert((-hw, fl, zb)), ib.vert((-hw, topy, zb)), ib.vert((hw, topy, zb))], 'WbInterior', False)
    ib.box((0, eye[1] - 0.12, seat[2] - 0.32), (0.16, 0.16, 0.025), 'WbDark')  # head armour
    # the seat
    sp = (seat[0], fl + 0.42, seat[2] - 0.05)
    ib.box(sp, (0.22, 0.04, 0.22), 'WbDark')
    ib.box((seat[0], fl + 0.75, seat[2] - 0.3), (0.22, 0.32, 0.04), 'WbDark')
    # the instrument panel: a dark board under the coaming with lit dials
    pz = T['sight'][2] + 0.06
    py0, py1 = fl + 0.45, topy - 0.02
    px = eye[0]
    ib.face([ib.vert((px - 0.36, py0, pz)), ib.vert((px + 0.36, py0, pz)), ib.vert((px + 0.36, py1, pz)), ib.vert((px - 0.36, py1, pz))], 'WbPanel', False)
    dials = [(-0.22, 0.72), (-0.07, 0.75), (0.08, 0.75), (0.23, 0.72), (-0.22, 0.32), (-0.07, 0.36), (0.08, 0.36), (0.23, 0.32)]
    for dx0, dy in dials:
        dx = dx0 + px
        y = lerp(py0, py1, dy)
        ib.disc((dx, y, pz - 0.006), (0, 0, -1), 0.048, 'WbDial', 14)
        ib.rod((dx, y, pz - 0.004), (dx, y, pz - 0.016), 0.054, 'WbDark', 14, 0.054, False)
        ib.box((dx + 0.012, y + 0.01, pz - 0.012), (0.016, 0.003, 0.001), 'WbDark')
    # the coaming over the panel
    ib.box((px, py1 + 0.03, pz - 0.08), (0.38, 0.03, 0.1), 'WbDark')
    # the stick and the rudder bar
    ib.rod((px, fl + 0.05, seat[2] + 0.42), (px, fl + 0.62, seat[2] + 0.36), 0.018, 'WbDark', 6)
    ib.box((px, fl + 0.66, seat[2] + 0.35), (0.06, 0.05, 0.03), 'WbDark')
    ib.box((px, fl + 0.15, zf - 0.25), (0.25, 0.03, 0.05), 'WbMetal')
    # the other crew seats: a seat pan and back facing the station's way
    for (ce, cf) in T.get('seats', [])[1:]:
        dz = -1 if cf == 0 else 1
        cs = (ce[0], ce[1] - 1.29, ce[2] - 0.05 * dz)
        ib.box((cs[0], cs[1] + 0.42, cs[2]), (0.2, 0.04, 0.2), 'WbDark')
        ib.box((cs[0], cs[1] + 0.72, cs[2] + 0.24 * dz), (0.2, 0.28, 0.04), 'WbDark')
    # the reflector sight: the housing on the coaming, the tilted glass at Warbirds.js sight
    sg = T['sight']
    ib.box((sg[0], sg[1] - 0.15, sg[2] + 0.05), (0.04, 0.05, 0.065), 'WbDark')
    sb = P('Sight')
    tilt = math.radians(40)
    cx, cy, cz = sg
    hw2, hh2 = 0.055, 0.045
    corners = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        corners.append(sb.vert((cx + sx * hw2, cy + sy * hh2 * math.cos(tilt), cz - sy * hh2 * math.sin(tilt))))
    sb.face(corners, 'WbSight', False)
    sb.face(corners[::-1], 'WbSight', False)

    # ---- the crew figures (the others' aircraft: the local player's own avatar sits in his seat)
    def figure(pb, e, face):
        d = 1 if face == 0 else -1  # which way the face looks along z
        hx, hy, hz = e[0], e[1] - 0.02, e[2] - 0.07 * d
        # head and leather helmet (a lathe), goggles, shoulders, chest
        prof = [(0.0, -0.13), (0.08, -0.12), (0.11, -0.06), (0.12, 0.0), (0.115, 0.06), (0.09, 0.11), (0.0, 0.135)]
        rings = []
        for r, yy in prof:
            rings.append([(hx + math.cos(2 * math.pi * i / 12) * r, hy + yy, hz + math.sin(2 * math.pi * i / 12) * r * 1.12) for i in range(12)])
        pb.loft(rings, lambda c, i, j: 'WbLeather' if c[1] > hy - 0.03 or (c[2] - hz) * d < -0.02 else 'WbSkin', False, False, True)
        pb.box((hx, hy + 0.02, hz + 0.1 * d), (0.1, 0.025, 0.02), 'WbMetal')
        pb.box((hx, hy - 0.33, hz - 0.02 * d), (0.21, 0.12, 0.13), 'WbJacket')
        pb.box((hx, hy - 0.2, hz - 0.01 * d), (0.07, 0.06, 0.06), 'WbJacket')

    figure(P('Pilot'), eye, 0)
    for i, (ce, cf) in enumerate(T.get('seats', [])[1:]):
        figure(P('Crew%d' % (i + 1)), ce, cf)

    # the turrets: the base (a ring, a dome of glass over it) turns about up; the guns pitch on it
    for tu in T.get('turrets', []):
        at = Vector(tu['at'])
        rest = tu['rest']
        fwd = Vector((math.sin(rest), 0, math.cos(rest)))
        right = Vector((math.cos(rest), 0, -math.sin(rest)))
        tb2 = P('Turret' + tu['id'])
        if tu.get('ring'):
            rr = tu['ring']
            ring = [tuple(at + Vector((math.cos(2 * math.pi * i / 20) * rr, -0.12, math.sin(2 * math.pi * i / 20) * rr))) for i in range(21)]
            for p0, p1 in zip(ring, ring[1:]):
                tb2.rod(p0, p1, 0.04, 'WbMetal', 6)
        if tu.get('dome'):
            rr = tu['ring']
            rings = []
            for k in range(7):
                ph = math.radians(lerp(0, 82, k / 6))
                rings.append([tuple(at + Vector((math.cos(2 * math.pi * i / 20) * rr * math.cos(ph), -0.25 + math.sin(ph) * (rr + 0.05), math.sin(2 * math.pi * i / 20) * rr * math.cos(ph)))) for i in range(20)])
            tb2.loft(rings, lambda *a: 'WbGlass', False, True, True)
            for k in range(2):
                a = math.pi * k
                arc = [tuple(at + Vector((math.cos(a) * rr * math.cos(math.radians(lerp(0, 80, i / 6))), -0.25 + math.sin(math.radians(lerp(0, 80, i / 6))) * (rr + 0.05), math.sin(a) * rr * math.cos(math.radians(lerp(0, 80, i / 6)))))) for i in range(7)]
                for p0, p1 in zip(arc, arc[1:]):
                    tb2.rod(p0, p1, 0.015, 'WbDark', 4)
        if tu.get('ball'):
            rings = []
            for k in range(7):
                ph = math.radians(lerp(-80, 80, k / 6))
                rings.append([tuple(at + Vector((math.cos(2 * math.pi * i / 14) * tu['ball'] * math.cos(ph), math.sin(ph) * tu['ball'], math.sin(2 * math.pi * i / 14) * tu['ball'] * math.cos(ph)))) for i in range(14)])
            tb2.loft(rings, lambda *a: 'WbDark', False, False, True)
        gb2 = P('Guns' + tu['id'])
        for gx, gy, gz, kind in tu['guns']:
            o = at + right * gx + Vector((0, gy, 0))
            body0, body1 = o - fwd * 0.25, o + fwd * 0.2
            gb2.rod(tuple(body0), tuple(body1), 0.05 if kind == 'heavy' else 0.04, 'WbDark', 8)
            gb2.rod(tuple(body1), tuple(o + fwd * gz), 0.018 if kind == 'heavy' else 0.013, 'WbDark', 6)
            gb2.box(tuple(o - fwd * 0.05 + Vector((0, -0.09, 0))), (0.03, 0.06, 0.07), 'WbMetal')
        # the gunner's grips
        gb2.box(tuple(at - fwd * 0.35 + Vector((0, -0.05, 0))), (0.12, 0.02, 0.02), 'WbDark')

    if T.get('bomb'):
        bb = P('Bomb')
        c = Vector(T['bomb'])
        rings = []
        for k in range(9):
            f = k / 8
            rr = 0.19 * math.sin(math.pi * min(1, 0.08 + f * 0.95)) ** 0.6
            rings.append([tuple(c + Vector((math.cos(2 * math.pi * i / 12) * rr, math.sin(2 * math.pi * i / 12) * rr, 0.85 - f * 1.7))) for i in range(12)])
        bb.loft(rings, lambda *a: 'WbTrim', True, True, True)
        for k in range(4):
            a = math.pi / 4 + k * math.pi / 2
            bb.box(tuple(c + Vector((math.cos(a) * 0.14, math.sin(a) * 0.14, -0.78))), (0.012 + abs(math.cos(a)) * 0.07, 0.012 + abs(math.sin(a)) * 0.07, 0.12), 'WbTrim')
        bb.box(tuple(c + Vector((0, 0.24, 0))), (0.04, 0.06, 0.3), 'WbDark')
        bb.box((0.2, c.y + 0.3, c.z + 0.1), (0.015, 0.2, 0.02), 'WbDark')
        bb.box((-0.2, c.y + 0.3, c.z + 0.1), (0.015, 0.2, 0.02), 'WbDark')

    if T.get('torpedo'):
        c = Vector(T['torpedo'])
        rings = []
        for k in range(10):
            f = k / 9
            rr = 0.27 * (math.sqrt(max(0.02, 1 - ((f - 0.12) / 0.12) ** 2)) if f < 0.12 else 1.0 if f < 0.8 else max(0.25, 1 - (f - 0.8) / 0.2 * 0.75))
            rings.append([tuple(c + Vector((math.cos(2 * math.pi * i / 12) * rr, math.sin(2 * math.pi * i / 12) * rr, 2.5 - f * 5.0))) for i in range(12)])
        F.loft(rings, lambda *a: 'WbMetal', True, True, True)
        F.box(tuple(c + Vector((0, 0.32, 0.4))), (0.05, 0.1, 0.9), 'WbDark')

    # ---- the undercarriage: legs, wheels, doors; the tailwheel
    mx, my, mz = T['main']
    r = T['wheel_r']
    for side, nm in ((1, 'L'), (-1, 'R')):
        gb = P('Gear' + nm)
        w = Wing(T, WG, side)
        top_s = mx + (0.25 if T['retract'] == 'in' else -0.05)
        topy = w.surface(top_s, 0.3, False)[1] + 0.05
        if T.get('nacelles'):
            topy = T['nacelles']['y'] - T['nacelles']['r'] * 0.6
        if T['retract'] == 'fixed':
            # a spatted leg: a streamlined fairing round the wheel, a trousered leg up to the wing
            wc = Vector((side * mx, my + r, mz))
            rings = []
            for k in range(9):
                f = k / 8
                rr = r * 0.98 * math.sin(math.pi * min(1, 0.06 + f * 0.95)) ** 0.7
                rings.append([tuple(wc + Vector((math.cos(2 * math.pi * i / 12) * rr * 0.45, math.sin(2 * math.pi * i / 12) * rr + 0.04, 0.85 - f * 1.55))) for i in range(12)])
            gb.loft(rings, lambda *a: 'WbMain', True, True, True)
            gb.rod(tuple(wc + Vector((0, 0.3, 0.05))), (side * top_s, topy, mz + 0.1), 0.08, 'WbMain', 10, 0.13)
            gb.box(tuple(wc + Vector((0, -r * 0.7, 0))), (0.06, 0.06, 0.12), 'WbTyre')
            continue
        wc = (side * (mx + 0.04), my + r, mz)
        gb.wheel(wc, r, 0.17 if r < 0.38 else 0.2)
        leg_top = (side * top_s, topy, mz + 0.05)
        gb.rod((side * (mx - 0.1), my + r, mz), leg_top, 0.055, 'WbMetal', 8)
        gb.rod((side * (mx - 0.1), my + r, mz), (side * (mx - 0.1), my + r + 0.5, mz), 0.075, 'WbDark', 8)
        # the leg's door, outside the leg
        d0 = Vector((side * (mx - 0.22), my + r + 0.1, mz))
        d1 = Vector(leg_top) + Vector((-side * 0.12, -0.05, 0))
        dv = d1 - d0
        nrm = Vector((side, 0, 0))
        wv = Vector((0, 0, 1)) * 0.22
        q = [gb.vert(tuple(d0 - wv)), gb.vert(tuple(d0 + wv)), gb.vert(tuple(d1 + wv)), gb.vert(tuple(d1 - wv))]
        gb.face(q, 'WbUnder', False)
        gb.face(q[::-1], 'WbUnder', False)
    tx, ty, tz = T['tailw']
    tg = P('GearT')
    st = fus_at(T, tz + 0.15)
    tg.wheel((0, ty + 0.11, tz), 0.11, 0.07)
    tg.rod((0, ty + 0.11, tz), (0, st[1] - st[4] * 0.6, tz + 0.25), 0.03, 'WbMetal', 6)

    # ---- the propeller (its own node, hub at Warbirds.js prop; spun in code about +Z) and the spinner
    # (a twin has two: Propeller on the left engine, Propeller2 on the right; the blades turn opposite ways in code)
    R = T['prop_r']
    nb = T['blades']
    for pi, hp in enumerate(T.get('props', [T['prop']])):
        hub = Vector(hp)
        pr = P('Propeller' if pi == 0 else 'Propeller2')
        for k in range(nb):
            a0 = 2 * math.pi * k / nb
            rings = []
            for i in range(8):
                f = i / 7
                rr = lerp(0.22, R, f)
                ch = T['blade_chord'] * (0.75 + 0.6 * math.sin(math.pi * min(1, f * 1.1)) * (1 - f * 0.4)) * (1 if f < 0.92 else max(0.25, 1 - (f - 0.92) / 0.08 * 0.75))
                th = 0.05 * (1 - f * 0.7)
                twist = math.radians(lerp(55, 18, f))
                ring = []
                for u, v in ((-0.5, 0), (-0.2, th * 0.6), (0.3, th * 0.4), (0.5, 0), (0.3, -th * 0.2), (-0.2, -th * 0.3)):
                    # chord along the disc's tangent, thickness along the axis, then the twist
                    cu, cv = u * ch, v
                    tx_ = cu * math.cos(twist) - cv * math.sin(twist)
                    tz_ = cu * math.sin(twist) + cv * math.cos(twist)
                    radial = Vector((math.cos(a0), math.sin(a0), 0))
                    tang = Vector((-math.sin(a0), math.cos(a0), 0))
                    p = hub + radial * rr + tang * tx_ + Vector((0, 0, tz_))
                    ring.append(tuple(p))
                rings.append(ring)
            pr.loft(rings, lambda c, i, j, hub=hub: 'WbPropTip' if (Vector(c) - hub).length > R - 0.14 else 'WbProp', True, True, True)
        sp_rings = []
        for i in range(9):
            f = i / 8
            rr = 0.36 * math.sqrt(max(0.0, 1 - f ** 1.6)) if T['nose'] == 'inline' else 0.4 * math.sqrt(max(0.0, 1 - f ** 1.8))
            z = hub.z - 0.25 + f * 0.75
            sp_rings.append([(hub.x + math.cos(2 * math.pi * j / 18) * rr, hub.y + math.sin(2 * math.pi * j / 18) * rr, z) for j in range(18)])
        pr.loft(sp_rings, lambda *a: 'WbBand', True, False, True)

    # ---- build the LOD0 objects, then the decimated levels
    objs = {}
    for name, b in parts.items():
        ob = b.build(col)
        if ob:
            objs[name] = ob
    lods = {0: objs}
    for level, ratio in ((1, 0.42), (2, 0.13)):
        lods[level] = {}
        for name, ob in objs.items():
            if name in ('Interior', 'Sight') or (level == 2 and (name in ('Pilot', 'GearT') or name.startswith('Crew'))):
                continue
            me = ob.data.copy()
            o2 = bpy.data.objects.new('L%d_%s' % (level, name), me)
            col.objects.link(o2)
            if name not in ('Glass',):
                mod = o2.modifiers.new('dec', 'DECIMATE')
                mod.ratio = ratio if not (name.startswith('Propeller') or name in ('Pilot',) or name.startswith('Crew')) else min(0.6, ratio * 1.5)
                bpy.context.view_layer.objects.active = o2
                with bpy.context.temp_override(object=o2, active_object=o2, selected_objects=[o2]):
                    bpy.ops.object.modifier_apply(modifier='dec')
            lods[level][name] = o2
    return lods


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def export(key, lods, col):
    T = TYPES[key]
    path = os.path.join(OUT_DIR, T['name'] + '.glb')
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for lv in lods.values():
        for ob in lv.values():
            ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True, use_selection=True,
                              export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False)
    for level, lv in lods.items():
        print('WARBIRD', key, 'LOD%d' % level, 'tris', sum(tri_count(o) for o in lv.values()))
    print('EXPORTED', path, os.path.getsize(path))
    return path


def preview(key, lods, col):
    T = TYPES[key]
    sc = bpy.context.scene
    engine = None
    for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH'):
        try:
            sc.render.engine = e
            engine = e
            break
        except Exception:
            continue
    print('render engine', engine)
    if engine == 'BLENDER_WORKBENCH':
        sc.display.shading.light = 'STUDIO'
        sc.display.shading.color_type = 'MATERIAL'
        sc.display.shading.show_shadows = True
    world = bpy.data.worlds.get('wb') or bpy.data.worlds.new('wb')
    sc.world = world
    try:
        world.use_nodes = True
        bg = world.node_tree.nodes.get('Background')
        bg.inputs['Color'].default_value = (0.55, 0.68, 0.85, 1.0)
        bg.inputs['Strength'].default_value = 0.9
    except Exception:
        pass
    if not bpy.data.objects.get('sun'):
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
        sun.data.energy = 3.5
        sun.rotation_euler = (math.radians(50), 0, math.radians(35))
        col.objects.link(sun)
        ground = bpy.data.meshes.new('ground')
        ground.from_pydata([(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [(0, 1, 2, 3)])
        gob = bpy.data.objects.new('ground', ground)
        ground.materials.append(mat('PreviewGround', (0.42, 0.45, 0.38), 0.9))
        col.objects.link(gob)
    gob = bpy.data.objects['ground']
    # the aircraft at rest: three-point (the ground under the main wheels, the tail down)
    my, mz = TYPES[key]['main'][1], TYPES[key]['main'][2]
    ty, tz = TYPES[key]['tailw'][1], TYPES[key]['tailw'][2]
    sit = math.atan((my - ty) / (tz - mz))
    for lv in lods.values():
        for ob in lv.values():
            ob.hide_render = True
    for ob in lods[0].values():
        ob.hide_render = False
        ob.rotation_euler = (-sit, 0, 0)  # Blender X = game X: nose up about the wing axis
    cam = bpy.data.objects.get('cam') or bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    if cam.name not in col.objects:
        col.objects.link(cam)
    sc.camera = cam
    gz = -(my * math.cos(sit) + mz * math.sin(sit))
    gob.location = (0, 0, -gz)
    sc.render.resolution_x, sc.render.resolution_y = 1280, 800
    try:
        sc.eevee.taa_render_samples = 32
    except Exception:
        pass
    k = max(1.0, T['span'] / 11.5)
    shots = [('front3q', (8.5 * k, -9.0 * k, 2.6 * k), (0, -0.5, 0.2)), ('side', (12.5 * k, 0.6, 0.6 * k), (0, 0.6, 0.2)), ('top', (4.0 * k, -3.5 * k, 13.0 * k), (0, 0.2, 0.0)),
             ('rear3q', (-7.5 * k, 9.5 * k, 3.2 * k), (0, 0.5, 0.3)), ('cockpit', 'eye', None)]
    for i, tu in enumerate(T.get('turrets', [])):
        shots.append(('turret_' + tu['id'].lower(), 'turret', tu))
    for name, loc, tgt in shots:
        if loc in ('eye', 'turret'):
            for ob in lods[0].values():
                ob.rotation_euler = (0, 0, 0)
                # (the seat's own figure is the camera: hidden)
                if loc == 'eye' and ob.name.endswith('_Pilot'):
                    ob.hide_render = True
            gob.location = (0, 0, -(my * 1.0) + 0.0)
            cam.data.sensor_fit = 'VERTICAL'
            cam.data.angle = math.radians(62)
            if loc == 'eye':
                e = T['eye']
                target = B((e[0], e[1] - 0.08, e[2] + 1.0))
            else:
                tu = tgt
                si = [i for i, (ce, cf) in enumerate(T['seats']) if abs(ce[2] - tu['at'][2]) < 1.2 and abs(ce[1] - tu['at'][1]) < 0.9][0]
                e = T['seats'][si][0]
                for ob in lods[0].values():
                    if ob.name.endswith('_Crew%d' % si):
                        ob.hide_render = True
                d = (math.sin(tu['rest']), 0.08, math.cos(tu['rest']))
                target = B((e[0] + d[0], e[1] + d[1], e[2] + d[2]))
            cam.location = B(e)
            sc.render.resolution_x, sc.render.resolution_y = 1600, 900
        else:
            cam.data.sensor_fit = 'AUTO'
            cam.data.lens = 42
            cam.location = Vector(loc)
            target = Vector(tgt)
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(PREVIEW_DIR, '%s_%s.png' % (key, name))
        bpy.ops.render.render(write_still=True)
        for ob in lods[0].values():
            ob.hide_render = False
        print('PREVIEW', sc.render.filepath)
    for ob in lods[0].values():
        ob.rotation_euler = (0, 0, 0)
        ob.hide_render = True


bpy.ops.wm.read_factory_settings(use_empty=True)
for key in (TYPES.keys() if ONLY == 'all' else [ONLY]):
    for ob in list(bpy.data.objects):
        if ob.name not in ('sun', 'ground', 'cam'):
            bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        if me.users == 0:
            bpy.data.meshes.remove(me)
    col = bpy.data.collections.get('wb') or bpy.data.collections.new('wb')
    if col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    lods = build_aircraft(key, col)
    export(key, lods, col)
    if PREVIEW_DIR:
        os.makedirs(PREVIEW_DIR, exist_ok=True)
        preview(key, lods, col)
