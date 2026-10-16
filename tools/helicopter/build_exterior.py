# The coastal rescue helicopter's exterior (wave 25E), built headless:
#   D:\blender\blender.exe -b --factory-startup -P tools/helicopter/build_exterior.py -- [outDir]
# -> public/models/helicopter/exterior.glb (original work, CC0 like the rest of the project's Blender output).
#
# Frame: src/features/helicopter/Model.js's model frame (+X left, +Y up, +Z the nose, origin at the skid sole under the
# mast's plane). The glazing (the bubble, its skirt, the chin windows) stays Model.js's own transparent meshes and the
# cockpit GLB (tools/helicopter/build_cockpit.py) furnishes the cabin: this file builds everything opaque around them:
# - Fuselage: the cabin tub as plan-view rings from the keel up to the skirt's lower edge (open where the chin windows
#   are), the aft fairing, the engine bay and the tail boom as one loft of cross sections along z, the transmission
#   cowl, the dorsal fin, the swept vertical fin, the stabiliser with its endplates, the skids on bent cross tubes, steps,
#   exhausts, the rescue hoist, antennas, the searchlight turret, door frames and handles, the rescue livery bands.
# - MainRotor (node at the hub 0, 3.19, -0.4): a hub with four tapered, twisted blades with tip caps (Model.js spins it).
# - TailRotor (node at 0.24, 2.25, -6.95): a two-blade rotor about local X.
# Materials (flat colours): Heli_Jade, Heli_Cream, Heli_Orange, Heli_Black, Heli_Metal, Heli_Dark, Heli_Blade.
import bpy, bmesh, math, sys, os, json
from mathutils import Vector

ROOT = os.path.abspath( os.path.join( os.path.dirname( __file__ ), '..', '..' ) )
argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
OUT = argv[ 0 ] if argv else os.path.join( ROOT, 'public', 'models', 'helicopter' )
os.makedirs( OUT, exist_ok = True )
PI = math.pi

COLORS = {
	'Heli_Jade': ( ( 0.035, 0.36, 0.34 ), 0.32, 0.25 ), 'Heli_Cream': ( ( 0.9, 0.82, 0.62 ), 0.38, 0.1 ), 'Heli_Orange': ( ( 0.85, 0.25, 0.04 ), 0.34, 0.1 ),
	'Heli_Black': ( ( 0.02, 0.022, 0.025 ), 0.5, 0.0 ), 'Heli_Metal': ( ( 0.62, 0.64, 0.66 ), 0.32, 0.9 ), 'Heli_Dark': ( ( 0.06, 0.065, 0.07 ), 0.45, 0.6 ),
	'Heli_Blade': ( ( 0.07, 0.075, 0.08 ), 0.38, 0.3 ),
}
MATS = {}
for name, ( col, rough, metal ) in COLORS.items():
	m = bpy.data.materials.new( name ); m.use_nodes = True
	b = m.node_tree.nodes[ 'Principled BSDF' ]
	b.inputs[ 'Base Color' ].default_value = ( *col, 1 ); b.inputs[ 'Roughness' ].default_value = rough; b.inputs[ 'Metallic' ].default_value = metal
	MATS[ name ] = m
ORDER = list( COLORS.keys() )

def B( p ): return Vector( ( p[ 0 ], - p[ 2 ], p[ 1 ] ) )
def lerp( a, b, t ): return a + ( b - a ) * t
def smooth( a, b, x ):
	t = max( 0.0, min( 1.0, ( x - a ) / ( b - a ) ) ); return t * t * ( 3 - 2 * t )

def newell( ps ):
	n = Vector( ( 0, 0, 0 ) )
	for i in range( len( ps ) ):
		a, b = ps[ i ], ps[ ( i + 1 ) % len( ps ) ]
		n.x += ( a.y - b.y ) * ( a.z + b.z ); n.y += ( a.z - b.z ) * ( a.x + b.x ); n.z += ( a.x - b.x ) * ( a.y + b.y )
	return n

class Mesh:
	def __init__( self ):
		self.bm = bmesh.new()
	def face( self, pts, mat, out = None, smooth_ = True ):
		ps = [ Vector( p ) for p in pts ]
		if out is not None:
			n = newell( ps )
			if n.length < 1e-12: return None
			if n.dot( Vector( out ) ) < 0: ps = ps[ :: - 1 ]
		try: f = self.bm.faces.new( [ self.bm.verts.new( B( p ) ) for p in ps ] )
		except ValueError: return None
		f.material_index = ORDER.index( mat ); f.smooth = smooth_
		return f
	def loft( self, rings, mat, cap = True, cells = None, closed = True ):
		cs = [ sum( ( Vector( p ) for p in r ), Vector() ) / len( r ) for r in rings ]
		n = len( rings[ 0 ] )
		for i in range( len( rings ) - 1 ):
			for k in range( n if closed else n - 1 ):
				q = [ rings[ i ][ k ], rings[ i ][ ( k + 1 ) % n ], rings[ i + 1 ][ ( k + 1 ) % n ], rings[ i + 1 ][ k ] ]
				c = sum( ( Vector( p ) for p in q ), Vector() ) / 4
				mm = cells( i, k, c ) if cells else mat
				if mm: self.face( q, mm, out = c - ( cs[ i ] + cs[ i + 1 ] ) / 2 )
		if cap:
			self.face( rings[ 0 ], mat, out = cs[ 0 ] - cs[ 1 ] )
			self.face( rings[ - 1 ], mat, out = cs[ - 1 ] - cs[ - 2 ] )
	def tube( self, a, b, r, mat, seg = 10, cap = True ):
		a, b = Vector( a ), Vector( b ); d = ( b - a ).normalized()
		u = d.cross( Vector( ( 0, 1, 0 ) ) if abs( d.y ) < 0.9 else Vector( ( 1, 0, 0 ) ) ).normalized(); v = d.cross( u )
		ring = lambda c: [ tuple( c + ( u * math.cos( t ) + v * math.sin( t ) ) * r ) for t in [ i / seg * 2 * PI for i in range( seg ) ] ]
		self.loft( [ ring( a ), ring( b ) ], mat, cap = cap )
	def path( self, pts, r, mat, seg = 10 ):
		# a bent tube through points (ring orientation from each segment), capped
		P = [ Vector( p ) for p in pts ]
		rings = []
		for i, p in enumerate( P ):
			d = ( P[ min( i + 1, len( P ) - 1 ) ] - P[ max( i - 1, 0 ) ] ).normalized()
			u = d.cross( Vector( ( 0, 1, 0 ) ) if abs( d.y ) < 0.9 else Vector( ( 1, 0, 0 ) ) ).normalized(); v = d.cross( u )
			rings.append( [ tuple( p + ( u * math.cos( t ) + v * math.sin( t ) ) * r ) for t in [ j / seg * 2 * PI for j in range( seg ) ] ] )
		self.loft( rings, mat )
	def box( self, c, s, mat ):
		x, y, z = c; hx, hy, hz = s[ 0 ] / 2, s[ 1 ] / 2, s[ 2 ] / 2
		P = lambda i, j, k: ( x + i * hx, y + j * hy, z + k * hz )
		self.loft( [ [ P( - 1, - 1, - 1 ), P( 1, - 1, - 1 ), P( 1, 1, - 1 ), P( - 1, 1, - 1 ) ], [ P( - 1, - 1, 1 ), P( 1, - 1, 1 ), P( 1, 1, 1 ), P( - 1, 1, 1 ) ] ], mat )
	def obj( self, name, sharp = 40 ):
		me = bpy.data.meshes.new( name )
		bmesh.ops.remove_doubles( self.bm, verts = self.bm.verts, dist = 1e-5 )
		self.bm.to_mesh( me ); self.bm.free()
		for m in ORDER: me.materials.append( MATS[ m ] )
		me.set_sharp_from_angle( angle = math.radians( sharp ) )
		ob = bpy.data.objects.new( name, me ); bpy.context.scene.collection.objects.link( ob )
		return ob

# a superellipse section ( centre y, half width, half height, exponent ) at z, n points from the top round the left
def sect( z, cy, a, b, e = 2.4, n = 20 ):
	pts = []
	for i in range( n ):
		t = i / n * 2 * PI
		c, s = math.cos( t ), math.sin( t )
		x = a * math.copysign( abs( s ) ** ( 2 / e ), s )
		y = b * math.copysign( abs( c ) ** ( 2 / e ), c )
		pts.append( ( x, cy + y, z ) )
	return pts

m = Mesh()
# ---- the cabin tub: plan rings (ellipses about z 0.72) from the keel to the skirt's lower edge (y 1.12, the glass's
# 0.93 x ( 1.13, 1.62 ) ellipse), open over the chin windows (y 0.66..1.12, round the nose within +-0.62 rad of ahead)
SK = ( 1.13 * 0.93, 1.62 * 0.93 )
def tub_ring( y, n = 48 ):
	t = smooth( 0.3, 1.12, y )
	a = lerp( 0.62, SK[ 0 ], t ** 0.55 ); b = lerp( 1.15, SK[ 1 ], t ** 0.45 ); cz = lerp( 0.5, 0.72, t )
	# the tub runs aft under the engine bay: its back is drawn out behind the ellipse
	pts = []
	for i in range( n ):
		th = i / n * 2 * PI
		x, z = math.cos( th ) * a, cz + math.sin( th ) * b
		if z < cz: z = cz + ( z - cz ) * ( 1.05 + 0.25 * ( 1 - t ) )
		pts.append( ( x, y, z ) )
	return pts
ys = [ 0.32, 0.36, 0.42, 0.52, 0.66, 0.8, 0.95, 1.06, 1.12 ]
rings = [ tub_ring( y ) for y in ys ]
def tub_cell( i, k, c ):
	y = ( ys[ i ] + ys[ i + 1 ] ) / 2
	th = math.atan2( c.z - 0.72, c.x )
	if y > 0.66 and abs( th - PI / 2 ) < 0.6 and c.z > 0.9: return None # the chin windows
	if 0.82 < y < 0.98: return 'Heli_Cream' # the livery's waist stripe
	return 'Heli_Jade'
m.loft( rings, 'Heli_Jade', cap = False, cells = tub_cell )
m.face( rings[ 0 ], 'Heli_Jade', out = ( 0, - 1, 0 ) )
# the door frames (a slim black edge round each door's opening) and the door handles; the steps under the doors
for s in ( 1, - 1 ):
	for z in ( - 0.32, 1.22 ):
		m.tube( ( s * 1.06, 0.78, z ), ( s * 0.98, 1.14, z + 0.02 ), 0.018, 'Heli_Black', seg = 6 )
	m.box( ( s * 1.09, 1.0, 0.2 ), ( 0.04, 0.03, 0.16 ), 'Heli_Metal' )
	m.box( ( s * 1.12, 0.5, 0.55 ), ( 0.22, 0.03, 0.42 ), 'Heli_Metal' )
	m.tube( ( s * 0.95, 0.5, 0.4 ), ( s * 1.04, 0.5, 0.4 ), 0.015, 'Heli_Metal', seg = 5 )

# ---- the aft fuselage and tail boom: one loft of sections along z from inside the cabin to the tail
AFT = [ ( - 0.55, 1.42, 0.95, 0.72, 2.6 ), ( - 0.85, 1.55, 0.98, 0.98, 2.6 ), ( - 1.2, 1.66, 0.92, 0.95, 2.5 ), ( - 1.6, 1.74, 0.72, 0.78, 2.3 ),
	( - 2.0, 1.78, 0.46, 0.5, 2.15 ), ( - 2.5, 1.82, 0.34, 0.36, 2.0 ), ( - 4.0, 1.92, 0.24, 0.26, 2.0 ), ( - 5.5, 2.0, 0.17, 0.19, 2.0 ),
	( - 6.6, 2.06, 0.13, 0.15, 2.0 ), ( - 7.12, 2.1, 0.09, 0.1, 2.0 ) ]
arings = [ sect( z, cy, a, b, e, 24 ) for ( z, cy, a, b, e ) in AFT ]
def aft_cell( i, k, c ):
	z = c.z
	if - 4.9 < z < - 4.45 or - 3.2 < z < - 2.95: return 'Heli_Orange' # the boom's rescue bands
	if c.y < 1.3 and z > - 1.6: return 'Heli_Jade'
	return 'Heli_Jade'
m.loft( arings, 'Heli_Jade', cells = aft_cell )
# the engine bay's grilles (black louvres on both flanks) and the exhausts
for s in ( 1, - 1 ):
	for j in range( 5 ):
		z = - 1.05 - j * 0.09
		m.box( ( s * 0.9, 1.95, z ), ( 0.02, 0.22, 0.035 ), 'Heli_Black' )
	m.tube( ( s * 0.42, 2.3, - 1.55 ), ( s * 0.52, 2.38, - 1.98 ), 0.12, 'Heli_Dark', seg = 12, cap = False )
	m.tube( ( s * 0.43, 2.31, - 1.6 ), ( s * 0.51, 2.37, - 1.95 ), 0.1, 'Heli_Black', seg = 12 )
# the transmission / intake cowl over the cabin's back, the mast fairing
cowl = [ sect( z, cy, a, b, 2.5, 20 ) for ( z, cy, a, b ) in ( ( 0.25, 2.42, 0.18, 0.08 ), ( 0.05, 2.47, 0.42, 0.18 ), ( - 0.4, 2.52, 0.56, 0.24 ), ( - 1.1, 2.5, 0.55, 0.24 ), ( - 1.75, 2.32, 0.32, 0.16 ), ( - 2.1, 2.1, 0.12, 0.08 ) ) ]
m.loft( cowl, 'Heli_Cream' )
for s in ( 1, - 1 ): m.box( ( s * 0.5, 2.58, - 0.75 ), ( 0.03, 0.12, 0.45 ), 'Heli_Black' ) # the intakes
m.tube( ( 0, 2.6, - 0.4 ), ( 0, 3.12, - 0.4 ), 0.1, 'Heli_Metal', seg = 12 )
m.tube( ( 0, 2.6, - 0.4 ), ( 0, 2.82, - 0.4 ), 0.2, 'Heli_Cream', seg = 14 )
# the dorsal fin along the boom's top
m.face( [ ( 0.02, 2.05, - 2.6 ), ( 0.02, 2.18, - 5.8 ), ( 0.02, 2.3, - 6.0 ), ( 0.02, 2.08, - 2.0 ) ], 'Heli_Jade', out = ( 1, 0, 0 ) )
m.face( [ ( - 0.02, 2.05, - 2.6 ), ( - 0.02, 2.18, - 5.8 ), ( - 0.02, 2.3, - 6.0 ), ( - 0.02, 2.08, - 2.0 ) ], 'Heli_Jade', out = ( - 1, 0, 0 ) )

# ---- the vertical fin (swept, an aerofoil thickness), its orange flash; the tail skid; the tail rotor's gearbox
def fin( pts, half, mat, axis = 'x' ):
	# an extruded aerofoil-ish plate: the outline in ( z, y ) (or ( z, x ) for a horizontal one), thickest mid-chord
	n = len( pts )
	cz = sum( p[ 0 ] for p in pts ) / n
	if axis == 'x':
		A = [ ( half * ( 0.4 + 0.6 * ( 1 - abs( p[ 0 ] - cz ) / 0.6 ) ), p[ 1 ], p[ 0 ] ) for p in pts ]
		Bm = [ ( - x, y, z ) for ( x, y, z ) in A ]
		mid = [ ( 0, p[ 1 ], p[ 0 ] ) for p in pts ]
	else:
		A = [ ( p[ 1 ], half, p[ 0 ] ) for p in pts ]; Bm = [ ( p[ 1 ], - half, p[ 0 ] ) for p in pts ]; mid = None
	for i in range( n ):
		j = ( i + 1 ) % n
		m.face( [ A[ i ], A[ j ], Bm[ j ], Bm[ i ] ], mat )
	m.face( A, mat, out = ( 1, 0, 0 ) if axis == 'x' else ( 0, 1, 0 ) )
	m.face( Bm, mat, out = ( - 1, 0, 0 ) if axis == 'x' else ( 0, - 1, 0 ) )
fin( [ ( - 6.35, 1.96 ), ( - 6.6, 2.2 ), ( - 7.0, 3.12 ), ( - 7.38, 3.2 ), ( - 7.32, 2.6 ), ( - 7.28, 1.86 ), ( - 6.8, 1.82 ) ], 0.05, 'Heli_Jade' )
fin( [ ( - 6.98, 2.75 ), ( - 7.12, 3.12 ), ( - 7.39, 3.21 ), ( - 7.36, 2.75 ) ], 0.056, 'Heli_Orange' )
fin( [ ( - 6.9, 1.84 ), ( - 7.0, 1.55 ), ( - 7.3, 1.45 ), ( - 7.32, 1.82 ) ], 0.04, 'Heli_Jade' )
m.path( [ ( 0, 1.5, - 7.18 ), ( 0, 1.32, - 7.35 ), ( 0, 1.3, - 7.55 ) ], 0.02, 'Heli_Metal', seg = 6 )
m.tube( ( 0.05, 2.25, - 6.95 ), ( 0.2, 2.25, - 6.95 ), 0.07, 'Heli_Dark', seg = 10 )
# the horizontal stabiliser with endplate fins
for s in ( 1, - 1 ):
	m.loft( [ [ ( s * x, 1.94 + dy, z ) for ( z, dy ) in ( ( - 5.25, 0 ), ( - 5.45, 0.035 ), ( - 5.75, 0.025 ), ( - 5.95, 0 ), ( - 5.75, - 0.02 ), ( - 5.45, - 0.025 ) ) ] for x in ( 0.15, 1.2 ) ], 'Heli_Jade' )
	m.loft( [ [ ( s * 1.21, y, z ) for ( z, y ) in ( ( - 5.3, 1.94 ), ( - 5.55, 2.2 ), ( - 5.95, 2.24 ), ( - 6.0, 1.94 ), ( - 5.95, 1.72 ), ( - 5.55, 1.74 ) ) ] for x in ( 0, ) ] + [ [ ( s * 1.25, y, z ) for ( z, y ) in ( ( - 5.3, 1.94 ), ( - 5.55, 2.2 ), ( - 5.95, 2.24 ), ( - 6.0, 1.94 ), ( - 5.95, 1.72 ), ( - 5.55, 1.74 ) ) ] ], 'Heli_Orange' )

# ---- the skids: two tubes turned up at the nose, bent cross tubes to the belly, wear plates
for s in ( 1, - 1 ):
	m.path( [ ( s * 1.3, 0.09, - 1.85 ), ( s * 1.3, 0.09, 1.55 ), ( s * 1.3, 0.13, 1.85 ), ( s * 1.29, 0.27, 2.08 ), ( s * 1.28, 0.42, 2.18 ) ], 0.055, 'Heli_Metal', seg = 10 )
	for z in ( - 1.0, 1.0 ):
		m.path( [ ( s * 1.3, 0.1, z ), ( s * 1.27, 0.4, z ), ( s * 1.18, 0.68, z ), ( s * 0.95, 0.82, z ), ( s * 0.6, 0.86, z ) ], 0.045, 'Heli_Metal', seg = 8 )
	m.box( ( s * 1.3, 0.04, 0.0 ), ( 0.06, 0.02, 1.6 ), 'Heli_Dark' )

# ---- rescue kit: the hoist over the right door (the game's right: -X), the searchlight turret under the nose,
# antennas, the beacon's base, a wire cutter on the nose
m.path( [ ( - 0.3, 2.5, - 0.2 ), ( - 0.85, 2.42, - 0.2 ), ( - 1.25, 2.22, - 0.2 ) ], 0.045, 'Heli_Metal', seg = 8 )
m.box( ( - 1.3, 2.12, - 0.2 ), ( 0.18, 0.18, 0.32 ), 'Heli_Cream' )
m.tube( ( - 1.3, 2.03, - 0.2 ), ( - 1.3, 1.6, - 0.2 ), 0.006, 'Heli_Black', seg = 4 )
m.box( ( - 1.3, 1.57, - 0.2 ), ( 0.08, 0.06, 0.08 ), 'Heli_Orange' )
m.tube( ( 0.42, 0.62, 1.95 ), ( 0.42, 0.75, 1.95 ), 0.05, 'Heli_Dark', seg = 8 )
m.loft( [ sect( z, 0.55, 0.1, 0.1, 2.0, 14 ) for z in ( 1.88, 2.06 ) ], 'Heli_Black' )
for ( x, z, h ) in ( ( 0.3, - 1.9, 0.35 ), ( - 0.3, - 2.4, 0.3 ) ): m.tube( ( x, 2.3 if z > - 2 else 2.1, z ), ( x, 2.3 + h if z > - 2 else 2.1 + h, z - 0.12 ), 0.012, 'Heli_Black', seg = 5 )
m.path( [ ( 0, 2.48, 2.16 ), ( 0, 2.6, 2.05 ) ], 0.015, 'Heli_Dark', seg = 5 )
m.path( [ ( 0, 0.36, 1.95 ), ( 0, 0.28, 2.15 ) ], 0.015, 'Heli_Dark', seg = 5 )
body = m.obj( 'Fuselage' )

# ---- the main rotor: a hub, four tapered blades with a little twist and swept tip caps, about +Y at the hub
r = Mesh()
r.tube( ( 0, - 0.09, 0 ), ( 0, 0.07, 0 ), 0.3, 'Heli_Dark', seg = 16 )
r.tube( ( 0, 0.07, 0 ), ( 0, 0.16, 0 ), 0.12, 'Heli_Metal', seg = 12 )
def blade( a, length = 4.9, root = 0.3 ):
	ca, sa = math.cos( a ), math.sin( a )
	rings = []
	steps = [ 0.0, 0.15, 0.5, 1.0, 2.0, 3.0, 4.0, length - 0.25, length ]
	for d in steps:
		rr = root + d
		chord = 0.28 if d > 0.4 else 0.12 + 0.4 * d
		if d > length - 0.3: chord *= 0.75
		twist = 0.12 * ( 1 - d / length )
		th = 0.05 if d > 0.4 else 0.06
		pts = []
		for ( u, v ) in ( ( 0.5, 0 ), ( 0.2, 0.6 ), ( - 0.25, 0.5 ), ( - 0.5, 0 ), ( - 0.25, - 0.35 ), ( 0.2, - 0.4 ) ):
			cu, cv = u * chord, v * th
			cu, cv = cu * math.cos( twist ) - cv * math.sin( twist ), cu * math.sin( twist ) + cv * math.cos( twist )
			# blade frame: span along ( sa, ca ) in xz, chord across it, thickness in y
			x = sa * rr + ca * cu; z = ca * rr - sa * cu
			pts.append( ( x, cv - 0.004 * d * d, z ) )
		rings.append( pts )
	r.loft( rings, 'Heli_Blade', cells = lambda i, k, c: 'Heli_Cream' if i >= len( steps ) - 2 else 'Heli_Blade' )
for n in range( 4 ): blade( n * PI / 2 )
rotor = r.obj( 'MainRotor', sharp = 50 )
rotor.location = B( ( 0, 3.19, - 0.4 ) )

# ---- the tail rotor: two blades about local X (the game spins the node about X), a hub
t = Mesh()
t.tube( ( 0, 0, 0 ), ( 0.1, 0, 0 ), 0.08, 'Heli_Dark', seg = 10 )
for sgn in ( 1, - 1 ):
	t.loft( [ [ ( 0.05 + dx, sgn * ( 0.06 + d ), dz ) for ( dx, dz ) in ( ( 0.02, 0.09 ), ( - 0.015, 0.06 ), ( - 0.02, - 0.07 ), ( 0.015, - 0.09 ) ) ] for d in ( 0.0, 0.75 ) ], 'Heli_Blade',
		cells = lambda i, k, c: 'Heli_Cream' if abs( c.y ) > 0.6 else 'Heli_Blade' )
tail = t.obj( 'TailRotor', sharp = 50 )
tail.location = B( ( 0.24, 2.25, - 6.95 ) )

bpy.ops.object.select_all( action = 'DESELECT' )
for o in ( body, rotor, tail ): o.select_set( True )
bpy.context.view_layer.objects.active = body
path = os.path.join( OUT, 'exterior.glb' )
bpy.ops.export_scene.gltf( filepath = path, export_format = 'GLB', use_selection = True, export_yup = True, export_apply = True, export_texcoords = False,
	export_normals = True, export_materials = 'EXPORT', export_cameras = False, export_lights = False, export_extras = False, export_animations = False, export_skins = False, export_morph = False )
tris = 0
for o in ( body, rotor, tail ):
	o.data.calc_loop_triangles(); tris += len( o.data.loop_triangles )
print( 'HELI', json.dumps( { 'tris': tris, 'bytes': os.path.getsize( path ) } ) )
