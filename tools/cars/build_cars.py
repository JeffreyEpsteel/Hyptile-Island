# Meridian's cars (wave 21B, rebuilt for A-class in wave 25E): sedan, taxi, pickup, delivery van, sports car, police car,
# bus. Built headless:
#   D:\blender\blender.exe -b --factory-startup -P tools/cars/build_cars.py -- [all|sedan,...] [outDir]
# -> public/models/cars/<kind>.glb (+ car_atlas.png, + a measurements line per car on stdout as JSON).
#
# How a body is made (all procedural, original work):
# - the lower body is a loft of cross sections along z (sill tucked under, the side bulging to its widest, a shoulder
#   crease, a crowned hood / deck), its sill lifted round each wheel into a real arch;
# - the greenhouse is a stack of plan-view rounded rectangles from the belt to the roof edge (the windscreen and the
#   backlight are their front / rear edges, the pillars their corners), capped by a crowned roof; every band between two
#   rings is glass, a pillar, black trim or paint by its row and column;
# - lamps, grilles, plates, door shut lines, handles, sill trim and liveries are decals PROJECTED onto that shell (a ray
#   per grid point, the hit pushed out a few mm along the surface normal), so they hug the curvature exactly;
# - mirrors, the taxi sign, the light bar, push bar, exhausts, spoilers, the bed and the bus's details are small solids.
# Every car also carries a far LOD (BodyLod / WheelLod_FL: a coarser loft, the lamps, grille and plates only).
#
# Conventions (src/features/cars/CarRender.js reads them):
# - glTF frame +Z forward (the nose), +Y up, +X the car's left; origin on the ground under the middle of the wheelbase.
# - nodes: Body (one mesh: CarPaint plain white, tinted per instance by the game; CarTrim and CarLamp on the atlas) and
#   Wheel_FL / Wheel_FR / Wheel_RL / Wheel_RR (material CarWheel, the atlas), each wheel its own node with its origin at
#   the hub; BodyLod (Lod1Paint / Lod1Trim / Lod1Lamp) and WheelLod_FL (Lod1Wheel). The game finds parts by material.
# - glass is CarTrim on the atlas's 'glass' (index 0) or 'busglass' (index 19) cell: the game splits it into its own
#   transparent draw. The cell order below is fixed (CarRender.js CELL_PBR reads roughness / metalness by index).
# - CarLamp: head / tail / indicator / reverse / beacon cells; the game makes them glow at night (and the beacons in a
#   chase: the blue / red cells, atlas row 1).
# - the greenhouse anchors (glass base / top z, y and half widths per kind) are the ones tools/cars/build_interiors.py
#   furnishes: change them together.
# Blender frame while building: game (x left, y up, z fore) -> Blender ( x, -z, y ); the exporter's +Y up turns it back.

import bpy, bmesh, math, sys, os, json
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.abspath( os.path.join( os.path.dirname( __file__ ), '..', '..' ) )
argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
WHICH = argv[ 0 ] if argv else 'all'
OUT = argv[ 1 ] if len( argv ) > 1 else os.path.join( ROOT, 'public', 'models', 'cars' )
os.makedirs( OUT, exist_ok = True )

# ------------------------------------------------------------------ the atlas: 8 x 8 cells of 8 px (order is an API)

CELLS = {
	'glass': ( 34, 46, 60 ), 'chrome': ( 196, 200, 206 ), 'plastic': ( 30, 30, 33 ), 'tyre': ( 24, 24, 25 ), 'rim': ( 168, 172, 178 ),
	'head': ( 255, 250, 228 ), 'tail': ( 205, 18, 22 ), 'amber': ( 255, 150, 24 ), 'blue': ( 30, 70, 255 ), 'red': ( 255, 26, 34 ),
	'sign': ( 255, 206, 40 ), 'checker': None, 'plate': ( 236, 234, 218 ), 'grille': ( 44, 46, 50 ), 'white': ( 238, 238, 236 ),
	'navy': ( 22, 32, 72 ), 'interior': ( 62, 58, 54 ), 'green': ( 30, 140, 96 ), 'bed': ( 40, 38, 36 ), 'busglass': ( 52, 70, 84 ),
	'reverse': ( 236, 236, 236 ), 'hub': ( 92, 94, 98 ),
	# wave 25E
	'housing': ( 14, 15, 17 ), 'seam': ( 10, 10, 11 ), 'wall': ( 36, 36, 38 ), 'disc': ( 104, 101, 98 ), 'darkrim': ( 40, 42, 46 ),
	'taildark': ( 96, 8, 10 ), 'steel': ( 62, 64, 68 ), 'gloss': ( 6, 6, 8 ), 'mirror': ( 205, 212, 220 ), 'rubber': ( 17, 17, 18 ),
	'yellow': ( 236, 178, 22 ), 'lightgrey': ( 150, 152, 156 ),
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
	for i, n in enumerate( NAMES ):
		cx, cy = i % 8, i // 8
		for y in range( 8 ):
			for x in range( 8 ):
				c = CELLS[ n ]
				if c is None: c = ( 240, 240, 236 ) if ( ( x // 2 ) + ( y // 2 ) ) % 2 == 0 else ( 20, 20, 22 )
				k = ( ( cy * 8 + y ) * SIZE + cx * 8 + x ) * 4
				px[ k ], px[ k + 1 ], px[ k + 2 ], px[ k + 3 ] = c[ 0 ] / 255, c[ 1 ] / 255, c[ 2 ] / 255, 1.0
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
	'Lod1Paint': material( 'Lod1Paint', False, ( 0.85, 0.85, 0.85, 1 ), 0.32, 0.15 ),
	'Lod1Trim': material( 'Lod1Trim', True, rough = 0.45 ),
	'Lod1Lamp': material( 'Lod1Lamp', True, rough = 0.2 ),
	'Lod1Wheel': material( 'Lod1Wheel', True, rough = 0.85 ),
}
LOD_MAT = { 'CarPaint': 'Lod1Paint', 'CarTrim': 'Lod1Trim', 'CarLamp': 'Lod1Lamp', 'CarWheel': 'Lod1Wheel' }

# ------------------------------------------------------------------ small maths

def B( p ):
	return Vector( ( p[ 0 ], - p[ 2 ], p[ 1 ] ) )

def G( v ):
	return Vector( ( v[ 0 ], v[ 2 ], - v[ 1 ] ) )

def lerp( a, b, t ):
	return a + ( b - a ) * t

def pw( pts, t ):
	# piecewise linear over ( t, value ) pairs
	if t <= pts[ 0 ][ 0 ]: return pts[ 0 ][ 1 ]
	for ( t0, v0 ), ( t1, v1 ) in zip( pts, pts[ 1: ] ):
		if t <= t1: return lerp( v0, v1, ( t - t0 ) / ( t1 - t0 ) if t1 > t0 else 0 )
	return pts[ - 1 ][ 1 ]

def pchip( xs, ys ):
	# monotone cubic (Fritsch-Carlson): smooth through the stations, never overshooting them
	n = len( xs )
	h = [ xs[ i + 1 ] - xs[ i ] for i in range( n - 1 ) ]
	d = [ ( ys[ i + 1 ] - ys[ i ] ) / h[ i ] if h[ i ] > 0 else 0 for i in range( n - 1 ) ]
	m = [ 0.0 ] * n
	m[ 0 ], m[ - 1 ] = d[ 0 ], d[ - 1 ]
	for i in range( 1, n - 1 ):
		if d[ i - 1 ] * d[ i ] <= 0: m[ i ] = 0
		else:
			w1, w2 = 2 * h[ i ] + h[ i - 1 ], h[ i ] + 2 * h[ i - 1 ]
			m[ i ] = ( w1 + w2 ) / ( w1 / d[ i - 1 ] + w2 / d[ i ] )
	def f( x ):
		if x <= xs[ 0 ]: return ys[ 0 ]
		if x >= xs[ - 1 ]: return ys[ - 1 ]
		i = max( 0, min( n - 2, next( k for k in range( n - 1 ) if x <= xs[ k + 1 ] ) ) )
		t = ( x - xs[ i ] ) / h[ i ]
		t2, t3 = t * t, t * t * t
		return ( 2 * t3 - 3 * t2 + 1 ) * ys[ i ] + ( t3 - 2 * t2 + t ) * h[ i ] * m[ i ] + ( - 2 * t3 + 3 * t2 ) * ys[ i + 1 ] + ( t3 - t2 ) * h[ i ] * m[ i + 1 ]
	return f

def newell( ps ):
	n = Vector( ( 0, 0, 0 ) )
	for i in range( len( ps ) ):
		a, b = ps[ i ], ps[ ( i + 1 ) % len( ps ) ]
		n.x += ( a.y - b.y ) * ( a.z + b.z ); n.y += ( a.z - b.z ) * ( a.x + b.x ); n.z += ( a.x - b.x ) * ( a.y + b.y )
	return n

# ------------------------------------------------------------------ mesh building in the game frame

class Mesh:

	def __init__( self, mats, lod = False ):
		self.bm = bmesh.new()
		self.uv = self.bm.loops.layers.uv.new( 'UVMap' )
		self.mats = mats
		self.lod = lod

	def mat( self, mat ):
		return LOD_MAT[ mat ] if self.lod else mat

	# a face (game-frame points) on one atlas cell (or explicit uvs), turned so its normal agrees with `out` (game frame)
	def face( self, pts, mat, cell = 'white', out = None, uvs = None ):
		ps = [ Vector( p ) for p in pts ]
		if len( ps ) < 3: return None
		if out is not None:
			n = newell( ps )
			if n.length < 1e-12: return None
			if n.dot( Vector( out ) ) < 0:
				ps = ps[ :: - 1 ]
				if uvs: uvs = uvs[ :: - 1 ]
		vs = [ self.bm.verts.new( B( p ) ) for p in ps ]
		try:
			f = self.bm.faces.new( vs )
		except ValueError:
			return None
		f.material_index = self.mats.index( self.mat( mat ) )
		f.smooth = True
		for k, l in enumerate( f.loops ):
			l[ self.uv ].uv = uvs[ k ] if uvs else cell_uv( cell )
		return f

	# an axis-aligned box (centre, full size) in the game frame
	def box( self, c, s, mat, cell = 'white', skip = () ):
		x, y, z = c; hx, hy, hz = s[ 0 ] / 2, s[ 1 ] / 2, s[ 2 ] / 2
		P = lambda i, j, k: ( x + i * hx, y + j * hy, z + k * hz )
		faces = {
			'+x': ( [ P( 1, - 1, - 1 ), P( 1, 1, - 1 ), P( 1, 1, 1 ), P( 1, - 1, 1 ) ], ( 1, 0, 0 ) ), '-x': ( [ P( - 1, - 1, - 1 ), P( - 1, - 1, 1 ), P( - 1, 1, 1 ), P( - 1, 1, - 1 ) ], ( - 1, 0, 0 ) ),
			'+y': ( [ P( - 1, 1, - 1 ), P( - 1, 1, 1 ), P( 1, 1, 1 ), P( 1, 1, - 1 ) ], ( 0, 1, 0 ) ), '-y': ( [ P( - 1, - 1, - 1 ), P( 1, - 1, - 1 ), P( 1, - 1, 1 ), P( - 1, - 1, 1 ) ], ( 0, - 1, 0 ) ),
			'+z': ( [ P( - 1, - 1, 1 ), P( 1, - 1, 1 ), P( 1, 1, 1 ), P( - 1, 1, 1 ) ], ( 0, 0, 1 ) ), '-z': ( [ P( - 1, - 1, - 1 ), P( - 1, 1, - 1 ), P( 1, 1, - 1 ), P( 1, - 1, - 1 ) ], ( 0, 0, - 1 ) ),
		}
		for k, ( pts, o ) in faces.items():
			if k in skip: continue
			self.face( pts, mat, cell, out = o )

	# a closed loft of rings (each a list of game points, the same count); caps the ends; out from each ring's centroid
	def loft_rings( self, rings, mat, cell, cap = True, cells = None ):
		cs = [ sum( ( Vector( p ) for p in r ), Vector() ) / len( r ) for r in rings ]
		n = len( rings[ 0 ] )
		for i in range( len( rings ) - 1 ):
			a, b = rings[ i ], rings[ i + 1 ]
			for k in range( n ):
				q = [ a[ k ], a[ ( k + 1 ) % n ], b[ ( k + 1 ) % n ], b[ k ] ]
				c = sum( ( Vector( p ) for p in q ), Vector() ) / 4
				mid = ( cs[ i ] + cs[ i + 1 ] ) / 2
				cl = cells( i, k ) if cells else ( mat, cell )
				self.face( q, cl[ 0 ], cl[ 1 ], out = c - mid )
		if cap:
			for r, c, o in ( ( rings[ 0 ], cs[ 0 ], cs[ 0 ] - cs[ 1 ] ), ( rings[ - 1 ], cs[ - 1 ], cs[ - 1 ] - cs[ - 2 ] ) ):
				self.face( r, mat, cell, out = o )

	# a tube from a to b (game points), radius r
	def tube( self, a, b, r, mat, cell, seg = 8, cap = True ):
		a, b = Vector( a ), Vector( b )
		d = ( b - a ).normalized()
		u = d.cross( Vector( ( 0, 1, 0 ) ) if abs( d.y ) < 0.9 else Vector( ( 1, 0, 0 ) ) ).normalized()
		v = d.cross( u )
		ring = lambda c: [ tuple( c + ( u * math.cos( t ) + v * math.sin( t ) ) * r ) for t in [ i / seg * math.pi * 2 for i in range( seg ) ] ]
		self.loft_rings( [ ring( a ), ring( b ) ], mat, cell, cap = cap )

	# a rounded-rectangle section ( half w, half h, corner r ) at centre c, in the plane spanned by unit u (width) and v
	@staticmethod
	def rrect( c, u, v, hw, hh, r, seg = 3 ):
		c, u, v = Vector( c ), Vector( u ), Vector( v )
		r = min( r, hw * 0.98, hh * 0.98 )
		pts = []
		for ( sx, sy, a0 ) in ( ( 1, 1, 0 ), ( - 1, 1, 90 ), ( - 1, - 1, 180 ), ( 1, - 1, 270 ) ):
			cc = c + u * sx * ( hw - r ) + v * sy * ( hh - r )
			for j in range( seg + 1 ):
				a = math.radians( a0 + 90 * j / seg )
				pts.append( tuple( cc + ( u * math.cos( a ) + v * math.sin( a ) ) * r ) )
		return pts

	def object( self, name, sharp = 38 ):
		me = bpy.data.meshes.new( name )
		bmesh.ops.remove_doubles( self.bm, verts = self.bm.verts, dist = 1e-5 )
		self.bm.to_mesh( me )
		self.bm.free()
		for m in self.mats: me.materials.append( MATS[ m ] )
		me.set_sharp_from_angle( angle = math.radians( sharp ) )
		ob = bpy.data.objects.new( name, me )
		bpy.context.scene.collection.objects.link( ob )
		return ob

# ------------------------------------------------------------------ the lower body: cross sections along z

# st: stations ( z, bottom, top, half width, crown, shoulder inset ) rear to front; wheels: [ ( zAxle, r ) ]
def lower_body( m, st, wheels, p, lod ):
	zs = [ s[ 0 ] for s in st ]
	F = [ pchip( zs, [ s[ j ] for s in st ] ) for j in range( 1, 6 ) ]
	z0, z1 = zs[ 0 ], zs[ - 1 ]
	arch_r = p.get( 'arch', 0.055 )
	# z samples: even steps, every station, dense round the arches, dense at the ends
	step = 0.11 if not lod else 0.32
	samples = set( zs )
	n = int( ( z1 - z0 ) / step )
	for i in range( n + 1 ): samples.add( z0 + ( z1 - z0 ) * i / n )
	for ( zw, r ) in wheels:
		Ra = r + arch_r
		k = 16 if not lod else 5
		for i in range( k + 1 ): samples.add( zw + Ra * math.cos( math.pi * i / k ) )
		for d in ( Ra + 0.012, - Ra - 0.012 ): samples.add( zw + d )
	if not lod:
		for d in ( 0.012, 0.035, 0.07 ): samples.add( z0 + d ); samples.add( z1 - d )
	zl = sorted( z for z in samples if z0 <= z <= z1 )
	keep = [ zl[ 0 ] ]
	for z in zl[ 1: ]:
		if z - keep[ - 1 ] > ( 0.008 if not lod else 0.05 ) or z == z1: keep.append( z )
	if keep[ - 1 ] != z1: keep.append( z1 )
	zl = keep
	tuck, belt = p.get( 'tuck', 0.07 ), p.get( 'belt', 0.45 )
	flare = p.get( 'flare', 0.012 )

	crease = p.get( 'crease', 0.006 )
	def section( z ):
		bot, top, hw, crown, sh = [ f( z ) for f in F ]
		# the side flares a touch over each wheel (a long, soft swell)
		arch = 0
		for ( zw, r ) in wheels:
			Ra = r + arch_r
			dz = abs( z - zw )
			if dz < Ra: arch = max( arch, r + math.sqrt( Ra * Ra - dz * dz ) )
			if dz < Ra + 0.45: hw += flare * 0.5 * ( 1 + math.cos( math.pi * min( 1, dz / ( Ra + 0.45 ) ) ) )
		H = max( 0.04, top - bot )
		# sill, rocker, the widest line, a character crease, the shoulder, the crowned top
		half = [ ( 0, bot ), ( hw - tuck, bot ), ( hw - tuck * 0.3, bot + min( 0.035, H * 0.12 ) ),
			( hw - 0.004, bot + H * belt * 0.45 ), ( hw, bot + H * belt ), ( hw - 0.002, bot + H * ( belt + ( 1 - belt ) * 0.42 ) ),
			( hw - crease, bot + H * ( belt + ( 1 - belt ) * 0.5 ) ), ( hw - crease - 0.004, bot + H * ( belt + ( 1 - belt ) * 0.78 ) ),
			( hw - sh * 0.55, top - min( 0.022, H * 0.08 ) ), ( hw - sh, top - 0.004 ), ( ( hw - sh ) * 0.8, top + crown * 0.5 ),
			( ( hw - sh ) * 0.42, top + crown * 0.9 ), ( 0, top + crown ) ]
		# the arch: its edge is ring point 2 exactly on the arch curve (the side above keeps its line, the points below
		# stack on the edge); points 0..2 turn into the wheel well's liner. The outline is the curve, not a stair of faces.
		lifted = [ False ] * len( half )
		if arch > half[ 2 ][ 1 ]:
			side = [ half[ i ] for i in range( 2, 9 ) ]
			ex = side[ - 1 ][ 0 ]
			for ( x0, y0 ), ( x1, y1 ) in zip( side, side[ 1: ] ):
				if y0 <= arch <= y1: ex = lerp( x0, x1, ( arch - y0 ) / ( y1 - y0 ) if y1 > y0 else 0 ); break
			half[ 0 ] = ( 0, arch + 0.002 )
			half[ 1 ] = ( ex - 0.07, arch + 0.001 )
			half[ 2 ] = ( ex, arch )
			for i in range( 3, len( half ) - 4 ):
				if half[ i ][ 1 ] < arch + 0.0015 * ( i - 2 ): half[ i ] = ( ex, arch + 0.0015 * ( i - 2 ) )
			lifted[ 0 ] = lifted[ 1 ] = lifted[ 2 ] = True
		if lod:
			keep = ( 0, 2, 4, 9, 10, 12 )
			half = [ half[ i ] for i in keep ]; lifted = [ lifted[ i ] for i in keep ]
		ring = [ ( x, y, z ) for ( x, y ) in half ] + [ ( - x, y, z ) for ( x, y ) in half[ - 2: 0: - 1 ] ]
		lift = lifted + lifted[ - 2: 0: - 1 ]
		return ring, ( bot + top ) / 2, lift

	rings, mids, lifts = [], [], []
	for z in zl:
		r, mid, lf = section( z )
		rings.append( r ); mids.append( mid ); lifts.append( lf )
	n = len( rings[ 0 ] )
	for i in range( len( rings ) - 1 ):
		a, b = rings[ i ], rings[ i + 1 ]
		for k in range( n ):
			q = [ a[ k ], a[ ( k + 1 ) % n ], b[ ( k + 1 ) % n ], b[ k ] ]
			c = sum( ( Vector( p ) for p in q ), Vector() ) / 4
			out = Vector( ( c.x, c.y - ( mids[ i ] + mids[ i + 1 ] ) / 2, 0 ) )
			under = k == 0 or k == n - 1
			k2 = ( k + 1 ) % n
			liner = ( lifts[ i ][ k ] and lifts[ i ][ k2 ] ) or ( lifts[ i + 1 ][ k ] and lifts[ i + 1 ][ k2 ] )
			f = m.face( q, 'CarTrim' if under or liner else 'CarPaint', 'housing' if liner and not under else 'plastic' if under else 'white', out = out )
			if f and liner: f.smooth = False
	for ring, d in ( ( rings[ 0 ], - 1 ), ( rings[ - 1 ], 1 ) ):
		m.face( ring, 'CarPaint', 'white', out = ( 0, 0, d ) )

# ------------------------------------------------------------------ the greenhouse: plan-view rings from belt to roof

# g: y / w / zf / zr / rcf / rcr: ( t, value ) lists; bowf / bowr; tumble; rows: [ ( t, label ) ]; side( t, zs0, zs1 ) ->
# [ ( z, label of the segment from z ) ]; mat( row, col ) -> ( material, cell ); crown; insets
def greenhouse( m, g, lod ):
	arc = 3 if not lod else 1
	def ring( t ):
		y = pw( g[ 'y' ], t )
		w0, w1 = pw( g[ 'w' ], 0 ), pw( g[ 'w' ], 1 )
		tt = max( 0.0, min( 1.0, t ) )
		w = w0 + ( w1 - w0 ) * ( tt ** g.get( 'tumble', 1.3 ) ) if t >= 0 else w0
		zf, zr = pw( g[ 'zf' ], t ), pw( g[ 'zr' ], t )
		rcf, rcr = pw( g[ 'rcf' ], t ), pw( g[ 'rcr' ], t )
		bf, br = g.get( 'bowf', 0.08 ), g.get( 'bowr', 0.06 )
		pts, labels = [], []
		# rear edge, centre to corner
		nr = 3 if not lod else 1
		for i in range( nr ):
			x = ( w - rcr ) * i / nr
			pts.append( ( x, y, zr + br * ( x / w ) ** 2 ) ); labels.append( 'R' )
		ze = zr + br * ( ( w - rcr ) / w ) ** 2
		for j in range( arc ):
			a = - math.pi / 2 + math.pi / 2 * j / arc
			pts.append( ( w - rcr + math.cos( a ) * rcr, y, ze + rcr + math.sin( a ) * rcr ) ); labels.append( 'C' )
		zf_e = zf - bf * ( ( w - rcf ) / w ) ** 2
		zs0, zs1 = ze + rcr, zf_e - rcf
		brk = g[ 'side' ]( t, zs0, zs1 )
		last = zs0 - 1
		for i, ( z, lab ) in enumerate( brk ):
			room = ( len( brk ) - i ) * 0.003
			z = max( last + 0.003, min( zs1 - room, z ) ) if i else zs0
			pts.append( ( w, y, z ) ); labels.append( lab ); last = z
		for j in range( arc ):
			a = math.pi / 2 * j / arc
			pts.append( ( w - rcf + math.cos( a ) * rcf, y, zf_e - rcf + math.sin( a ) * rcf ) ); labels.append( 'A' )
		nf = 3 if not lod else 1
		for i in range( nf ):
			x = ( w - rcf ) * ( 1 - i / nf )
			pts.append( ( x, y, zf - bf * ( x / w ) ** 2 ) ); labels.append( 'F' )
		pts.append( ( 0, y, zf ) )
		# mirror: the right half back from the front centre to the rear centre
		half = len( pts )
		full = pts + [ ( - x, y, z ) for ( x, y, z ) in pts[ - 2: 0: - 1 ] ]
		lab_full = labels + [ labels[ k - 1 ] for k in range( half - 1, 1, - 1 ) ] + [ labels[ 0 ] ]
		return full, lab_full, ( zf + zr ) / 2, y
	rows = g[ 'rows' ] if not lod else g.get( 'lodRows', g[ 'rows' ] )
	rings = [ ring( t ) for ( t, _ ) in rows ]
	n = len( rings[ 0 ][ 0 ] )
	for i in range( len( rows ) - 1 ):
		( a, la, zc, ya ), ( b, _, zc2, yb ) = rings[ i ], rings[ i + 1 ]
		row = rows[ i ][ 1 ]
		for k in range( n ):
			q = [ a[ k ], a[ ( k + 1 ) % n ], b[ ( k + 1 ) % n ], b[ k ] ]
			c = sum( ( Vector( p ) for p in q ), Vector() ) / 4
			mat, cell = g[ 'mat' ]( row, la[ k ] )
			m.face( q, mat, cell, out = ( c.x, 0, c.z - ( zc + zc2 ) / 2 ) )
	# the roof: inset rings rising to the crown, a fan to the centre
	top, _, zc, y = rings[ - 1 ]
	crown = g.get( 'crown', 0.035 )
	prev = top
	for f in ( g.get( 'insets', ( 0.04, 0.22, 0.55 ) ) if not lod else ( 0.3, ) ):
		cur = [ ( x * ( 1 - f ), y + crown * ( 1 - ( 1 - f ) ** 2 ), zc + ( z - zc ) * ( 1 - f * 0.92 ) ) for ( x, _, z ) in top ]
		for k in range( n ):
			m.face( [ prev[ k ], prev[ ( k + 1 ) % n ], cur[ ( k + 1 ) % n ], cur[ k ] ], 'CarPaint', 'white', out = ( 0, 1, 0 ) )
		prev = cur
	cen = ( 0, y + crown, zc )
	for k in range( n ):
		m.face( [ prev[ k ], prev[ ( k + 1 ) % n ], cen ], 'CarPaint', 'white', out = ( 0, 1, 0 ) )

# ------------------------------------------------------------------ decals projected onto the shell

class Projector:

	def __init__( self, m ):
		self.m = m
		m.bm.normal_update() # (new faces carry no normal until this: the decals would sit on the shell and z-fight)
		self.bvh = BVHTree.FromBMesh( m.bm )

	def hit( self, p2, axis, sign ):
		a, b = p2
		if axis == 'z': o, d = ( a, b, sign * 30 ), ( 0, 0, - sign )
		elif axis == 'x': o, d = ( sign * 30, b, a ), ( - sign, 0, 0 )
		else: o, d = ( a, 30, b ), ( 0, - 1, 0 )
		loc, nrm, _, _ = self.bvh.ray_cast( B( o ), B( d ), 80 )
		if loc is None: return None
		return G( loc ), G( nrm ).normalized()

	# a projected patch. shape 'quad': pts = 4 corners ( a, b ) in the projection plane; 'disc': ( ca, cb, ra, rb );
	# 'arc': ( ca, cb, r0, r1, a0, a1 ) (an annulus sector, angles in degrees from +a)
	def decal( self, shape, pts, axis, sign, mat, cell, off = 0.003, nu = 3, nv = 2, mirror = False, uv = None, lodkeep = False ):
		m = self.m
		if m.lod and not lodkeep: return
		if m.lod: nu, nv = max( 1, nu // 3 ), max( 1, nv // 2 )
		variants = [ ( sign, 1 ) ]
		if mirror: variants.append( ( - sign, 1 ) if axis == 'x' else ( sign, - 1 ) )
		for ( sg, fx ) in variants:
			grid = []
			for j in range( nv + 1 ):
				row = []
				for i in range( nu + 1 ):
					u, v = i / nu, j / nv
					if shape == 'quad':
						p0, p1, p2, p3 = pts
						a = lerp( lerp( p0[ 0 ], p1[ 0 ], u ), lerp( p3[ 0 ], p2[ 0 ], u ), v )
						b = lerp( lerp( p0[ 1 ], p1[ 1 ], u ), lerp( p3[ 1 ], p2[ 1 ], u ), v )
					elif shape == 'disc':
						ca, cb, ra, rb = pts
						t = u * math.pi * 2
						a, b = ca + math.cos( t ) * ra * v, cb + math.sin( t ) * rb * v
					else:
						ca, cb, r0, r1, a0, a1 = pts
						t = math.radians( lerp( a0, a1, u ) )
						r = lerp( r0, r1, v )
						a, b = ca + math.cos( t ) * r, cb + math.sin( t ) * r
					if axis != 'x': a *= fx
					h = self.hit( ( a, b ), axis, sg )
					row.append( None if h is None else ( h[ 0 ] + h[ 1 ] * off, h[ 1 ], u, v ) )
				grid.append( row )
			# a ray that slipped past the edge and struck something far behind (a wall further along, a cab) is dropped:
			# a patch hugs one surface
			ax = { 'x': 0, 'y': 1, 'z': 2 }[ axis ]
			depth = sorted( c[ 0 ][ ax ] for row in grid for c in row if c is not None )
			if depth:
				med = depth[ len( depth ) // 2 ]
				grid = [ [ c if c is not None and abs( c[ 0 ][ ax ] - med ) < 0.22 else None for c in row ] for row in grid ]
			for j in range( nv ):
				for i in range( nu ):
					q = [ grid[ j ][ i ], grid[ j ][ i + 1 ], grid[ j + 1 ][ i + 1 ], grid[ j + 1 ][ i ] ]
					if any( x is None for x in q ): continue
					out = sum( ( x[ 1 ] for x in q ), Vector() )
					uvs = [ cell_uv( cell, x[ 2 ], x[ 3 ] ) for x in q ] if uv == 'stretch' else None
					if shape == 'disc' and j == 0:
						# the centre row collapses: triangles
						tri = [ q[ 0 ], q[ 2 ], q[ 3 ] ]
						m.face( [ x[ 0 ] for x in tri ], mat, cell, out = out )
						continue
					m.face( [ x[ 0 ] for x in q ], mat, cell, out = out, uvs = uvs )

	# a thin strip along a polyline in the projection plane (shut lines, chrome strips)
	def strip( self, line, width, axis, sign, mat, cell, off = 0.002, mirror = False, lodkeep = False, seg = 1 ):
		for ( a0, b0 ), ( a1, b1 ) in zip( line, line[ 1: ] ):
			da, db = a1 - a0, b1 - b0
			L = math.hypot( da, db ) or 1
			seg = max( seg, int( math.ceil( L / 0.05 ) ) )
			na, nb = - db / L * width / 2, da / L * width / 2
			self.decal( 'quad', [ ( a0 + na, b0 + nb ), ( a0 - na, b0 - nb ), ( a1 - na, b1 - nb ), ( a1 + na, b1 + nb ) ], axis, sign, mat, cell,
				off = off, nu = 1, nv = max( 1, seg ), mirror = mirror, lodkeep = lodkeep )

# ------------------------------------------------------------------ wheels

# a wheel: radius r, width ww, its hub at the origin, axis along game x; both faces dressed (the game draws the FL wheel for
# all four). style: rim design; lod: a cheap far wheel
def wheel( name, r, ww, style, lod = False ):
	m = Mesh( [ 'Lod1Wheel' if lod else 'CarWheel' ], lod = lod )
	seg = 28 if not lod else 10
	ring = lambda x, rr, ph = 0: [ ( x, math.cos( a ) * rr, math.sin( a ) * rr ) for a in [ ( i + ph ) / seg * math.pi * 2 for i in range( seg ) ] ]
	rim_r = r * style.get( 'rim', 0.64 )
	h = ww / 2
	# the tyre: tread, rounded shoulders, sidewalls to the bead
	prof = [ ( - h * 0.97, rim_r + 0.012, 'wall' ), ( - h, r * 0.86, 'wall' ), ( - h * 0.92, r - 0.018, 'tyre' ), ( - h * 0.7, r, 'tyre' ),
		( h * 0.7, r, 'tyre' ), ( h * 0.92, r - 0.018, 'tyre' ), ( h, r * 0.86, 'wall' ), ( h * 0.97, rim_r + 0.012, 'wall' ) ]
	if lod: prof = [ prof[ i ] for i in ( 0, 1, 3, 4, 6, 7 ) ]
	rings = [ ring( x, rr ) for ( x, rr, _ ) in prof ]
	for i in range( len( rings ) - 1 ):
		cell = prof[ i ][ 2 ] if prof[ i ][ 2 ] == prof[ i + 1 ][ 2 ] else 'wall'
		for k in range( seg ):
			k2 = ( k + 1 ) % seg
			q = [ rings[ i ][ k ], rings[ i ][ k2 ], rings[ i + 1 ][ k2 ], rings[ i + 1 ][ k ] ]
			c = sum( ( Vector( p ) for p in q ), Vector() ) / 4
			m.face( q, 'CarWheel', cell, out = ( 0, c.y, c.z ) )
	for side in ( 1, - 1 ):
		xo = side * h * 0.97
		outv = ( side, 0, 0 )
		lip = ring( xo, rim_r + 0.012 )
		lip_in = ring( xo - side * 0.012, rim_r - 0.012 )
		for k in range( seg ):
			k2 = ( k + 1 ) % seg
			m.face( [ lip[ k ], lip[ k2 ], lip_in[ k2 ], lip_in[ k ] ], 'CarWheel', style[ 'face' ], out = outv )
		if lod:
			cen = ( xo - side * 0.02, 0, 0 )
			for k in range( seg ):
				m.face( [ lip_in[ k ], lip_in[ ( k + 1 ) % seg ], cen ], 'CarWheel', style[ 'face' ], out = outv )
			continue
		# the dish: spokes at the face, the holes deep (the brake disc behind them)
		nsp = style.get( 'spokes', 5 )
		frac = style.get( 'fill', 0.42 )
		dish = style.get( 'dish', 0.03 )
		r_hub = r * style.get( 'hub', 0.2 )
		r_in = rim_r - 0.012
		xs = xo - side * ( 0.012 + dish )   # the spoke face
		xh = xo - side * ( 0.012 + 0.085 )  # the hole floor (the disc)
		# angular grid: per spoke pitch, sub-steps for the spoke and the hole
		sub = 3
		ang = []
		for s in range( nsp ):
			base = s / nsp * math.pi * 2
			for j in range( sub + 1 ): ang.append( ( base + frac * ( 2 * math.pi / nsp ) * j / sub, 'spoke' if j < sub else 'hole' ) )
			for j in range( 1, sub ): ang.append( ( base + ( frac + ( 1 - frac ) * j / sub ) * ( 2 * math.pi / nsp ), 'hole' ) )
		ang.sort()
		P = lambda x, rr, a: ( x, math.cos( a ) * rr, math.sin( a ) * rr )
		na = len( ang )
		for i in range( na ):
			a0, kind = ang[ i ]
			a1 = ang[ ( i + 1 ) % na ][ 0 ] + ( math.pi * 2 if i == na - 1 else 0 )
			if kind == 'spoke':
				# spoke face from the hub out to the lip, curving back a little toward the lip (concave dish)
				m.face( [ P( xs, r_hub, a0 ), P( xs, r_hub, a1 ), P( xo - side * 0.012, r_in, a1 ), P( xo - side * 0.012, r_in, a0 ) ], 'CarWheel', style[ 'face' ], out = outv )
			else:
				m.face( [ P( xh, r_hub, a0 ), P( xh, r_hub, a1 ), P( xh, r_in, a1 ), P( xh, r_in, a0 ) ], 'CarWheel', 'disc' if style.get( 'disc', True ) else 'darkrim', out = outv )
				# the hole's walls: at the lip, at the hub
				m.face( [ P( xo - side * 0.012, r_in, a0 ), P( xo - side * 0.012, r_in, a1 ), P( xh, r_in, a1 ), P( xh, r_in, a0 ) ], 'CarWheel', 'darkrim', out = ( 0, - math.cos( ( a0 + a1 ) / 2 ), - math.sin( ( a0 + a1 ) / 2 ) ) )
				m.face( [ P( xs, r_hub, a0 ), P( xs, r_hub, a1 ), P( xh, r_hub, a1 ), P( xh, r_hub, a0 ) ], 'CarWheel', 'darkrim', out = ( 0, math.cos( ( a0 + a1 ) / 2 ), math.sin( ( a0 + a1 ) / 2 ) ) )
			# side walls where a spoke meets a hole
			nxt = ang[ ( i + 1 ) % na ][ 1 ]
			if kind != nxt:
				a = a1
				tang = ( 0, - math.sin( a ), math.cos( a ) )
				o = tang if kind == 'spoke' else tuple( - c for c in tang )
				m.face( [ P( xs, r_hub, a ), P( xo - side * 0.012, r_in, a ), P( xh, r_in, a ), P( xh, r_hub, a ) ], 'CarWheel', 'darkrim', out = o )
		# the centre cap (and lug nuts on steel wheels)
		cap = ring( xs + side * 0.004, r_hub )
		cen = ( xs + side * 0.012, 0, 0 )
		for k in range( seg ):
			m.face( [ cap[ k ], cap[ ( k + 1 ) % seg ], cen ], 'CarWheel', style.get( 'cap', 'chrome' ), out = outv )
	return m.object( name, sharp = 50 )

WHEELS = {
	'alloy5': { 'face': 'rim', 'spokes': 5, 'fill': 0.4, 'dish': 0.035, 'cap': 'darkrim' },
	'alloy10': { 'face': 'rim', 'spokes': 10, 'fill': 0.38, 'dish': 0.045, 'cap': 'chrome', 'rim': 0.7 },
	'sport': { 'face': 'darkrim', 'spokes': 7, 'fill': 0.3, 'dish': 0.05, 'cap': 'gloss', 'rim': 0.72 },
	'steel': { 'face': 'lightgrey', 'spokes': 8, 'fill': 0.78, 'dish': 0.02, 'cap': 'chrome', 'rim': 0.6, 'hub': 0.28 },
	'police': { 'face': 'steel', 'spokes': 8, 'fill': 0.76, 'dish': 0.02, 'cap': 'chrome', 'rim': 0.62, 'hub': 0.26 },
	'truck': { 'face': 'rim', 'spokes': 6, 'fill': 0.5, 'dish': 0.04, 'cap': 'chrome', 'rim': 0.62 },
	'bus': { 'face': 'lightgrey', 'spokes': 10, 'fill': 0.8, 'dish': 0.06, 'cap': 'steel', 'rim': 0.55, 'hub': 0.3, 'disc': False },
}

# ------------------------------------------------------------------ the cars (game frame, metres)

# L length, W width, wb wheelbase, r wheel radius, ww wheel width
SPECS = {
	'sedan': { 'L': 4.6, 'W': 1.8, 'wb': 2.72, 'r': 0.33, 'ww': 0.22 },
	'taxi': { 'L': 4.7, 'W': 1.8, 'wb': 2.78, 'r': 0.33, 'ww': 0.22 },
	'police': { 'L': 4.8, 'W': 1.84, 'wb': 2.8, 'r': 0.34, 'ww': 0.23 },
	'pickup': { 'L': 5.3, 'W': 1.95, 'wb': 3.2, 'r': 0.39, 'ww': 0.26 },
	'van': { 'L': 5.1, 'W': 1.98, 'wb': 3.1, 'r': 0.36, 'ww': 0.24 },
	'sports': { 'L': 4.35, 'W': 1.92, 'wb': 2.55, 'r': 0.34, 'ww': 0.27 },
	'bus': { 'L': 11.0, 'W': 2.5, 'wb': 6.2, 'r': 0.5, 'ww': 0.3 },
}

def pmat( row, col, belt = ( 'CarTrim', 'chrome' ), bpost = ( 'CarTrim', 'gloss' ), glass = 'glass', paintcols = 'ACP' ):
	paint = ( 'CarPaint', 'white' )
	trim = ( 'CarTrim', 'housing' )
	if row in ( 'base', 'edge' ): return paint
	if col in paintcols: return paint
	if col == 'B': return bpost
	if row == 'belt': return belt if col == 'G' else trim
	if row == 'header': return trim
	if row == 'glass': return ( 'CarTrim', glass ) if col in 'GFR' else trim
	return paint

ROWS_CAR = [ ( - 0.06, 'base' ), ( 0.0, 'belt' ), ( 0.04, 'glass' ), ( 0.36, 'glass' ), ( 0.68, 'glass' ), ( 0.9, 'header' ), ( 0.962, 'edge' ), ( 1.0, None ) ]
ROWS_LOD = [ ( - 0.06, 'base' ), ( 0.04, 'glass' ), ( 0.92, 'edge' ), ( 1.0, None ) ]

def car_lamps_front( P, w, y0, y1, xin, xout, slope = 0.02, ind = True, fog = None, drl = True, round_lamps = False ):
	# headlamps: a black housing, the bright projector(s) and a running-light strip along the lower edge, an amber corner
	if round_lamps:
		for cx in ( xout - 0.075, xin + 0.075 ):
			P.decal( 'disc', ( cx, ( y0 + y1 ) / 2, 0.075, 0.07 ), 'z', 1, 'CarTrim', 'chrome', off = 0.003, nu = 12, nv = 2, mirror = True, lodkeep = True )
			P.decal( 'disc', ( cx, ( y0 + y1 ) / 2, 0.058, 0.054 ), 'z', 1, 'CarLamp', 'head', off = 0.005, nu = 12, nv = 2, mirror = True, lodkeep = True )
	else:
		P.decal( 'quad', [ ( xout, y0 - slope ), ( xin, y0 ), ( xin + 0.015, y1 ), ( xout - 0.04, y1 + slope * 0.5 ) ], 'z', 1, 'CarTrim', 'housing', off = 0.003, nu = 5, nv = 2, mirror = True, lodkeep = True )
		pm = ( xin + xout ) / 2
		for cx, rr in ( ( pm - ( xout - xin ) * 0.2, 0.045 ), ( pm + ( xout - xin ) * 0.18, 0.04 ) ):
			P.decal( 'disc', ( cx, ( y0 + y1 ) / 2 + 0.008, rr, rr * 0.9 ), 'z', 1, 'CarLamp', 'head', off = 0.0055, nu = 10, nv = 1, mirror = True )
		P.decal( 'quad', [ ( pm - 0.04, ( y0 + y1 ) / 2 - 0.004 ), ( pm + 0.04, ( y0 + y1 ) / 2 - 0.004 ), ( pm + 0.04, ( y0 + y1 ) / 2 + 0.02 ), ( pm - 0.04, ( y0 + y1 ) / 2 + 0.02 ) ], 'z', 1, 'CarTrim', 'chrome', off = 0.0045, nu = 1, nv = 1, mirror = True )
		if drl: P.decal( 'quad', [ ( xout - 0.02, y0 - slope + 0.008 ), ( xin + 0.01, y0 + 0.008 ), ( xin + 0.012, y0 + 0.022 ), ( xout - 0.025, y0 - slope + 0.022 ) ], 'z', 1, 'CarLamp', 'head', off = 0.005, nu = 4, nv = 1, mirror = True, lodkeep = True )
	if ind:
		P.decal( 'quad', [ ( min( w - 0.07, xout + 0.07 ), y0 - slope + 0.004 ), ( xout + 0.008, y0 - slope + 0.004 ), ( xout - 0.004, y1 - 0.01 ), ( min( w - 0.08, xout + 0.06 ), y1 - 0.014 ) ], 'z', 1, 'CarLamp', 'amber', off = 0.004, nu = 2, nv = 2, mirror = True )
	if fog:
		fx, fy = fog
		P.decal( 'disc', ( fx, fy, 0.05, 0.045 ), 'z', 1, 'CarTrim', 'housing', off = 0.003, nu = 10, nv = 1, mirror = True )
		P.decal( 'disc', ( fx, fy, 0.036, 0.032 ), 'z', 1, 'CarLamp', 'head', off = 0.005, nu = 10, nv = 1, mirror = True )

def grille( P, x, y0, y1, slats = 3, surround = 'chrome', mesh = 'grille', taper = 0.04, lodkeep = True ):
	P.decal( 'quad', [ ( - x - 0.015, y0 - 0.015 ), ( x + 0.015, y0 - 0.015 ), ( x - taper + 0.015, y1 + 0.015 ), ( - x + taper - 0.015, y1 + 0.015 ) ], 'z', 1, 'CarTrim', surround, off = 0.003, nu = 6, nv = 2, lodkeep = lodkeep )
	P.decal( 'quad', [ ( - x, y0 ), ( x, y0 ), ( x - taper, y1 ), ( - x + taper, y1 ) ], 'z', 1, 'CarTrim', mesh, off = 0.0045, nu = 6, nv = 2, lodkeep = lodkeep )
	for j in range( slats ):
		yy = lerp( y0, y1, ( j + 1 ) / ( slats + 1 ) )
		xx = x - taper * ( j + 1 ) / ( slats + 1 )
		P.strip( [ ( - xx + 0.01, yy ), ( xx - 0.01, yy ) ], 0.012, 'z', 1, 'CarTrim', surround, off = 0.006 )

def plate( P, y, sign, x = 0.26, h = 0.11, off = 0.004 ):
	P.decal( 'quad', [ ( - x, y ), ( x, y ), ( x, y + h ), ( - x, y + h ) ], 'z', sign, 'CarTrim', 'plate', off = off, nu = 3, nv = 1, lodkeep = True )

def door_lines( P, lines, w = 0.007 ):
	for line in lines: P.strip( line, w, 'x', 1, 'CarTrim', 'seam', off = 0.0018, mirror = True, seg = 3 )

def handles( P, at, y, chrome = 'chrome' ):
	for z in at:
		P.decal( 'quad', [ ( z - 0.075, y - 0.014 ), ( z + 0.075, y - 0.014 ), ( z + 0.07, y + 0.014 ), ( z - 0.07, y + 0.014 ) ], 'x', 1, 'CarTrim', chrome, off = 0.007, nu = 2, nv = 1, mirror = True )

def side_mirrors( m, x, y, z, s = 1.0, stalk = 'CarPaint', head = 'CarPaint' ):
	# a teardrop housing on a short stalk; its rear face (-z) carries the glass at z - 0.064 (build_interiors.py
	# side_mirror_glass puts the driver's live mirror there)
	for sd in ( 1, - 1 ):
		cx = sd * x
		u, v = ( 1, 0, 0 ), ( 0, 1, 0 )
		rings = []
		for ( dz, f ) in ( ( - 0.06, 1.0 ), ( - 0.03, 1.0 ), ( 0.01, 0.92 ), ( 0.04, 0.7 ), ( 0.058, 0.35 ) ):
			rings.append( Mesh.rrect( ( cx + sd * ( 0.004 * ( 1 - f ) ), y, z + dz ), u, v, 0.08 * s * f, 0.052 * s * f, 0.03 * s * f, 3 if not m.lod else 1 ) )
		m.loft_rings( rings, head, 'white', cap = False )
		m.face( rings[ - 1 ], head, 'white', out = ( 0, 0, 1 ) )
		# the glass on the rear face (the outside view; the driver's view is the interior's live mirror)
		m.face( rings[ 0 ], 'CarTrim', 'housing', out = ( 0, 0, - 1 ) )
		g = Mesh.rrect( ( cx, y, z - 0.0615 ), u, v, 0.068 * s, 0.042 * s, 0.022 * s, 2 if not m.lod else 1 )
		m.face( g, 'CarTrim', 'mirror', out = ( 0, 0, - 1 ) )
		# the stalk to the door (toward the car's middle and down)
		m.tube( ( cx - sd * 0.05, y - 0.015, z ), ( cx - sd * 0.13, y - 0.05, z + 0.02 ), 0.018, stalk if stalk != 'CarPaint' else 'CarTrim', 'housing', seg = 6 )

def exhausts( m, xs, y, z, r = 0.035, l = 0.12 ):
	for x in xs:
		m.tube( ( x, y, z + l ), ( x, y, z ), r, 'CarTrim', 'chrome', seg = 10, cap = False )
		m.face( [ ( x + math.cos( a ) * r * 0.85, y + math.sin( a ) * r * 0.85, z + 0.01 ) for a in [ i / 10 * math.pi * 2 for i in range( 10 ) ] ], 'CarTrim', 'gloss', out = ( 0, 0, - 1 ) )

# ---- the sedan family (sedan, taxi, police): the greenhouse anchors are build_interiors.py's sedan_family()

def sedan_family( m, S, kind, lod ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	wheels = [ ( S[ 'wb' ] / 2, S[ 'r' ] ), ( - S[ 'wb' ] / 2, S[ 'r' ] ) ]
	boxy = kind == 'taxi'
	st = [ ( zr, 0.38, 0.79 if not boxy else 0.84, w - ( 0.13 if not boxy else 0.06 ), 0, 0.02 ),
		( zr + 0.025, 0.34, 0.865, w - ( 0.055 if not boxy else 0.025 ), 0.005, 0.04 ),
		( zr + 0.09, 0.30, 0.935, w - 0.018, 0.012, 0.06 ), ( zr + 0.24, 0.285, 0.975, w, 0.018, 0.08 ),
		( zr + 1.0, 0.28, 0.99, w, 0.02, 0.09 ), ( zf - 1.5, 0.28, 0.955, w, 0.02, 0.09 ),
		( zf - 0.6, 0.28, 0.885, w, 0.03, 0.09 ), ( zf - 0.25, 0.29, 0.83, w - 0.01, 0.028, 0.085 ),
		( zf - 0.1, 0.30, 0.78 if not boxy else 0.8, w - ( 0.035 if not boxy else 0.015 ), 0.02, 0.07 ),
		( zf - 0.03, 0.33, 0.73 if not boxy else 0.78, w - ( 0.08 if not boxy else 0.03 ), 0.01, 0.05 ),
		( zf, 0.37, 0.68 if not boxy else 0.74, w - ( 0.14 if not boxy else 0.07 ), 0, 0.03 ) ]
	lower_body( m, st, wheels, { 'tuck': 0.07, 'belt': 0.42, 'flare': 0.005, 'crease': 0.008 }, lod )
	zb = zf - 2.72  # the B pillar
	def side( t, zs0, zs1 ):
		cw = 0.11 - 0.05 * t
		return [ ( zs0, 'C' ), ( zs0 + cw, 'T' ), ( zs0 + cw + 0.018, 'G' ), ( zb - 0.06, 'T' ), ( zb - 0.045, 'B' ), ( zb + 0.045, 'T' ),
			( zb + 0.06, 'G' ), ( zs1 - 0.05, 'T' ), ( zs1 - 0.032, 'A' ) ]
	belt = ( 'CarTrim', 'chrome' ) if kind != 'police' else ( 'CarTrim', 'housing' )
	g = { 'y': [ ( 0, 0.95 ), ( 1, 1.45 ) ], 'w': [ ( 0, w - 0.1 ), ( 1, w - 0.27 ) ], 'zf': [ ( 0, zf - 1.5 ), ( 1, zf - 2.3 ) ], 'zr': [ ( 0, zr + 1.0 ), ( 1, zr + 1.55 ) ],
		'rcf': [ ( 0, 0.11 ), ( 1, 0.06 ) ], 'rcr': [ ( 0, 0.16 ), ( 1, 0.1 ) ], 'bowf': 0.09, 'bowr': 0.07, 'tumble': 1.35,
		'rows': ROWS_CAR, 'lodRows': ROWS_LOD, 'side': side, 'mat': lambda r, c: pmat( r, c, belt = belt ), 'crown': 0.035 }
	greenhouse( m, g, lod )
	P = Projector( m )
	# ---- front
	if kind == 'taxi':
		grille( P, 0.42, 0.5, 0.66, slats = 4, taper = 0.0 )
		car_lamps_front( P, w, 0.58, 0.7, 0.5, 0.8, slope = 0.0, round_lamps = True, ind = False )
		P.decal( 'quad', [ ( 0.52, 0.5 ), ( 0.72, 0.5 ), ( 0.72, 0.54 ), ( 0.52, 0.54 ) ], 'z', 1, 'CarLamp', 'amber', off = 0.004, nu = 2, nv = 1, mirror = True )
		# chrome bumpers, a black rubber strip
		P.decal( 'quad', [ ( - w + 0.07, 0.36 ), ( w - 0.07, 0.36 ), ( w - 0.07, 0.47 ), ( - w + 0.07, 0.47 ) ], 'z', 1, 'CarTrim', 'chrome', off = 0.003, nu = 8, nv = 2, lodkeep = True )
		P.strip( [ ( - w + 0.08, 0.415 ), ( w - 0.08, 0.415 ) ], 0.025, 'z', 1, 'CarTrim', 'rubber', off = 0.006 )
		plate( P, 0.37, 1, off = 0.008 )
	else:
		grille( P, 0.36 if kind == 'sedan' else 0.4, 0.55, 0.67, slats = 3 if kind == 'sedan' else 0, surround = 'chrome' if kind == 'sedan' else 'gloss', taper = 0.05 )
		car_lamps_front( P, w, 0.645, 0.735, 0.47, 0.82, slope = 0.025, fog = ( 0.63, 0.42 ) if kind == 'sedan' else None )
		P.decal( 'quad', [ ( - 0.5, 0.34 ), ( 0.5, 0.34 ), ( 0.46, 0.43 ), ( - 0.46, 0.43 ) ], 'z', 1, 'CarTrim', 'grille', off = 0.003, nu = 6, nv = 1, lodkeep = True )
		plate( P, 0.44, 1 )
		if kind == 'police':
			# the push bar: two uprights, a cross bar, its rubber pads
			for x in ( - 0.36, 0.36 ):
				m.tube( ( x, 0.32, zf - 0.02 ), ( x, 0.72, zf + 0.16 ), 0.025, 'CarTrim', 'gloss', seg = 6 )
				m.box( ( x, 0.62, zf + 0.15 ), ( 0.07, 0.14, 0.05 ), 'CarTrim', 'rubber' )
			m.tube( ( - 0.4, 0.5, zf + 0.12 ), ( 0.4, 0.5, zf + 0.12 ), 0.022, 'CarTrim', 'gloss', seg = 6 )
			m.tube( ( - 0.4, 0.66, zf + 0.15 ), ( 0.4, 0.66, zf + 0.15 ), 0.022, 'CarTrim', 'gloss', seg = 6 )
			# grille strobes
			for x in ( - 0.2, 0.2 ):
				P.decal( 'quad', [ ( x - 0.06, 0.6 ), ( x + 0.06, 0.6 ), ( x + 0.06, 0.62 ), ( x - 0.06, 0.62 ) ], 'z', 1, 'CarLamp', 'blue' if x > 0 else 'red', off = 0.007, nu = 1, nv = 1 )
	# ---- rear
	ty0, ty1 = ( 0.8, 0.9 ) if kind != 'taxi' else ( 0.62, 0.8 )
	if kind == 'taxi':
		for sx in ( 1, - 1 ):
			P.decal( 'quad', [ ( sx * ( w - 0.05 ), ty0 ), ( sx * ( w - 0.24 ), ty0 ), ( sx * ( w - 0.24 ), ty1 ), ( sx * ( w - 0.05 ), ty1 ) ], 'z', - 1, 'CarLamp', 'tail', off = 0.004, nu = 2, nv = 2, lodkeep = True )
			P.decal( 'quad', [ ( sx * ( w - 0.12 ), ty0 + 0.06 ), ( sx * ( w - 0.2 ), ty0 + 0.06 ), ( sx * ( w - 0.2 ), ty0 + 0.11 ), ( sx * ( w - 0.12 ), ty0 + 0.11 ) ], 'z', - 1, 'CarLamp', 'reverse', off = 0.006, nu = 1, nv = 1 )
		P.decal( 'quad', [ ( - w + 0.07, 0.38 ), ( w - 0.07, 0.38 ), ( w - 0.07, 0.49 ), ( - w + 0.07, 0.49 ) ], 'z', - 1, 'CarTrim', 'chrome', off = 0.003, nu = 8, nv = 2, lodkeep = True )
		plate( P, 0.6, - 1 )
	else:
		for sx in ( 1, - 1 ):
			P.decal( 'quad', [ ( sx * ( w - 0.06 ), ty0 - 0.02 ), ( sx * ( w - 0.4 ), ty0 + 0.01 ), ( sx * ( w - 0.4 ), ty1 ), ( sx * ( w - 0.07 ), ty1 + 0.005 ) ], 'z', - 1, 'CarTrim', 'housing', off = 0.003, nu = 4, nv = 2, lodkeep = True )
			P.decal( 'quad', [ ( sx * ( w - 0.075 ), ty0 - 0.005 ), ( sx * ( w - 0.385 ), ty0 + 0.022 ), ( sx * ( w - 0.385 ), ty1 - 0.012 ), ( sx * ( w - 0.085 ), ty1 - 0.008 ) ], 'z', - 1, 'CarLamp', 'tail', off = 0.005, nu = 4, nv = 2, lodkeep = True )
			P.decal( 'quad', [ ( sx * ( w - 0.27 ), ty0 + 0.03 ), ( sx * ( w - 0.36 ), ty0 + 0.032 ), ( sx * ( w - 0.36 ), ty0 + 0.07 ), ( sx * ( w - 0.27 ), ty0 + 0.07 ) ], 'z', - 1, 'CarLamp', 'reverse', off = 0.0065, nu = 1, nv = 1 )
			P.strip( [ ( sx * ( w - 0.09 ), ty0 + 0.045 ), ( sx * ( w - 0.25 ), ty0 + 0.05 ) ], 0.012, 'z', - 1, 'CarTrim', 'taildark', off = 0.0065 )
			# the tail lamps wrap round the corner onto the quarter
			P.decal( 'quad', [ ( zr + 0.04, ty0 - 0.015 ), ( zr + 0.2, ty0 - 0.01 ), ( zr + 0.2, ty1 - 0.005 ), ( zr + 0.035, ty1 ) ], 'x', sx, 'CarLamp', 'tail', off = 0.004, nu = 2, nv = 1 )
		P.strip( [ ( - w + 0.42, ty1 - 0.03 ), ( w - 0.42, ty1 - 0.03 ) ], 0.018, 'z', - 1, 'CarTrim', 'chrome' if kind == 'sedan' else 'gloss', off = 0.004 )
		plate( P, 0.62, - 1 )
		P.decal( 'quad', [ ( - 0.62, 0.33 ), ( 0.62, 0.33 ), ( 0.6, 0.42 ), ( - 0.6, 0.42 ) ], 'z', - 1, 'CarTrim', 'housing', off = 0.003, nu = 6, nv = 1, lodkeep = True )
		for sx in ( 1, - 1 ): P.decal( 'quad', [ ( sx * 0.66, 0.46 ), ( sx * 0.76, 0.46 ), ( sx * 0.76, 0.48 ), ( sx * 0.66, 0.48 ) ], 'z', - 1, 'CarLamp', 'tail', off = 0.004, nu = 1, nv = 1 )
		exhausts( m, ( - 0.55, ) if kind == 'sedan' else ( - 0.55, 0.55 ), 0.31, zr + 0.01 )
	# ---- sides: shut lines, handles, sill trim, side marker
	zfa = wheels[ 0 ][ 0 ] - wheels[ 0 ][ 1 ] - 0.08
	zra = wheels[ 1 ][ 0 ] + wheels[ 1 ][ 1 ] + 0.08
	door_lines( P, [ [ ( zfa, 0.33 ), ( zfa - 0.01, 0.62 ), ( zfa - 0.03, 0.95 ) ], [ ( zb, 0.31 ), ( zb, 0.95 ) ], [ ( zra, 0.72 ), ( zra - 0.02, 0.95 ) ],
		[ ( zra + 0.02, 0.33 ), ( zfa, 0.33 ) ] ] )
	handles( P, ( zb + 0.5, zb - 0.38 ), 0.86 )
	P.decal( 'quad', [ ( zra - 0.06, 0.285 ), ( zfa + 0.06, 0.285 ), ( zfa + 0.06, 0.318 ), ( zra - 0.06, 0.318 ) ], 'x', 1, 'CarTrim', 'housing' if kind != 'taxi' else 'chrome', off = 0.002, nu = 6, nv = 1, mirror = True )
	P.decal( 'quad', [ ( zf - 0.42, 0.66 ), ( zf - 0.3, 0.66 ), ( zf - 0.3, 0.69 ), ( zf - 0.42, 0.69 ) ], 'x', 1, 'CarLamp', 'amber', off = 0.003, nu = 1, nv = 1, mirror = True )
	# hood and boot shut lines (from above)
	P.strip( [ ( - w + 0.24, zf - 0.13 ), ( w - 0.24, zf - 0.13 ) ], 0.006, 'y', 1, 'CarTrim', 'seam', off = 0.0018, seg = 1 )
	for sx in ( 1, - 1 ):
		P.strip( [ ( sx * ( w - 0.23 ), zf - 0.13 ), ( sx * ( w - 0.2 ), zf - 1.42 ) ], 0.006, 'y', 1, 'CarTrim', 'seam', off = 0.0018, seg = 4 )
		P.strip( [ ( sx * ( w - 0.2 ), zr + 0.95 ), ( sx * ( w - 0.24 ), zr + 0.12 ) ], 0.006, 'y', 1, 'CarTrim', 'seam', off = 0.0018, seg = 3 )
	P.strip( [ ( - w + 0.2, zr + 0.95 ), ( w - 0.2, zr + 0.95 ) ], 0.006, 'y', 1, 'CarTrim', 'seam', off = 0.0018 )
	side_mirrors( m, w - 0.05 + 0.08, 1.0, zf - 1.5 - 0.1 )
	gtz = ( zr + 1.55 + zf - 2.3 ) / 2
	if kind == 'taxi':
		# the checker band and the roof sign
		n = 12
		z0, z1 = zr + 0.55, zf - 0.65
		for k in range( n ):
			a, b = z0 + ( z1 - z0 ) * k / n, z0 + ( z1 - z0 ) * ( k + 1 ) / n
			P.decal( 'quad', [ ( a, 0.7 ), ( b, 0.7 ), ( b, 0.79 ), ( a, 0.79 ) ], 'x', 1, 'CarTrim', 'checker', off = 0.002, nu = 1, nv = 1, mirror = True, uv = 'stretch', lodkeep = True )
		sign = []
		for ( dy, f ) in ( ( 0.0, 1.0 ), ( 0.17, 1.0 ), ( 0.22, 0.86 ) ):
			sign.append( Mesh.rrect( ( 0, 1.48 + dy, gtz ), ( 1, 0, 0 ), ( 0, 0, 1 ), 0.33 * f, 0.13 * f, 0.06 * f, 2 if not lod else 1 ) )
		m.loft_rings( sign, 'CarLamp', 'sign', cells = lambda i, k: ( 'CarLamp', 'sign' ) if i == 0 else ( 'CarTrim', 'white' ) )
		m.box( ( 0, 1.47, gtz ), ( 0.5, 0.04, 0.18 ), 'CarTrim', 'housing' )
	elif kind == 'police':
		# livery: the navy door panels, a white stripe; the light bar on its feet; the A-pillar spot lamp; antennas
		P.decal( 'quad', [ ( zra + 0.02, 0.34 ), ( zfa - 0.02, 0.34 ), ( zfa - 0.04, 0.86 ), ( zra + 0.0, 0.86 ) ], 'x', 1, 'CarTrim', 'navy', off = 0.0009, nu = 8, nv = 4, mirror = True, lodkeep = True )
		P.strip( [ ( zra - 0.4, 0.7 ), ( zf - 0.25, 0.7 ) ], 0.04, 'x', 1, 'CarTrim', 'white', off = 0.0011, mirror = True, seg = 1 )
		bar = []
		for ( dy, f ) in ( ( 0.0, 1.0 ), ( 0.09, 1.0 ), ( 0.12, 0.9 ) ):
			bar.append( Mesh.rrect( ( 0, 1.5 + dy, gtz ), ( 1, 0, 0 ), ( 0, 0, 1 ), 0.62 * f, 0.13 * f, 0.08 * f, 3 if not lod else 1 ) )
		def barcell( i, k ):
			if i != 0: return ( 'CarTrim', 'gloss' )
			x = bar[ 0 ][ k ][ 0 ]
			return ( 'CarLamp', 'blue' if x > 0.08 else 'red' if x < - 0.08 else 'reverse' )
		m.loft_rings( bar, 'CarTrim', 'gloss', cells = barcell )
		for x in ( - 0.45, 0.45 ): m.box( ( x, 1.47, gtz ), ( 0.08, 0.06, 0.2 ), 'CarTrim', 'housing' )
		m.tube( ( w - 0.12, 1.05, zf - 1.45 ), ( w - 0.02, 1.12, zf - 1.42 ), 0.012, 'CarTrim', 'gloss', seg = 5 )
		m.tube( ( w - 0.02, 1.12, zf - 1.42 ), ( w - 0.02, 1.12, zf - 1.32 ), 0.05, 'CarTrim', 'chrome', seg = 10 )
		m.face( [ ( w - 0.02 + math.cos( a ) * 0.045, 1.12 + math.sin( a ) * 0.045, zf - 1.319 ) for a in [ i / 10 * math.pi * 2 for i in range( 10 ) ] ], 'CarLamp', 'head', out = ( 0, 0, 1 ) )
		for x in ( - 0.3, 0.3 ): m.tube( ( x, 0.99, zr + 0.5 ), ( x, 1.55, zr + 0.48 ), 0.004, 'CarTrim', 'gloss', seg = 4 )
	else:
		# a shark-fin antenna
		m.loft_rings( [ Mesh.rrect( ( 0, 1.475, zr + 1.7 - dz ), ( 1, 0, 0 ), ( 0, 1, 0 ), 0.03 * f, 0.03 + 0.035 * f, 0.02 * f, 1 ) for ( dz, f ) in ( ( 0, 0.5 ), ( 0.08, 1 ), ( 0.16, 0.4 ) ) ], 'CarTrim', 'gloss' )

def build_sedan( m, S, lod ): sedan_family( m, S, 'sedan', lod )
def build_taxi( m, S, lod ): sedan_family( m, S, 'taxi', lod )
def build_police( m, S, lod ): sedan_family( m, S, 'police', lod )

def build_sports( m, S, lod ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	wheels = [ ( S[ 'wb' ] / 2, S[ 'r' ] ), ( - S[ 'wb' ] / 2, S[ 'r' ] ) ]
	st = [ ( zr, 0.3, 0.7, w - 0.12, 0, 0.02 ), ( zr + 0.04, 0.24, 0.8, w - 0.04, 0.008, 0.05 ), ( zr + 0.22, 0.2, 0.855, w, 0.02, 0.1 ),
		( zr + 1.0, 0.2, 0.865, w, 0.03, 0.15 ), ( zf - 1.6, 0.2, 0.81, w - 0.01, 0.03, 0.15 ), ( zf - 1.0, 0.2, 0.74, w, 0.05, 0.14 ),
		( zf - 0.45, 0.205, 0.63, w - 0.02, 0.045, 0.1 ), ( zf - 0.15, 0.215, 0.53, w - 0.06, 0.03, 0.07 ), ( zf - 0.04, 0.23, 0.46, w - 0.12, 0.015, 0.04 ),
		( zf, 0.26, 0.4, w - 0.2, 0, 0.02 ) ]
	lower_body( m, st, wheels, { 'tuck': 0.05, 'belt': 0.5, 'flare': 0.035, 'arch': 0.045 }, lod )
	def side( t, zs0, zs1 ):
		cw = 0.36 - 0.28 * t
		return [ ( zs0, 'C' ), ( zs0 + cw, 'T' ), ( zs0 + cw + 0.016, 'G' ), ( zs1 - 0.045, 'T' ), ( zs1 - 0.03, 'A' ) ]
	g = { 'y': [ ( 0, 0.82 ), ( 1, 1.18 ) ], 'w': [ ( 0, w - 0.16 ), ( 1, w - 0.36 ) ], 'zf': [ ( 0, zf - 1.6 ), ( 1, zf - 2.25 ) ], 'zr': [ ( 0, zr + 1.0 ), ( 1, zr + 1.45 ) ],
		'rcf': [ ( 0, 0.12 ), ( 1, 0.07 ) ], 'rcr': [ ( 0, 0.2 ), ( 1, 0.12 ) ], 'bowf': 0.12, 'bowr': 0.1, 'tumble': 1.2,
		'rows': ROWS_CAR, 'lodRows': ROWS_LOD, 'side': side, 'mat': lambda r, c: pmat( r, c, belt = ( 'CarTrim', 'housing' ) ), 'crown': 0.03 }
	greenhouse( m, g, lod )
	P = Projector( m )
	# a low nose: slim lamps sweeping back, a wide intake, splitter
	P.decal( 'quad', [ ( 0.78, 0.44 ), ( 0.5, 0.465 ), ( 0.51, 0.505 ), ( 0.76, 0.49 ) ], 'z', 1, 'CarTrim', 'housing', off = 0.003, nu = 6, nv = 2, mirror = True, lodkeep = True )
	P.decal( 'quad', [ ( 0.765, 0.448 ), ( 0.52, 0.47 ), ( 0.525, 0.482 ), ( 0.75, 0.46 ) ], 'z', 1, 'CarLamp', 'head', off = 0.005, nu = 6, nv = 1, mirror = True, lodkeep = True )
	for cx in ( 0.6, 0.68 ): P.decal( 'disc', ( cx, 0.482, 0.017, 0.012 ), 'z', 1, 'CarLamp', 'head', off = 0.0062, nu = 8, nv = 1, mirror = True )
	grille( P, 0.55, 0.27, 0.4, slats = 2, surround = 'gloss', taper = 0.06 )
	for sx in ( 1, - 1 ): P.decal( 'quad', [ ( sx * 0.86, 0.27 ), ( sx * 0.62, 0.27 ), ( sx * 0.64, 0.38 ), ( sx * 0.8, 0.36 ) ], 'z', 1, 'CarTrim', 'grille', off = 0.003, nu = 2, nv = 1 )
	m.box( ( 0, 0.215, zf - 0.02 ), ( W - 0.35, 0.02, 0.12 ), 'CarTrim', 'gloss' )
	plate( P, 0.3, 1, x = 0.22, h = 0.1, off = 0.008 )
	# the tail: one light strip across the back, quad exhausts in a diffuser, a lip spoiler
	P.decal( 'quad', [ ( - w + 0.1, 0.62 ), ( w - 0.1, 0.62 ), ( w - 0.12, 0.67 ), ( - w + 0.12, 0.67 ) ], 'z', - 1, 'CarTrim', 'housing', off = 0.003, nu = 10, nv = 1, lodkeep = True )
	P.decal( 'quad', [ ( - w + 0.12, 0.628 ), ( w - 0.12, 0.628 ), ( w - 0.14, 0.66 ), ( - w + 0.14, 0.66 ) ], 'z', - 1, 'CarLamp', 'tail', off = 0.005, nu = 10, nv = 1, lodkeep = True )
	for sx in ( 1, - 1 ): P.decal( 'quad', [ ( sx * 0.3, 0.632 ), ( sx * 0.42, 0.632 ), ( sx * 0.42, 0.655 ), ( sx * 0.3, 0.655 ) ], 'z', - 1, 'CarLamp', 'reverse', off = 0.0065, nu = 1, nv = 1 )
	P.decal( 'quad', [ ( - w + 0.15, 0.25 ), ( w - 0.15, 0.25 ), ( w - 0.18, 0.38 ), ( - w + 0.18, 0.38 ) ], 'z', - 1, 'CarTrim', 'gloss', off = 0.003, nu = 8, nv = 1, lodkeep = True )
	plate( P, 0.44, - 1, x = 0.22, h = 0.1 )
	exhausts( m, ( - 0.42, - 0.32, 0.32, 0.42 ), 0.29, zr + 0.02, r = 0.038 )
	m.loft_rings( [ Mesh.rrect( ( 0, 0.86 + dy, zr + 0.14 ), ( 1, 0, 0 ), ( 0, 1, 0 ), w - 0.12, 0.012, 0.01, 1 ) for dy in ( 0.0, 0.04 ) ], 'CarTrim', 'gloss' )
	# side intakes behind the doors, the shut line, a flush handle, the sill blade
	zfa = wheels[ 0 ][ 0 ] - wheels[ 0 ][ 1 ] - 0.06
	zra = wheels[ 1 ][ 0 ] + wheels[ 1 ][ 1 ] + 0.06
	door_lines( P, [ [ ( zfa, 0.28 ), ( zfa - 0.05, 0.8 ) ], [ ( - 0.62, 0.3 ), ( - 0.58, 0.8 ) ] ] )
	P.decal( 'quad', [ ( zra + 0.05, 0.42 ), ( - 0.66, 0.4 ), ( - 0.6, 0.62 ), ( zra + 0.12, 0.6 ) ], 'x', 1, 'CarTrim', 'housing', off = 0.003, nu = 3, nv = 2, mirror = True, lodkeep = True )
	handles( P, ( - 0.48, ), 0.74, chrome = 'gloss' )
	P.decal( 'quad', [ ( zra, 0.2 ), ( zfa, 0.2 ), ( zfa, 0.25 ), ( zra, 0.25 ) ], 'x', 1, 'CarTrim', 'gloss', off = 0.002, nu = 6, nv = 1, mirror = True )
	side_mirrors( m, w - 0.12 + 0.08, 0.9, zf - 1.6 - 0.05, s = 0.9 )

def build_pickup( m, S, lod ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	wheels = [ ( S[ 'wb' ] / 2, S[ 'r' ] ), ( - S[ 'wb' ] / 2, S[ 'r' ] ) ]
	cab0 = zf - 2.65
	bz0, bz1 = zr + 0.06, cab0 - 0.06
	st = [ ( zr, 0.44, 0.84, w - 0.03, 0, 0.0 ), ( zr + 0.04, 0.4, 0.84, w, 0.0, 0.0 ), ( bz1 + 0.02, 0.4, 0.84, w, 0.0, 0.0 ),
		( cab0, 0.38, 1.08, w, 0.0, 0.06 ), ( zf - 1.4, 0.38, 1.11, w, 0.015, 0.06 ), ( zf - 0.4, 0.38, 1.06, w, 0.03, 0.06 ),
		( zf - 0.12, 0.39, 1.0, w - 0.01, 0.02, 0.05 ), ( zf - 0.03, 0.42, 0.94, w - 0.03, 0.01, 0.03 ), ( zf, 0.46, 0.88, w - 0.07, 0, 0.02 ) ]
	lower_body( m, st, wheels, { 'tuck': 0.05, 'belt': 0.5, 'flare': 0.02, 'arch': 0.07 }, lod )
	def side( t, zs0, zs1 ):
		return [ ( zs0, 'C' ), ( zs0 + 0.06, 'T' ), ( zs0 + 0.075, 'G' ), ( zs1 - 0.05, 'T' ), ( zs1 - 0.035, 'A' ) ]
	g = { 'y': [ ( 0, 1.1 ), ( 1, 1.78 ) ], 'w': [ ( 0, w - 0.08 ), ( 1, w - 0.2 ) ], 'zf': [ ( 0, zf - 1.42 ), ( 1, zf - 2.05 ) ], 'zr': [ ( 0, cab0 + 0.05 ), ( 1, cab0 + 0.12 ) ],
		'rcf': [ ( 0, 0.1 ), ( 1, 0.06 ) ], 'rcr': [ ( 0, 0.08 ), ( 1, 0.06 ) ], 'bowf': 0.07, 'bowr': 0.02, 'tumble': 1.2,
		'rows': ROWS_CAR, 'lodRows': ROWS_LOD, 'side': side, 'mat': lambda r, c: pmat( r, c, belt = ( 'CarTrim', 'housing' ) ), 'crown': 0.03 }
	greenhouse( m, g, lod )
	# the bed: walls (paint outside, liner inside), the floor, the tailgate, the rails' caps
	wall = 0.06
	for sx in ( 1, - 1 ):
		x0 = sx * ( w - wall )
		m.face( [ ( x0, 0.84, bz0 ), ( x0, 0.84, bz1 ), ( x0, 1.12, bz1 ), ( x0, 1.12, bz0 ) ], 'CarTrim', 'bed', out = ( - sx, 0, 0 ) )
		m.face( [ ( sx * w, 0.8, bz0 - 0.06 ), ( sx * w, 0.8, bz1 + 0.06 ), ( sx * w, 1.12, bz1 + 0.06 ), ( sx * w, 1.12, bz0 - 0.06 ) ], 'CarPaint', 'white', out = ( sx, 0, 0 ) )
		m.face( [ ( x0, 1.12, bz0 - 0.06 ), ( x0, 1.12, bz1 + 0.06 ), ( sx * w, 1.12, bz1 + 0.06 ), ( sx * w, 1.12, bz0 - 0.06 ) ], 'CarTrim', 'housing', out = ( 0, 1, 0 ) )
	m.face( [ ( - w + wall, 0.85, bz0 ), ( w - wall, 0.85, bz0 ), ( w - wall, 0.85, bz1 ), ( - w + wall, 0.85, bz1 ) ], 'CarTrim', 'bed', out = ( 0, 1, 0 ) )
	for k in range( 6 if not lod else 0 ):
		x = - w + wall + 0.12 + k * ( W - 2 * wall - 0.24 ) / 5
		m.box( ( x, 0.86, ( bz0 + bz1 ) / 2 ), ( 0.035, 0.02, bz1 - bz0 - 0.04 ), 'CarTrim', 'bed' )
	m.box( ( 0, 0.98, bz1 + 0.02 ), ( W - 0.04, 0.3, 0.06 ), 'CarPaint', 'white', skip = ( '-y', ) )
	m.face( [ ( - w + 0.02, 0.84, bz1 - 0.01 ), ( w - 0.02, 0.84, bz1 - 0.01 ), ( w - 0.02, 1.13, bz1 - 0.01 ), ( - w + 0.02, 1.13, bz1 - 0.01 ) ], 'CarTrim', 'bed', out = ( 0, 0, - 1 ) )
	# tailgate
	m.box( ( 0, 0.97, zr + 0.03 ), ( W - 0.02, 0.32, 0.06 ), 'CarPaint', 'white' )
	m.face( [ ( - w + wall, 0.85, zr + 0.061 ), ( w - wall, 0.85, zr + 0.061 ), ( w - wall, 1.12, zr + 0.061 ), ( - w + wall, 1.12, zr + 0.061 ) ], 'CarTrim', 'bed', out = ( 0, 0, 1 ) )
	P = Projector( m )
	# a big chrome grille, square lamps, a step bumper, fender flares
	grille( P, 0.5, 0.62, 0.9, slats = 3, surround = 'chrome', taper = 0.0 )
	P.decal( 'quad', [ ( 0.86, 0.75 ), ( 0.54, 0.75 ), ( 0.54, 0.9 ), ( 0.86, 0.89 ) ], 'z', 1, 'CarTrim', 'chrome', off = 0.003, nu = 4, nv = 2, mirror = True, lodkeep = True )
	P.decal( 'quad', [ ( 0.84, 0.765 ), ( 0.56, 0.765 ), ( 0.56, 0.885 ), ( 0.84, 0.875 ) ], 'z', 1, 'CarTrim', 'housing', off = 0.0045, nu = 4, nv = 2, mirror = True, lodkeep = True )
	for cx in ( 0.64, 0.76 ): P.decal( 'disc', ( cx, 0.825, 0.045, 0.045 ), 'z', 1, 'CarLamp', 'head', off = 0.006, nu = 10, nv = 1, mirror = True, lodkeep = True )
	P.decal( 'quad', [ ( 0.86, 0.68 ), ( 0.7, 0.68 ), ( 0.7, 0.73 ), ( 0.86, 0.73 ) ], 'z', 1, 'CarLamp', 'amber', off = 0.004, nu = 1, nv = 1, mirror = True )
	m.box( ( 0, 0.52, zf + 0.04 ), ( W - 0.06, 0.2, 0.14 ), 'CarTrim', 'chrome' )
	m.box( ( 0, 0.43, zf + 0.06 ), ( W - 0.3, 0.05, 0.1 ), 'CarTrim', 'housing' )
	plate( P, 0.47, 1, off = 0.118 )
	# rear: tall lamps on the bed corners, a step bumper, the hitch
	for sx in ( 1, - 1 ):
		P.decal( 'quad', [ ( sx * ( w - 0.025 ), 0.9 ), ( sx * ( w - 0.15 ), 0.9 ), ( sx * ( w - 0.15 ), 1.1 ), ( sx * ( w - 0.025 ), 1.1 ) ], 'z', - 1, 'CarLamp', 'tail', off = 0.004, nu = 1, nv = 2, lodkeep = True )
		P.decal( 'quad', [ ( sx * ( w - 0.03 ), 0.94 ), ( sx * ( w - 0.12 ), 0.94 ), ( sx * ( w - 0.12 ), 0.99 ), ( sx * ( w - 0.03 ), 0.99 ) ], 'z', - 1, 'CarLamp', 'reverse', off = 0.006, nu = 1, nv = 1 )
	m.box( ( 0, 0.52, zr - 0.05 ), ( W - 0.04, 0.17, 0.16 ), 'CarTrim', 'chrome' )
	m.box( ( 0, 0.6, zr - 0.05 ), ( 0.6, 0.012, 0.15 ), 'CarTrim', 'rubber' )
	m.box( ( 0, 0.42, zr - 0.16 ), ( 0.07, 0.07, 0.16 ), 'CarTrim', 'gloss' )
	P.decal( 'quad', [ ( - 0.26, 0.97 ), ( 0.26, 0.97 ), ( 0.26, 1.08 ), ( - 0.26, 1.08 ) ], 'z', - 1, 'CarTrim', 'plate', off = 0.004, nu = 2, nv = 1, lodkeep = True )
	for ( zw, r ) in wheels:
		P.decal( 'arc', ( zw, r, r + 0.085, r + 0.16, 4, 176 ), 'x', 1, 'CarTrim', 'housing', off = 0.006, nu = 14, nv = 1, mirror = True )
	# running boards, shut lines, handles, the mirrors (big towing ones)
	zfa = wheels[ 0 ][ 0 ] - wheels[ 0 ][ 1 ] - 0.2
	for sx in ( 1, - 1 ): m.box( ( sx * ( w - 0.04 ), 0.36, ( cab0 + zfa ) / 2 ), ( 0.18, 0.04, zfa - cab0 + 0.1 ), 'CarTrim', 'housing' )
	door_lines( P, [ [ ( zfa, 0.42 ), ( zfa - 0.02, 1.1 ) ], [ ( cab0 + 0.06, 0.42 ), ( cab0 + 0.06, 1.1 ) ], [ ( cab0 + 0.06, 0.43 ), ( zfa, 0.43 ) ], [ ( cab0 - 0.05, 0.86 ), ( cab0 - 0.05, 1.11 ) ] ] )
	handles( P, ( cab0 + 0.22, ), 1.0 )
	side_mirrors( m, w - 0.03 + 0.08, 1.2, zf - 1.42 - 0.1, s = 1.15 )

def build_van( m, S, lod ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	wheels = [ ( S[ 'wb' ] / 2, S[ 'r' ] ), ( - S[ 'wb' ] / 2, S[ 'r' ] ) ]
	box_end = zf - 1.75
	st = [ ( zr, 0.38, 0.96, w - 0.03, 0, 0.0 ), ( zr + 0.04, 0.34, 1.0, w, 0.0, 0.02 ), ( zf - 1.0, 0.34, 1.0, w, 0.0, 0.02 ),
		( zf - 0.45, 0.34, 0.98, w, 0.04, 0.04 ), ( zf - 0.15, 0.35, 0.92, w - 0.02, 0.03, 0.04 ), ( zf - 0.04, 0.38, 0.86, w - 0.06, 0.012, 0.03 ),
		( zf, 0.42, 0.8, w - 0.12, 0, 0.02 ) ]
	lower_body( m, st, wheels, { 'tuck': 0.05, 'belt': 0.5, 'flare': 0.012 }, lod )
	ty = lambda y: ( y - 0.98 ) / ( 2.35 - 0.98 )
	def side( t, zs0, zs1 ):
		return [ ( zs0, 'P' ), ( box_end - 0.05, 'B' ), ( box_end + 0.03, 'T' ), ( box_end + 0.045, 'G' ), ( zs1 - 0.05, 'T' ), ( zs1 - 0.035, 'A' ) ]
	rows = [ ( - 0.03, 'base' ), ( 0.0, 'belt' ), ( ty( 1.03 ), 'glass' ), ( ty( 1.5 ), 'glass' ), ( ty( 2.08 ), 'header' ), ( ty( 2.16 ), 'upper' ), ( ty( 2.32 ), 'edge' ), ( 1.0, None ) ]
	lrows = [ ( - 0.03, 'base' ), ( ty( 1.03 ), 'glass' ), ( ty( 2.12 ), 'upper' ), ( 1.0, None ) ]
	def mat( row, col ):
		if col == 'R': return ( 'CarPaint', 'white' )
		if row == 'upper': return ( 'CarPaint', 'white' )
		return pmat( row, col, belt = ( 'CarTrim', 'housing' ) )
	g = { 'y': [ ( 0, 0.98 ), ( 1, 2.35 ) ], 'w': [ ( 0, w - 0.03 ), ( 1, w - 0.08 ) ], 'zf': [ ( 0, zf - 1.0 ), ( ty( 2.15 ), zf - 1.5 ), ( 1, zf - 1.66 ) ],
		'zr': [ ( 0, zr + 0.01 ), ( 1, zr + 0.04 ) ], 'rcf': [ ( 0, 0.16 ), ( ty( 2.15 ), 0.1 ), ( 1, 0.08 ) ], 'rcr': [ ( 0, 0.06 ), ( 1, 0.06 ) ],
		'bowf': 0.08, 'bowr': 0.0, 'tumble': 1.0, 'rows': rows, 'lodRows': lrows, 'side': side, 'mat': mat, 'crown': 0.04 }
	greenhouse( m, g, lod )
	P = Projector( m )
	# the face: a broad black grille with a chrome bar, tall lamps, a black bumper with the step and fog lamps
	grille( P, 0.52, 0.6, 0.82, slats = 2, surround = 'gloss', taper = 0.04 )
	P.strip( [ ( - 0.48, 0.73 ), ( 0.48, 0.73 ) ], 0.03, 'z', 1, 'CarTrim', 'chrome', off = 0.007 )
	P.decal( 'quad', [ ( 0.88, 0.66 ), ( 0.6, 0.68 ), ( 0.6, 0.86 ), ( 0.84, 0.88 ) ], 'z', 1, 'CarTrim', 'housing', off = 0.003, nu = 4, nv = 2, mirror = True, lodkeep = True )
	for cx, cy in ( ( 0.68, 0.79 ), ( 0.78, 0.79 ) ): P.decal( 'disc', ( cx, cy, 0.04, 0.04 ), 'z', 1, 'CarLamp', 'head', off = 0.0055, nu = 10, nv = 1, mirror = True, lodkeep = True )
	P.decal( 'quad', [ ( 0.85, 0.69 ), ( 0.63, 0.7 ), ( 0.63, 0.72 ), ( 0.85, 0.71 ) ], 'z', 1, 'CarLamp', 'amber', off = 0.005, nu = 2, nv = 1, mirror = True )
	P.decal( 'quad', [ ( - w + 0.12, 0.36 ), ( w - 0.12, 0.36 ), ( w - 0.12, 0.56 ), ( - w + 0.12, 0.56 ) ], 'z', 1, 'CarTrim', 'housing', off = 0.003, nu = 8, nv = 2, lodkeep = True )
	plate( P, 0.42, 1, off = 0.006 )
	# the back: two doors (shut line, handles), vertical lamps in the corners, the step bumper
	P.strip( [ ( 0, 0.4 ), ( 0, 2.25 ) ], 0.008, 'z', - 1, 'CarTrim', 'seam', off = 0.0015 )
	for sx in ( 1, - 1 ):
		P.decal( 'quad', [ ( sx * ( w - 0.01 ), 0.6 ), ( sx * ( w - 0.12 ), 0.6 ), ( sx * ( w - 0.12 ), 1.05 ), ( sx * ( w - 0.01 ), 1.05 ) ], 'z', - 1, 'CarTrim', 'housing', off = 0.003, nu = 1, nv = 3, lodkeep = True )
		P.decal( 'quad', [ ( sx * ( w - 0.02 ), 0.82 ), ( sx * ( w - 0.11 ), 0.82 ), ( sx * ( w - 0.11 ), 1.03 ), ( sx * ( w - 0.02 ), 1.03 ) ], 'z', - 1, 'CarLamp', 'tail', off = 0.005, nu = 1, nv = 2, lodkeep = True )
		P.decal( 'quad', [ ( sx * ( w - 0.02 ), 0.71 ), ( sx * ( w - 0.11 ), 0.71 ), ( sx * ( w - 0.11 ), 0.8 ), ( sx * ( w - 0.02 ), 0.8 ) ], 'z', - 1, 'CarLamp', 'amber', off = 0.005, nu = 1, nv = 1 )
		P.decal( 'quad', [ ( sx * ( w - 0.02 ), 0.62 ), ( sx * ( w - 0.11 ), 0.62 ), ( sx * ( w - 0.11 ), 0.69 ), ( sx * ( w - 0.02 ), 0.69 ) ], 'z', - 1, 'CarLamp', 'reverse', off = 0.005, nu = 1, nv = 1 )
		P.decal( 'quad', [ ( sx * 0.06, 1.2 ), ( sx * 0.2, 1.2 ), ( sx * 0.2, 1.23 ), ( sx * 0.06, 1.23 ) ], 'z', - 1, 'CarTrim', 'gloss', off = 0.006, nu = 1, nv = 1 )
	m.box( ( 0, 0.48, zr - 0.06 ), ( W - 0.04, 0.2, 0.14 ), 'CarTrim', 'housing' )
	m.box( ( 0, 0.585, zr - 0.08 ), ( 0.7, 0.015, 0.12 ), 'CarTrim', 'rubber' )
	P.decal( 'quad', [ ( - 0.26, 0.64 ), ( 0.26, 0.64 ), ( 0.26, 0.75 ), ( - 0.26, 0.75 ) ], 'z', - 1, 'CarTrim', 'plate', off = 0.004, nu = 2, nv = 1, lodkeep = True )
	m.face( [ ( 0.35, 2.3, zr + 0.015 ), ( - 0.35, 2.3, zr + 0.015 ), ( - 0.35, 2.33, zr + 0.015 ), ( 0.35, 2.33, zr + 0.015 ) ], 'CarLamp', 'tail', out = ( 0, 0, - 1 ) )
	# sides: the sliding door's lines and its rail, the cab door, handles, the green band, rubbing strip
	zfa = wheels[ 0 ][ 0 ] - wheels[ 0 ][ 1 ] - 0.12
	slide0, slide1 = box_end - 1.45, box_end - 0.06
	door_lines( P, [ [ ( zfa, 0.38 ), ( zfa - 0.02, 1.0 ) ], [ ( box_end - 0.05, 0.38 ), ( box_end - 0.05, 2.08 ) ], [ ( slide0, 0.4 ), ( slide0, 2.08 ) ],
		[ ( slide0, 2.08 ), ( slide1, 2.08 ) ], [ ( zr + 0.05, 0.42 ), ( zr + 0.05, 2.25 ) ] ] )
	P.strip( [ ( slide0 - 0.6, 1.2 ), ( slide0 - 0.02, 1.2 ) ], 0.025, 'x', 1, 'CarTrim', 'gloss', off = 0.005, mirror = True )
	handles( P, ( box_end + 0.18, slide1 - 0.12 ), 1.05, chrome = 'gloss' )
	P.decal( 'quad', [ ( zr + 0.25, 1.4 ), ( box_end - 0.2, 1.4 ), ( box_end - 0.2, 1.62 ), ( zr + 0.25, 1.62 ) ], 'x', 1, 'CarTrim', 'green', off = 0.001, nu = 6, nv = 1, mirror = True, lodkeep = True )
	P.decal( 'quad', [ ( zr + 0.25, 1.64 ), ( box_end - 0.2, 1.64 ), ( box_end - 0.2, 1.665 ), ( zr + 0.25, 1.665 ) ], 'x', 1, 'CarTrim', 'yellow', off = 0.001, nu = 6, nv = 1, mirror = True )
	P.decal( 'quad', [ ( zr + 0.1, 0.62 ), ( zf - 1.1, 0.62 ), ( zf - 1.1, 0.7 ), ( zr + 0.1, 0.7 ) ], 'x', 1, 'CarTrim', 'housing', off = 0.004, nu = 8, nv = 1, mirror = True )
	P.decal( 'quad', [ ( zf - 0.5, 0.75 ), ( zf - 0.4, 0.75 ), ( zf - 0.4, 0.78 ), ( zf - 0.5, 0.78 ) ], 'x', 1, 'CarLamp', 'amber', off = 0.003, nu = 1, nv = 1, mirror = True )
	side_mirrors( m, w - 0.02 + 0.08, 1.3, zf - 1.15, s = 1.25 )

def build_bus( m, S, lod ):
	L, W = S[ 'L' ], S[ 'W' ]; w = W / 2; zr, zf = - L / 2, L / 2
	wheels = [ ( S[ 'wb' ] / 2, S[ 'r' ] ), ( - S[ 'wb' ] / 2, S[ 'r' ] ) ]
	st = [ ( zr, 0.46, 1.22, w - 0.05, 0, 0.0 ), ( zr + 0.06, 0.42, 1.25, w, 0.0, 0.01 ), ( zf - 0.08, 0.42, 1.25, w, 0.0, 0.01 ), ( zf, 0.48, 1.22, w - 0.06, 0, 0.0 ) ]
	lower_body( m, st, wheels, { 'tuck': 0.04, 'belt': 0.5, 'flare': 0.0, 'arch': 0.08 }, lod )
	ty = lambda y: ( y - 1.24 ) / ( 3.05 - 1.24 )
	n = 7
	z0, z1 = zr + 0.55, zf - 1.9
	posts = [ z0 + ( z1 - z0 ) * k / n for k in range( n + 1 ) ]
	def side( t, zs0, zs1 ):
		out = [ ( zs0, 'P' ) ]
		for k, z in enumerate( posts ):
			out += [ ( z - 0.06, 'B' ), ( z + 0.06, 'G' if k < n else 'P' ) ]
		out += [ ( zf - 1.75, 'B' ), ( zf - 1.65, 'G' ), ( zs1 - 0.07, 'T' ), ( zs1 - 0.03, 'W' ) ]
		return out
	rows = [ ( - 0.03, 'base' ), ( 0.0, 'belt' ), ( ty( 1.3 ), 'glass' ), ( ty( 1.9 ), 'glass' ), ( ty( 2.5 ), 'header' ), ( ty( 2.6 ), 'upper' ), ( ty( 3.0 ), 'edge' ), ( 1.0, None ) ]
	lrows = [ ( - 0.03, 'base' ), ( ty( 1.3 ), 'glass' ), ( ty( 2.55 ), 'upper' ), ( 1.0, None ) ]
	def mat( row, col ):
		if row == 'upper' or col == 'P': return ( 'CarPaint', 'white' )
		if col == 'R': return ( 'CarPaint', 'white' ) # (the rear screen is a decal over the engine bay's wall)
		# the windscreen wraps round the front corners (a slim black post where it meets the side glass): no paint in sight
		if col in 'AW': col = 'F'
		return pmat( row, col, belt = ( 'CarTrim', 'housing' ), glass = 'busglass' )
	g = { 'y': [ ( 0, 1.24 ), ( 1, 3.05 ) ], 'w': [ ( 0, w - 0.02 ), ( 1, w - 0.06 ) ], 'zf': [ ( 0, zf - 0.03 ), ( ty( 2.6 ), zf - 0.12 ), ( 1, zf - 0.3 ) ],
		'zr': [ ( 0, zr + 0.02 ), ( 1, zr + 0.08 ) ], 'rcf': [ ( 0, 0.24 ), ( 1, 0.3 ) ], 'rcr': [ ( 0, 0.12 ), ( 1, 0.16 ) ],
		'bowf': 0.12, 'bowr': 0.03, 'tumble': 1.0, 'rows': rows, 'lodRows': lrows, 'side': side, 'mat': mat, 'crown': 0.05 }
	greenhouse( m, g, lod )
	P = Projector( m )
	# the front: the destination board over the screen, lamps in black pods, a grille and the bumper
	P.decal( 'quad', [ ( - 0.85, 2.64 ), ( 0.85, 2.64 ), ( 0.85, 2.92 ), ( - 0.85, 2.92 ) ], 'z', 1, 'CarTrim', 'housing', off = 0.003, nu = 6, nv = 1, lodkeep = True )
	P.decal( 'quad', [ ( - 0.8, 2.68 ), ( 0.8, 2.68 ), ( 0.8, 2.88 ), ( - 0.8, 2.88 ) ], 'z', 1, 'CarLamp', 'amber', off = 0.005, nu = 6, nv = 1, lodkeep = True )
	P.strip( [ ( 0, 1.3 ), ( 0, 2.5 ) ], 0.05, 'z', 1, 'CarTrim', 'housing', off = 0.004, seg = 3 )
	for sx in ( 1, - 1 ):
		P.decal( 'quad', [ ( sx * ( w - 0.08 ), 0.62 ), ( sx * ( w - 0.5 ), 0.62 ), ( sx * ( w - 0.5 ), 0.86 ), ( sx * ( w - 0.12 ), 0.86 ) ], 'z', 1, 'CarTrim', 'housing', off = 0.003, nu = 3, nv = 1, lodkeep = True )
		for cx in ( 0.2, 0.32 ): P.decal( 'disc', ( sx * ( w - cx ), 0.75, 0.05, 0.05 ), 'z', 1, 'CarLamp', 'head', off = 0.005, nu = 10, nv = 1, lodkeep = True )
		P.decal( 'quad', [ ( sx * ( w - 0.42 ), 0.66 ), ( sx * ( w - 0.48 ), 0.66 ), ( sx * ( w - 0.48 ), 0.82 ), ( sx * ( w - 0.42 ), 0.82 ) ], 'z', 1, 'CarLamp', 'amber', off = 0.005, nu = 1, nv = 1 )
	grille( P, 0.6, 0.95, 1.15, slats = 3, surround = 'gloss', taper = 0.0 )
	P.decal( 'quad', [ ( - w + 0.06, 0.42 ), ( w - 0.06, 0.42 ), ( w - 0.06, 0.6 ), ( - w + 0.06, 0.6 ) ], 'z', 1, 'CarTrim', 'housing', off = 0.003, nu = 8, nv = 1, lodkeep = True )
	plate( P, 0.47, 1, off = 0.006 )
	# the back: the engine grille, the rear screen, lamps
	P.decal( 'quad', [ ( - 0.95, 1.9 ), ( 0.95, 1.9 ), ( 0.95, 2.6 ), ( - 0.95, 2.6 ) ], 'z', - 1, 'CarTrim', 'housing', off = 0.003, nu = 4, nv = 2, lodkeep = True )
	P.decal( 'quad', [ ( - 0.9, 1.94 ), ( 0.9, 1.94 ), ( 0.9, 2.56 ), ( - 0.9, 2.56 ) ], 'z', - 1, 'CarTrim', 'busglass', off = 0.005, nu = 4, nv = 2, lodkeep = True )
	P.decal( 'quad', [ ( - 0.8, 0.7 ), ( 0.8, 0.7 ), ( 0.8, 1.15 ), ( - 0.8, 1.15 ) ], 'z', - 1, 'CarTrim', 'grille', off = 0.003, nu = 4, nv = 2, lodkeep = True )
	for j in range( 6 if not lod else 0 ):
		yy = 0.74 + j * 0.07
		P.strip( [ ( - 0.78, yy ), ( 0.78, yy ) ], 0.02, 'z', - 1, 'CarTrim', 'gloss', off = 0.005 )
	for sx in ( 1, - 1 ):
		P.decal( 'quad', [ ( sx * ( w - 0.06 ), 0.7 ), ( sx * ( w - 0.24 ), 0.7 ), ( sx * ( w - 0.24 ), 1.12 ), ( sx * ( w - 0.06 ), 1.12 ) ], 'z', - 1, 'CarTrim', 'housing', off = 0.003, nu = 1, nv = 2, lodkeep = True )
		for j, ( cell, y0 ) in enumerate( ( ( 'tail', 0.98 ), ( 'amber', 0.86 ), ( 'reverse', 0.74 ) ) ):
			P.decal( 'disc', ( sx * ( w - 0.15 ), y0 + 0.055, 0.06, 0.05 ), 'z', - 1, 'CarLamp', cell, off = 0.005, nu = 10, nv = 1, lodkeep = j == 0 )
	P.decal( 'quad', [ ( - w + 0.06, 0.44 ), ( w - 0.06, 0.44 ), ( w - 0.06, 0.62 ), ( - w + 0.06, 0.62 ) ], 'z', - 1, 'CarTrim', 'housing', off = 0.003, nu = 8, nv = 1, lodkeep = True )
	P.decal( 'quad', [ ( - 0.26, 1.2 ), ( 0.26, 1.2 ), ( 0.26, 1.31 ), ( - 0.26, 1.31 ) ], 'z', - 1, 'CarTrim', 'plate', off = 0.006, nu = 2, nv = 1, lodkeep = True )
	# the doors on the kerb side (the game's right: -x): glass leaves in black frames, down to the step
	for zc in ( zf - 1.1, - 0.6 ):
		P.decal( 'quad', [ ( zc - 0.6, 0.5 ), ( zc + 0.6, 0.5 ), ( zc + 0.6, 2.7 ), ( zc - 0.6, 2.7 ) ], 'x', - 1, 'CarTrim', 'housing', off = 0.004, nu = 2, nv = 4, lodkeep = True )
		for d in ( - 1, 1 ):
			P.decal( 'quad', [ ( zc + d * 0.03, 0.6 ), ( zc + d * 0.55, 0.6 ), ( zc + d * 0.55, 2.6 ), ( zc + d * 0.03, 2.6 ) ], 'x', - 1, 'CarTrim', 'busglass', off = 0.007, nu = 1, nv = 4, lodkeep = True )
	# the livery band, the skirt, side markers, mirrors on their arms
	P.decal( 'quad', [ ( zr + 0.1, 1.12 ), ( zf - 0.12, 1.12 ), ( zf - 0.12, 1.2 ), ( zr + 0.1, 1.2 ) ], 'x', 1, 'CarTrim', 'white', off = 0.0015, nu = 24, nv = 1, mirror = True, lodkeep = True )
	P.decal( 'quad', [ ( zr + 0.1, 0.44 ), ( zf - 0.1, 0.44 ), ( zf - 0.1, 0.52 ), ( zr + 0.1, 0.52 ) ], 'x', 1, 'CarTrim', 'housing', off = 0.002, nu = 12, nv = 1, mirror = True )
	for z in ( zr + 1.0, 0.0, zf - 2.5 ):
		P.decal( 'quad', [ ( z - 0.05, 0.6 ), ( z + 0.05, 0.6 ), ( z + 0.05, 0.64 ), ( z - 0.05, 0.64 ) ], 'x', 1, 'CarLamp', 'amber', off = 0.003, nu = 1, nv = 1, mirror = True )
	for sx in ( 1, - 1 ):
		m.tube( ( sx * ( w - 0.1 ), 2.4, zf - 0.15 ), ( sx * ( w + 0.25 ), 2.25, zf + 0.05 ), 0.02, 'CarTrim', 'gloss', seg = 6 )
		m.loft_rings( [ Mesh.rrect( ( sx * ( w + 0.3 ), 1.9, zf + 0.06 + dz ), ( 1, 0, 0 ), ( 0, 1, 0 ), 0.11, 0.17, 0.04, 2 if not lod else 1 ) for dz in ( - 0.03, 0.03 ) ], 'CarTrim', 'gloss' )
		m.face( Mesh.rrect( ( sx * ( w + 0.3 ), 1.9, zf + 0.026 ), ( 1, 0, 0 ), ( 0, 1, 0 ), 0.095, 0.155, 0.035, 2 if not lod else 1 ), 'CarTrim', 'mirror', out = ( 0, 0, - 1 ) )

BUILD = { 'sedan': build_sedan, 'taxi': build_taxi, 'police': build_police, 'pickup': build_pickup, 'van': build_van, 'sports': build_sports, 'bus': build_bus }
WHEEL_STYLE = { 'sedan': 'alloy5', 'taxi': 'steel', 'police': 'police', 'pickup': 'truck', 'van': 'steel', 'sports': 'sport', 'bus': 'bus' }

def clear():
	for o in list( bpy.context.scene.objects ): bpy.data.objects.remove( o, do_unlink = True )
	for me in list( bpy.data.meshes ): bpy.data.meshes.remove( me )

def build( kind ):
	clear()
	S = SPECS[ kind ]
	m = Mesh( [ 'CarPaint', 'CarTrim', 'CarLamp' ] )
	BUILD[ kind ]( m, S, False )
	body = m.object( 'Body' )
	lm = Mesh( [ 'Lod1Paint', 'Lod1Trim', 'Lod1Lamp' ], lod = True )
	BUILD[ kind ]( lm, S, True )
	lod = lm.object( 'BodyLod' )
	# the wheels: outer face flush with the body side less 0.04, the front axle +wb/2
	w = S[ 'W' ] / 2
	x = w - S[ 'ww' ] / 2 - 0.04
	wheels = []
	st = WHEELS[ WHEEL_STYLE[ kind ] ]
	for name, sx, sz in ( ( 'Wheel_FL', 1, 1 ), ( 'Wheel_FR', - 1, 1 ), ( 'Wheel_RL', 1, - 1 ), ( 'Wheel_RR', - 1, - 1 ) ):
		ob = wheel( name, S[ 'r' ], S[ 'ww' ], st )
		ob.location = B( ( sx * x, S[ 'r' ], sz * S[ 'wb' ] / 2 ) )
		wheels.append( ob )
	wl = wheel( 'WheelLod_FL', S[ 'r' ], S[ 'ww' ], st, lod = True )
	wl.location = B( ( x, S[ 'r' ], S[ 'wb' ] / 2 ) )
	parts = [ body ] + wheels + [ lod, wl ]
	bpy.ops.object.select_all( action = 'DESELECT' )
	for o in parts: o.select_set( True )
	bpy.context.view_layer.objects.active = body
	path = os.path.join( OUT, kind + '.glb' )
	bpy.ops.export_scene.gltf( filepath = path, export_format = 'GLB', use_selection = True, export_yup = True, export_apply = True,
		export_texcoords = True, export_normals = True, export_materials = 'EXPORT', export_cameras = False, export_lights = False,
		export_extras = False, export_animations = False, export_skins = False, export_morph = False, export_image_format = 'AUTO' )
	def tris( objs ):
		n = 0
		for o in objs:
			o.data.calc_loop_triangles()
			n += len( o.data.loop_triangles )
		return n
	near = [ body ] + wheels
	lo = [ min( ( o.matrix_world @ Vector( c ) )[ i ] for o in near for c in o.bound_box ) for i in range( 3 ) ]
	hi = [ max( ( o.matrix_world @ Vector( c ) )[ i ] for o in near for c in o.bound_box ) for i in range( 3 ) ]
	print( 'CAR', json.dumps( { 'kind': kind, 'tris': tris( near ), 'body': tris( [ body ] ), 'wheel': tris( [ wheels[ 0 ] ] ), 'lodTris': tris( [ lod, wl ] ) + 3 * tris( [ wl ] ),
		'bytes': os.path.getsize( path ), 'length': round( hi[ 1 ] - lo[ 1 ], 3 ), 'width': round( hi[ 0 ] - lo[ 0 ], 3 ), 'height': round( hi[ 2 ], 3 ) } ) )

kinds = list( SPECS.keys() ) if WHICH == 'all' else WHICH.split( ',' )
for k in kinds: build( k )
