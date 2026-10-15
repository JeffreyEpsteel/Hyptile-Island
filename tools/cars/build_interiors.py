# The seven car interiors (wave 24A), one GLB per kind, built headless:
#   D:\blender\blender.exe -b --factory-startup -P tools/cars/build_interiors.py -- [all|sedan,...] [outDir]
# -> public/models/cars/interior-<kind>.glb (original work, CC0 like the rest of the project's Blender output).
#
# Frame and fit: the game frame of tools/cars/build_cars.py (+X the car's left, +Y up, +Z the nose, origin on the ground
# under the middle of the wheelbase); every number below is derived from that script's greenhouse (gb / gt) so the cabin
# sits inside the body shell and under its glass. The driver sits on the left (+X), at KINDS.eye / seat of CarData.js.
#
# Nodes the game drives (src/features/cars/CarInterior.js):
#   Cabin            everything static, one primitive per material
#   Wheel            the steering wheel (pivot at its hub, local Z = the column axis; turns about local Z) with the
#                    driver's gloves on the rim; empties Wrist_L / Wrist_R under it (the forearms reach them)
#   Pedal_Gas / Pedal_Brake (pivot at the hinge; press = rotate about local X)   Gear (pivot at its base, rotate about X)
#   Stalk_Ind / Stalk_Wiper (pivot on the column; flick = rotate about local Z)
#   Wiper_A / Wiper_B (pivot on the cowl, local XY = the glass plane, local +Y along the arm; sweep about local Z)
#   Screen_Cluster / Screen_Stack / Screen_Aux (quads, uv 0..1 = the live instrument canvas regions)
#   RainGlass (a quad just inside the windscreen: drops and the wipers' clear arcs)   DomeLens (the interior lamp)
#   Bulkhead glass, the taxi partition (Glass_Partition)   empties Eye (the authored eye), Dome (the lamp's light)
import bpy, sys, os, math
sys.path.insert( 0, os.path.dirname( __file__ ) )
from interior_kit import Kit
from mathutils import Vector

ROOT = os.path.abspath( os.path.join( os.path.dirname( __file__ ), '..', '..' ) )
argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
WHICH = argv[ 0 ] if argv else 'all'
OUT = argv[ 1 ] if len( argv ) > 1 else os.path.join( ROOT, 'public', 'models', 'cars' )
os.makedirs( OUT, exist_ok = True )

MATS = {
	'Leather_Black': ( ( 0.06, 0.055, 0.055 ), 0.5, 0 ), 'Leather_Tan': ( ( 0.5, 0.33, 0.2 ), 0.5, 0 ), 'Leather_Red': ( ( 0.55, 0.07, 0.06 ), 0.45, 0 ),
	'Cloth_Grey': ( ( 0.3, 0.3, 0.31 ), 0.95, 0 ), 'Cloth_Beige': ( ( 0.58, 0.53, 0.45 ), 0.95, 0 ), 'Cloth_Blue': ( ( 0.13, 0.17, 0.26 ), 0.95, 0 ),
	'Cloth_Bus': ( ( 0.12, 0.3, 0.26 ), 0.95, 0 ), 'Cloth_Sleeve': ( ( 0.16, 0.2, 0.26 ), 0.9, 0 ), 'Cloth_Police': ( ( 0.07, 0.09, 0.16 ), 0.9, 0 ),
	'Vinyl_Black': ( ( 0.07, 0.07, 0.075 ), 0.42, 0 ), 'Vinyl_Brown': ( ( 0.34, 0.2, 0.11 ), 0.45, 0 ), 'Vinyl_Grey': ( ( 0.32, 0.33, 0.34 ), 0.5, 0 ),
	'Plastic_Dark': ( ( 0.07, 0.075, 0.08 ), 0.6, 0 ), 'Plastic_Grey': ( ( 0.24, 0.25, 0.26 ), 0.6, 0 ), 'Plastic_Beige': ( ( 0.63, 0.59, 0.51 ), 0.6, 0 ),
	'Plastic_Bus': ( ( 0.62, 0.63, 0.6 ), 0.55, 0 ), 'Plastic_Seat': ( ( 0.1, 0.32, 0.27 ), 0.4, 0 ),
	'SoftTouch_Dark': ( ( 0.09, 0.09, 0.095 ), 0.78, 0 ), 'SoftTouch_Brown': ( ( 0.2, 0.14, 0.1 ), 0.78, 0 ),
	'Carpet_Dark': ( ( 0.075, 0.075, 0.08 ), 1.0, 0 ), 'Rubber_Black': ( ( 0.035, 0.035, 0.035 ), 0.88, 0 ), 'Rubber_Floor': ( ( 0.1, 0.1, 0.1 ), 0.85, 0 ),
	'Chrome': ( ( 0.92, 0.92, 0.94 ), 0.12, 1 ), 'Metal_Brushed': ( ( 0.7, 0.7, 0.72 ), 0.32, 1 ), 'Metal_Painted': ( ( 0.2, 0.22, 0.25 ), 0.45, 0.5 ),
	'Metal_Yellow': ( ( 0.86, 0.66, 0.06 ), 0.35, 0.3 ), 'Carbon': ( ( 0.06, 0.06, 0.07 ), 0.3, 0 ), 'Wood_Walnut': ( ( 0.36, 0.19, 0.09 ), 0.35, 0 ),
	'Headliner_Light': ( ( 0.62, 0.6, 0.56 ), 1.0, 0 ), 'Headliner_Dark': ( ( 0.13, 0.13, 0.14 ), 1.0, 0 ),
	'Mirror': ( ( 0.9, 0.92, 0.95 ), 0.03, 1 ), 'Glass_Partition': ( ( 0.8, 0.86, 0.9 ), 0.05, 0 ),
	'Screen_Cluster': ( ( 0.02, 0.02, 0.02 ), 0.4, 0 ), 'Screen_Stack': ( ( 0.02, 0.02, 0.02 ), 0.4, 0 ), 'Screen_Aux': ( ( 0.02, 0.02, 0.02 ), 0.4, 0 ),
	'RainGlass': ( ( 1, 1, 1 ), 0.1, 0 ), 'Lamp_Dome': ( ( 0.92, 0.9, 0.82 ), 0.3, 0 ), 'Lamp_Red': ( ( 0.8, 0.08, 0.06 ), 0.3, 0 ),
	'Glove': ( ( 0.09, 0.075, 0.065 ), 0.55, 0 ), 'Shoe': ( ( 0.05, 0.045, 0.04 ), 0.4, 0 ), 'Cardboard': ( ( 0.55, 0.4, 0.24 ), 0.95, 0 ), 'Strap_Orange': ( ( 0.85, 0.35, 0.05 ), 0.8, 0 ),
}

PI = math.pi
SPECS = {
	'sedan': { 'L': 4.6, 'W': 1.8 }, 'taxi': { 'L': 4.7, 'W': 1.8 }, 'police': { 'L': 4.8, 'W': 1.84 }, 'pickup': { 'L': 5.3, 'W': 1.95 },
	'van': { 'L': 5.1, 'W': 1.98 }, 'sports': { 'L': 4.35, 'W': 1.92 }, 'bus': { 'L': 11.0, 'W': 2.5 },
}
# eyes / seats: keep in step with CarData.js KINDS
EYE = { 'sedan': ( 0.38, 1.22, - 0.1 ), 'taxi': ( 0.38, 1.22, - 0.1 ), 'police': ( 0.38, 1.24, - 0.05 ), 'pickup': ( 0.4, 1.45, 0.34 ),
	'van': ( 0.42, 1.6, 1.0 ), 'sports': ( 0.4, 1.0, - 0.3 ), 'bus': ( 0.75, 2.2, 4.4 ) }

# ------------------------------------------------------------------ shared pieces

def glass_line( base, top ):
	# windscreen: base ( z, y ) -> top ( z, y ); returns y( z ), z( y ), the unit up-the-glass ( dy, dz ), the tilt about X
	( zb, yb ), ( zt, yt ) = base, top
	d = Vector( ( 0, yt - yb, zt - zb ) ).normalized()
	return d, math.atan2( d.z, d.y )

def seat( k, n, x, z, floor, w = 0.5, style = 'cloth', mat = 'Cloth_Grey', trim = 'Leather_Black', h = 0.18, back = 0.62, recline = - 0.22, head = True, depth = 0.5 ):
	# cushion (front edge up a little), backrest (reclined), headrest on two chrome posts, side bolsters, a plastic base
	top = floor + h + 0.12
	k.box( n, ( x, floor + h * 0.5, z - 0.02 ), ( w * 0.8, h, depth * 0.8 ), 'Plastic_Dark', 0.02 )
	k.box( n, ( x, top - 0.06, z ), ( w, 0.13, depth ), mat if style != 'bucket' else trim, 0.05, 3, rot = ( - 0.07, 0, 0 ) )
	bz = z - depth / 2 - 0.02
	by = top + back / 2 - 0.04
	k.box( n, ( x, by, bz - math.sin( - recline ) * back / 2 ), ( w * 0.96, back, 0.12 ), mat if style != 'bucket' else trim, 0.05, 3, rot = ( recline, 0, 0 ) )
	if style in ( 'cloth', 'taxi', 'police' ):
		# bolsters / piping in the trim material: the cloth insert framed by vinyl or leather
		for s in ( - 1, 1 ):
			k.box( n, ( x + s * ( w / 2 - 0.045 ), top - 0.03, z ), ( 0.09, 0.15, depth * 0.98 ), trim, 0.04, 3, rot = ( - 0.07, 0, 0 ) )
			k.box( n, ( x + s * ( w * 0.48 - 0.045 ), by, bz - math.sin( - recline ) * back / 2 + 0.02 ), ( 0.09, back * 0.96, 0.14 ), trim, 0.04, 3, rot = ( recline, 0, 0 ) )
		for j in ( - 1, 0, 1 ):
			k.box( n, ( x, by + j * back * 0.22, bz - math.sin( - recline ) * ( back / 2 + j * back * 0.22 ) + 0.062 ), ( w * 0.74, 0.008, 0.012 ), trim, 0.0, rot = ( recline, 0, 0 ) )
	if style == 'bucket':
		for s in ( - 1, 1 ):
			k.box( n, ( x + s * ( w / 2 - 0.04 ), top + 0.02, z ), ( 0.1, 0.2, depth ), trim, 0.045, 3, rot = ( - 0.07, 0, 0 ) )
			k.box( n, ( x + s * ( w / 2 - 0.04 ), by + 0.05, bz - math.sin( - recline ) * back / 2 + 0.05 ), ( 0.11, back * 1.05, 0.2 ), trim, 0.05, 3, rot = ( recline, 0, 0 ) )
		# the insert in alcantara-like cloth and red stitching
		k.box( n, ( x, by, bz - math.sin( - recline ) * back / 2 + 0.064 ), ( w * 0.55, back * 0.8, 0.01 ), 'Cloth_Grey', 0.004, rot = ( recline, 0, 0 ) )
		for s in ( - 1, 1 ): k.box( n, ( x + s * w * 0.28, by, bz - math.sin( - recline ) * back / 2 + 0.068 ), ( 0.006, back * 0.8, 0.006 ), 'Leather_Red', 0.0, rot = ( recline, 0, 0 ) )
		# harness slots instead of a headrest: the backrest runs up
		hy = by + back / 2 + 0.12
		k.box( n, ( x, hy, bz - math.sin( - recline ) * ( back / 2 + 0.12 ) ), ( w * 0.62, 0.26, 0.11 ), trim, 0.05, 3, rot = ( recline, 0, 0 ) )
		for s in ( - 1, 1 ): k.box( n, ( x + s * 0.09, hy - 0.03, bz - math.sin( - recline ) * ( back / 2 + 0.1 ) + 0.058 ), ( 0.05, 0.1, 0.01 ), 'Plastic_Dark', 0.005, rot = ( recline, 0, 0 ) )
	elif head:
		hy = by + back / 2 + 0.16
		hz = bz - math.sin( - recline ) * ( back / 2 + 0.16 ) + 0.02
		k.box( n, ( x, hy, hz ), ( w * 0.55, 0.17, 0.11 ), mat, 0.045, 3, rot = ( recline, 0, 0 ) )
		for s in ( - 1, 1 ): k.rod( n, ( x + s * 0.08, hy - 0.08, hz ), ( x + s * 0.08, hy - 0.2, hz + 0.02 ), 0.007, 'Chrome' )
	return top

def bench( k, n, x0, x1, z, floor, mat, trim, back = 0.55, h = 0.18, depth = 0.5, pleats = 0, recline = - 0.2 ):
	x, w = ( x0 + x1 ) / 2, x1 - x0
	top = floor + h + 0.12
	k.box( n, ( x, floor + h * 0.5, z ), ( w * 0.92, h, depth * 0.8 ), 'Plastic_Dark', 0.02 )
	k.box( n, ( x, top - 0.06, z ), ( w, 0.13, depth ), mat, 0.05, 3, rot = ( - 0.06, 0, 0 ) )
	k.box( n, ( x, top + back / 2 - 0.05, z - depth / 2 - 0.03 - 0.06 + math.sin( recline ) * back / 2 ), ( w, back, 0.12 ), mat, 0.05, 3, rot = ( recline, 0, 0 ) )
	for j in range( 1, pleats ):
		xx = x0 + w * j / pleats
		k.box( n, ( xx, top + back / 2 - 0.05, z - depth / 2 - 0.03 + math.sin( recline ) * back / 2 ), ( 0.01, back * 0.92, 0.01 ), trim, 0.0, rot = ( recline, 0, 0 ) )
		k.box( n, ( xx, top + 0.005, z + 0.02 ), ( 0.01, 0.01, depth * 0.9 ), trim, 0.0, rot = ( - 0.06, 0, 0 ) )
	return top

def steering( k, eye, c, R = 0.185, tilt = 0.42, rim = 'Leather_Black', spoke = 'Plastic_Dark', spokes = 3, flat = False, paddles = False, column_to = None, hands = True ):
	n = k.node( 'Wheel', c, ( tilt, 0, 0 ) )
	if flat:
		k.torus( n, ( 0, 0, 0 ), R, 0.019, rim, seg = 36, ring = 10, a0 = - PI / 2 + 0.75, arc = PI * 2 - 1.5 )
		k.rod( n, ( math.cos( - PI / 2 + 0.75 ) * R, math.sin( - PI / 2 + 0.75 ) * R, 0 ), ( math.cos( - PI / 2 - 0.75 ) * R, math.sin( - PI / 2 - 0.75 ) * R, 0 ), 0.019, rim )
		# the red top-centre marker
		k.box( n, ( 0, R, 0 ), ( 0.03, 0.045, 0.045 ), 'Leather_Red', 0.008 )
	else:
		k.torus( n, ( 0, 0, 0 ), R, 0.018 if R < 0.22 else 0.016, rim, seg = 40, ring = 10 )
	k.box( n, ( 0, - 0.005, 0.025 ), ( 0.13, 0.1, 0.06 ), spoke, 0.025, 3 )
	k.cyl( n, ( 0, 0, 0.06 ), 0.03, 0.04, 0.1, 'Plastic_Dark', seg = 14 )
	angles = { 3: ( 0, PI, - PI / 2 ), 2: ( 0, PI ), 4: ( PI / 5, PI - PI / 5, - PI / 5, PI + PI / 5 ) }[ spokes ]
	for a in angles:
		k.rod( n, ( math.cos( a ) * 0.05, math.sin( a ) * 0.05, 0.02 ), ( math.cos( a ) * ( R - 0.01 ), math.sin( a ) * ( R - 0.01 ), 0.0 ), 0.012, spoke )
		k.box( n, ( math.cos( a ) * R * 0.55, math.sin( a ) * R * 0.55, 0.012 ), ( 0.05 if abs( math.cos( a ) ) > 0.5 else 0.03, 0.03, 0.02 ), spoke, 0.008, rot = ( 0, 0, a ) )
	k.box( n, ( 0.035, 0.0, - 0.008 ), ( 0.03, 0.016, 0.004 ), 'Chrome', 0.002 )
	if paddles:
		for s in ( - 1, 1 ): k.box( n, ( s * ( R * 0.72 ), 0.03, 0.055 ), ( 0.07, 0.11, 0.008 ), 'Carbon', 0.006, rot = ( 0, 0, s * 0.15 ) )
	if hands:
		# the driver's gloves round the rim at a quarter to three, thumbs on the spokes
		for s, nm in ( ( 1, 'L' ), ( - 1, 'R' ) ):
			hx = s * R
			k.box( n, ( hx, 0.0, - 0.02 ), ( 0.05, 0.095, 0.06 ), 'Glove', 0.022, 3 )
			for f in range( 4 ):
				k.box( n, ( hx + s * 0.002, 0.035 - f * 0.022, 0.016 ), ( 0.052, 0.018, 0.03 ), 'Glove', 0.008, 2 )
			k.box( n, ( hx - s * 0.035, 0.03, - 0.006 ), ( 0.05, 0.02, 0.022 ), 'Glove', 0.009, 2, rot = ( 0, 0, s * 0.5 ) )
			k.cyl( n, ( hx + s * 0.005, - 0.005, - 0.065 ), 0.03, 0.033, 0.05, 'Glove', rot = ( 0, 0, 0 ), seg = 10 )
			k.empty( 'Wrist_' + nm, ( hx + s * 0.005, - 0.01, - 0.09 ), 'Wheel' )
	return n

def shoe( k, n, c, rot ):
	# a driving shoe: sole, upper, heel; the ankle empty sits over the heel
	k.box( n, c, ( 0.095, 0.075, 0.27 ), 'Shoe', 0.03, 3, rot = rot )
	from mathutils import Euler
	m = Euler( rot, 'XYZ' ).to_matrix()
	k.box( n, tuple( Vector( c ) + m @ Vector( ( 0, - 0.045, 0 ) ) ), ( 0.1, 0.018, 0.28 ), 'Rubber_Black', 0.006, rot = rot )
	return tuple( Vector( c ) + m @ Vector( ( 0, 0.06, - 0.08 ) ) )

def pedals( k, x, floor, z_hinge, y_hinge, gap = 0.17, clutch = False, rest = None ):
	for nm, dx, w in ( ( 'Pedal_Gas', - gap / 2 - 0.02, 0.06 ), ( 'Pedal_Brake', gap / 2, 0.1 ) ):
		n = k.node( nm, ( x + dx, y_hinge, z_hinge ), ( 0, 0, 0 ) )
		ly = floor + 0.12 - y_hinge
		k.rod( n, ( 0, 0, 0 ), ( 0, ly * 0.85, - 0.06 ), 0.009, 'Metal_Painted' )
		k.box( n, ( 0, ly, - 0.085 ), ( w, 0.11 if nm == 'Pedal_Gas' else 0.07, 0.02 ), 'Rubber_Black', 0.008, rot = ( 0.35, 0, 0 ) )
		for j in range( 4 ): k.box( n, ( 0, ly - 0.035 + j * 0.022, - 0.098 ), ( w * 0.86, 0.006, 0.006 ), 'Metal_Brushed', 0.0, rot = ( 0.35, 0, 0 ) )
		if nm == 'Pedal_Gas':
			# the right foot rides the throttle: ball of the foot on the pad, heel on the floor
			a = shoe( k, n, ( 0.0, ly - 0.06, - 0.2 ), ( - 0.55, 0, 0 ) )
			k.empty( 'Ankle_R', a, nm )
	# the left foot on the floor by the dead pedal
	rx, ry, rz = rest if rest else ( x + 0.2, floor + 0.05, z_hinge - 0.1 )
	c = k.node( 'FootRest' )
	a = shoe( k, c, ( rx - 0.03, ry + 0.06, rz - 0.12 ), ( - 0.45, 0, 0 ) )
	k.empty( 'Ankle_L', a )

def stalks( k, c, side = 0.075 ):
	for nm, s, mat in ( ( 'Stalk_Ind', 1, 'Plastic_Dark' ), ( 'Stalk_Wiper', - 1, 'Plastic_Dark' ) ):
		n = k.node( nm, ( c[ 0 ] + s * side, c[ 1 ], c[ 2 ] ), ( 0, 0, 0 ) )
		k.rod( n, ( 0, 0, 0 ), ( s * 0.13, 0.01, - 0.03 ), 0.007, mat )
		k.cyl( n, ( s * 0.13, 0.01, - 0.03 ), 0.011, 0.011, 0.04, mat, rot = ( 0, PI / 2, 0 ), seg = 10 )

def wipers( k, pivots, base, top, length ):
	d, theta = glass_line( base, top )
	for nm, x, L in zip( ( 'Wiper_A', 'Wiper_B' ), pivots, length ):
		# a little outside the glass (local +Z is the outward normal)
		p = Vector( ( x, base[ 1 ] + 0.02, base[ 0 ] + 0.04 ) )
		n = k.node( nm, p, ( theta, 0, 0 ) )
		k.cyl( n, ( 0, 0, 0.005 ), 0.016, 0.014, 0.03, 'Plastic_Dark', rot = ( 0, 0, 0 ), seg = 10 )
		k.box( n, ( 0, L * 0.45, 0.03 ), ( 0.016, L * 0.9, 0.012 ), 'Plastic_Dark', 0.004 )
		k.box( n, ( 0, L * 0.55, 0.012 ), ( 0.02, L * 0.88, 0.02 ), 'Rubber_Black', 0.005 )

def rain_glass( k, base, top, half_b, half_t, inset = 0.012 ):
	d, theta = glass_line( base, top )
	nrm = Vector( ( 0, - d.z, d.y ) )  # pointing back / in when the glass leans back
	if nrm.z > 0: nrm = - nrm
	off = nrm * inset
	c = [ Vector( ( half_t, top[ 1 ], top[ 0 ] ) ) + off, Vector( ( - half_t, top[ 1 ], top[ 0 ] ) ) + off, Vector( ( - half_b, base[ 1 ], base[ 0 ] ) ) + off, Vector( ( half_b, base[ 1 ], base[ 0 ] ) ) + off ]
	n = k.node( 'RainGlass' )
	k.quad( n, c, 'RainGlass' )

def screen( k, name, center, w, h, yaw = 0.0, pitch = 0.0, bezel = 'Plastic_Dark', node = None, depth = 0.02 ):
	# a display facing the driver (-Z), tilted back by pitch (radians), turned toward the driver by yaw; with a bezel
	n = k.node( name, center, ( pitch, yaw, 0 ) )
	k.quad( n, [ ( w / 2, h / 2, 0 ), ( - w / 2, h / 2, 0 ), ( - w / 2, - h / 2, 0 ), ( w / 2, - h / 2, 0 ) ], name )
	b = k.node( name + '_Bezel', center, ( pitch, yaw, 0 ) )
	for ( cx, cy, sx, sy ) in ( ( 0, h / 2 + 0.008, w + 0.03, 0.016 ), ( 0, - h / 2 - 0.008, w + 0.03, 0.016 ), ( w / 2 + 0.008, 0, 0.016, h ), ( - w / 2 - 0.008, 0, 0.016, h ) ):
		k.box( b, ( cx, cy, 0.006 ), ( sx, sy, 0.024 ), bezel, 0.005 )
	k.box( b, ( 0, 0, depth / 2 + 0.003 ), ( w + 0.02, h + 0.02, depth ), bezel, 0.004 )
	return n

def binnacle( k, n, ex, y0, z0, w = 0.44, h = 0.14, tilt = 0.18, depth = 0.2, mat = 'SoftTouch_Dark', sw = 0.36, name = 'Screen_Cluster' ):
	# the instrument pod on the dash top: its rear face leans back by tilt from ( y0, z0 ) up h; a brow overhangs it; the
	# cluster display sits 4 mm proud of the face
	t = math.tan( tilt )
	k.hull( n, [ ( ex + s * w / 2, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( y0 - 0.06, z0 - 0.01 ), ( y0, z0 ), ( y0 + h, z0 + h * t ), ( y0 + h, z0 + depth ), ( y0 - 0.06, z0 + depth ) ) ], mat, True )
	k.hull( n, [ ( ex + s * ( w / 2 + 0.01 ), y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( y0 + h - 0.01, z0 + h * t + 0.01 ), ( y0 + h + 0.025, z0 + h * t + 0.01 ), ( y0 + h + 0.025, z0 + h * t - 0.045 ), ( y0 + h + 0.008, z0 + h * t - 0.05 ) ) ], mat, True )
	sh = h * 0.84
	screen( k, name, ( ex, y0 + h / 2, z0 + h / 2 * t - 0.004 ), sw, sw * 0.4 if sw * 0.4 < sh else sh, pitch = tilt )

def door_panels( k, n, half, z0, z1, floor, belt, mat, trim, arm = 'SoftTouch_Dark', handle = 'Chrome', pocket = True, speaker = True ):
	for s in ( 1, - 1 ):
		x = s * half
		k.box( n, ( x - s * 0.02, ( floor + belt ) / 2, ( z0 + z1 ) / 2 ), ( 0.04, belt - floor, z1 - z0 ), trim, 0.012 )
		k.box( n, ( x - s * 0.045, belt - 0.18, ( z0 + z1 ) / 2 ), ( 0.02, 0.2, ( z1 - z0 ) * 0.9 ), mat, 0.008 )
		k.box( n, ( x - s * 0.07, floor + 0.36, ( z0 + z1 ) / 2 + 0.1 ), ( 0.08, 0.05, ( z1 - z0 ) * 0.45 ), arm, 0.02, 3 )
		k.box( n, ( x - s * 0.045, belt - 0.02, ( z0 + z1 ) / 2 ), ( 0.06, 0.04, z1 - z0 ), trim, 0.015 )
		# the window sill over the door's top to the outer skin (hides the body shell's shoulder from inside)
		k.box( n, ( x + s * 0.04, belt + 0.012, ( z0 + z1 ) / 2 ), ( 0.17, 0.026, z1 - z0 + 0.06 ), trim, 0.01 )
		k.box( n, ( x - s * 0.05, belt - 0.12, z1 - 0.2 ), ( 0.02, 0.03, 0.09 ), handle, 0.008 )
		if pocket: k.box( n, ( x - s * 0.06, floor + 0.14, ( z0 + z1 ) / 2 + 0.15 ), ( 0.05, 0.12, ( z1 - z0 ) * 0.4 ), 'Plastic_Dark', 0.015 )
		if speaker: k.cyl( n, ( x - s * 0.043, floor + 0.17, z1 - 0.17 ), 0.07, 0.07, 0.01, 'Plastic_Dark', rot = ( 0, PI / 2, 0 ), seg = 20 )

def rear_mirror( k, n, x, y, z, w = 0.25 ):
	k.box( n, ( x, y, z ), ( w, 0.075, 0.035 ), 'Plastic_Dark', 0.012 )
	k.quad( n, [ ( x + w / 2 - 0.008, y + 0.03, z - 0.019 ), ( x - w / 2 + 0.008, y + 0.03, z - 0.019 ), ( x - w / 2 + 0.008, y - 0.03, z - 0.019 ), ( x + w / 2 - 0.008, y - 0.03, z - 0.019 ) ], 'Mirror' )

def side_mirror_glass( k, n, x, y, z ):
	# the exterior mirror's rear face (build_cars.py mirrors(): 0.16 x 0.1 x 0.12 boxes)
	for s in ( 1, - 1 ):
		k.quad( n, [ ( s * x + 0.065, y + 0.04, z ), ( s * x - 0.065, y + 0.04, z ), ( s * x - 0.065, y - 0.04, z ), ( s * x + 0.065, y - 0.04, z ) ], 'Mirror' )

def dome( k, n, y, z, w = 0.16 ):
	k.box( n, ( 0, y - 0.01, z ), ( w + 0.04, 0.02, 0.12 ), 'Plastic_Grey', 0.008 )
	d = k.node( 'DomeLens' )
	k.box( d, ( 0, y - 0.022, z ), ( w, 0.012, 0.08 ), 'Lamp_Dome', 0.005 )
	k.empty( 'Dome', ( 0, y - 0.06, z ) )

# ------------------------------------------------------------------ the sedan family: sedan, taxi, police

def sedan_family( kind ):
	S = SPECS[ kind ]; L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	gb = ( zr + 1.0, zf - 1.5, 0.95, w - 0.1 ); gt = ( zr + 1.55, zf - 2.3, 1.45, w - 0.27 )
	eye = EYE[ kind ]; ex, ey, ez = eye
	k = Kit( MATS )
	n = k.node( 'Cabin' )
	floor = 0.31
	half = gb[ 3 ]  # the inner face of the doors, under the glass base
	style = { 'sedan': ( 'cloth', 'Cloth_Beige', 'Vinyl_Brown', 'SoftTouch_Brown', 'Headliner_Light' ),
		'taxi': ( 'taxi', 'Vinyl_Black', 'Vinyl_Black', 'SoftTouch_Dark', 'Headliner_Light' ),
		'police': ( 'police', 'Cloth_Police', 'Vinyl_Black', 'SoftTouch_Dark', 'Headliner_Dark' ) }[ kind ]
	sstyle, smat, strim, dashmat, headliner = style
	cowl = ( gb[ 1 ], gb[ 2 ] )
	roof = ( gt[ 1 ], gt[ 2 ] )
	# floor: carpet, tunnel, sills
	k.box( n, ( 0, floor, ( gb[ 0 ] + gb[ 1 ] ) / 2 ), ( half * 2, 0.03, gb[ 1 ] - gb[ 0 ] ), 'Carpet_Dark', 0.0 )
	k.box( n, ( 0, floor + 0.07, ( gb[ 0 ] + gb[ 1 ] ) / 2 ), ( 0.26, 0.14, gb[ 1 ] - gb[ 0 ] - 0.1 ), 'Carpet_Dark', 0.05, 3 )
	for s in ( 1, - 1 ): k.box( n, ( s * ( half - 0.04 ), floor + 0.05, ( gb[ 0 ] + gb[ 1 ] ) / 2 ), ( 0.08, 0.1, gb[ 1 ] - gb[ 0 ] ), 'Plastic_Dark', 0.02 )
	# floor mats
	for x in ( ex, - ex ): k.box( n, ( x, floor + 0.018, ez + 0.45 ), ( 0.46, 0.008, 0.6 ), 'Rubber_Floor', 0.004 )
	# ---- the dashboard: passenger section, centre stack, driver section with the instrument hood
	dtop = cowl[ 1 ] + 0.04
	k.hull( n, [ ( s * ( half - 0.01 ), y, z ) for s in ( - 1, - 0.13 ) for ( y, z ) in ( ( cowl[ 1 ] - 0.01, cowl[ 0 ] - 0.01 ), ( dtop, 0.46 ), ( dtop - 0.05, 0.40 ), ( 0.78, 0.37 ), ( 0.62, 0.47 ), ( 0.62, cowl[ 0 ] ) ) ], dashmat, True )
	# a soft padded upper skin over the whole width and the glovebox lid
	k.box( n, ( - half * 0.55, dtop - 0.02, 0.62 ), ( half * 0.85, 0.04, 0.34 ), dashmat, 0.02, 3, rot = ( 0.08, 0, 0 ) )
	k.box( n, ( - half * 0.52, 0.72, 0.385 ), ( half * 0.62, 0.14, 0.02 ), 'Plastic_Dark' if kind != 'sedan' else 'Wood_Walnut', 0.01, rot = ( - 0.3, 0, 0 ) )
	if kind == 'sedan':
		# the walnut band across the dash and the doors
		k.box( n, ( - half * 0.52, 0.86, 0.395 ), ( half * 0.9, 0.05, 0.02 ), 'Wood_Walnut', 0.006, rot = ( 0.15, 0, 0 ) )
	# centre stack
	k.hull( n, [ ( s * 0.15, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( dtop, cowl[ 0 ] - 0.05 ), ( dtop, 0.55 ), ( 0.95, 0.5 ), ( 0.62, 0.58 ), ( floor + 0.2, 0.6 ), ( floor + 0.2, cowl[ 0 ] - 0.05 ) ) ], dashmat, True )
	# driver section: the face set forward to frame the cluster, a knee bolster below
	k.hull( n, [ ( s, y, z ) for s in ( 0.15, half - 0.01 ) for ( y, z ) in ( ( cowl[ 1 ] - 0.01, cowl[ 0 ] - 0.01 ), ( dtop - 0.06, 0.5 ), ( 0.86, 0.5 ), ( 0.78, 0.46 ), ( 0.62, 0.5 ), ( 0.62, cowl[ 0 ] ) ) ], dashmat, True )
	binnacle( k, n, ex, dtop - 0.065, 0.5, mat = dashmat )
	# vents: two at the outer ends, two in the stack
	for x in ( half - 0.12, - half + 0.12, 0.07, - 0.07 ):
		zz = 0.47 if abs( x ) > 0.3 else 0.512
		k.box( n, ( x, 0.93 if abs( x ) > 0.3 else 0.965, zz - 0.01 ), ( 0.1 if abs( x ) > 0.3 else 0.09, 0.055, 0.02 ), 'Plastic_Dark', 0.01 )
		for j in range( 4 ): k.box( n, ( x, ( 0.93 if abs( x ) > 0.3 else 0.965 ) - 0.02 + j * 0.013, zz - 0.022 ), ( 0.085 if abs( x ) > 0.3 else 0.075, 0.003, 0.012 ), 'Chrome' if kind == 'sedan' else 'Plastic_Grey', 0.0 )
	# the cluster (behind the wheel) and the stack display
	screen( k, 'Screen_Stack', ( 0, 0.79, 0.522 ), 0.2, 0.267, pitch = - 0.24 )
	# steering column shroud, wheel, stalks, pedals
	wc = ( ex, 0.83, 0.24 )
	k.hull( n, [ ( ex + s * 0.06, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( 0.85, 0.33 ), ( 0.8, 0.5 ), ( 0.72, 0.5 ), ( 0.78, 0.33 ) ) ], 'Plastic_Dark', True )
	steering( k, eye, wc, 0.185, 0.42, rim = 'Leather_Black' if kind != 'sedan' else 'Leather_Tan', spokes = 3 if kind != 'taxi' else 4 )
	stalks( k, ( ex, 0.83, 0.33 ) )
	pedals( k, ex, floor, 0.66, 0.66 )
	k.box( n, ( ex + 0.2, floor + 0.08, 0.62 ), ( 0.08, 0.02, 0.2 ), 'Rubber_Black', 0.005, rot = ( 0.6, 0, 0 ) )
	# ---- centre console, gear selector, handbrake, cup holders, armrest
	k.box( n, ( 0, floor + 0.21, 0.05 ), ( 0.22, 0.3, 0.9 ), 'Plastic_Dark', 0.03, 3 )
	k.box( n, ( 0, floor + 0.37, 0.12 ), ( 0.2, 0.02, 0.36 ), dashmat if kind != 'sedan' else 'Wood_Walnut', 0.008 )
	g = k.node( 'Gear', ( 0, floor + 0.38, 0.16 ) )
	k.box( n, ( 0, floor + 0.385, 0.16 ), ( 0.07, 0.01, 0.14 ), 'Plastic_Dark', 0.004 )
	k.rod( g, ( 0, 0, 0 ), ( 0, 0.1, 0 ), 0.008, 'Chrome' )
	k.sphere( g, ( 0, 0.12, 0 ), 0.028, 'Leather_Black', scale = ( 1, 1.2, 1.1 ) )
	k.cyl( g, ( 0, 0.012, 0 ), 0.03, 0.012, 0.03, 'Leather_Black', rot = ( - PI / 2, 0, 0 ), seg = 12 )
	for dz in ( - 0.02, 0.06 ): k.cyl( n, ( 0, floor + 0.37, dz - 0.08 ), 0.035, 0.03, 0.04, 'Rubber_Black', rot = ( PI / 2, 0, 0 ), seg = 14 )
	k.box( n, ( 0.0, floor + 0.43, - 0.33 ), ( 0.2, 0.08, 0.3 ), 'SoftTouch_Dark' if kind != 'sedan' else 'Vinyl_Brown', 0.03, 3 )
	hb = k.node( 'Handbrake', ( 0.07, floor + 0.37, - 0.02 ) )
	k.box( hb, ( 0, 0.03, - 0.08 ), ( 0.035, 0.03, 0.2 ), 'Plastic_Dark', 0.012, rot = ( 0.2, 0, 0 ) )
	# ---- seats
	for x in ( ex, - ex ): seat( k, n, x, ez - 0.05, floor, 0.5, sstyle, smat, strim )
	rz = - 0.83 if kind != 'police' else - 0.78
	rear = 'Vinyl_Black' if kind == 'police' else smat
	bench( k, n, - half + 0.05, half - 0.05, rz, floor + 0.02, rear, strim, back = 0.42, depth = 0.42, pleats = 3 if kind != 'police' else 0, recline = - 0.18 )
	k.box( n, ( 0, gb[ 2 ] + 0.015, gb[ 0 ] + 0.14 ), ( half * 2 - 0.1, 0.02, 0.12 ), 'Plastic_Dark', 0.005 )
	# ---- doors, pillars, headliner, visors, mirrors, dome
	door_panels( k, n, half, gb[ 0 ] + 0.05, gb[ 1 ] - 0.08, floor, gb[ 2 ], smat if kind == 'sedan' else strim, 'Plastic_Dark' if kind != 'sedan' else 'SoftTouch_Brown',
		handle = 'Chrome' if kind == 'sedan' else 'Plastic_Grey' )
	for s in ( 1, - 1 ):
		k.tube( n, [ ( s * ( gb[ 3 ] - 0.03 ), gb[ 2 ] + 0.01, gb[ 1 ] - 0.03 ), ( s * ( gt[ 3 ] - 0.03 ), gt[ 2 ] - 0.03, gt[ 1 ] - 0.01 ) ], 0.035, 'Plastic_Grey' if headliner == 'Headliner_Light' else 'Plastic_Dark' )
		zb = ( gb[ 0 ] + gb[ 1 ] ) / 2 + 0.05; ztb = ( gt[ 0 ] + gt[ 1 ] ) / 2 + 0.05
		k.slab( n, [ ( s * ( gb[ 3 ] - 0.02 ), gb[ 2 ], zb - 0.07 ), ( s * ( gb[ 3 ] - 0.02 ), gb[ 2 ], zb + 0.07 ), ( s * ( gt[ 3 ] - 0.02 ), gt[ 2 ] - 0.02, ztb + 0.06 ), ( s * ( gt[ 3 ] - 0.02 ), gt[ 2 ] - 0.02, ztb - 0.06 ) ], 0.03 * s, 'Plastic_Grey' if headliner == 'Headliner_Light' else 'Plastic_Dark' )
		# seat belts down the B pillars
		k.slab( n, [ ( s * ( gb[ 3 ] - 0.06 ), gt[ 2 ] - 0.1, ztb + 0.0 ), ( s * ( gb[ 3 ] - 0.06 ), gt[ 2 ] - 0.1, ztb + 0.045 ), ( s * ( ex + 0.12 ), floor + 0.45, ez - 0.12 ), ( s * ( ex + 0.12 ), floor + 0.45, ez - 0.165 ) ], 0.004 * s, 'Cloth_Grey' )
	k.box( n, ( 0, gt[ 2 ] - 0.025, ( gt[ 0 ] + gt[ 1 ] ) / 2 ), ( gt[ 3 ] * 2 + 0.05, 0.02, gt[ 1 ] - gt[ 0 ] + 0.08 ), headliner, 0.008 )
	for s in ( 1, - 1 ): k.box( n, ( s * 0.33, gt[ 2 ] - 0.045, gt[ 1 ] - 0.08 ), ( 0.34, 0.018, 0.15 ), headliner, 0.008 )
	dome( k, n, gt[ 2 ] - 0.035, ( gt[ 0 ] + gt[ 1 ] ) / 2 )
	k.rod( n, ( 0, gt[ 2 ] - 0.03, gt[ 1 ] + 0.05 ), ( 0, gt[ 2 ] - 0.08, gt[ 1 ] + 0.09 ), 0.008, 'Plastic_Dark' )
	rear_mirror( k, n, 0, gt[ 2 ] - 0.1, gt[ 1 ] + 0.1 )
	side_mirror_glass( k, n, w - 0.05 + 0.08, 1.0, gb[ 1 ] - 0.1 - 0.064 )
	# ---- the kind's own fit-out
	if kind == 'taxi':
		# fare meter on the dash top (Screen_Aux), the partition behind the front seats with its pay tray
		screen( k, 'Screen_Aux', ( - 0.05, dtop + 0.065, 0.55 ), 0.2, 0.08, pitch = 0.3, yaw = 0.15, bezel = 'Plastic_Dark', depth = 0.06 )
		pz = - 0.6
		k.box( n, ( 0, floor + 0.62, pz ), ( half * 2 - 0.06, 0.62, 0.03 ), 'Plastic_Dark', 0.01 )
		k.box( n, ( 0, floor + 0.62 + 0.04, pz - 0.04 ), ( 0.3, 0.06, 0.1 ), 'Metal_Brushed', 0.01 )
		for s in ( 1, - 1 ): k.rod( n, ( s * ( half - 0.05 ), floor + 0.93, pz ), ( s * ( half - 0.1 ), gt[ 2 ] - 0.04, pz - 0.05 ), 0.015, 'Metal_Brushed' )
		k.rod( n, ( half - 0.06, floor + 0.93, pz ), ( - half + 0.06, floor + 0.93, pz ), 0.015, 'Metal_Brushed' )
		k.rod( n, ( half - 0.1, gt[ 2 ] - 0.05, pz - 0.05 ), ( - half + 0.1, gt[ 2 ] - 0.05, pz - 0.05 ), 0.015, 'Metal_Brushed' )
		p = k.node( 'Partition' )
		k.quad( p, [ ( - half + 0.08, gt[ 2 ] - 0.06, pz - 0.05 ), ( half - 0.08, gt[ 2 ] - 0.06, pz - 0.05 ), ( half - 0.06, floor + 0.94, pz ), ( - half + 0.06, floor + 0.94, pz ) ], 'Glass_Partition' )
		# the rear passenger's card reader on the partition
		k.box( n, ( - 0.35, floor + 0.75, pz - 0.035 ), ( 0.16, 0.1, 0.04 ), 'Plastic_Grey', 0.01 )
	if kind == 'police':
		# the laptop on its mount over the console (Screen_Aux), the radio stack, the light bar switch panel, the cage
		k.rod( n, ( - 0.06, floor + 0.37, 0.1 ), ( - 0.24, floor + 0.6, 0.16 ), 0.02, 'Metal_Painted' )
		k.box( n, ( - 0.28, floor + 0.6, 0.16 ), ( 0.32, 0.025, 0.22 ), 'Plastic_Dark', 0.01, rot = ( 0, 0.55, 0 ) )
		screen( k, 'Screen_Aux', ( - 0.24, floor + 0.71, 0.1 ), 0.29, 0.116, pitch = - 0.25, yaw = 0.55, bezel = 'Plastic_Dark' )
		k.box( n, ( 0, 0.55, 0.52 ), ( 0.17, 0.05, 0.1 ), 'Plastic_Dark', 0.008 )
		k.box( n, ( 0, 0.55, 0.465 ), ( 0.15, 0.03, 0.01 ), 'Plastic_Grey', 0.003 )
		k.box( n, ( 0.0, 0.49, 0.5 ), ( 0.17, 0.05, 0.12 ), 'Metal_Painted', 0.008 )
		for j in range( 4 ): k.box( n, ( - 0.05 + j * 0.033, 0.5, 0.437 ), ( 0.022, 0.03, 0.012 ), 'Lamp_Red' if j == 0 else 'Plastic_Grey', 0.004 )
		# radio handset on its hook
		k.box( n, ( 0.1, floor + 0.45, 0.32 ), ( 0.05, 0.1, 0.035 ), 'Plastic_Dark', 0.012, rot = ( 0.3, 0, 0.2 ) )
		pz = - 0.6
		k.box( n, ( 0, floor + 0.55, pz ), ( half * 2 - 0.06, 0.5, 0.025 ), 'Metal_Painted', 0.008 )
		cage = k.node( 'Cage' )
		k.grid( cage, [ ( half - 0.06, gt[ 2 ] - 0.05, pz - 0.05 ), ( - half + 0.06, gt[ 2 ] - 0.05, pz - 0.05 ), ( - half + 0.04, floor + 0.8, pz ), ( half - 0.04, floor + 0.8, pz ) ], 22, 5, 0.005, 'Metal_Painted' )
		for s in ( 1, - 1 ): k.rod( n, ( s * ( half - 0.04 ), floor + 0.8, pz ), ( s * ( half - 0.06 ), gt[ 2 ] - 0.05, pz - 0.05 ), 0.018, 'Metal_Painted' )
	if kind == 'sedan':
		# a clock in the stack top and wood on the doors
		k.cyl( n, ( 0, dtop - 0.02, 0.555 ), 0.03, 0.03, 0.01, 'Chrome', rot = ( PI / 2 - 0.2, 0, 0 ), seg = 20 )
		for s in ( 1, - 1 ): k.box( n, ( s * ( half - 0.055 ), gb[ 2 ] - 0.1, ( gb[ 0 ] + gb[ 1 ] ) / 2 ), ( 0.012, 0.04, ( gb[ 1 ] - gb[ 0 ] ) * 0.8 ), 'Wood_Walnut', 0.004 )
	wipers( k, ( 0.3, - 0.25 ), ( gb[ 1 ], gb[ 2 ] ), ( gt[ 1 ], gt[ 2 ] ), ( 0.58, 0.52 ) )
	rain_glass( k, ( gb[ 1 ], gb[ 2 ] ), ( gt[ 1 ], gt[ 2 ] ), gb[ 3 ] - 0.01, gt[ 3 ] - 0.01 )
	k.empty( 'Eye', eye )
	return k

# ------------------------------------------------------------------ sports: buckets, carbon, a small flat-bottom wheel with paddles

def sports():
	S = SPECS[ 'sports' ]; L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	gb = ( zr + 1.0, zf - 1.6, 0.82, w - 0.16 ); gt = ( zr + 1.45, zf - 2.25, 1.18, w - 0.36 )
	eye = EYE[ 'sports' ]; ex, ey, ez = eye
	k = Kit( MATS ); n = k.node( 'Cabin' )
	floor = 0.22; half = gb[ 3 ]; cowl = ( gb[ 1 ], gb[ 2 ] )
	k.box( n, ( 0, floor, ( gb[ 0 ] + gb[ 1 ] ) / 2 ), ( half * 2, 0.03, gb[ 1 ] - gb[ 0 ] ), 'Carpet_Dark', 0.0 )
	# a tall transmission tunnel in carbon, the console spine
	k.box( n, ( 0, floor + 0.14, - 0.25 ), ( 0.3, 0.28, 1.4 ), 'Leather_Black', 0.05, 3 )
	k.box( n, ( 0, floor + 0.285, - 0.15 ), ( 0.24, 0.015, 0.9 ), 'Carbon', 0.006 )
	for s in ( 1, - 1 ): k.box( n, ( s * 0.152, floor + 0.2, - 0.25 ), ( 0.006, 0.006, 1.3 ), 'Leather_Red', 0.0 )
	dtop = cowl[ 1 ] + 0.04
	for x0, x1 in ( ( - half + 0.01, - 0.15 ), ( 0.15, half - 0.01 ) ):
		k.hull( n, [ ( x, y, z ) for x in ( x0, x1 ) for ( y, z ) in ( ( cowl[ 1 ] - 0.01, cowl[ 0 ] - 0.01 ), ( dtop, 0.3 ), ( dtop - 0.06, 0.24 ), ( 0.6, 0.24 ), ( 0.45, 0.33 ), ( 0.45, cowl[ 0 ] ) ) ], 'Leather_Black', True )
	# the carbon fascia band and the red stitch line
	k.box( n, ( - 0.25, dtop - 0.075, 0.245 ), ( half * 1.1, 0.06, 0.02 ), 'Carbon', 0.006, rot = ( 0.35, 0, 0 ) )
	k.box( n, ( 0, dtop + 0.003, 0.36 ), ( half * 2 - 0.1, 0.004, 0.004 ), 'Leather_Red', 0.0 )
	# a cowl over a single round-ish cluster
	binnacle( k, n, ex, dtop - 0.04, 0.29, w = 0.38, h = 0.125, tilt = 0.25, mat = 'Leather_Black', sw = 0.3 )
	# centre stack low and angled to the driver, carbon surround
	k.hull( n, [ ( s * 0.15, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( dtop - 0.04, cowl[ 0 ] - 0.05 ), ( dtop - 0.04, 0.3 ), ( 0.62, 0.36 ), ( floor + 0.28, 0.42 ), ( floor + 0.28, cowl[ 0 ] - 0.05 ) ) ], 'Carbon', True )
	screen( k, 'Screen_Stack', ( 0, 0.6, 0.34 ), 0.18, 0.24, pitch = - 0.42 )
	for x in ( half - 0.1, - half + 0.1 ):
		k.cyl( n, ( x, dtop - 0.06, 0.255 ), 0.045, 0.045, 0.03, 'Metal_Brushed', rot = ( PI / 2 - 0.3, 0, 0 ), seg = 18 )
		k.cyl( n, ( x, dtop - 0.06, 0.24 ), 0.035, 0.035, 0.012, 'Plastic_Dark', rot = ( PI / 2 - 0.3, 0, 0 ), seg = 18 )
	wc = ( ex, 0.68, 0.06 )
	k.hull( n, [ ( ex + s * 0.055, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( 0.71, 0.14 ), ( 0.66, 0.3 ), ( 0.58, 0.3 ), ( 0.64, 0.14 ) ) ], 'Leather_Black', True )
	steering( k, eye, wc, 0.165, 0.38, rim = 'Leather_Black', spoke = 'Carbon', spokes = 3, flat = True, paddles = True )
	stalks( k, ( ex, 0.69, 0.14 ), 0.065 )
	pedals( k, ex, floor, 0.5, 0.5, gap = 0.15 )
	# aluminium pedal faces: a drilled look by brushed metal slats (pedals() adds them); a footrest
	k.box( n, ( ex + 0.19, floor + 0.07, 0.5 ), ( 0.08, 0.02, 0.2 ), 'Metal_Brushed', 0.005, rot = ( 0.6, 0, 0 ) )
	# a short gear selector in a carbon gate; the drive-mode dial
	g = k.node( 'Gear', ( 0, floor + 0.3, 0.02 ) )
	k.rod( g, ( 0, 0, 0 ), ( 0, 0.07, 0 ), 0.008, 'Metal_Brushed' )
	k.sphere( g, ( 0, 0.085, 0 ), 0.025, 'Leather_Black', scale = ( 1, 1.1, 1.3 ) )
	k.cyl( n, ( 0, floor + 0.3, - 0.12 ), 0.03, 0.03, 0.02, 'Metal_Brushed', rot = ( PI / 2, 0, 0 ), seg = 20 )
	for x in ( ex, - ex ): seat( k, n, x, ez - 0.02, floor - 0.04, 0.52, 'bucket', 'Leather_Black', 'Leather_Black', h = 0.13, back = 0.6, recline = - 0.32, depth = 0.5 )
	# no rear seats: a carbon bulkhead and a parcel shelf behind the buckets
	k.box( n, ( 0, ( floor + gb[ 2 ] ) / 2 + 0.05, gb[ 0 ] + 0.12 ), ( half * 2, gb[ 2 ] - floor + 0.1, 0.03 ), 'Carbon', 0.008 )
	k.box( n, ( 0, gb[ 2 ] + 0.03, gb[ 0 ] + 0.2 ), ( half * 2, 0.02, 0.2 ), 'Leather_Black', 0.008 )
	door_panels( k, n, half, gb[ 0 ] + 0.05, gb[ 1 ] - 0.06, floor, gb[ 2 ], 'Carbon', 'Leather_Black', 'Leather_Black', 'Metal_Brushed', pocket = False, speaker = True )
	for s in ( 1, - 1 ):
		k.tube( n, [ ( s * ( gb[ 3 ] - 0.03 ), gb[ 2 ] + 0.01, gb[ 1 ] - 0.03 ), ( s * ( gt[ 3 ] - 0.03 ), gt[ 2 ] - 0.03, gt[ 1 ] - 0.01 ) ], 0.03, 'Cloth_Grey' )
		# red harness belts over the seats
		k.slab( n, [ ( s * ( ex - 0.08 ), floor + 0.95, ez - 0.4 ), ( s * ( ex - 0.03 ), floor + 0.95, ez - 0.4 ), ( s * ( ex - 0.04 ), floor + 0.3, ez + 0.05 ), ( s * ( ex - 0.09 ), floor + 0.3, ez + 0.05 ) ], 0.004 * s, 'Leather_Red' )
	k.box( n, ( 0, gt[ 2 ] - 0.02, ( gt[ 0 ] + gt[ 1 ] ) / 2 ), ( gt[ 3 ] * 2 + 0.05, 0.02, gt[ 1 ] - gt[ 0 ] + 0.08 ), 'Cloth_Grey', 0.008 )
	dome( k, n, gt[ 2 ] - 0.03, ( gt[ 0 ] + gt[ 1 ] ) / 2, 0.12 )
	rear_mirror( k, n, 0, gt[ 2 ] - 0.08, gt[ 1 ] + 0.07, 0.2 )
	side_mirror_glass( k, n, w - 0.12 + 0.08, 0.9, gb[ 1 ] - 0.05 - 0.064 )
	wipers( k, ( 0.3, - 0.25 ), ( gb[ 1 ], gb[ 2 ] ), ( gt[ 1 ], gt[ 2 ] ), ( 0.5, 0.45 ) )
	rain_glass( k, ( gb[ 1 ], gb[ 2 ] ), ( gt[ 1 ], gt[ 2 ] ), gb[ 3 ] - 0.01, gt[ 3 ] - 0.01 )
	k.empty( 'Eye', eye )
	return k

# ------------------------------------------------------------------ pickup: a full-width bench, rubber floor, column shifter

def pickup():
	S = SPECS[ 'pickup' ]; L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	cab0 = zf - 2.65
	gb = ( cab0 + 0.05, zf - 1.42, 1.1, w - 0.08 ); gt = ( cab0 + 0.12, zf - 2.05, 1.78, w - 0.2 )
	eye = EYE[ 'pickup' ]; ex, ey, ez = eye
	k = Kit( MATS ); n = k.node( 'Cabin' )
	floor = 0.44; half = gb[ 3 ]; cowl = ( gb[ 1 ], gb[ 2 ] )
	# the rubber floor with ribs, the back wall of the cab
	k.box( n, ( 0, floor, ( gb[ 0 ] + gb[ 1 ] ) / 2 ), ( half * 2, 0.03, gb[ 1 ] - gb[ 0 ] ), 'Rubber_Floor', 0.0 )
	for j in range( 10 ): k.box( n, ( 0, floor + 0.018, gb[ 0 ] + 0.25 + j * 0.085 ), ( half * 1.8, 0.008, 0.02 ), 'Rubber_Floor', 0.003 )
	k.box( n, ( 0, ( floor + gb[ 2 ] ) / 2, gb[ 0 ] + 0.04 ), ( half * 2, gb[ 2 ] - floor, 0.03 ), 'Plastic_Grey', 0.008 )
	dtop = cowl[ 1 ] + 0.03
	# a plain painted-metal dash with a plastic top: two sections, no stack
	k.hull( n, [ ( s * ( half - 0.01 ), y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( cowl[ 1 ] - 0.01, cowl[ 0 ] - 0.01 ), ( dtop, 0.9 ), ( dtop - 0.05, 0.84 ), ( 0.9, 0.84 ), ( 0.78, 0.94 ), ( 0.78, cowl[ 0 ] ) ) ], 'Plastic_Grey', True )
	k.box( n, ( 0, dtop + 0.005, 1.02 ), ( half * 2 - 0.04, 0.03, 0.34 ), 'SoftTouch_Dark', 0.012, rot = ( 0.1, 0, 0 ) )
	binnacle( k, n, ex, dtop - 0.05, 0.84, w = 0.46, h = 0.15, tilt = 0.12, mat = 'Plastic_Dark', sw = 0.38 )
	screen( k, 'Screen_Stack', ( - 0.06, 0.98, 0.826 ), 0.2, 0.267, pitch = 0.0 )
	k.box( n, ( - half * 0.6, 0.95, 0.84 ), ( 0.4, 0.13, 0.02 ), 'Plastic_Dark', 0.01 )  # glovebox
	for x in ( half - 0.12, - half + 0.12 ): k.box( n, ( x, dtop - 0.08, 0.835 ), ( 0.1, 0.06, 0.02 ), 'Plastic_Dark', 0.01 )
	wc = ( ex, 1.0, 0.6 )
	k.hull( n, [ ( ex + s * 0.06, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( 1.02, 0.7 ), ( 0.98, 0.86 ), ( 0.9, 0.86 ), ( 0.95, 0.7 ) ) ], 'Plastic_Dark', True )
	steering( k, eye, wc, 0.2, 0.5, rim = 'Rubber_Black', spoke = 'Plastic_Grey', spokes = 2 )
	stalks( k, ( ex, 1.0, 0.68 ) )
	# the column shifter (Gear pivots on the column's right)
	g = k.node( 'Gear', ( ex - 0.07, 1.0, 0.7 ) )
	k.rod( g, ( 0, 0, 0 ), ( - 0.2, 0.02, - 0.05 ), 0.008, 'Chrome' )
	k.sphere( g, ( - 0.21, 0.02, - 0.055 ), 0.02, 'Plastic_Dark' )
	pedals( k, ex, floor, 0.98, 0.84 )
	# the bench seat in brown vinyl with pleats, one piece across the cab
	bench( k, n, - half + 0.04, half - 0.04, 0.48, floor, 'Vinyl_Brown', 'Vinyl_Black', back = 0.6, depth = 0.45, pleats = 6, recline = - 0.08 )
	for x in ( ex, - ex ): k.box( n, ( x, floor + 1.02, gb[ 0 ] + 0.12 ), ( 0.3, 0.18, 0.09 ), 'Vinyl_Brown', 0.04, 3 )
	door_panels( k, n, half, gb[ 0 ] + 0.03, gb[ 1 ] - 0.06, floor, gb[ 2 ], 'Plastic_Grey', 'Plastic_Grey', 'Plastic_Dark', 'Plastic_Dark', pocket = False, speaker = False )
	for s in ( 1, - 1 ):
		# the window crank on each door
		k.cyl( n, ( s * ( half - 0.06 ), gb[ 2 ] - 0.25, ( gb[ 0 ] + gb[ 1 ] ) / 2 ), 0.025, 0.025, 0.02, 'Chrome', rot = ( 0, 0, PI / 2 ), seg = 12 )
		k.rod( n, ( s * ( half - 0.07 ), gb[ 2 ] - 0.25, ( gb[ 0 ] + gb[ 1 ] ) / 2 ), ( s * ( half - 0.07 ), gb[ 2 ] - 0.33, ( gb[ 0 ] + gb[ 1 ] ) / 2 + 0.03 ), 0.007, 'Chrome' )
		k.tube( n, [ ( s * ( gb[ 3 ] - 0.03 ), gb[ 2 ] + 0.01, gb[ 1 ] - 0.03 ), ( s * ( gt[ 3 ] - 0.03 ), gt[ 2 ] - 0.03, gt[ 1 ] - 0.01 ) ], 0.035, 'Plastic_Grey' )
	k.box( n, ( 0, gt[ 2 ] - 0.025, ( gt[ 0 ] + gt[ 1 ] ) / 2 ), ( gt[ 3 ] * 2 + 0.05, 0.02, gt[ 1 ] - gt[ 0 ] + 0.08 ), 'Headliner_Light', 0.008 )
	for s in ( 1, - 1 ): k.box( n, ( s * 0.35, gt[ 2 ] - 0.045, gt[ 1 ] - 0.08 ), ( 0.36, 0.018, 0.15 ), 'Vinyl_Grey', 0.008 )
	dome( k, n, gt[ 2 ] - 0.035, ( gt[ 0 ] + gt[ 1 ] ) / 2 )
	rear_mirror( k, n, 0, gt[ 2 ] - 0.1, gt[ 1 ] + 0.1, 0.24 )
	side_mirror_glass( k, n, w - 0.03 + 0.08, 1.2, gb[ 1 ] - 0.1 - 0.064 )
	# a gun-rack-free back window, a toolbox under the bench, a fire extinguisher by the passenger's feet
	k.cyl( n, ( - half + 0.15, floor + 0.17, gb[ 1 ] - 0.3 ), 0.05, 0.05, 0.32, 'Lamp_Red', rot = ( 0, 0, 0 ), seg = 14 )
	wipers( k, ( 0.32, - 0.27 ), ( gb[ 1 ], gb[ 2 ] ), ( gt[ 1 ], gt[ 2 ] ), ( 0.6, 0.55 ) )
	rain_glass( k, ( gb[ 1 ], gb[ 2 ] ), ( gt[ 1 ], gt[ 2 ] ), gb[ 3 ] - 0.01, gt[ 3 ] - 0.01 )
	k.empty( 'Eye', eye )
	return k

# ------------------------------------------------------------------ van: a cab-forward utility cab, a bulkhead and the cargo bay

def van():
	S = SPECS[ 'van' ]; L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	box_end = zf - 1.75
	gb = ( box_end, zf - 1.0, 0.98, w - 0.04 ); gt = ( box_end, zf - 1.5, 2.15, w - 0.12 )
	eye = EYE[ 'van' ]; ex, ey, ez = eye
	k = Kit( MATS ); n = k.node( 'Cabin' )
	floor = 0.4; half = gb[ 3 ] - 0.02; cowl = ( gb[ 1 ], gb[ 2 ] )
	k.box( n, ( 0, floor, ( box_end + zf - 0.6 ) / 2 ), ( half * 2, 0.03, zf - 0.6 - box_end ), 'Rubber_Floor', 0.0 )
	# the engine cover between the seats (cab-forward)
	k.box( n, ( 0, floor + 0.2, 1.25 ), ( 0.42, 0.4, 0.75 ), 'Plastic_Grey', 0.06, 3 )
	k.box( n, ( 0, floor + 0.41, 1.2 ), ( 0.36, 0.02, 0.4 ), 'Rubber_Black', 0.01 )
	dtop = 1.28
	# a deep, flat utility dash under the near-vertical screen; trays on top
	k.hull( n, [ ( s * ( half - 0.01 ), y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( cowl[ 1 ] + 0.02, cowl[ 0 ] - 0.04 ), ( dtop, 1.4 ), ( dtop, 1.33 ), ( dtop - 0.08, 1.28 ), ( 0.75, 1.4 ), ( 0.75, cowl[ 0 ] - 0.04 ) ) ], 'Plastic_Grey', True )
	for x in ( - 0.55, - 0.18 ): k.box( n, ( x, dtop + 0.02, 1.36 ), ( 0.3, 0.04, 0.08 ), 'Plastic_Dark', 0.01 )
	binnacle( k, n, ex, dtop - 0.01, 1.29, w = 0.36, h = 0.11, tilt = 0.35, depth = 0.05, mat = 'Plastic_Dark', sw = 0.3 )
	screen( k, 'Screen_Stack', ( - 0.02, 1.1, 1.27 ), 0.18, 0.24, pitch = - 0.3 )
	# a flat, bus-like wheel close to the chest, a long column
	wc = ( ex, 1.14, 1.2 )
	k.hull( n, [ ( ex + s * 0.06, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( 1.09, 1.24 ), ( 0.98, 1.36 ), ( 0.9, 1.36 ), ( 1.02, 1.24 ) ) ], 'Plastic_Dark', True )
	steering( k, eye, wc, 0.2, 1.05, rim = 'Plastic_Dark', spoke = 'Plastic_Grey', spokes = 2 )
	stalks( k, ( ex, 1.07, 1.27 ) )
	g = k.node( 'Gear', ( 0.18, 1.02, 1.36 ) )
	k.rod( g, ( 0, 0, 0 ), ( 0, 0.12, - 0.05 ), 0.009, 'Plastic_Dark' )
	k.sphere( g, ( 0, 0.13, - 0.055 ), 0.025, 'Plastic_Dark' )
	k.box( n, ( 0.18, 1.0, 1.38 ), ( 0.1, 0.05, 0.12 ), 'Plastic_Dark', 0.015 )
	pedals( k, ex, floor, 1.42, 0.78 )
	for x in ( ex, - ex ): seat( k, n, x, ez - 0.02, floor, 0.48, 'cloth', 'Vinyl_Grey', 'Vinyl_Black', h = 0.24, back = 0.62, recline = - 0.16 )
	# the bulkhead with its window, then the cargo bay: shelving, boxes, straps, floor rails
	bz = box_end + 0.03
	k.box( n, ( 0, ( floor + 1.3 ) / 2, bz ), ( half * 2, 1.3 - floor, 0.03 ), 'Metal_Painted', 0.006 )
	k.box( n, ( 0, 1.98, bz ), ( half * 2, 0.36, 0.03 ), 'Metal_Painted', 0.006 )
	for s in ( 1, - 1 ): k.box( n, ( s * ( half - 0.2 ), 1.48, bz ), ( 0.4, 0.36, 0.03 ), 'Metal_Painted', 0.006 )
	for j in range( 5 ): k.box( n, ( 0, floor + 0.12 + j * 0.18, bz + 0.02 ), ( half * 2 - 0.05, 0.03, 0.012 ), 'Metal_Painted', 0.004 )
	b = k.node( 'Bulkhead' )
	k.quad( b, [ ( half - 0.4, 1.66, bz ), ( - half + 0.4, 1.66, bz ), ( - half + 0.4, 1.3, bz ), ( half - 0.4, 1.3, bz ) ], 'Glass_Partition' )
	cz0, cz1 = zr + 0.15, box_end - 0.05
	k.box( n, ( 0, 0.99, ( cz0 + cz1 ) / 2 ), ( W - 0.12, 0.02, cz1 - cz0 ), 'Rubber_Floor', 0.0 )
	for x in ( - 0.5, 0, 0.5 ): k.box( n, ( x, 1.01, ( cz0 + cz1 ) / 2 ), ( 0.04, 0.02, cz1 - cz0 ), 'Metal_Brushed', 0.004 )
	k.box( n, ( 0, 2.28, ( cz0 + cz1 ) / 2 ), ( W - 0.12, 0.02, cz1 - cz0 ), 'Headliner_Light', 0.0 )
	for s in ( 1, - 1 ):
		k.box( n, ( s * ( w - 0.07 ), 1.65, ( cz0 + cz1 ) / 2 ), ( 0.02, 1.3, cz1 - cz0 ), 'Plastic_Bus', 0.0 )
		# shelving down the right wall, boxes on it
		if s < 0:
			for y in ( 1.3, 1.75, 2.15 ): k.box( n, ( s * ( w - 0.3 ), y, ( cz0 + cz1 ) / 2 + 0.3 ), ( 0.42, 0.025, 2.4 ), 'Metal_Painted', 0.006 )
			for zz in ( cz0 + 0.95, cz0 + 1.65, cz0 + 2.35, cz0 + 3.05 ): k.rod( n, ( s * ( w - 0.1 ), 1.0, zz ), ( s * ( w - 0.1 ), 2.2, zz ), 0.015, 'Metal_Painted' ) or k.rod( n, ( s * ( w - 0.5 ), 1.0, zz ), ( s * ( w - 0.5 ), 2.2, zz ), 0.015, 'Metal_Painted' )
			for i, ( y, zz, sx, sy, sz ) in enumerate( ( ( 1.31, cz0 + 1.1, 0.36, 0.3, 0.4 ), ( 1.31, cz0 + 1.6, 0.34, 0.24, 0.42 ), ( 1.76, cz0 + 1.3, 0.38, 0.32, 0.5 ), ( 1.76, cz0 + 2.3, 0.3, 0.22, 0.3 ), ( 2.16, cz0 + 2.0, 0.34, 0.1, 0.6 ) ) ):
				k.box( n, ( s * ( w - 0.3 ), y + sy / 2 + 0.013, zz ), ( sx, sy, sz ), 'Cardboard', 0.01 )
	# a stack of parcels strapped to the left wall and a hand truck
	for i, ( x, y, zz, sx, sy, sz ) in enumerate( ( ( 0.55, 1.2, cz0 + 0.9, 0.5, 0.4, 0.55 ), ( 0.55, 1.6, cz0 + 0.95, 0.45, 0.4, 0.5 ), ( 0.5, 1.2, cz0 + 1.6, 0.55, 0.42, 0.6 ), ( 0.2, 1.17, cz0 + 2.4, 0.4, 0.34, 0.4 ) ) ):
		k.box( n, ( x, y, zz ), ( sx, sy, sz ), 'Cardboard', 0.01, rot = ( 0, 0.05 * ( i - 1 ), 0 ) )
	k.slab( n, [ ( w - 0.09, 1.95, cz0 + 0.6 ), ( w - 0.09, 1.95, cz0 + 0.65 ), ( 0.3, 1.82, cz0 + 0.65 ), ( 0.3, 1.82, cz0 + 0.6 ) ], 0.004, 'Strap_Orange' )
	k.slab( n, [ ( w - 0.09, 1.95, cz0 + 1.85 ), ( w - 0.09, 1.95, cz0 + 1.9 ), ( 0.22, 1.42, cz0 + 1.9 ), ( 0.22, 1.42, cz0 + 1.85 ) ], 0.004, 'Strap_Orange' )
	k.tube( n, [ ( - 0.1, 1.02, cz0 + 3.3 ), ( - 0.1, 2.1, cz0 + 3.2 ) ], 0.015, 'Metal_Painted' )
	k.tube( n, [ ( 0.25, 1.02, cz0 + 3.3 ), ( 0.25, 2.1, cz0 + 3.2 ) ], 0.015, 'Metal_Painted' )
	k.box( n, ( 0.075, 1.04, cz0 + 3.42 ), ( 0.4, 0.02, 0.25 ), 'Metal_Painted', 0.004 )
	# cargo lamps
	for zz in ( cz0 + 0.8, cz0 + 2.4 ): k.box( n, ( 0, 2.26, zz ), ( 0.3, 0.03, 0.12 ), 'Lamp_Dome', 0.01 )
	door_panels( k, n, half, box_end + 0.05, zf - 1.05, floor, gb[ 2 ] + 0.2, 'Plastic_Grey', 'Plastic_Grey', 'Plastic_Dark', 'Plastic_Dark', pocket = True, speaker = False )
	for s in ( 1, - 1 ):
		k.tube( n, [ ( s * ( gb[ 3 ] - 0.04 ), gb[ 2 ] + 0.05, gb[ 1 ] - 0.05 ), ( s * ( gt[ 3 ] - 0.04 ), gt[ 2 ] - 0.04, gt[ 1 ] - 0.02 ) ], 0.04, 'Plastic_Grey' )
		# a grab handle on the A pillar
		k.tube( n, [ ( s * ( gb[ 3 ] - 0.1 ), 1.5, 1.4 ), ( s * ( gb[ 3 ] - 0.13 ), 1.55, 1.38 ), ( s * ( gb[ 3 ] - 0.13 ), 1.75, 1.3 ), ( s * ( gb[ 3 ] - 0.1 ), 1.8, 1.28 ) ], 0.014, 'Plastic_Dark' )
	k.box( n, ( 0, gt[ 2 ] - 0.025, ( box_end + gt[ 1 ] ) / 2 ), ( gt[ 3 ] * 2, 0.02, gt[ 1 ] - box_end + 0.04 ), 'Headliner_Light', 0.008 )
	# the overhead shelf over the windscreen (a van classic)
	k.box( n, ( 0, gt[ 2 ] - 0.1, gt[ 1 ] - 0.05 ), ( gt[ 3 ] * 2 - 0.05, 0.03, 0.3 ), 'Plastic_Grey', 0.01 )
	k.box( n, ( 0, gt[ 2 ] - 0.07, gt[ 1 ] - 0.18 ), ( gt[ 3 ] * 2 - 0.05, 0.08, 0.02 ), 'Plastic_Grey', 0.006 )
	for s in ( 1, - 1 ): k.box( n, ( s * 0.38, gt[ 2 ] - 0.135, gt[ 1 ] - 0.02 ), ( 0.36, 0.018, 0.15 ), 'Vinyl_Grey', 0.008, rot = ( - 0.3, 0, 0 ) )
	dome( k, n, gt[ 2 ] - 0.035, ( box_end + gt[ 1 ] ) / 2 )
	side_mirror_glass( k, n, w - 0.02 + 0.08, 1.3, zf - 1.15 - 0.064 )
	wipers( k, ( 0.35, - 0.3 ), ( gb[ 1 ], gb[ 2 ] ), ( gt[ 1 ], gt[ 2 ] ), ( 0.75, 0.7 ) )
	rain_glass( k, ( gb[ 1 ], gb[ 2 ] ), ( gt[ 1 ], gt[ 2 ] ), gb[ 3 ] - 0.01, gt[ 3 ] - 0.01 )
	k.empty( 'Eye', eye )
	return k

# ------------------------------------------------------------------ bus: the driver's cab, ticket machine, passenger rows

def bus():
	S = SPECS[ 'bus' ]; L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	eye = EYE[ 'bus' ]; ex, ey, ez = eye
	k = Kit( MATS ); n = k.node( 'Cabin' )
	floor = 0.75; inner = w - 0.08; ceil = 2.62; belt = 1.24
	k.box( n, ( 0, floor, 0 ), ( inner * 2, 0.03, L - 0.3 ), 'Rubber_Floor', 0.0 )
	for z in [ zr + 0.5 + i * 0.25 for i in range( int( ( L - 1.0 ) / 0.25 ) ) ]: k.box( n, ( 0, floor + 0.017, z ), ( 0.7, 0.006, 0.03 ), 'Rubber_Floor', 0.002 )
	k.box( n, ( 0, floor + 0.016, 0 ), ( 0.05, 0.006, L - 1.0 ), 'Metal_Yellow', 0.0 )
	k.box( n, ( 0, ceil, 0 ), ( inner * 2, 0.03, L - 0.3 ), 'Plastic_Bus', 0.0 )
	for s in ( 1, - 1 ):
		k.box( n, ( s * inner, ( floor + belt ) / 2, 0 ), ( 0.04, belt - floor, L - 0.3 ), 'Plastic_Bus', 0.0 )
		# the light strips (emissive at night by the dome lamp material), the ad panels over the windows
		k.box( n, ( s * ( inner - 0.35 ), ceil - 0.025, - 0.3 ), ( 0.12, 0.02, L - 2.4 ), 'Lamp_Dome', 0.006 )
		k.hull( n, [ ( s * inner, ceil, zr + 0.3 ), ( s * inner, ceil, zf - 1.6 ), ( s * ( inner - 0.25 ), ceil, zr + 0.3 ), ( s * ( inner - 0.25 ), ceil, zf - 1.6 ), ( s * inner, 2.42, zr + 0.3 ), ( s * inner, 2.42, zf - 1.6 ) ], 'Plastic_Bus' )
		# the overhead grab rail
		k.rod( n, ( s * 0.42, 2.3, zr + 0.6 ), ( s * 0.42, 2.3, zf - 1.8 ), 0.017, 'Metal_Yellow' )
	# passenger rows: two-and-two seats in moquette on plastic shells, poles at every other row, stop buttons
	rows = [ zf - 2.6 - i * 0.8 for i in range( 10 ) ]
	for i, z in enumerate( rows ):
		for s in ( 1, - 1 ):
			if s < 0 and ( zf - 2.0 > z > zf - 3.0 or 0.2 > z > - 1.2 ):
				continue  # (the doors' wells on the kerb side)
			for j in ( 0, 1 ):
				x = s * ( inner - 0.25 - j * 0.45 )
				k.box( n, ( x, floor + 0.42, z ), ( 0.42, 0.06, 0.42 ), 'Plastic_Seat', 0.025 )
				k.box( n, ( x, floor + 0.47, z + 0.01 ), ( 0.38, 0.05, 0.36 ), 'Cloth_Bus', 0.02, 3 )
				k.box( n, ( x, floor + 0.75, z - 0.22 ), ( 0.42, 0.6, 0.05 ), 'Plastic_Seat', 0.025, rot = ( - 0.12, 0, 0 ) )
				k.box( n, ( x, floor + 0.75, z - 0.19 ), ( 0.36, 0.5, 0.02 ), 'Cloth_Bus', 0.01, rot = ( - 0.12, 0, 0 ) )
				k.rod( n, ( x, floor, z ), ( x, floor + 0.4, z ), 0.025, 'Metal_Painted' )
			k.rod( n, ( s * ( inner - 0.25 - 0.45 - 0.24 ), floor + 0.75, z - 0.22 ), ( s * ( inner - 0.25 - 0.45 - 0.24 ), floor + 1.08, z - 0.24 ), 0.016, 'Metal_Yellow' )
			if i % 2 == 0:
				px = s * ( inner - 0.95 )
				k.rod( n, ( px, floor + 1.0, z - 0.25 ), ( px, ceil, z - 0.25 ), 0.018, 'Metal_Yellow' )
				k.box( n, ( px, 1.85, z - 0.22 ), ( 0.05, 0.08, 0.03 ), 'Lamp_Red', 0.01 )
	# the wheelchair bay's fold-down bench and belt on the kerb side, middle
	k.box( n, ( - ( inner - 0.1 ), floor + 0.7, - 0.5 ), ( 0.08, 0.5, 0.9 ), 'Plastic_Bus', 0.02 )
	# ---- the driver's cab: wide dash, flat wheel, a partition with its glass, the ticket machine on it
	dz = zf - 0.42
	k.hull( n, [ ( s * ( inner - 0.01 ), y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( belt + 0.05, zf - 0.12 ), ( belt + 0.12, dz ), ( belt + 0.08, dz - 0.08 ), ( floor + 0.45, dz - 0.05 ), ( floor + 0.05, dz ), ( floor + 0.05, zf - 0.12 ) ) ], 'Plastic_Dark', True )
	# the driver's console rises to a proper bus dash height round the wheel
	k.hull( n, [ ( ex + s * 0.36, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( belt + 0.05, zf - 0.12 ), ( 1.58, zf - 0.3 ), ( 1.58, 4.98 ), ( 1.45, 4.9 ), ( floor + 0.1, 4.95 ), ( floor + 0.1, zf - 0.12 ) ) ], 'Plastic_Dark', True )
	binnacle( k, n, ex, 1.58, 5.0, w = 0.5, h = 0.16, tilt = 0.5, depth = 0.2, mat = 'Plastic_Dark', sw = 0.42 )
	k.hull( n, [ ( ex - 0.37 + s * 0.12, y, z ) for s in ( - 1, 1 ) for ( y, z ) in ( ( belt + 0.05, zf - 0.12 ), ( 1.55, zf - 0.3 ), ( 1.55, 4.96 ), ( floor + 0.1, 4.95 ), ( floor + 0.1, zf - 0.12 ) ) ], 'Plastic_Dark', True )
	screen( k, 'Screen_Stack', ( ex - 0.37, 1.62, 5.02 ), 0.2, 0.267, pitch = 0.75, yaw = 0.3 )
	# the switch bank to the driver's left (doors, kneel, lights): physical rockers
	k.box( n, ( ex + 0.47, 1.5, 4.92 ), ( 0.2, 0.06, 0.16 ), 'Plastic_Dark', 0.01 )
	for i in range( 8 ): k.box( n, ( ex + 0.4 + ( i % 4 ) * 0.045, 1.535, 4.88 + ( i // 4 ) * 0.06 ), ( 0.03, 0.02, 0.04 ), 'Lamp_Red' if i == 0 else 'Plastic_Grey', 0.005 )
	wc = ( ex, 1.5, 4.76 )
	k.rod( n, ( ex, floor + 0.05, 4.95 ), ( ex, 1.46, 4.8 ), 0.05, 'Plastic_Dark' )
	steering( k, eye, wc, 0.25, 1.1, rim = 'Plastic_Dark', spoke = 'Plastic_Grey', spokes = 2 )
	stalks( k, ( ex, 1.45, 4.82 ), 0.1 )
	pedals( k, ex, floor, dz - 0.25, floor + 0.35, gap = 0.22 )
	# the driver's seat on its pedestal
	seat( k, n, ex, ez - 0.05, floor + 0.2, 0.52, 'cloth', 'Cloth_Bus', 'Vinyl_Black', h = 0.24, back = 0.68, recline = - 0.14 )
	k.cyl( n, ( ex, floor + 0.12, ez - 0.05 ), 0.12, 0.16, 0.24, 'Metal_Painted', seg = 16 )
	# the gear buttons (D N R) on a pod to the driver's left
	g = k.node( 'Gear', ( ex + 0.38, belt - 0.05, ez + 0.12 ) )
	k.box( g, ( 0, 0.03, 0 ), ( 0.08, 0.02, 0.06 ), 'Plastic_Grey', 0.008 )
	k.box( n, ( ex + 0.38, belt - 0.15, ez + 0.12 ), ( 0.14, 0.2, 0.16 ), 'Plastic_Dark', 0.02 )
	# cab partition behind and to the right of the driver, half glazed
	pz = ez - 0.45
	k.box( n, ( ex - 0.02, floor + 0.5, pz ), ( 0.92, 1.0, 0.03 ), 'Plastic_Bus', 0.01 )
	k.box( n, ( ex - 0.52, floor + 0.55, ( pz + 4.85 ) / 2 ), ( 0.03, 1.1, 4.85 - pz ), 'Plastic_Bus', 0.01 )
	k.rod( n, ( ex - 0.47, floor + 1.1, pz ), ( ex - 0.47, ceil, pz ), 0.02, 'Metal_Yellow' )
	k.rod( n, ( ex + 0.43, floor + 1.0, pz ), ( ex + 0.43, ceil, pz ), 0.02, 'Metal_Yellow' )
	p = k.node( 'Partition' )
	k.quad( p, [ ( ex - 0.47, ceil - 0.1, pz ), ( ex + 0.43, ceil - 0.1, pz ), ( ex + 0.43, floor + 1.0, pz ), ( ex - 0.47, floor + 1.0, pz ) ], 'Glass_Partition' )
	# the ticket machine on the partition's front, facing the boarding passengers (Screen_Aux is its display)
	tz = ez + 0.25
	k.box( n, ( ex - 0.6, floor + 1.0, tz ), ( 0.12, 0.42, 0.3 ), 'Metal_Brushed', 0.02 )
	k.box( n, ( ex - 0.67, floor + 0.86, tz ), ( 0.03, 0.06, 0.16 ), 'Plastic_Dark', 0.008 )
	k.box( n, ( ex - 0.67, floor + 1.02, tz - 0.08 ), ( 0.02, 0.1, 0.1 ), 'Plastic_Grey', 0.006 )
	screen( k, 'Screen_Aux', ( ex - 0.67, floor + 1.14, tz + 0.03 ), 0.2, 0.08, pitch = 0.0, yaw = - PI / 2 + 0.35, bezel = 'Plastic_Dark' )
	# the windscreen's sun blind, the destination box over it, the big mirrors inside
	k.box( n, ( 0, ceil - 0.05, zf - 0.22 ), ( inner * 2, 0.1, 0.28 ), 'Plastic_Dark', 0.02 )
	k.cyl( n, ( ex, ceil - 0.12, zf - 0.2 ), 0.035, 0.035, 0.9, 'Plastic_Grey', rot = ( 0, 0, PI / 2 ), seg = 12 )
	rear_mirror( k, n, - 0.2, ceil - 0.2, zf - 0.4, 0.4 )
	dome( k, n, ceil - 0.01, ez, 0.2 )
	for s in ( 1, - 1 ): k.quad( n, [ ( s * ( w + 0.3 ) + 0.1, 2.05, zf - 0.05 ), ( s * ( w + 0.3 ) - 0.1, 2.05, zf - 0.05 ), ( s * ( w + 0.3 ) - 0.1, 1.75, zf - 0.05 ), ( s * ( w + 0.3 ) + 0.1, 1.75, zf - 0.05 ) ], 'Mirror' )
	for s in ( 1, - 1 ):
		k.rod( n, ( s * w, 2.2, zf - 0.15 ), ( s * ( w + 0.3 ), 2.1, zf - 0.08 ), 0.02, 'Plastic_Dark' )
		k.box( n, ( s * ( w + 0.3 ), 1.9, zf - 0.04 ), ( 0.24, 0.36, 0.05 ), 'Plastic_Dark', 0.02 )
	wipers( k, ( 0.6, - 0.3 ), ( zf - 0.02, belt ), ( zf - 0.1, 3.0 ), ( 1.0, 0.95 ) )
	rain_glass( k, ( zf - 0.02, belt ), ( zf - 0.1, 3.0 ), w - 0.04, w - 0.08, inset = 0.03 )
	k.empty( 'Eye', eye )
	return k

BUILD = { 'sedan': lambda: sedan_family( 'sedan' ), 'taxi': lambda: sedan_family( 'taxi' ), 'police': lambda: sedan_family( 'police' ),
	'pickup': pickup, 'van': van, 'sports': sports, 'bus': bus }

for kind in ( BUILD.keys() if WHICH == 'all' else WHICH.split( ',' ) ):
	k = BUILD[ kind ]()
	path = os.path.join( OUT, 'interior-' + kind + '.glb' )
	k.export( path )
	tris = sum( len( p.vertices ) - 2 for o in bpy.context.scene.objects if o.type == 'MESH' for p in o.data.polygons )
	print( 'INTERIOR', kind, path, os.path.getsize( path ), 'bytes', tris, 'tris', len( [ o for o in bpy.context.scene.objects if o.type == 'MESH' ] ), 'meshes' )
