# The coastal rescue helicopter's cockpit (wave 24A), built headless:
#   D:\blender\blender.exe -b --factory-startup -P tools/helicopter/build_cockpit.py -- [outDir]
# -> public/models/helicopter/cockpit.glb (original work, CC0 like the rest of the project's Blender output).
#
# Frame: the aircraft's model frame of src/features/helicopter/Model.js (+X left, +Y up, +Z the nose, origin at the skid
# sole under the rotor mast's plane). The live instrument face stays Cockpit.js's own quad (FACE: centre 0,1.32,1.565,
# 1.72 x 0.645 m, tilted 0.22 rad); this file frames it with a glareshield and side cheeks and adds what a real cabin has:
# crew seats with harnesses, the centre pedestal with radios, the overhead console (Screen_Overhead: its live switch
# panel), a rubber floor, door trims, an extinguisher and a first-aid pack, and the pilot's controls with the pilot's
# gloves and boots on them.
# Nodes the game drives (src/features/helicopter/Cockpit.js): Cyclic (pivot 0.2,1.02,0.35), Collective (0.55,1.08,-0.25),
# Pedal_L (0.36,0.82,0.85), Pedal_R (0.04,0.82,0.85): their rest is identity, the game copies Model.js's control poses;
# empties Wrist_L / Wrist_R (on the collective / cyclic grips), Ankle_L / Ankle_R (on the pedals), Eye.
import bpy, sys, os, math
sys.path.insert( 0, os.path.join( os.path.dirname( __file__ ), '..', 'cars' ) )
from interior_kit import Kit
from mathutils import Vector

ROOT = os.path.abspath( os.path.join( os.path.dirname( __file__ ), '..', '..' ) )
argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
OUT = argv[ 0 ] if argv else os.path.join( ROOT, 'public', 'models', 'helicopter' )
os.makedirs( OUT, exist_ok = True )
PI = math.pi

MATS = {
	'Leather_Black': ( ( 0.07, 0.065, 0.06 ), 0.5, 0 ), 'Cloth_Grey': ( ( 0.27, 0.28, 0.29 ), 0.95, 0 ), 'Strap_Orange': ( ( 0.86, 0.36, 0.06 ), 0.75, 0 ),
	'Strap_Grey': ( ( 0.3, 0.31, 0.32 ), 0.8, 0 ), 'Plastic_Dark': ( ( 0.06, 0.065, 0.07 ), 0.6, 0 ), 'Plastic_Grey': ( ( 0.26, 0.27, 0.28 ), 0.6, 0 ),
	'SoftTouch_Dark': ( ( 0.08, 0.085, 0.09 ), 0.8, 0 ), 'Rubber_Black': ( ( 0.035, 0.035, 0.035 ), 0.88, 0 ), 'Rubber_Floor': ( ( 0.11, 0.115, 0.12 ), 0.85, 0 ),
	'Metal_Brushed': ( ( 0.7, 0.7, 0.72 ), 0.32, 1 ), 'Metal_Painted': ( ( 0.2, 0.22, 0.24 ), 0.45, 0.5 ), 'Chrome': ( ( 0.9, 0.9, 0.92 ), 0.12, 1 ),
	'Paint_Jade': ( ( 0.08, 0.45, 0.43 ), 0.4, 0.2 ), 'Lamp_Red': ( ( 0.85, 0.08, 0.06 ), 0.3, 0 ), 'Lamp_Green': ( ( 0.1, 0.8, 0.3 ), 0.3, 0 ),
	'Lamp_Amber': ( ( 0.95, 0.55, 0.05 ), 0.3, 0 ), 'Screen_Overhead': ( ( 0.02, 0.02, 0.02 ), 0.4, 0 ), 'Glove': ( ( 0.09, 0.075, 0.065 ), 0.55, 0 ),
	'Shoe': ( ( 0.05, 0.045, 0.04 ), 0.4, 0 ), 'Cloth_Bag': ( ( 0.75, 0.1, 0.08 ), 0.9, 0 ),
}

k = Kit( MATS )
n = k.node( 'Cabin' )
EYE = ( 0.2, 1.96, - 0.05 )
FLOOR = 0.8

# ---- the floor: a ribbed rubber mat over the footwell, kick plates at the nose
k.box( n, ( 0, FLOOR + 0.005, 0.5 ), ( 1.9, 0.012, 1.85 ), 'Rubber_Floor', 0.0 )
for j in range( 14 ): k.box( n, ( 0, FLOOR + 0.014, - 0.3 + j * 0.12 ), ( 1.8, 0.006, 0.025 ), 'Rubber_Floor', 0.002 )
k.hull( n, [ ( x, y, z ) for x in ( - 0.95, 0.95 ) for ( y, z ) in ( ( FLOOR, 1.42 ), ( FLOOR, 1.5 ), ( 0.98, 1.5 ), ( 0.98, 1.47 ) ) ], 'Metal_Painted' )

# ---- the instrument panel's frame: glareshield over the face, cheeks at its sides, a lower panel under it
k.hull( n, [ ( x, y, z ) for x in ( - 0.95, 0.95 ) for ( y, z ) in ( ( 1.648, 1.6 ), ( 1.69, 1.6 ), ( 1.71, 1.95 ), ( 1.64, 1.98 ) ) ], 'SoftTouch_Dark', True )
k.box( n, ( 0, 1.646, 1.6 ), ( 1.9, 0.008, 0.012 ), 'Rubber_Black', 0.002 )
t = math.tan( 0.22 )
for s in ( - 1, 1 ):
	k.hull( n, [ ( s * x, y, z ) for x in ( 0.875, 0.96 ) for ( y, z ) in ( ( 1.0, 1.5 ), ( 1.64, 1.64 ), ( 1.64, 1.85 ), ( 1.0, 1.85 ) ) ], 'Plastic_Dark', True )
	# the panel lamps' hoods over the face corners
	k.box( n, ( s * 0.915, 1.66, 1.62 ), ( 0.08, 0.02, 0.06 ), 'Plastic_Dark', 0.008 )
# the lower panel: circuit breakers and a compass on the glareshield
k.hull( n, [ ( x, y, z ) for x in ( - 0.86, 0.86 ) for ( y, z ) in ( ( 0.99, 1.49 ), ( 0.86, 1.47 ), ( 0.86, 1.62 ), ( 0.99, 1.62 ) ) ], 'Plastic_Dark', True )
for i in range( 18 ): k.cyl( n, ( - 0.72 + i * 0.085, 0.925, 1.474 ), 0.011, 0.011, 0.02, 'Plastic_Grey' if i % 5 else 'Lamp_Amber', rot = ( PI / 2 - 0.14, 0, 0 ), seg = 8 )
k.box( n, ( 0.0, 1.73, 1.7 ), ( 0.1, 0.07, 0.08 ), 'Plastic_Dark', 0.015 )
k.sphere( n, ( 0.0, 1.76, 1.68 ), 0.035, 'Lamp_Amber' )

# ---- the centre pedestal between the seats: radios, transponder, the rotor brake lever
PX = - 0.175
k.hull( n, [ ( PX + s * 0.15, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( 0.99, 1.47 ), ( 0.98, 1.2 ), ( FLOOR + 0.25, 0.55 ), ( FLOOR, 0.5 ), ( FLOOR, 1.47 ) ) ], 'Plastic_Dark', True )
slope = math.atan2( 0.98 - ( FLOOR + 0.25 ), 1.2 - 0.55 )
for j, ( mat, lamp ) in enumerate( ( ( 'Plastic_Grey', 'Lamp_Green' ), ( 'Plastic_Grey', 'Lamp_Amber' ), ( 'Plastic_Grey', 'Lamp_Green' ), ( 'Plastic_Grey', 'Lamp_Red' ) ) ):
	f = 0.15 + j * 0.2
	zc, yc = 1.2 - f * ( 1.2 - 0.55 ), 0.98 - f * ( 0.98 - FLOOR - 0.25 )
	k.box( n, ( PX, yc + 0.012, zc ), ( 0.27, 0.012, 0.11 ), mat, 0.004, rot = ( - slope, 0, 0 ) )
	k.box( n, ( PX - 0.03, yc + 0.02, zc ), ( 0.12, 0.006, 0.04 ), 'Plastic_Dark', 0.002, rot = ( - slope, 0, 0 ) )
	k.box( n, ( PX - 0.03, yc + 0.023, zc ), ( 0.1, 0.004, 0.025 ), lamp, 0.0, rot = ( - slope, 0, 0 ) )
	for dx in ( 0.07, 0.11 ): k.cyl( n, ( PX + dx, yc + 0.03, zc ), 0.014, 0.012, 0.025, 'Plastic_Dark', rot = ( - slope, 0, 0 ), seg = 12 )
k.rod( n, ( PX + 0.1, 0.98, 1.3 ), ( PX + 0.1, 1.06, 1.22 ), 0.008, 'Lamp_Red' )

# ---- the overhead console on the canopy beam: its live switch panel faces down and back to the pilot
k.rod( n, ( 0, 2.48, 0.92 ), ( 0, 2.2, 1.65 ), 0.04, 'Paint_Jade' )
k.hull( n, [ ( x, y, z ) for x in ( - 0.33, 0.33 ) for ( y, z ) in ( ( 2.5, 0.05 ), ( 2.5, 0.85 ), ( 2.33, 0.62 ), ( 2.22, 0.2 ), ( 2.3, 0.05 ) ) ], 'Plastic_Dark', True )
oc, ow, oh, op = Vector( ( 0, 2.285, 0.43 ) ), 0.56, 0.233, - 0.64
o = k.node( 'Screen_Overhead', oc, ( op, 0, 0 ) )
k.quad( o, [ ( ow / 2, oh / 2, 0 ), ( - ow / 2, oh / 2, 0 ), ( - ow / 2, - oh / 2, 0 ), ( ow / 2, - oh / 2, 0 ) ], 'Screen_Overhead' )
ob = k.node( 'Screen_Overhead_Bezel', oc, ( op, 0, 0 ) )
for ( cx, cy, sx, sy ) in ( ( 0, oh / 2 + 0.01, ow + 0.04, 0.02 ), ( 0, - oh / 2 - 0.01, ow + 0.04, 0.02 ), ( ow / 2 + 0.01, 0, 0.02, oh ), ( - ow / 2 - 0.01, 0, 0.02, oh ) ):
	k.box( ob, ( cx, cy, 0.008 ), ( sx, sy, 0.028 ), 'Plastic_Dark', 0.005 )
# two map lamps either side of it
for s in ( - 1, 1 ): k.cyl( n, ( s * 0.25, 2.2, 0.2 ), 0.03, 0.022, 0.05, 'Metal_Painted', rot = ( - 0.6, 0, 0 ), seg = 12 )

# ---- crew seats: shells, cushions, harnesses (orange rescue webbing for the pilot), headrests, rails
def crew_seat( x, harness ):
	k.box( n, ( x, 0.92, - 0.2 ), ( 0.56, 0.11, 0.6 ), 'Leather_Black', 0.04, 3, rot = ( - 0.05, 0, 0 ) )
	k.box( n, ( x, 1.33, - 0.56 ), ( 0.56, 0.78, 0.12 ), 'Leather_Black', 0.04, 3, rot = ( - 0.1, 0, 0 ) )
	for s in ( - 1, 1 ):
		k.box( n, ( x + s * 0.27, 0.98, - 0.2 ), ( 0.06, 0.13, 0.6 ), 'Cloth_Grey', 0.025, 2, rot = ( - 0.05, 0, 0 ) )
		k.box( n, ( x + s * 0.27, 1.32, - 0.55 ), ( 0.06, 0.7, 0.16 ), 'Cloth_Grey', 0.025, 2, rot = ( - 0.1, 0, 0 ) )
		k.rod( n, ( x + s * 0.22, FLOOR, - 0.45 ), ( x + s * 0.22, 0.86, - 0.4 ), 0.02, 'Metal_Painted' )
		k.rod( n, ( x + s * 0.22, FLOOR, 0.05 ), ( x + s * 0.22, 0.86, 0.0 ), 0.02, 'Metal_Painted' )
		k.box( n, ( x + s * 0.22, FLOOR + 0.015, - 0.2 ), ( 0.04, 0.03, 0.8 ), 'Metal_Brushed', 0.005 )
	k.box( n, ( x, 1.86, - 0.62 ), ( 0.32, 0.2, 0.12 ), 'Leather_Black', 0.05, 3, rot = ( - 0.1, 0, 0 ) )
	strap = 'Strap_Orange' if harness else 'Strap_Grey'
	for s in ( - 1, 1 ):
		k.slab( n, [ ( x + s * 0.1, 1.72, - 0.6 ), ( x + s * 0.06, 1.72, - 0.6 ), ( x + s * 0.03, 1.08, - 0.06 ), ( x + s * 0.07, 1.08, - 0.06 ) ], - 0.006, strap )
		k.slab( n, [ ( x + s * 0.26, 1.0, - 0.35 ), ( x + s * 0.26, 1.04, - 0.35 ), ( x + s * 0.03, 1.04, - 0.05 ), ( x + s * 0.03, 1.0, - 0.05 ) ], - 0.006, strap )
	k.cyl( n, ( x, 1.04, - 0.05 ), 0.04, 0.04, 0.02, 'Metal_Brushed', rot = ( PI / 2 - 0.4, 0, 0 ), seg = 16 )
crew_seat( 0.2, True )
crew_seat( - 0.55, False )

# ---- door trims inside the new door skins (Model.js), handles, map pockets; the extinguisher and the rescue bag
for s in ( - 1, 1 ):
	x = s * 1.0
	k.box( n, ( x, 0.96, 0.45 ), ( 0.03, 0.3, 1.5 ), 'Plastic_Grey', 0.01 )
	k.box( n, ( x - s * 0.025, 0.9, 0.55 ), ( 0.02, 0.14, 0.6 ), 'Plastic_Dark', 0.01 )
	k.box( n, ( x - s * 0.03, 1.09, 0.1 ), ( 0.03, 0.03, 0.12 ), 'Metal_Brushed', 0.008 )
	k.tube( n, [ ( x - s * 0.02, 1.62, - 0.3 ), ( x - s * 0.06, 1.66, - 0.25 ), ( x - s * 0.06, 1.66, 0.0 ), ( x - s * 0.02, 1.62, 0.05 ) ], 0.012, 'Plastic_Dark' )
k.cyl( n, ( - 0.15, 1.0, - 0.62 ), 0.055, 0.055, 0.36, 'Lamp_Red', rot = ( 0, 0, 0 ), seg = 14 )
k.box( n, ( - 0.15, 1.2, - 0.62 ), ( 0.05, 0.05, 0.08 ), 'Plastic_Dark', 0.01 )
k.box( n, ( 0.75, 0.97, - 0.55 ), ( 0.36, 0.3, 0.24 ), 'Cloth_Bag', 0.05, 3 )
k.box( n, ( 0.75, 1.0, - 0.42 ), ( 0.12, 0.12, 0.01 ), 'Plastic_Grey', 0.004 )

# ---- the pilot's controls: cyclic (right hand), collective (left hand), anti-torque pedals (feet)
c = k.node( 'Cyclic', ( 0.2, 1.02, 0.35 ) )
k.cyl( c, ( 0, 0.04, 0 ), 0.06, 0.03, 0.09, 'Rubber_Black', rot = ( PI / 2, 0, 0 ), seg = 14 )
k.rod( c, ( 0, 0, 0 ), ( 0, 0.36, - 0.06 ), 0.016, 'Metal_Painted' )
k.box( c, ( 0, 0.43, - 0.08 ), ( 0.05, 0.13, 0.055 ), 'Plastic_Dark', 0.02, 3, rot = ( 0.15, 0, 0 ) )
k.box( c, ( 0, 0.5, - 0.075 ), ( 0.035, 0.02, 0.025 ), 'Lamp_Red', 0.006 )
k.box( c, ( 0.0, 0.44, - 0.052 ), ( 0.012, 0.035, 0.02 ), 'Plastic_Grey', 0.004 )
# the right glove round the grip, thumb on the hat switch
k.box( c, ( - 0.01, 0.43, - 0.1 ), ( 0.075, 0.1, 0.07 ), 'Glove', 0.03, 3 )
k.box( c, ( 0.0, 0.485, - 0.092 ), ( 0.022, 0.05, 0.024 ), 'Glove', 0.01, 2, rot = ( 0.6, 0, 0 ) )
k.cyl( c, ( - 0.015, 0.4, - 0.16 ), 0.032, 0.035, 0.06, 'Glove', rot = ( PI / 2 - 0.3, 0, 0 ), seg = 10 )
k.empty( 'Wrist_R', ( - 0.015, 0.39, - 0.19 ), 'Cyclic' )
cl = k.node( 'Collective', ( 0.55, 1.08, - 0.25 ) )
k.box( cl, ( 0, - 0.02, 0 ), ( 0.08, 0.1, 0.12 ), 'Metal_Painted', 0.015 )
k.rod( cl, ( 0, 0, 0 ), ( 0, 0.1, 0.36 ), 0.017, 'Metal_Painted' )
k.cyl( cl, ( 0, 0.115, 0.42 ), 0.026, 0.026, 0.13, 'Rubber_Black', rot = ( PI / 2 - 0.27, 0, 0 ), seg = 14 )
k.box( cl, ( 0, 0.15, 0.5 ), ( 0.07, 0.06, 0.06 ), 'Plastic_Dark', 0.012 )
for i in range( 3 ): k.box( cl, ( - 0.02 + i * 0.02, 0.183, 0.5 ), ( 0.012, 0.01, 0.012 ), 'Lamp_Green' if i == 1 else 'Plastic_Grey', 0.003 )
k.box( cl, ( 0, 0.12, 0.42 ), ( 0.07, 0.075, 0.1 ), 'Glove', 0.028, 3, rot = ( - 0.27, 0, 0 ) )
k.cyl( cl, ( 0.0, 0.1, 0.33 ), 0.032, 0.035, 0.06, 'Glove', rot = ( PI / 2 - 0.27, 0, 0 ), seg = 10 )
k.empty( 'Wrist_L', ( 0.0, 0.095, 0.3 ), 'Collective' )
for nm, x, ank in ( ( 'Pedal_L', 0.36, 'Ankle_L' ), ( 'Pedal_R', 0.04, 'Ankle_R' ) ):
	p = k.node( nm, ( x, 0.82, 0.85 ) )
	# the pedal plate leans forward (0.9 rad from upright); the boot lies on it, ball of the foot on the plate
	k.box( p, ( 0, 0.1, 0.0 ), ( 0.12, 0.2, 0.025 ), 'Metal_Painted', 0.008, rot = ( 0.9, 0, 0 ) )
	for j in range( 4 ): k.box( p, ( 0, 0.04 + j * 0.03, - 0.012 - j * 0.035 ), ( 0.1, 0.006, 0.008 ), 'Rubber_Black', 0.0, rot = ( 0.9, 0, 0 ) )
	k.rod( p, ( 0, 0, 0.05 ), ( 0, 0.15, 0.17 ), 0.012, 'Metal_Painted' )
	k.box( p, ( 0, 0.103, - 0.079 ), ( 0.1, 0.08, 0.28 ), 'Shoe', 0.03, 3, rot = ( - 0.68, 0, 0 ) )
	k.box( p, ( 0, 0.06, - 0.2 ), ( 0.1, 0.1, 0.09 ), 'Shoe', 0.03, 3 )
	k.empty( ank, ( 0, 0.11, - 0.2 ), nm )
k.empty( 'Eye', EYE )
path = os.path.join( OUT, 'cockpit.glb' )
k.export( path )
tris = sum( len( p.vertices ) - 2 for o in bpy.context.scene.objects if o.type == 'MESH' for p in o.data.polygons )
print( 'COCKPIT', path, os.path.getsize( path ), 'bytes', tris, 'tris' )
