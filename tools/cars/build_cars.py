# Meridian's cars (wave 21B): sedan, taxi, pickup, delivery van, sports car, police car, bus. Low poly, one shared 64 px
# palette atlas, built headless:
#   D:\blender\blender.exe -b --factory-startup -P tools/cars/build_cars.py -- [all|sedan,...] [outDir]
# -> public/models/cars/<kind>.glb (+ car_atlas.png, + a measurements line per car on stdout as JSON).
#
# Conventions (src/features/cars/CarRender.js reads them):
# - glTF frame +Z forward (the nose), +Y up, +X the car's left; origin on the ground under the middle of the wheelbase.
# - nodes: Body (one mesh, three primitives: CarPaint plain white, tinted per instance by the game; CarTrim and CarLamp
#   on the atlas) and Wheel_FL / Wheel_FR / Wheel_RL / Wheel_RR (material CarWheel, the atlas), each wheel its own node
#   with its origin at the hub. The game finds the wheels by material (StaticGLB names meshes 'car-' + material).
# - CarLamp: head / tail / indicator / beacon cells; the game makes them glow at night (and the beacons in a chase).
# Blender frame while building: game (x left, y up, z fore) -> Blender ( x, -z, y ); the exporter's +Y up turns it back.

import bpy, bmesh, math, sys, os, json
from mathutils import Vector

ROOT = os.path.abspath( os.path.join( os.path.dirname( __file__ ), '..', '..' ) )
argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
WHICH = argv[ 0 ] if argv else 'all'
OUT = argv[ 1 ] if len( argv ) > 1 else os.path.join( ROOT, 'public', 'models', 'cars' )
os.makedirs( OUT, exist_ok = True )

# ------------------------------------------------------------------ the atlas: 8 x 8 cells of 8 px

CELLS = {
	'glass': ( 34, 46, 60 ), 'chrome': ( 196, 200, 206 ), 'plastic': ( 30, 30, 33 ), 'tyre': ( 24, 24, 25 ), 'rim': ( 168, 172, 178 ),
	'head': ( 255, 250, 228 ), 'tail': ( 205, 18, 22 ), 'amber': ( 255, 150, 24 ), 'blue': ( 30, 70, 255 ), 'red': ( 255, 26, 34 ),
	'sign': ( 255, 206, 40 ), 'checker': None, 'plate': ( 236, 234, 218 ), 'grille': ( 44, 46, 50 ), 'white': ( 238, 238, 236 ),
	'navy': ( 22, 32, 72 ), 'interior': ( 62, 58, 54 ), 'green': ( 30, 140, 96 ), 'bed': ( 40, 38, 36 ), 'busglass': ( 52, 70, 84 ),
	'reverse': ( 236, 236, 236 ), 'hub': ( 92, 94, 98 ),
}
NAMES = list( CELLS.keys() )
SIZE = 64

def cell_uv( name, fu = 0.5, fv = 0.5 ):
	i = NAMES.index( name )
	cx, cy = i % 8, i // 8
	# 1 px inset so mips never bleed into the neighbour cell at near range
	return ( ( cx * 8 + 1 + fu * 6 ) / SIZE, ( cy * 8 + 1 + fv * 6 ) / SIZE )

def make_atlas():
	img = bpy.data.images.new( 'car_atlas', SIZE, SIZE, alpha = True ) # (RGBA: every PNG decoder takes it)
	px = [ 0.0 ] * ( SIZE * SIZE * 4 )
	srgb = lambda c: c / 255.0  # the image is sRGB: store the sRGB values
	for i, n in enumerate( NAMES ):
		cx, cy = i % 8, i // 8
		for y in range( 8 ):
			for x in range( 8 ):
				c = CELLS[ n ]
				if c is None: c = ( 240, 240, 236 ) if ( ( x // 2 ) + ( y // 2 ) ) % 2 == 0 else ( 20, 20, 22 )
				k = ( ( cy * 8 + y ) * SIZE + cx * 8 + x ) * 4
				px[ k ], px[ k + 1 ], px[ k + 2 ], px[ k + 3 ] = srgb( c[ 0 ] ), srgb( c[ 1 ] ), srgb( c[ 2 ] ), 1.0
	img.pixels = px
	path = os.path.join( OUT, 'car_atlas.png' )
	img.filepath_raw = path
	img.file_format = 'PNG'
	img.save()
	img.pack()
	return img

ATLAS = make_atlas()

def material( name, textured, color = ( 1, 1, 1, 1 ), rough = 0.5, metal = 0.0 ):
	m = bpy.data.materials.new( name )
	m.use_nodes = True
	b = m.node_tree.nodes[ 'Principled BSDF' ]
	b.inputs[ 'Base Color' ].default_value = color
	b.inputs[ 'Roughness' ].default_value = rough
	b.inputs[ 'Metallic' ].default_value = metal
	if textured:
		t = m.node_tree.nodes.new( 'ShaderNodeTexImage' )
		t.image = ATLAS
		t.interpolation = 'Closest'
		m.node_tree.links.new( t.outputs[ 'Color' ], b.inputs[ 'Base Color' ] )
	return m

MATS = {
	'CarPaint': material( 'CarPaint', False, ( 0.85, 0.85, 0.85, 1 ), 0.32, 0.15 ),
	'CarTrim': material( 'CarTrim', True, rough = 0.45 ),
	'CarLamp': material( 'CarLamp', True, rough = 0.2 ),
	'CarWheel': material( 'CarWheel', True, rough = 0.85 ),
}
BODY_MATS = [ 'CarPaint', 'CarTrim', 'CarLamp' ]

# ------------------------------------------------------------------ mesh building in the game frame

def B( p ):
	return Vector( ( p[ 0 ], - p[ 2 ], p[ 1 ] ) )

class Mesh:

	def __init__( self, mats ):
		self.bm = bmesh.new()
		self.uv = self.bm.loops.layers.uv.new( 'UVMap' )
		self.mats = mats

	# a face (game-frame points), turned to face away from `inside` (a game-frame point), on one atlas cell (or uvs)
	def face( self, pts, mat, cell = 'white', inside = None, uvs = None ):
		ps = [ Vector( p ) for p in pts ]
		if inside is not None and len( ps ) >= 3:
			n = ( ps[ 1 ] - ps[ 0 ] ).cross( ps[ 2 ] - ps[ 0 ] )
			if n.length < 1e-9 and len( ps ) > 3: n = ( ps[ 2 ] - ps[ 0 ] ).cross( ps[ 3 ] - ps[ 0 ] )
			c = sum( ps, Vector() ) / len( ps )
			# the game frame is right handed like Blender's after the swap: a CCW face seen from outside points out
			if n.dot( c - Vector( inside ) ) < 0:
				ps = ps[ :: - 1 ]
				if uvs: uvs = uvs[ :: - 1 ]
		vs = [ self.bm.verts.new( B( p ) ) for p in ps ]
		try:
			f = self.bm.faces.new( vs )
		except ValueError:
			return None
		f.material_index = self.mats.index( mat )
		for k, l in enumerate( f.loops ):
			l[ self.uv ].uv = uvs[ k ] if uvs else cell_uv( cell )
		return f

	# an axis-aligned box (centre, full size) in the game frame
	def box( self, c, s, mat, cell = 'white', skip = () ):
		x, y, z = c; hx, hy, hz = s[ 0 ] / 2, s[ 1 ] / 2, s[ 2 ] / 2
		P = lambda i, j, k: ( x + i * hx, y + j * hy, z + k * hz )
		faces = {
			'+x': [ P( 1, - 1, - 1 ), P( 1, 1, - 1 ), P( 1, 1, 1 ), P( 1, - 1, 1 ) ], '-x': [ P( - 1, - 1, - 1 ), P( - 1, - 1, 1 ), P( - 1, 1, 1 ), P( - 1, 1, - 1 ) ],
			'+y': [ P( - 1, 1, - 1 ), P( - 1, 1, 1 ), P( 1, 1, 1 ), P( 1, 1, - 1 ) ], '-y': [ P( - 1, - 1, - 1 ), P( 1, - 1, - 1 ), P( 1, - 1, 1 ), P( - 1, - 1, 1 ) ],
			'+z': [ P( - 1, - 1, 1 ), P( 1, - 1, 1 ), P( 1, 1, 1 ), P( - 1, 1, 1 ) ], '-z': [ P( - 1, - 1, - 1 ), P( - 1, 1, - 1 ), P( 1, 1, - 1 ), P( 1, - 1, - 1 ) ],
		}
		for k, pts in faces.items():
			if k in skip: continue
			self.face( pts, mat, cell, inside = c )

	# the lower body: a loft of cross sections along z. st: [ ( z, yBottom, yTop, halfWidth ) ] rear to front
	def loft( self, st, mat = 'CarPaint', cell = 'white', tuck = 0.07, shoulder = 0.09, belt = 0.55 ):
		rings = []
		for ( z, y0, y1, w ) in st:
			yb = y0 + ( y1 - y0 ) * belt
			# right to left round the section: sill, belt (widest), shoulder, mirrored
			rings.append( [ ( - w + tuck, y0, z ), ( - w, yb, z ), ( - w + shoulder, y1, z ), ( w - shoulder, y1, z ), ( w, yb, z ), ( w - tuck, y0, z ) ] )
		for i in range( len( rings ) - 1 ):
			a, b = rings[ i ], rings[ i + 1 ]
			zc = ( st[ i ][ 0 ] + st[ i + 1 ][ 0 ] ) / 2
			yc = ( st[ i ][ 1 ] + st[ i ][ 2 ] + st[ i + 1 ][ 1 ] + st[ i + 1 ][ 2 ] ) / 4
			n = len( a )
			for k in range( n ):
				q = [ a[ k ], a[ ( k + 1 ) % n ], b[ ( k + 1 ) % n ], b[ k ] ]
				if max( abs( q[ 0 ][ 0 ] - q[ 1 ][ 0 ] ), abs( q[ 0 ][ 1 ] - q[ 1 ][ 1 ] ) ) < 1e-6 and max( abs( q[ 2 ][ 0 ] - q[ 3 ][ 0 ] ), abs( q[ 2 ][ 1 ] - q[ 3 ][ 1 ] ) ) < 1e-6: continue
				bottom = k == n - 1
				self.face( q, 'CarTrim' if bottom else mat, 'plastic' if bottom else cell, inside = ( 0, yc, zc ) )
		for ring, ( z, y0, y1, w ), d in ( ( rings[ 0 ], st[ 0 ], - 1 ), ( rings[ - 1 ], st[ - 1 ], 1 ) ):
			self.face( ring, mat, cell, inside = ( 0, ( y0 + y1 ) / 2, z - d ) )

	# a greenhouse / box with a different base and top: base ( z0, z1, y, halfWidth ), top ( z0, z1, y, halfWidth );
	# mats per face: front, back, sides, top (each ( material, cell ))
	def hexa( self, base, top, front, back, sides, roof, bottom = None ):
		bz0, bz1, by, bw = base; tz0, tz1, ty, tw = top
		b = [ ( - bw, by, bz0 ), ( bw, by, bz0 ), ( bw, by, bz1 ), ( - bw, by, bz1 ) ]
		t = [ ( - tw, ty, tz0 ), ( tw, ty, tz0 ), ( tw, ty, tz1 ), ( - tw, ty, tz1 ) ]
		c = ( 0, ( by + ty ) / 2, ( bz0 + bz1 + tz0 + tz1 ) / 4 )
		self.face( [ b[ 3 ], b[ 2 ], t[ 2 ], t[ 3 ] ], *front, inside = c )
		self.face( [ b[ 0 ], b[ 1 ], t[ 1 ], t[ 0 ] ], *back, inside = c )
		self.face( [ b[ 1 ], b[ 2 ], t[ 2 ], t[ 1 ] ], *sides, inside = c )
		self.face( [ b[ 0 ], b[ 3 ], t[ 3 ], t[ 0 ] ], *sides, inside = c )
		self.face( t, *roof, inside = c )
		if bottom: self.face( b, *bottom, inside = c )

	def object( self, name ):
		me = bpy.data.meshes.new( name )
		bmesh.ops.remove_doubles( self.bm, verts = self.bm.verts, dist = 1e-5 )
		self.bm.to_mesh( me )
		self.bm.free()
		for m in self.mats: me.materials.append( MATS[ m ] )
		ob = bpy.data.objects.new( name, me )
		bpy.context.scene.collection.objects.link( ob )
		return ob

# a wheel: radius r, width w, its hub at the origin (the object is placed at the hub), axis along game x
def wheel( name, r, w, seg = 12 ):
	m = Mesh( [ 'CarWheel' ] )
	ring = lambda x, rr: [ ( x, math.cos( a ) * rr, math.sin( a ) * rr ) for a in [ i / seg * math.pi * 2 for i in range( seg ) ] ]
	o, i_ = ring( w / 2, r ), ring( - w / 2, r )
	for k in range( seg ):
		k2 = ( k + 1 ) % seg
		m.face( [ o[ k ], o[ k2 ], i_[ k2 ], i_[ k ] ], 'CarWheel', 'tyre', inside = ( 0, 0, 0 ) )
	for x, side in ( ( w / 2 + 0.002, 1 ), ( - w / 2 - 0.002, - 1 ) ):
		rim = ring( x, r * 0.62 )
		hub = ring( x + side * 0.015, r * 0.2 )
		outer = ring( x, r )
		for k in range( seg ):
			k2 = ( k + 1 ) % seg
			m.face( [ outer[ k ], outer[ k2 ], rim[ k2 ], rim[ k ] ], 'CarWheel', 'tyre', inside = ( - side, 0, 0 ) )
			m.face( [ rim[ k ], rim[ k2 ], hub[ k2 ], hub[ k ] ], 'CarWheel', 'rim', inside = ( - side, 0, 0 ) )
		m.face( hub, 'CarWheel', 'hub', inside = ( - side, 0, 0 ) )
	return m.object( name )

# ------------------------------------------------------------------ the cars (game frame, metres)

# L length, W width, wb wheelbase, r wheel radius, tw track inset (the wheel's outer face this far inside the body side)
SPECS = {
	'sedan': { 'L': 4.6, 'W': 1.8, 'wb': 2.72, 'r': 0.33, 'ww': 0.22 },
	'taxi': { 'L': 4.7, 'W': 1.8, 'wb': 2.78, 'r': 0.33, 'ww': 0.22 },
	'police': { 'L': 4.8, 'W': 1.84, 'wb': 2.8, 'r': 0.34, 'ww': 0.23 },
	'pickup': { 'L': 5.3, 'W': 1.95, 'wb': 3.2, 'r': 0.39, 'ww': 0.26 },
	'van': { 'L': 5.1, 'W': 1.98, 'wb': 3.1, 'r': 0.36, 'ww': 0.24 },
	'sports': { 'L': 4.35, 'W': 1.92, 'wb': 2.55, 'r': 0.34, 'ww': 0.27 },
	'bus': { 'L': 11.0, 'W': 2.5, 'wb': 6.2, 'r': 0.5, 'ww': 0.3 },
}

def lamps_front( m, z, y, w, h = 0.13, dx = 0.34 ):
	for s in ( 1, - 1 ):
		m.box( ( s * ( w - dx / 2 - 0.08 ), y, z ), ( dx, h, 0.06 ), 'CarLamp', 'head' )
		m.box( ( s * ( w - 0.05 ), y - 0.01, z - 0.1 ), ( 0.05, 0.08, 0.14 ), 'CarLamp', 'amber' )

def lamps_rear( m, z, y, w, h = 0.14, dx = 0.32 ):
	for s in ( 1, - 1 ):
		m.box( ( s * ( w - dx / 2 - 0.06 ), y, z ), ( dx, h, 0.06 ), 'CarLamp', 'tail' )
		m.box( ( s * ( w - dx - 0.12 ), y, z ), ( 0.1, h * 0.7, 0.05 ), 'CarLamp', 'reverse' )

def bumpers( m, zr, zf, y, w, d = 0.16 ):
	m.box( ( 0, y, zf ), ( w * 2 - 0.1, 0.16, d ), 'CarTrim', 'plastic' )
	m.box( ( 0, y, zr ), ( w * 2 - 0.1, 0.16, d ), 'CarTrim', 'plastic' )
	m.box( ( 0, y + 0.02, zf + d / 2 + 0.005 ), ( 0.5, 0.11, 0.01 ), 'CarTrim', 'plate' )
	m.box( ( 0, y + 0.18, zr - d / 2 - 0.005 ), ( 0.5, 0.11, 0.01 ), 'CarTrim', 'plate' )

def mirrors( m, z, y, w ):
	for s in ( 1, - 1 ): m.box( ( s * ( w + 0.08 ), y, z ), ( 0.16, 0.1, 0.12 ), 'CarPaint' )

def sedan_like( m, S, kind ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	trunk = 0.98 if kind != 'police' else 1.0
	m.loft( [ ( zr, 0.3, 0.72, w - 0.05 ), ( zr + 0.18, 0.28, trunk - 0.03, w ), ( zr + 1.05, 0.28, trunk, w ), ( zf - 1.55, 0.28, 0.96, w ),
		( zf - 0.55, 0.28, 0.88, w ), ( zf - 0.12, 0.3, 0.78, w - 0.02 ), ( zf, 0.34, 0.62, w - 0.08 ) ] )
	gb, gt = ( zr + 1.0, zf - 1.5, 0.95, w - 0.1 ), ( zr + 1.55, zf - 2.3, 1.45, w - 0.27 )
	m.hexa( gb, gt, ( 'CarTrim', 'glass' ), ( 'CarTrim', 'glass' ), ( 'CarTrim', 'glass' ), ( 'CarPaint', 'white' ) )
	# pillars over the glass: A, B, C (thin paint strips just proud of the side glass)
	for s in ( 1, - 1 ):
		for ( z0, z1 ) in ( ( gb[ 1 ] - 0.08, gt[ 1 ] - 0.02 ), ( ( gb[ 0 ] + gb[ 1 ] ) / 2 + 0.05, ( gt[ 0 ] + gt[ 1 ] ) / 2 + 0.05 ), ( gb[ 0 ] + 0.02, gt[ 0 ] + 0.1 ) ):
			xb, xt = s * ( gb[ 3 ] + 0.012 ), s * ( gt[ 3 ] + 0.012 )
			m.face( [ ( xb, gb[ 2 ], z0 - 0.06 ), ( xb, gb[ 2 ], z0 + 0.06 ), ( xt, gt[ 2 ], z1 + 0.05 ), ( xt, gt[ 2 ], z1 - 0.05 ) ], 'CarPaint', inside = ( 0, 1.2, ( z0 + z1 ) / 2 ) )
	m.box( ( 0, 0.56, zf + 0.005 ), ( 0.9, 0.16, 0.04 ), 'CarTrim', 'grille' )
	lamps_front( m, zf - 0.02, 0.66, w )
	lamps_rear( m, zr + 0.02, 0.78, w )
	bumpers( m, zr - 0.02, zf + 0.04, 0.4, w )
	mirrors( m, gb[ 1 ] - 0.1, 1.0, w - 0.05 )
	# door handles and a chrome belt line
	for s in ( 1, - 1 ): m.box( ( s * ( w + 0.003 ), 0.92, ( zr + zf ) / 2 + 0.1 ), ( 0.01, 0.025, 2.2 ), 'CarTrim', 'chrome' )
	return gt

def build_sedan( m, S ):
	sedan_like( m, S, 'sedan' )

def build_taxi( m, S ):
	gt = sedan_like( m, S, 'taxi' )
	w = S[ 'W' ] / 2
	zc = ( gt[ 0 ] + gt[ 1 ] ) / 2
	m.box( ( 0, gt[ 2 ] + 0.1, zc ), ( 0.7, 0.2, 0.32 ), 'CarLamp', 'sign' )
	m.box( ( 0, gt[ 2 ] + 0.015, zc ), ( 0.5, 0.03, 0.2 ), 'CarTrim', 'plastic' )
	# the checker band along both sides
	n = 10
	z0, z1 = - S[ 'L' ] / 2 + 0.6, S[ 'L' ] / 2 - 0.7
	for s in ( 1, - 1 ):
		x = s * ( w + 0.004 )
		for k in range( n ):
			a, b = z0 + ( z1 - z0 ) * k / n, z0 + ( z1 - z0 ) * ( k + 1 ) / n
			uv = [ cell_uv( 'checker', 0, 0 ), cell_uv( 'checker', 1, 0 ), cell_uv( 'checker', 1, 1 ), cell_uv( 'checker', 0, 1 ) ]
			m.face( [ ( x, 0.66, a ), ( x, 0.66, b ), ( x, 0.78, b ), ( x, 0.78, a ) ], 'CarTrim', uvs = uv, inside = ( 0, 0.7, ( a + b ) / 2 ) )

def build_police( m, S ):
	gt = sedan_like( m, S, 'police' )
	w = S[ 'W' ] / 2; zf = S[ 'L' ] / 2
	zc = ( gt[ 0 ] + gt[ 1 ] ) / 2
	m.box( ( 0, gt[ 2 ] + 0.04, zc ), ( 1.2, 0.06, 0.26 ), 'CarTrim', 'plastic' )
	m.box( ( 0.32, gt[ 2 ] + 0.12, zc ), ( 0.56, 0.12, 0.24 ), 'CarLamp', 'blue' )
	m.box( ( - 0.32, gt[ 2 ] + 0.12, zc ), ( 0.56, 0.12, 0.24 ), 'CarLamp', 'red' )
	# the navy doors band and the push bar
	for s in ( 1, - 1 ):
		x = s * ( w + 0.004 )
		m.face( [ ( x, 0.4, - 1.1 ), ( x, 0.4, 1.2 ), ( x, 0.86, 1.2 ), ( x, 0.86, - 1.1 ) ], 'CarTrim', 'navy', inside = ( 0, 0.6, 0 ) )
	m.box( ( 0, 0.55, zf + 0.2 ), ( 1.0, 0.36, 0.06 ), 'CarTrim', 'plastic' )
	for s in ( 1, - 1 ): m.box( ( s * 0.38, 0.5, zf + 0.12 ), ( 0.06, 0.3, 0.18 ), 'CarTrim', 'plastic' )

def build_pickup( m, S ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	cab0 = zf - 2.65
	m.loft( [ ( zr, 0.38, 1.08, w ), ( cab0, 0.38, 1.08, w ), ( zf - 1.4, 0.36, 1.12, w ), ( zf - 0.25, 0.36, 1.02, w ), ( zf, 0.42, 0.86, w - 0.06 ) ] )
	gb, gt = ( cab0 + 0.05, zf - 1.42, 1.1, w - 0.08 ), ( cab0 + 0.12, zf - 2.05, 1.78, w - 0.2 )
	m.hexa( gb, gt, ( 'CarTrim', 'glass' ), ( 'CarTrim', 'glass' ), ( 'CarTrim', 'glass' ), ( 'CarPaint', 'white' ) )
	# the bed: a dark floor inset and the inner walls
	bz0, bz1 = zr + 0.08, cab0 - 0.06
	m.face( [ ( - w + 0.1, 1.085, bz0 ), ( w - 0.1, 1.085, bz0 ), ( w - 0.1, 1.085, bz1 ), ( - w + 0.1, 1.085, bz1 ) ], 'CarTrim', 'bed', inside = ( 0, 0, ( bz0 + bz1 ) / 2 ) )
	for s in ( 1, - 1 ): m.box( ( s * ( w - 0.05 ), 1.16, ( bz0 + bz1 ) / 2 ), ( 0.1, 0.16, bz1 - bz0 ), 'CarPaint' )
	m.box( ( 0, 1.16, bz0 + 0.04 ), ( W - 0.1, 0.16, 0.08 ), 'CarPaint' )
	m.box( ( 0, 1.16, bz1 ), ( W - 0.1, 0.16, 0.08 ), 'CarPaint' )
	m.box( ( 0, 0.7, zf + 0.005 ), ( 1.2, 0.26, 0.04 ), 'CarTrim', 'chrome' )
	lamps_front( m, zf - 0.02, 0.88, w, 0.16, 0.36 )
	lamps_rear( m, zr - 0.01, 0.9, w, 0.22, 0.14 )
	bumpers( m, zr - 0.04, zf + 0.05, 0.5, w, 0.18 )
	mirrors( m, gb[ 1 ] - 0.1, 1.2, w - 0.03 )

def build_van( m, S ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	m.loft( [ ( zr, 0.34, 1.0, w ), ( zf - 1.0, 0.34, 1.0, w ), ( zf - 0.2, 0.34, 0.95, w ), ( zf, 0.4, 0.82, w - 0.05 ) ] )
	box_end = zf - 1.75
	# the cargo box (paint all round) and the cab greenhouse
	m.hexa( ( zr, box_end, 0.98, w ), ( zr, box_end, 2.35, w - 0.04 ), ( 'CarPaint', 'white' ), ( 'CarPaint', 'white' ), ( 'CarPaint', 'white' ), ( 'CarPaint', 'white' ) )
	m.hexa( ( box_end, zf - 1.0, 0.98, w - 0.04 ), ( box_end, zf - 1.5, 2.15, w - 0.12 ), ( 'CarTrim', 'glass' ), ( 'CarPaint', 'white' ), ( 'CarTrim', 'glass' ), ( 'CarPaint', 'white' ) )
	# rear doors' split and handles, the side band
	m.box( ( 0, 1.6, zr - 0.006 ), ( 0.02, 1.2, 0.01 ), 'CarTrim', 'plastic' )
	for s in ( 1, - 1 ): m.box( ( s * ( w + 0.004 ), 1.45, zr + ( box_end - zr ) / 2 ), ( 0.01, 0.2, box_end - zr - 0.3 ), 'CarTrim', 'green' )
	m.box( ( 0, 0.62, zf + 0.005 ), ( 1.0, 0.2, 0.04 ), 'CarTrim', 'grille' )
	lamps_front( m, zf - 0.02, 0.8, w )
	lamps_rear( m, zr - 0.01, 0.95, w, 0.3, 0.14 )
	bumpers( m, zr - 0.04, zf + 0.04, 0.45, w )
	mirrors( m, zf - 1.15, 1.3, w - 0.02 )

def build_sports( m, S ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	m.loft( [ ( zr, 0.24, 0.74, w - 0.06 ), ( zr + 0.25, 0.2, 0.84, w ), ( zr + 1.2, 0.2, 0.86, w ), ( zf - 1.65, 0.2, 0.8, w ),
		( zf - 0.7, 0.2, 0.7, w - 0.02 ), ( zf - 0.1, 0.22, 0.56, w - 0.06 ), ( zf, 0.26, 0.44, w - 0.14 ) ], tuck = 0.05, shoulder = 0.14, belt = 0.45 )
	gb, gt = ( zr + 1.0, zf - 1.6, 0.82, w - 0.16 ), ( zr + 1.45, zf - 2.25, 1.18, w - 0.36 )
	m.hexa( gb, gt, ( 'CarTrim', 'glass' ), ( 'CarTrim', 'glass' ), ( 'CarTrim', 'glass' ), ( 'CarPaint', 'white' ) )
	m.box( ( 0, 0.88, zr + 0.12 ), ( W - 0.3, 0.04, 0.22 ), 'CarPaint' )
	for s in ( 1, - 1 ): m.box( ( s * 0.6, 0.83, zr + 0.16 ), ( 0.05, 0.1, 0.05 ), 'CarTrim', 'plastic' )
	m.box( ( 0, 0.3, zf + 0.02 ), ( 1.2, 0.12, 0.06 ), 'CarTrim', 'grille' )
	for s in ( 1, - 1 ):
		m.box( ( s * ( w - 0.3 ), 0.5, zf - 0.1 ), ( 0.36, 0.06, 0.16 ), 'CarLamp', 'head' )
		m.box( ( s * ( w - 0.25 ), 0.68, zr - 0.01 ), ( 0.4, 0.07, 0.04 ), 'CarLamp', 'tail' )
	m.box( ( 0, 0.3, zr - 0.04 ), ( W - 0.25, 0.14, 0.1 ), 'CarTrim', 'plastic' )
	m.box( ( 0, 0.48, zr - 0.012 ), ( 0.46, 0.1, 0.01 ), 'CarTrim', 'plate' )
	mirrors( m, gb[ 1 ] - 0.05, 0.9, w - 0.12 )

def build_bus( m, S ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	m.loft( [ ( zr, 0.42, 1.25, w ), ( zf - 0.2, 0.42, 1.25, w ), ( zf, 0.48, 1.2, w - 0.04 ) ], tuck = 0.05, shoulder = 0.03, belt = 0.5 )
	m.hexa( ( zr, zf - 0.02, 1.24, w - 0.02 ), ( zr + 0.05, zf - 0.1, 3.05, w - 0.06 ), ( 'CarTrim', 'busglass' ), ( 'CarPaint', 'white' ), ( 'CarTrim', 'busglass' ), ( 'CarPaint', 'white' ) )
	# window posts and the roof band (paint over the glass band), the stripe, the destination board
	n = 8
	for s in ( 1, - 1 ):
		x = s * ( w - 0.035 )
		for k in range( n + 1 ):
			z = zr + 0.4 + ( L - 1.8 ) * k / n
			m.face( [ ( x, 1.24, z - 0.08 ), ( x, 1.24, z + 0.08 ), ( x, 3.0, z + 0.08 ), ( x, 3.0, z - 0.08 ) ], 'CarPaint', inside = ( 0, 2, z ) )
		m.face( [ ( x, 2.55, zr ), ( x, 2.55, zf - 0.2 ), ( x, 3.04, zf - 0.2 ), ( x, 3.04, zr ) ], 'CarPaint', inside = ( 0, 2.8, 0 ) )
		m.face( [ ( s * ( w + 0.004 ), 0.95, zr ), ( s * ( w + 0.004 ), 0.95, zf - 0.1 ), ( s * ( w + 0.004 ), 1.12, zf - 0.1 ), ( s * ( w + 0.004 ), 1.12, zr ) ], 'CarTrim', 'green', inside = ( 0, 1, 0 ) )
	m.box( ( 0, 2.78, zf - 0.07 ), ( 1.6, 0.3, 0.04 ), 'CarLamp', 'amber' )
	m.box( ( 0, 1.75, zr - 0.006 ), ( W - 0.4, 0.9, 0.01 ), 'CarTrim', 'busglass' )
	for s in ( 1, - 1 ):
		m.box( ( s * ( w - 0.3 ), 0.75, zf + 0.01 ), ( 0.36, 0.16, 0.05 ), 'CarLamp', 'head' )
		m.box( ( s * ( w - 0.2 ), 0.9, zr - 0.01 ), ( 0.2, 0.36, 0.04 ), 'CarLamp', 'tail' )
		# the doors: dark panels on the kerb side (the game's right: -x)
	m.box( ( - ( w + 0.004 ), 1.6, zf - 1.1 ), ( 0.01, 2.2, 1.0 ), 'CarTrim', 'busglass' )
	m.box( ( - ( w + 0.004 ), 1.6, - 0.6 ), ( 0.01, 2.2, 1.0 ), 'CarTrim', 'busglass' )
	bumpers( m, zr - 0.05, zf + 0.06, 0.5, w, 0.2 )

BUILD = { 'sedan': build_sedan, 'taxi': build_taxi, 'police': build_police, 'pickup': build_pickup, 'van': build_van, 'sports': build_sports, 'bus': build_bus }

def clear():
	for o in list( bpy.context.scene.objects ): bpy.data.objects.remove( o, do_unlink = True )

def build( kind ):
	clear()
	S = SPECS[ kind ]
	m = Mesh( BODY_MATS )
	BUILD[ kind ]( m, S )
	body = m.object( 'Body' )
	# the wheels: outer face flush with the body side less 0.04, the front axle +wb/2
	w = S[ 'W' ] / 2
	x = w - S[ 'ww' ] / 2 - 0.04
	wheels = []
	for name, sx, sz in ( ( 'Wheel_FL', 1, 1 ), ( 'Wheel_FR', - 1, 1 ), ( 'Wheel_RL', 1, - 1 ), ( 'Wheel_RR', - 1, - 1 ) ):
		ob = wheel( name, S[ 'r' ], S[ 'ww' ] )
		ob.location = B( ( sx * x, S[ 'r' ], sz * S[ 'wb' ] / 2 ) )
		wheels.append( ob )
	bpy.ops.object.select_all( action = 'DESELECT' )
	for o in [ body ] + wheels: o.select_set( True )
	bpy.context.view_layer.objects.active = body
	path = os.path.join( OUT, kind + '.glb' )
	bpy.ops.export_scene.gltf( filepath = path, export_format = 'GLB', use_selection = True, export_yup = True, export_apply = True,
		export_texcoords = True, export_normals = True, export_materials = 'EXPORT', export_cameras = False, export_lights = False,
		export_extras = False, export_animations = False, export_skins = False, export_morph = False, export_image_format = 'AUTO' )
	tris = 0
	for o in [ body ] + wheels:
		o.data.calc_loop_triangles()
		tris += len( o.data.loop_triangles )
	lo = [ min( ( o.matrix_world @ Vector( c ) )[ i ] for o in [ body ] + wheels for c in o.bound_box ) for i in range( 3 ) ]
	hi = [ max( ( o.matrix_world @ Vector( c ) )[ i ] for o in [ body ] + wheels for c in o.bound_box ) for i in range( 3 ) ]
	print( 'CAR', json.dumps( { 'kind': kind, 'tris': tris, 'bytes': os.path.getsize( path ), 'length': round( hi[ 1 ] - lo[ 1 ], 3 ), 'width': round( hi[ 0 ] - lo[ 0 ], 3 ), 'height': round( hi[ 2 ], 3 ) } ) )

kinds = list( SPECS.keys() ) if WHICH == 'all' else WHICH.split( ',' )
for k in kinds: build( k )
