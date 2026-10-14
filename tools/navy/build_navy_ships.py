# The navy's own ships (wave 19F): a three-masted frigate and a gaff revenue cutter, low poly, built headless:
#   D:\blender\blender.exe -b --factory-startup -P tools/navy/build_navy_ships.py -- <frigate|revenue|all> [outDir]
# -> public/models/navy/frigate.glb, public/models/navy/revenue.glb (+ a measurements line per ship on stdout).
#
# Conventions of the fork's brigantine_v2 / sloop_v2 (features/naval/Models.js, ShipFrame.js, MastFall.js):
# - glTF frame +X forward (bow), +Y up, origin at the waterline centre of the hull; the X extent is symmetric about 0
#   (ShipFrame.centreOnHull shifts by the middle of the X extent, so the bowsprit tip and the aft-most part balance).
# - one mesh node (SM_Frigate / SM_Revenue), one primitive per material; the game names each mesh 'ship-' + material.
# - the brigantine's own materials and textures (M_NavalSparTimber / SailCanvas / RiggingHemp: MastFall's /spar|sail|
#   canvas|rigging|mast/ picks them to topple; M_NavalLanternGlass: the lantern glass that glows at night), plus the navy's
#   M_NavyHullBlue / M_NavyHullWhite (a 128 px painted-plank map tinted by baseColorFactor), M_NavyBlueCanvas (the sail
#   canvas tinted blue: the ensign and the pennant, they fall with the spars) and M_NavyHelmWheel (the turning wheel:
#   features/navy/NavyModels.js lifts that mesh out and spins it, as naval's carved wheel).
# Blender frame while building: X forward, Y port, Z up (the exporter's +Y up turns it into the glTF frame).

import bpy, bmesh, math, sys, os, json, struct
from mathutils import Vector, Matrix

ROOT = os.path.abspath( os.path.join( os.path.dirname( __file__ ), '..', '..' ) )
BRIG = os.path.join( ROOT, 'public', 'models', 'ships', 'brigantine_v2.glb' )

argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
WHICH = argv[ 0 ] if argv else 'all'
OUT = argv[ 1 ] if len( argv ) > 1 else os.path.join( ROOT, 'public', 'models', 'navy' )

MATS = [ 'M_NavalHullTar', 'M_NavyHullBlue', 'M_NavyHullWhite', 'M_NavalSheerStripe', 'M_NavalDeckPlank', 'M_NavalSparTimber',
	'M_NavalIron', 'M_NavalAgedBrass', 'M_NavalSailCanvas', 'M_NavyBlueCanvas', 'M_NavalRiggingHemp', 'M_NavalLanternGlass', 'M_NavyHelmWheel' ]
# linear baseColorFactor of the tinted materials (patched into the GLB after export as well)
TINT = { 'M_NavyHullBlue': ( 0.02, 0.05, 0.2 ), 'M_NavyHullWhite': ( 0.98, 0.96, 0.9 ), 'M_NavyBlueCanvas': ( 0.06, 0.12, 0.42 ), 'M_NavyHelmWheel': ( 1.0, 0.92, 0.85 ) }
# metres per texture tile (box projection) and the ones whose map runs the other way
UVS = { 'M_NavalHullTar': 2.4, 'M_NavyHullBlue': ( 4.8, 1.2 ), 'M_NavyHullWhite': ( 4.8, 1.2 ), 'M_NavalSheerStripe': 2.0, 'M_NavalDeckPlank': 3.2, 'M_NavalSparTimber': 1.6,
	'M_NavalSailCanvas': 4.0, 'M_NavyBlueCanvas': 2.0, 'M_NavyHelmWheel': 0.8 }
SWAP = { 'M_NavalHullTar', 'M_NavalSheerStripe' }

def lerp( a, b, t ): return a + ( b - a ) * t
def clamp( v, a, b ): return a if v < a else b if v > b else v
def smooth( a, b, x ):
	t = clamp( ( x - a ) / ( b - a ), 0, 1 )
	return t * t * ( 3 - 2 * t )

# ------------------------------------------------------------------ mesh builder

class MB:

	def __init__( self ):
		self.bm = bmesh.new()
		self.uv = self.bm.loops.layers.uv.new( 'UVMap' )
		self.mi = { n: i for i, n in enumerate( MATS ) }

	def v( self, p ):
		return self.bm.verts.new( Vector( p ) )

	# a face from BMVerts or points; `facing` flips the winding so the normal points that way; uvs default to a box projection
	def f( self, vs, mat, facing = None, uvs = None, smooth = False ):
		vs = [ x if isinstance( x, bmesh.types.BMVert ) else self.v( x ) for x in vs ]
		if facing is not None:
			n = normal_of( [ x.co for x in vs ] )
			if n.dot( Vector( facing ) ) < 0:
				vs = vs[ :: - 1 ]
				if uvs: uvs = uvs[ :: - 1 ]
		try:
			face = self.bm.faces.new( vs )
		except ValueError:
			return None
		face.material_index = self.mi[ mat ]
		face.smooth = smooth
		if uvs is None: uvs = boxuv( [ x.co for x in vs ], UVS.get( mat, 1.0 ), mat in SWAP )
		for l, uv in zip( face.loops, uvs ): l[ self.uv ].uv = uv
		return face

def normal_of( pts ):
	n = Vector( ( 0, 0, 0 ) )
	for i in range( len( pts ) ):
		a, b = pts[ i ], pts[ ( i + 1 ) % len( pts ) ]
		n.x += ( a.y - b.y ) * ( a.z + b.z ); n.y += ( a.z - b.z ) * ( a.x + b.x ); n.z += ( a.x - b.x ) * ( a.y + b.y )
	return n.normalized() if n.length > 1e-12 else Vector( ( 0, 0, 1 ) )

def boxuv( pts, s, swap = False ):
	su, sv = s if isinstance( s, tuple ) else ( s, s ) # (long planks: a tile is wider than it is high)
	n = normal_of( pts )
	ax = max( range( 3 ), key = lambda i: abs( n[ i ] ) )
	out = []
	for p in pts:
		if ax == 2: u, v = p.x, p.y
		elif ax == 1: u, v = p.x, p.z
		else: u, v = p.y, p.z
		out.append( ( v / sv, u / su ) if swap else ( u / su, v / sv ) )
	return out

# a box: centre, size (x, y, z), rotation matrix (3x3) or euler (rx, ry, rz)
def box( mb, c, size, mat, rot = None, uvscale = None ):
	R = rot if isinstance( rot, Matrix ) else ( Matrix.Rotation( 0, 3, 'X' ) if rot is None else ( Matrix.Rotation( rot[ 2 ], 3, 'Z' ) @ Matrix.Rotation( rot[ 1 ], 3, 'Y' ) @ Matrix.Rotation( rot[ 0 ], 3, 'X' ) ) )
	c = Vector( c ); hx, hy, hz = size[ 0 ] / 2, size[ 1 ] / 2, size[ 2 ] / 2
	P = lambda x, y, z: c + R @ Vector( ( x, y, z ) )
	faces = [ ( ( 1, 0, 0 ), [ ( hx, - hy, - hz ), ( hx, hy, - hz ), ( hx, hy, hz ), ( hx, - hy, hz ) ] ),
		( ( - 1, 0, 0 ), [ ( - hx, - hy, - hz ), ( - hx, - hy, hz ), ( - hx, hy, hz ), ( - hx, hy, - hz ) ] ),
		( ( 0, 1, 0 ), [ ( - hx, hy, - hz ), ( - hx, hy, hz ), ( hx, hy, hz ), ( hx, hy, - hz ) ] ),
		( ( 0, - 1, 0 ), [ ( - hx, - hy, - hz ), ( hx, - hy, - hz ), ( hx, - hy, hz ), ( - hx, - hy, hz ) ] ),
		( ( 0, 0, 1 ), [ ( - hx, - hy, hz ), ( hx, - hy, hz ), ( hx, hy, hz ), ( - hx, hy, hz ) ] ),
		( ( 0, 0, - 1 ), [ ( - hx, - hy, - hz ), ( - hx, hy, - hz ), ( hx, hy, - hz ), ( hx, - hy, - hz ) ] ) ]
	for n, q in faces:
		pts = [ P( *p ) for p in q ]
		uvs = boxuv( pts, uvscale, mat in SWAP ) if uvscale else None
		mb.f( pts, mat, facing = R @ Vector( n ), uvs = uvs )

# a tapered cylinder from p0 to p1 (radii r0, r1), n sides; caps optional; smooth sides with a UV seam
def cyl( mb, p0, p1, r0, r1, mat, n = 8, cap0 = True, cap1 = True, smooth = True, vlen = None ):
	p0, p1 = Vector( p0 ), Vector( p1 )
	ax = ( p1 - p0 ); L = ax.length; ax.normalize()
	ref = Vector( ( 0, 0, 1 ) ) if abs( ax.z ) < 0.9 else Vector( ( 1, 0, 0 ) )
	e1 = ax.cross( ref ).normalized(); e2 = ax.cross( e1 ).normalized()
	vlen = vlen or UVS.get( mat, 1.0 ) * 2.5
	ring0, ring1 = [], []
	for i in range( n + 1 ):
		a = 2 * math.pi * i / n
		d = e1 * math.cos( a ) + e2 * math.sin( a )
		ring0.append( mb.v( p0 + d * r0 ) if i < n else ring0[ 0 ] )
		ring1.append( mb.v( p1 + d * r1 ) if i < n else ring1[ 0 ] )
	for i in range( n ):
		u0, u1 = i / n, ( i + 1 ) / n
		mid = ( ring0[ i ].co + ring0[ i + 1 ].co ) / 2
		mb.f( [ ring0[ i ], ring0[ i + 1 ], ring1[ i + 1 ], ring1[ i ] ], mat, facing = mid - p0 - ax * ( mid - p0 ).dot( ax ), uvs = [ ( u0, 0 ), ( u1, 0 ), ( u1, L / vlen ), ( u0, L / vlen ) ], smooth = smooth )
	if cap0 and r0 > 0.004: mb.f( [ x.co.copy() for x in ring0[ : n ] ], mat, facing = - ax )
	if cap1 and r1 > 0.004: mb.f( [ x.co.copy() for x in ring1[ : n ] ], mat, facing = ax )

def line( mb, a, b, r = 0.03 ):
	cyl( mb, a, b, r, r, 'M_NavalRiggingHemp', n = 3, cap0 = False, cap1 = False, smooth = False )

# a grid surface P( s, t ) (s across, t down), nu x nv quads, uv from the corner sizes
def grid( mb, P, nu, nv, mat, uscale = 1.0, vscale = 1.0, smooth = True ):
	S = UVS.get( mat, 2.0 )
	V = [ [ mb.v( P( i / nu, j / nv ) ) for i in range( nu + 1 ) ] for j in range( nv + 1 ) ]
	for j in range( nv ):
		for i in range( nu ):
			q = [ V[ j ][ i ], V[ j ][ i + 1 ], V[ j + 1 ][ i + 1 ], V[ j + 1 ][ i ] ]
			uvs = [ ( i / nu * uscale / S, - j / nv * vscale / S ), ( ( i + 1 ) / nu * uscale / S, - j / nv * vscale / S ), ( ( i + 1 ) / nu * uscale / S, - ( j + 1 ) / nv * vscale / S ), ( i / nu * uscale / S, - ( j + 1 ) / nv * vscale / S ) ]
			mb.f( q, mat, uvs = uvs, smooth = smooth )

# a triangle sail A (head) B (tack) C (clew), n rows, bellied along `belly` (vector, m at the middle)
def tri_sail( mb, A, B, C, n, mat, belly ):
	A, B, C, belly = Vector( A ), Vector( B ), Vector( C ), Vector( belly )
	S = UVS.get( mat, 2.0 )
	rows = []
	for k in range( n + 1 ):
		t = k / n
		row = []
		for i in range( k + 1 ):
			s = i / k if k else 0.5
			p = A + ( B - A ) * t * ( 1 - s ) + ( C - A ) * t * s
			w = math.sin( math.pi * t * 0.85 ) * math.sin( math.pi * ( s if k else 0.5 ) )
			row.append( ( mb.v( p + belly * w ), p ) )
		rows.append( row )
	uv = lambda p: ( ( p - A ).dot( ( C - B ).normalized() ) / S, - ( p - A ).length / S )
	for k in range( n ):
		r0, r1 = rows[ k ], rows[ k + 1 ]
		for i in range( k + 1 ):
			mb.f( [ r0[ i ][ 0 ], r1[ i ][ 0 ], r1[ i + 1 ][ 0 ] ], mat, uvs = [ uv( r0[ i ][ 1 ] ), uv( r1[ i ][ 1 ] ), uv( r1[ i + 1 ][ 1 ] ) ], smooth = True )
			if i < k: mb.f( [ r0[ i ][ 0 ], r1[ i + 1 ][ 0 ], r0[ i + 1 ][ 0 ] ], mat, uvs = [ uv( r0[ i ][ 1 ] ), uv( r1[ i + 1 ][ 1 ] ), uv( r0[ i + 1 ][ 1 ] ) ], smooth = True )

# a square sail hung from a yard: top corners a0 a1, foot corners b0 b1, bellied forward
def square_sail( mb, a0, a1, b0, b1, belly, mat = 'M_NavalSailCanvas', nu = 4, nv = 3 ):
	a0, a1, b0, b1 = Vector( a0 ), Vector( a1 ), Vector( b0 ), Vector( b1 )
	w = ( a1 - a0 ).length; h = ( ( b0 + b1 ) / 2 - ( a0 + a1 ) / 2 ).length
	def P( s, t ):
		p = ( a0.lerp( a1, s ) ).lerp( b0.lerp( b1, s ), t )
		return p + Vector( ( belly * math.sin( math.pi * s ) * math.sin( math.pi * t * 0.8 ), 0, 0 ) )
	grid( mb, P, nu, nv, mat, w, h )

# a flag flying aft (-X) from a hoist at `top` (x, y, z), w long, h deep, with a wave; cells: column / row split points
# and the material of each cell( ci, ri )
def flag( mb, top, w, h, cols, rows, cellmat, wave = 0.18 ):
	tx, ty, tz = top
	def P( s, t ):
		return Vector( ( tx - s * w, ty + wave * math.sin( 2 * math.pi * s * 1.1 ) * s, tz - t * h - 0.08 * s * s ) )
	sub = 2
	for ci in range( len( cols ) - 1 ):
		for ri in range( len( rows ) - 1 ):
			mat = cellmat( ci, ri )
			s0, s1, t0, t1 = cols[ ci ], cols[ ci + 1 ], rows[ ri ], rows[ ri + 1 ]
			grid( mb, lambda a, b: P( lerp( s0, s1, a ), lerp( t0, t1, b ) ), sub, 1, mat, ( s1 - s0 ) * w, ( t1 - t0 ) * h )

# ------------------------------------------------------------------ hull

class Hull:

	# L hull length (stern x0 .. stem x1), Bh half beam, keel z, sheer( u ) top of the side, rows (z, absolute, below sheer)
	def __init__( self, L, Bh, keel, sheer, rows, transom = 0.68, bowfull = 1.5 ):
		self.L, self.Bh, self.keel, self.sheer, self.rows, self.transom, self.bowfull = L, Bh, keel, sheer, rows, transom, bowfull
		self.x0, self.x1 = - L / 2, L / 2
		self.Hmid = sheer( 0.5 )

	def u( self, x ): return ( x - self.x0 ) / self.L

	def y( self, x, z ):
		u = clamp( self.u( x ), 0, 1 )
		zn = ( z - self.keel ) / ( self.Hmid - self.keel )
		sh = math.sin( clamp( zn / 0.85, 0, 1 ) * math.pi / 2 ) ** 0.5 if zn <= 0.85 else max( 0.8, 1 - 0.45 * ( zn - 0.85 ) )
		fb = 1.0 if u <= 0.55 else 1 - ( ( u - 0.55 ) / 0.45 ) ** ( self.bowfull + 1.5 * clamp( zn, 0, 1 ) )
		fs = 1.0
		if u < 0.35:
			k = ( 0.35 - u ) / 0.35
			t = smooth( 0.3, 0.75, zn )
			fs = lerp( 1 - k ** 1.8, 1 - ( 1 - self.transom ) * k ** 1.5, t )
		return max( 0.0, self.Bh * sh * fb * fs )

	def slope( self, x, z ):
		return ( self.y( x + 0.05, z ) - self.y( x - 0.05, z ) ) / 0.1

	# band material by height: a list of (z top, material)
	def build( self, mb, xs, bands ):
		self.xs = xs
		for side in ( 1, - 1 ):
			G = []
			for x in xs:
				zs = [ self.keel ] + [ r for r in self.rows ] + [ self.sheer( self.u( x ) ) ]
				G.append( [ mb.v( ( x, side * self.y( x, z ), z ) ) for z in zs ] )
			for i in range( len( xs ) - 1 ):
				for j in range( len( G[ 0 ] ) - 1 ):
					q = [ G[ i ][ j ], G[ i + 1 ][ j ], G[ i + 1 ][ j + 1 ], G[ i ][ j + 1 ] ]
					zm = ( q[ 0 ].co.z + q[ 3 ].co.z ) / 2
					mat = next( m for top, m in bands if zm < top )
					if sum( ( a.co - b.co ).length for a, b in zip( q, q[ 1: ] + q[ : 1 ] ) ) < 1e-4: continue
					f = mb.f( q, mat, facing = ( 0, side, 0 ) )
					if f: f.smooth = True
		# the transom: the stern section as one face (aft), its upper part painted
		x = xs[ 0 ]
		zs = [ self.keel ] + self.rows + [ self.sheer( 0 ) ]
		ring = [ ( x, self.y( x, z ), z ) for z in zs ] + [ ( x, - self.y( x, z ), z ) for z in reversed( zs ) ]
		ring = [ p for i, p in enumerate( ring ) if i == 0 or ( Vector( p ) - Vector( ring[ i - 1 ] ) ).length > 1e-4 ]
		mb.f( ring, 'M_NavyHullBlue', facing = ( - 1, 0, 0 ) )

	# the bulwark's inside (thickness t), its cap, from deck( x ) up to the sheer
	def bulwarks( self, mb, deck, t = 0.16, inner = 'M_NavalSheerStripe', cap = 'M_NavyHullWhite' ):
		xs = self.xs
		for side in ( 1, - 1 ):
			for i in range( len( xs ) - 1 ):
				xa, xb = xs[ i ], xs[ i + 1 ]
				zd = deck( ( xa + xb ) / 2 )
				sa, sb = self.sheer( self.u( xa ) ), self.sheer( self.u( xb ) )
				ia = lambda x, z: max( 0.0, self.y( x, z ) - t )
				q = [ ( xa, side * ia( xa, zd ), zd ), ( xb, side * ia( xb, zd ), zd ), ( xb, side * ia( xb, sb ), sb ), ( xa, side * ia( xa, sa ), sa ) ]
				mb.f( q, inner, facing = ( 0, - side, 0 ) )
				c = [ ( xa, side * ia( xa, sa ), sa ), ( xb, side * ia( xb, sb ), sb ), ( xb, side * self.y( xb, sb ), sb ), ( xa, side * self.y( xa, sa ), sa ) ]
				mb.f( c, cap, facing = ( 0, 0, 1 ) )
		# the transom's inside and cap
		x = xs[ 0 ]; zd = deck( x + 0.01 ); s = self.sheer( 0 )
		yi = lambda z: max( 0.0, self.y( x, z ) - t )
		mb.f( [ ( x + t, - yi( zd ), zd ), ( x + t, yi( zd ), zd ), ( x + t, yi( s ), s ), ( x + t, - yi( s ), s ) ], inner, facing = ( 1, 0, 0 ) )
		mb.f( [ ( x, - self.y( x, s ), s ), ( x, self.y( x, s ), s ), ( x + t, yi( s ), s ), ( x + t, - yi( s ), s ) ], cap, facing = ( 0, 0, 1 ) )

	# a deck at height z between xa and xb (the stations in between), inside the bulwarks
	def deck( self, mb, xa, xb, z, t = 0.16 ):
		xs = [ xa ] + [ x for x in self.xs if xa + 1e-3 < x < xb - 1e-3 ] + [ xb ]
		w = lambda x: max( 0.0, self.y( x, z ) - t )
		for i in range( len( xs ) - 1 ):
			a, b = xs[ i ], xs[ i + 1 ]
			for side in ( 1, - 1 ):
				q = [ ( a, 0, z ), ( b, 0, z ), ( b, side * w( b ), z ), ( a, side * w( a ), z ) ]
				if w( a ) + w( b ) < 1e-3: continue
				mb.f( q, 'M_NavalDeckPlank', facing = ( 0, 0, 1 ) )

	# a break between two deck levels at x (a white bulkhead facing `facing`)
	def bulkhead( self, mb, x, z0, z1, facing, t = 0.16, door = True ):
		w0, w1 = max( 0.0, self.y( x, z0 ) - t ), max( 0.0, self.y( x, z1 ) - t )
		mb.f( [ ( x, - w0, z0 ), ( x, w0, z0 ), ( x, w1, z1 ), ( x, - w1, z1 ) ], 'M_NavyHullWhite', facing = ( facing, 0, 0 ) )
		mb.f( [ ( x, - w1, z1 ), ( x, w1, z1 ), ( x + facing * 0.12, w1, z1 ), ( x + facing * 0.12, - w1, z1 ) ], 'M_NavalSparTimber', facing = ( 0, 0, 1 ) )
		if door:
			for y in ( - 1.6, 1.6 ):
				mb.f( [ ( x + facing * 0.02, y - 0.35, z0 ), ( x + facing * 0.02, y + 0.35, z0 ), ( x + facing * 0.02, y + 0.35, z0 + min( 1.0, z1 - z0 - 0.15 ) ), ( x + facing * 0.02, y - 0.35, z0 + min( 1.0, z1 - z0 - 0.15 ) ) ], 'M_NavalHullTar', facing = ( facing, 0, 0 ) )

	# a point on the side at (x, z), standing off by `off`, and the side's yaw there
	def side_at( self, x, z, side, off = 0.0 ):
		return Vector( ( x, side * ( self.y( x, z ) + off ), z ) ), math.atan( self.slope( x, z ) ) * side

def stations( x0, x1, n, extra = () ):
	xs = [ lerp( x0, x1, 0.5 - 0.5 * math.cos( math.pi * i / n ) ) for i in range( n + 1 ) ]
	for e in extra: xs.append( e )
	xs.sort()
	out = []
	for x in xs:
		if out and abs( x - out[ - 1 ] ) < 0.2:
			if x in extra: out[ - 1 ] = x
			continue
		out.append( x )
	return out

# ------------------------------------------------------------------ fittings

# a gun port with a barrel out of it (and its lid raised above for the lower tier)
def gun_port( mb, hull, x, z, side, size, barrel = True, lid = False, carriage_deck = None, r = 0.12 ):
	p, yaw = hull.side_at( x, z, side, 0.02 )
	R = Matrix.Rotation( yaw, 3, 'Z' )
	box( mb, p, ( size, 0.06, size ), 'M_NavalHullTar', R )
	if lid:
		hinge = p + Vector( ( 0, side * 0.03, size / 2 ) )
		L = Matrix.Rotation( yaw, 3, 'Z' ) @ Matrix.Rotation( - side * math.radians( 68 ), 3, 'X' )
		box( mb, hinge + L @ Vector( ( 0, 0, size / 2 ) ), ( size + 0.06, 0.06, size + 0.04 ), 'M_NavyHullBlue', L )
	if barrel:
		out = R @ Vector( ( 0, side, 0 ) )
		cyl( mb, p - out * 0.55, p + out * 0.62, r * 1.25, r, 'M_NavalIron', n = 8, cap0 = False )
		cyl( mb, p + out * 0.58, p + out * 0.66, r * 1.35, r * 1.35, 'M_NavalIron', n = 8 )
		if carriage_deck is not None:
			c = Vector( ( x, side * ( hull.y( x, z ) - 0.85 ), ( carriage_deck + z - 0.12 ) / 2 ) )
			box( mb, c, ( 0.62, 1.0, z - 0.12 - carriage_deck ), 'M_NavalSparTimber' )

# a stern window on the transom (x: the face it stands on): a dark pane behind amber glass (it glows at night)
def stern_window( mb, x, y, z, w, h ):
	box( mb, ( x - 0.02, y, z ), ( 0.03, w, h ), 'M_NavalHullTar' )
	box( mb, ( x - 0.045, y, z ), ( 0.02, w - 0.1, h - 0.1 ), 'M_NavalLanternGlass' )

def lantern( mb, base, post = 0.7, s = 0.32 ):
	b = Vector( base )
	cyl( mb, b, b + Vector( ( 0, 0, post ) ), 0.04, 0.04, 'M_NavalIron', n = 6 )
	g = b + Vector( ( 0, 0, post + s * 0.7 ) )
	box( mb, g, ( s, s, s * 1.3 ), 'M_NavalLanternGlass' )
	cyl( mb, g + Vector( ( 0, 0, s * 0.65 ) ), g + Vector( ( 0, 0, s * 1.05 ) ), s * 0.62, 0.02, 'M_NavalIron', n = 6, cap1 = False )
	box( mb, g - Vector( ( 0, 0, s * 0.7 ) ), ( s * 1.1, s * 1.1, 0.06 ), 'M_NavalIron' )

# a spoked wheel in the YZ plane at hub (x, 0, z), radius R (M_NavyHelmWheel: the part that turns) and its post
def wheel( mb, hub, R, deck, spokes = 8 ):
	h = Vector( hub )
	n = 14
	pts = [ h + Vector( ( 0, R * math.cos( 2 * math.pi * i / n ), R * math.sin( 2 * math.pi * i / n ) ) ) for i in range( n ) ]
	for i in range( n ): cyl( mb, pts[ i ], pts[ ( i + 1 ) % n ], 0.035, 0.035, 'M_NavyHelmWheel', n = 4, cap0 = False, cap1 = False, smooth = False )
	for k in range( spokes ):
		a = 2 * math.pi * ( k + 0.5 ) / spokes
		d = Vector( ( 0, math.cos( a ), math.sin( a ) ) )
		cyl( mb, h + d * 0.08, h + d * ( R * 1.28 ), 0.026, 0.02, 'M_NavyHelmWheel', n = 4, cap0 = False, smooth = False )
	cyl( mb, h - Vector( ( 0.09, 0, 0 ) ), h + Vector( ( 0.09, 0, 0 ) ), 0.1, 0.1, 'M_NavyHelmWheel', n = 8 )
	# the post and axle (fixed), forward of the wheel
	cyl( mb, h + Vector( ( 0.09, 0, 0 ) ), h + Vector( ( 0.3, 0, 0 ) ), 0.04, 0.04, 'M_NavalIron', n = 6 )
	box( mb, ( h.x + 0.3, 0, ( deck + h.z + 0.08 ) / 2 ), ( 0.16, 0.22, h.z + 0.08 - deck ), 'M_NavalSparTimber' )

def channel_shrouds( mb, hull, mast_x, top, xs_off, side, z_ch, top_y = 0.35, out = 0.25 ):
	# the channel (a ledge on the side) and the shrouds from it to the masthead
	x0, x1 = mast_x + min( xs_off ) - 0.4, mast_x + max( xs_off ) + 0.4
	p, yaw = hull.side_at( ( x0 + x1 ) / 2, z_ch, side, out / 2 )
	box( mb, p, ( x1 - x0, out, 0.1 ), 'M_NavalSparTimber', Matrix.Rotation( yaw, 3, 'Z' ) )
	for dx in xs_off:
		a = Vector( ( mast_x + dx, side * ( hull.y( mast_x + dx, z_ch ) + out * 0.8 ), z_ch ) )
		line( mb, a, ( mast_x - 0.1, side * top_y, top ) )

# ------------------------------------------------------------------ the frigate

def build_frigate():
	mb = MB()
	L, Bh, keel = 27.5, 3.95, - 2.6
	XQ, XF = - 6.8, 9.2 # the quarterdeck's break, the forecastle's
	DQ, DM, DF = 4.6, 3.4, 4.35 # quarterdeck, main (gun) deck, forecastle
	uq, uf = ( XQ + L / 2 ) / L, ( XF + L / 2 ) / L
	# the rail steps up at the breaks (the drift), and rises a little more to the taffrail and the knightheads
	sheer = lambda u: 4.75 + 0.95 * smooth( uq + 0.05, uq, u ) + 0.2 * smooth( uq, 0.0, u ) + 0.55 * smooth( uf - 0.05, uf, u ) + 0.15 * smooth( uf, 1.0, u )
	rows = [ - 2.1, - 1.4, - 0.6, 0.3, 1.2, 2.0, 2.95, 3.55, 4.35 ]
	H = Hull( L, Bh, keel, sheer, rows, transom = 0.66, bowfull = 1.4 )
	xs = stations( H.x0, H.x1, 32, ( XQ, XQ + 0.7, XQ + 1.4, XF, XF - 0.7, XF - 1.4 ) )
	H.build( mb, xs, [ ( 0.3, 'M_NavalHullTar' ), ( 2.0, 'M_NavyHullBlue' ), ( 2.95, 'M_NavyHullWhite' ), ( 99, 'M_NavyHullBlue' ) ] )
	deck = lambda x: DQ if x < XQ else DF if x > XF else DM
	H.bulwarks( mb, deck )
	H.deck( mb, H.x0, XQ, DQ ); H.deck( mb, XQ, XF, DM ); H.deck( mb, XF, H.x1, DF )
	H.bulkhead( mb, XQ, DM, DQ, 1 ); H.bulkhead( mb, XF, DM, DF, - 1, door = False )
	# ladders up to the quarterdeck
	for y in ( - 2.6, 2.6 ):
		for k in range( 4 ): box( mb, ( XQ + 1.1 - k * 0.28, y, DM + 0.15 + k * 0.3 ), ( 0.26, 0.9, 0.06 ), 'M_NavalSparTimber' )

	# the stem knee and the figurehead
	knee = [ ( H.x1 - 0.1, - 2.5 ), ( H.x1 + 0.25, 0.0 ), ( H.x1 + 0.75, 3.0 ), ( H.x1 + 1.05, 4.7 ), ( H.x1 - 0.1, 5.2 ) ]
	for side in ( 1, - 1 ): mb.f( [ ( x, side * 0.13, z ) for x, z in knee ], 'M_NavyHullBlue', facing = ( 0, side, 0 ) )
	for i in range( len( knee ) ):
		( xa, za ), ( xb, zb ) = knee[ i ], knee[ ( i + 1 ) % len( knee ) ]
		mb.f( [ ( xa, - 0.13, za ), ( xb, - 0.13, zb ), ( xb, 0.13, zb ), ( xa, 0.13, za ) ], 'M_NavyHullBlue', facing = ( ( zb - za ), 0, - ( xb - xa ) ) )
	box( mb, ( H.x1 + 1.0, 0, 4.85 ), ( 0.5, 0.36, 0.55 ), 'M_NavalAgedBrass', ( 0, math.radians( - 25 ), 0 ) )

	# gun ports: the lower tier (lids raised, barrels out) on the white strake, the upper in the waist's bulwark
	lower = [ - 10.8, - 8.1, - 5.4, - 2.7, 0.0, 2.7, 5.4, 8.1 ]
	upper = [ - 5.4, - 2.7, 0.0, 2.7, 5.4, 8.1 ]
	for side in ( 1, - 1 ):
		for x in lower: gun_port( mb, H, x, 2.48, side, 0.56, lid = True, r = 0.13 )
		for x in upper: gun_port( mb, H, x, 4.0, side, 0.58, carriage_deck = DM, r = 0.12 )
		for x in ( - 9.4, - 12.0 ): gun_port( mb, H, x, 5.0, side, 0.42, carriage_deck = DQ, r = 0.09 ) # quarterdeck carronades

	# the stern: windows (glass glows at night) in a white band, a gilt board, three lanterns
	xs0 = H.x0 - 0.02
	box( mb, ( xs0 - 0.02, 0, 5.08 ), ( 0.04, 2 * H.y( H.x0, 5.08 ) - 0.3, 0.7 ), 'M_NavyHullWhite' )
	for y in ( - 1.84, - 0.92, 0.0, 0.92, 1.84 ): stern_window( mb, xs0 - 0.04, y, 5.08, 0.62, 0.46 )
	for y in ( - 1.38, - 0.46, 0.46, 1.38 ): stern_window( mb, xs0, y, 3.95, 0.55, 0.4 )
	box( mb, ( xs0 - 0.03, 0, 4.42 ), ( 0.04, 2 * H.y( H.x0, 4.42 ) - 0.6, 0.22 ), 'M_NavalAgedBrass' )
	for y in ( - 2.4, 0.0, 2.4 ): lantern( mb, ( H.x0 + 0.08, y, sheer( 0 ) ), post = 0.55 if y else 0.9, s = 0.3 if y else 0.4 )

	# deck furniture: capstan, hatches, the binnacle and the double wheel aft of the mizzen
	cyl( mb, ( - 3.6, 0, DM ), ( - 3.6, 0, DM + 0.85 ), 0.42, 0.34, 'M_NavalSparTimber', n = 10 )
	for x, s in ( ( 1.3, 1.7 ), ( - 1.6, 1.3 ), ( 9.9 + 0.0, 1.0 ) ):
		box( mb, ( x, 0, ( DM if x < XF else DF ) + 0.12 ), ( s, s * 1.2, 0.24 ), 'M_NavalSparTimber' )
	WX, WR = - 10.7, 0.72
	WH = DQ + 1.02
	wheel( mb, ( WX, 0, WH ), WR, DQ )
	box( mb, ( WX + 1.25, 0, DQ + 0.55 ), ( 0.5, 0.5, 1.1 ), 'M_NavalAgedBrass' )
	box( mb, ( - 12.4, 0, DQ + 0.35 ), ( 1.2, 1.8, 0.7 ), 'M_NavalSparTimber' ) # skylight
	# the ship's boat on the booms over the waist
	bh = Hull( 5.6, 0.85, - 0.35, lambda u: 0.42 + 0.12 * smooth( 0.75, 1.0, u ) + 0.08 * smooth( 0.25, 0.0, u ), [ - 0.15, 0.1 ], transom = 0.6, bowfull = 1.2 )
	bmb_off = Vector( ( 3.6, 0, DM + 1.45 ) )
	boat = MB()
	bh.build( boat, stations( bh.x0, bh.x1, 10 ), [ ( 0.1, 'M_NavyHullWhite' ), ( 9, 'M_NavyHullBlue' ) ] )
	for vtx in boat.bm.verts: vtx.co += bmb_off
	merge( mb, boat )
	box( mb, bmb_off + Vector( ( 0, 0, 0.12 ) ), ( 5.2, 1.5, 0.05 ), 'M_NavalDeckPlank' )
	for dx in ( - 1.35, 1.35 ): # the booms (clear of the guns at 2.7 / 5.4) on their posts
		box( mb, ( bmb_off.x + dx, 0, DM + 1.03 ), ( 0.2, 2 * H.y( bmb_off.x + dx, DM + 1 ) - 0.5, 0.14 ), 'M_NavalSparTimber' )
		for s in ( - 1, 1 ): box( mb, ( bmb_off.x + dx, s * 1.4, DM + 0.48 ), ( 0.16, 0.16, 0.96 ), 'M_NavalSparTimber' )

	# masts: x, foot deck, lower top, topmast head, t'gallant head; yards (z, half span) per mast
	masts = [
		( 'fore', 7.6, DM, 13.2, 20.0, 24.2, [ ( 12.3, 7.0 ), ( 18.9, 5.2 ), ( 23.4, 3.7 ) ] ),
		( 'main', - 0.4, DM, 14.6, 22.0, 26.6, [ ( 13.7, 8.0 ), ( 20.8, 6.0 ), ( 25.8, 4.2 ) ] ),
		( 'mizzen', - 8.8, DQ, 12.4, 18.6, None, [ ( 17.7, 4.2 ) ] ),
	]
	for name, mx, foot, top, tmh, tgh, yards in masts:
		cyl( mb, ( mx, 0, foot - 0.3 ), ( mx, 0, top + 0.9 ), 0.34 if name != 'mizzen' else 0.27, 0.26 if name != 'mizzen' else 0.2, 'M_NavalSparTimber', n = 8 )
		box( mb, ( mx - 0.15, 0, top ), ( 2.0, 2.8 if name != 'mizzen' else 2.2, 0.14 ), 'M_NavalSparTimber' ) # the top
		cyl( mb, ( mx + 0.05, 0, top - 0.6 ), ( mx + 0.05, 0, tmh + 0.6 ), 0.2, 0.15, 'M_NavalSparTimber', n = 8 )
		box( mb, ( mx + 0.05, 0, tmh - 0.1 ), ( 0.8, 1.5, 0.1 ), 'M_NavalSparTimber' ) # crosstrees
		if tgh: cyl( mb, ( mx + 0.1, 0, tmh - 0.4 ), ( mx + 0.1, 0, tgh + 0.5 ), 0.12, 0.07, 'M_NavalSparTimber', n = 6 )
		head = ( tgh or tmh ) + 0.5
		# yards and the sails under them (each sail's foot at the yard below; the course's at the rail)
		below = None
		for k, ( yz, hs ) in enumerate( yards ):
			cyl( mb, ( mx + 0.35, - hs, yz ), ( mx + 0.35, hs, yz ), 0.07, 0.07, 'M_NavalSparTimber', n = 6 )
			cyl( mb, ( mx + 0.35, - hs * 0.35, yz ), ( mx + 0.35, hs * 0.35, yz ), 0.15, 0.15, 'M_NavalSparTimber', n = 6, smooth = True )
		for k, ( yz, hs ) in enumerate( yards ):
			if name == 'mizzen':
				fz, fhs = top + 0.3, 4.6 # the mizzen topsail sheets to the crossjack under the top
				cyl( mb, ( mx + 0.35, - fhs, fz ), ( mx + 0.35, fhs, fz ), 0.06, 0.06, 'M_NavalSparTimber', n = 6 )
			elif k == 0: fz, fhs = foot + 2.4, hs * 1.02
			else: fz, fhs = yards[ k - 1 ][ 0 ] + 0.15, yards[ k - 1 ][ 1 ] * 0.98
			bel = 0.75 if k == 0 else 0.6
			square_sail( mb, ( mx + 0.45, - hs * 0.96, yz - 0.1 ), ( mx + 0.45, hs * 0.96, yz - 0.1 ), ( mx + 0.5, - fhs, fz ), ( mx + 0.5, fhs, fz ), bel )
		# shrouds to the lower top, topmast shrouds from the top's edge, backstays to the side aft
		for side in ( 1, - 1 ):
			channel_shrouds( mb, H, mx, top - 0.1, [ - 1.6, - 0.8, 0.0, 0.8 ], side, sheer( H.u( mx ) ) - 0.15 )
			for dx in ( - 0.4, 0.3 ): line( mb, ( mx + dx, side * 1.2, top + 0.05 ), ( mx + 0.05, side * 0.2, tmh - 0.2 ), 0.025 )
			ax = mx - 3.2
			za, zb = sheer( H.u( ax ) ) - 0.15, sheer( H.u( ax - 1.0 ) ) - 0.15
			line( mb, ( ax, side * ( H.y( ax, za ) + 0.2 ), za ), ( mx + 0.05, side * 0.15, tmh ), 0.025 )
			if tgh: line( mb, ( ax - 1.0, side * ( H.y( ax - 1.0, zb ) + 0.2 ), zb ), ( mx + 0.1, side * 0.1, tgh ), 0.022 )
		# the pennant at the main truck (blue canvas, inner third white)
		if name == 'main':
			flag( mb, ( mx + 0.1, 0, head ), 5.2, 0.32, [ 0, 0.3, 1.0 ], [ 0, 1 ], lambda c, r: 'M_NavalSailCanvas' if c == 0 else 'M_NavyBlueCanvas', wave = 0.3 )
		cyl( mb, ( mx + 0.1 if tgh else mx + 0.05, 0, head - 0.5 ), ( mx + 0.1 if tgh else mx + 0.05, 0, head + 0.05 ), 0.08, 0.08, 'M_NavalSparTimber', n = 6 )

	# the spanker: boom and gaff aft of the mizzen, the sail between; the blue ensign with a white cross at the gaff's peak
	mz = - 8.8
	boom_end = Vector( ( - 15.9, 0, DQ + 2.5 ) )
	gaff_peak = Vector( ( - 14.0, 0, 15.1 ) )
	cyl( mb, ( mz - 0.3, 0, DQ + 2.25 ), boom_end, 0.12, 0.09, 'M_NavalSparTimber', n = 6 ) # (high over the wheel and the helmsman)
	cyl( mb, ( mz - 0.3, 0, 11.4 ), gaff_peak, 0.11, 0.08, 'M_NavalSparTimber', n = 6 )
	grid( mb, lambda s, t: Vector( ( lerp( lerp( mz - 0.4, gaff_peak.x, s ), lerp( mz - 0.4, boom_end.x + 0.4, s ), t ), - 0.5 * math.sin( math.pi * s ) * math.sin( math.pi * t ), lerp( lerp( 11.3, gaff_peak.z - 0.1, s ), lerp( DQ + 2.35, boom_end.z + 0.08, s ), t ) ) ), 4, 3, 'M_NavalSailCanvas', 6.0, 6.0 )
	cyl( mb, gaff_peak, gaff_peak + Vector( ( - 0.05, 0, 0.5 ) ), 0.04, 0.03, 'M_NavalSparTimber', n = 4 ) # the ensign's halyard
	cells = lambda c, r: 'M_NavalSailCanvas' if c == 2 or r == 1 else 'M_NavyBlueCanvas'
	flag( mb, ( gaff_peak.x - 0.08, 0, gaff_peak.z + 0.45 ), 2.4, 1.5, [ 0, 0.22, 0.42, 0.58, 0.78, 1.0 ], [ 0, 0.42, 0.58, 1.0 ], cells, wave = 0.2 )
	line( mb, boom_end, ( H.x0 + 0.3, 0, sheer( 0 ) + 0.3 ), 0.025 ) # the sheet

	# the bowsprit and jib-boom (the tip balances the aft-most part so the hull stays centred), the headsails and stays
	aft = min( v.co.x for v in mb.bm.verts )
	tip = Vector( ( - aft, 0, 7.4 ) )
	root = Vector( ( H.x1 - 2.6, 0, DF + 0.35 ) )
	cyl( mb, root, root.lerp( tip, 0.62 ), 0.3, 0.2, 'M_NavalSparTimber', n = 8 )
	cyl( mb, root.lerp( tip, 0.5 ), tip, 0.13, 0.07, 'M_NavalSparTimber', n = 6 )
	fx = masts[ 0 ][ 1 ]
	jib_head, stay_head = Vector( ( fx + 0.3, 0, 21.8 ) ), Vector( ( fx + 0.3, 0, 13.0 ) )
	tri_sail( mb, jib_head, tip.lerp( root, 0.08 ) + Vector( ( 0, 0, 0.1 ) ), Vector( ( tip.x - 5.4, 0, 6.6 ) ), 4, 'M_NavalSailCanvas', ( 0, 0.55, 0 ) )
	tri_sail( mb, stay_head, root.lerp( tip, 0.55 ) + Vector( ( 0, 0, 0.12 ) ), Vector( ( fx + 2.6, 0, DF + 1.6 ) ), 3, 'M_NavalSailCanvas', ( 0, 0.45, 0 ) )
	line( mb, jib_head, tip, 0.03 )
	line( mb, stay_head, root.lerp( tip, 0.55 ), 0.035 )
	line( mb, ( fx + 0.1, 0, 24.4 ), tip, 0.025 )
	line( mb, ( fx + 0.05, 0, 19.8 ), tip.lerp( root, 0.25 ), 0.03 )
	line( mb, tip, ( H.x1 + 0.7, 0, 1.0 ), 0.035 ) # the bobstay
	mainx, mizx = masts[ 1 ][ 1 ], masts[ 2 ][ 1 ]
	line( mb, ( mainx, 0, 14.4 ), ( fx - 0.25, 0, DM + 0.8 ), 0.045 ) # main stay
	line( mb, ( mainx + 0.1, 0, 21.8 ), ( fx, 0, 13.4 ), 0.03 )
	line( mb, ( mizx, 0, 12.2 ), ( mainx - 0.2, 0, DM + 2.0 ), 0.035 )
	line( mb, ( mizx + 0.05, 0, 18.4 ), ( mainx, 0, 14.7 ), 0.025 )
	info = { 'helm': ( 0, round( WX - 0.75, 2 ) ), 'wheel': ( 0, round( WH, 2 ), round( WX, 2 ) ), 'masts': [ m[ 1 ] for m in masts ], 'lower': lower, 'upper': upper }
	return mb, H, info, { 'deck': DM, 'quarterdeck': DQ, 'forecastle': DF, 'lowerZ': 2.48, 'upperZ': 4.0 }

# ------------------------------------------------------------------ the revenue cutter

def build_revenue():
	mb = MB()
	L, Bh, keel = 15.0, 2.6, - 1.6
	sheer = lambda u: 2.7 + 0.35 * smooth( 0.3, 0.0, u ) + 0.45 * smooth( 0.65, 1.0, u )
	rows = [ - 1.2, - 0.7, - 0.15, 0.25, 0.85, 1.3, 1.6, 2.2 ]
	H = Hull( L, Bh, keel, sheer, rows, transom = 0.62, bowfull = 1.1 )
	DM = 1.95
	xs = stations( H.x0, H.x1, 26 )
	H.build( mb, xs, [ ( 0.25, 'M_NavalHullTar' ), ( 1.3, 'M_NavyHullBlue' ), ( 1.6, 'M_NavyHullWhite' ), ( 99, 'M_NavyHullBlue' ) ] )
	H.bulwarks( mb, lambda x: DM, t = 0.12 )
	H.deck( mb, H.x0, H.x1, DM, t = 0.12 )
	knee = [ ( H.x1 - 0.05, - 1.5 ), ( H.x1 + 0.12, 0.0 ), ( H.x1 + 0.3, 2.1 ), ( H.x1 + 0.35, 3.0 ), ( H.x1 - 0.05, 3.2 ) ]
	for side in ( 1, - 1 ): mb.f( [ ( x, side * 0.09, z ) for x, z in knee ], 'M_NavyHullBlue', facing = ( 0, side, 0 ) )
	for i in range( len( knee ) ):
		( xa, za ), ( xb, zb ) = knee[ i ], knee[ ( i + 1 ) % len( knee ) ]
		mb.f( [ ( xa, - 0.09, za ), ( xb, - 0.09, zb ), ( xb, 0.09, zb ), ( xa, 0.09, za ) ], 'M_NavyHullBlue', facing = ( ( zb - za ), 0, - ( xb - xa ) ) )

	# two small guns a side through ports in the bulwark
	ports = [ - 3.0, 4.0 ] # (clear of the channels at the mast)
	for side in ( 1, - 1 ):
		for x in ports: gun_port( mb, H, x, 2.42, side, 0.42, carriage_deck = DM, r = 0.085 )

	# deck: a skylight, a hatch, the companion, the wheel aft, lanterns on the quarters, a stern board
	box( mb, ( - 1.2, 0, DM + 0.22 ), ( 1.4, 1.1, 0.44 ), 'M_NavalSparTimber' )
	box( mb, ( 4.0, 0, DM + 0.12 ), ( 1.0, 1.0, 0.24 ), 'M_NavalSparTimber' )
	box( mb, ( - 3.6, 0, DM + 0.4 ), ( 1.0, 0.9, 0.8 ), 'M_NavalSparTimber' ) # the companion
	WX, WR = - 5.6, 0.46
	WH = DM + 0.95
	wheel( mb, ( WX, 0, WH ), WR, DM, spokes = 6 )
	for y in ( - 1.55, 1.55 ): lantern( mb, ( H.x0 + 0.5, y, sheer( H.u( H.x0 + 0.5 ) ) ), post = 0.4, s = 0.26 )
	box( mb, ( H.x0 - 0.03, 0, 2.45 ), ( 0.04, 2 * H.y( H.x0, 2.45 ) - 0.4, 0.22 ), 'M_NavalAgedBrass' )
	for y in ( - 0.8, 0.0, 0.8 ): stern_window( mb, H.x0, y, 1.95, 0.42, 0.3 )

	# the mast (lower + pole topmast), boom, gaff, mainsail, gaff topsail, staysail, jib, bowsprit
	MX, top, tmh = 1.9, 12.4, 16.6
	cyl( mb, ( MX, 0, DM - 0.3 ), ( MX, 0, top + 0.7 ), 0.22, 0.16, 'M_NavalSparTimber', n = 8 )
	box( mb, ( MX, 0, top ), ( 0.5, 1.1, 0.1 ), 'M_NavalSparTimber' )
	cyl( mb, ( MX + 0.02, 0, top - 0.5 ), ( MX + 0.02, 0, tmh ), 0.11, 0.06, 'M_NavalSparTimber', n = 6 )
	boom0, boom_end = Vector( ( MX - 0.2, 0, DM + 1.9 ) ), Vector( ( - 10.6, 0, DM + 2.2 ) ) # (over the helmsman's head)
	gaff0, gaff_peak = Vector( ( MX - 0.2, 0, 10.9 ) ), Vector( ( - 5.2, 0, 14.4 ) )
	cyl( mb, boom0, boom_end, 0.11, 0.08, 'M_NavalSparTimber', n = 6 )
	cyl( mb, gaff0, gaff_peak, 0.09, 0.07, 'M_NavalSparTimber', n = 6 )
	grid( mb, lambda s, t: Vector( ( lerp( lerp( gaff0.x - 0.1, gaff_peak.x, s ), lerp( boom0.x - 0.1, boom_end.x + 0.3, s ), t ), - 0.6 * math.sin( math.pi * s ) * math.sin( math.pi * t ), lerp( lerp( gaff0.z - 0.1, gaff_peak.z - 0.1, s ), lerp( boom0.z + 0.08, boom_end.z + 0.08, s ), t ) ) ), 5, 4, 'M_NavalSailCanvas', 11.0, 9.0 )
	tri_sail( mb, ( MX + 0.05, 0, tmh - 0.2 ), ( MX, 0, top + 0.5 ), gaff_peak + Vector( ( 0.2, 0, 0.2 ) ), 3, 'M_NavalSailCanvas', ( 0, - 0.3, 0 ) )
	cells = lambda c, r: 'M_NavalSailCanvas' if c == 2 or r == 1 else 'M_NavyBlueCanvas'
	flag( mb, ( gaff_peak.x - 0.06, 0, gaff_peak.z + 0.1 ), 1.7, 1.05, [ 0, 0.22, 0.42, 0.58, 0.78, 1.0 ], [ 0, 0.42, 0.58, 1.0 ], cells, wave = 0.15 )
	flag( mb, ( MX + 0.05, 0, tmh + 0.05 ), 3.4, 0.24, [ 0, 0.3, 1.0 ], [ 0, 1 ], lambda c, r: 'M_NavalSailCanvas' if c == 0 else 'M_NavyBlueCanvas', wave = 0.25 )
	line( mb, boom_end, ( H.x0 + 0.4, 0, sheer( 0 ) + 0.1 ), 0.025 )
	aft = min( v.co.x for v in mb.bm.verts )
	tip = Vector( ( - aft, 0, 3.25 ) )
	root = Vector( ( H.x1 - 1.6, 0, DM + 0.45 ) )
	cyl( mb, root, tip, 0.14, 0.07, 'M_NavalSparTimber', n = 6 )
	stay_tack = Vector( ( H.x1 + 0.3, 0, 3.15 ) )
	tri_sail( mb, ( MX + 0.2, 0, top - 0.4 ), stay_tack + Vector( ( - 0.3, 0, 0.15 ) ), ( MX + 1.4, 0, DM + 1.1 ), 3, 'M_NavalSailCanvas', ( 0, 0.4, 0 ) )
	tri_sail( mb, ( MX + 0.08, 0, tmh - 0.5 ), tip + Vector( ( - 0.3, 0, 0.1 ) ), ( H.x1 - 0.2, 0, DM + 1.6 ), 4, 'M_NavalSailCanvas', ( 0, 0.5, 0 ) )
	line( mb, ( MX + 0.2, 0, top - 0.3 ), stay_tack, 0.03 )
	line( mb, ( MX + 0.08, 0, tmh - 0.4 ), tip, 0.025 )
	line( mb, tip, ( H.x1 + 0.2, 0, 0.6 ), 0.03 )
	for side in ( 1, - 1 ):
		channel_shrouds( mb, H, MX, top - 0.1, [ - 0.9, - 0.2, 0.5 ], side, sheer( H.u( MX ) ) - 0.1, top_y = 0.2, out = 0.18 )
		line( mb, ( MX - 4.6, side * ( H.y( MX - 4.6, 2.6 ) + 0.1 ), 2.6 ), ( MX, side * 0.12, top - 0.2 ), 0.025 ) # running backstay
	info = { 'helm': ( 0, round( WX - 0.6, 2 ) ), 'wheel': ( 0, round( WH, 2 ), round( WX, 2 ) ), 'masts': [ MX ], 'ports': ports }
	return mb, H, info, { 'deck': DM, 'portZ': 2.42 }

def merge( mb, other ):
	# copy the faces of another builder (its own verts) into mb
	vm = {}
	for v in other.bm.verts: vm[ v ] = mb.bm.verts.new( v.co )
	for f in other.bm.faces:
		nf = mb.bm.faces.new( [ vm[ v ] for v in f.verts ] )
		nf.material_index = f.material_index; nf.smooth = f.smooth
		for l, ol in zip( nf.loops, f.loops ): l[ mb.uv ].uv = ol[ other.uv ].uv

# ------------------------------------------------------------------ materials, export

def paint_image():
	im = bpy.data.images.get( 'T_NavyPaint_BaseColor' )
	if im: return im
	N = 128
	im = bpy.data.images.new( 'T_NavyPaint_BaseColor', N, N, alpha = False )
	px = []
	import random
	rnd = random.Random( 19 )
	for y in range( N ):
		plank = y % 32
		shade = 0.9 + 0.05 * math.sin( plank / 32 * math.pi ) # each plank a little rounder in the light
		seam = 0.7 if plank == 0 else 0.86 if plank == 1 else 1.0
		for x in range( N ):
			butt = 0.8 if ( x + ( y // 32 ) * 45 ) % 128 == 0 and plank > 1 else 1.0 # plank ends, staggered (one per plank per tile)
			v = clamp( shade * seam * butt + rnd.uniform( - 0.025, 0.025 ), 0, 1 )
			px += [ v, v, v * 0.995, 1.0 ]
	im.pixels = px
	im.pack()
	return im

def make_materials():
	# the brigantine's materials and textures, as they are
	bpy.ops.import_scene.gltf( filepath = BRIG )
	for o in list( bpy.context.scene.objects ): bpy.data.objects.remove( o, do_unlink = True )
	paint = paint_image()
	def textured( name, image, tint, rough, metal = 0.0 ):
		m = bpy.data.materials.get( name ) or bpy.data.materials.new( name )
		m.use_nodes = True
		m.use_backface_culling = False
		nt = m.node_tree
		b = nt.nodes.get( 'Principled BSDF' )
		t = nt.nodes.new( 'ShaderNodeTexImage' ); t.image = image
		mix = nt.nodes.new( 'ShaderNodeMix' ); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
		mix.inputs[ 0 ].default_value = 1.0
		a = next( s for s in mix.inputs if s.identifier == 'A_Color' ); bb = next( s for s in mix.inputs if s.identifier == 'B_Color' )
		bb.default_value = ( *tint, 1.0 )
		nt.links.new( t.outputs[ 'Color' ], a )
		nt.links.new( next( s for s in mix.outputs if s.identifier == 'Result_Color' ), b.inputs[ 'Base Color' ] )
		b.inputs[ 'Roughness' ].default_value = rough
		b.inputs[ 'Metallic' ].default_value = metal
		return m
	textured( 'M_NavyHullBlue', paint, TINT[ 'M_NavyHullBlue' ], 0.62 )
	textured( 'M_NavyHullWhite', paint, TINT[ 'M_NavyHullWhite' ], 0.6 )
	textured( 'M_NavyBlueCanvas', bpy.data.images[ 'T_NavalSailCanvas_BaseColor' ], TINT[ 'M_NavyBlueCanvas' ], 0.9 )
	textured( 'M_NavyHelmWheel', bpy.data.images[ 'T_NavalSparTimber_BaseColor' ], TINT[ 'M_NavyHelmWheel' ], 0.6 )
	for n in MATS: assert bpy.data.materials.get( n ), n

def finish( mb, name, path ):
	me = bpy.data.meshes.new( name )
	mb.bm.to_mesh( me ); mb.bm.free()
	for n in MATS: me.materials.append( bpy.data.materials[ n ] )
	ob = bpy.data.objects.new( name, me )
	bpy.context.scene.collection.objects.link( ob )
	for o in bpy.context.scene.objects: o.select_set( o == ob )
	bpy.context.view_layer.objects.active = ob
	os.makedirs( os.path.dirname( path ), exist_ok = True )
	bpy.ops.export_scene.gltf( filepath = path, export_format = 'GLB', use_selection = True, export_yup = True, export_apply = True,
		export_texcoords = True, export_normals = True, export_materials = 'EXPORT', export_cameras = False, export_lights = False,
		export_extras = False, export_animations = False, export_skins = False, export_morph = False )
	patch_factors( path )
	me.calc_loop_triangles()
	tris = len( me.loop_triangles )
	bpy.data.objects.remove( ob, do_unlink = True )
	return tris

# baseColorFactor of the tinted materials (whatever the exporter made of the multiply node), rewritten in the JSON chunk
def patch_factors( path ):
	with open( path, 'rb' ) as fh: data = fh.read()
	jlen = struct.unpack_from( '<I', data, 12 )[ 0 ]
	j = json.loads( data[ 20: 20 + jlen ] )
	rest = data[ 20 + jlen: ]
	for m in j.get( 'materials', [] ):
		if m.get( 'name' ) in TINT:
			m.setdefault( 'pbrMetallicRoughness', {} )[ 'baseColorFactor' ] = [ *TINT[ m[ 'name' ] ], 1.0 ]
	js = json.dumps( j, separators = ( ',', ':' ) ).encode( 'utf8' )
	js += b' ' * ( ( 4 - len( js ) % 4 ) % 4 )
	out = struct.pack( '<III', 0x46546C67, 2, 12 + 8 + len( js ) + len( rest ) ) + struct.pack( '<II', len( js ), 0x4E4F534A ) + js + rest
	with open( path, 'wb' ) as fh: fh.write( out )

def measure( H, info, extra, path, tris, bounds ):
	size = os.path.getsize( path )
	print( 'MEASURE', json.dumps( { 'file': os.path.basename( path ), 'tris': tris, 'bytes': size, 'bounds': bounds, 'info': info, 'levels': extra,
		'halfBeam': { str( z ): round( max( H.y( x, z ) for x in [ i * 0.25 for i in range( - 40, 41 ) ] ), 3 ) for z in ( 0.0, 2.48, 2.72, 3.0, 3.6, 4.0, H.Hmid ) },
		'sideAt': { str( x ): [ round( H.y( x, z ), 3 ) for z in ( 2.48, 2.72, 4.0 ) ] for x in ( - 5.4, - 2.5, 0.0, 2.5, 5.4 ) } } ) )

def bounds_of( mb ):
	xs = [ v.co.x for v in mb.bm.verts ]; ys = [ v.co.y for v in mb.bm.verts ]; zs = [ v.co.z for v in mb.bm.verts ]
	return [ [ round( min( xs ), 3 ), round( max( xs ), 3 ) ], [ round( min( ys ), 3 ), round( max( ys ), 3 ) ], [ round( min( zs ), 3 ), round( max( zs ), 3 ) ] ]

bpy.ops.wm.read_factory_settings( use_empty = True )
make_materials()
for kind, fn in ( ( 'frigate', build_frigate ), ( 'revenue', build_revenue ) ):
	if WHICH not in ( 'all', kind ): continue
	mb, H, info, extra = fn()
	b = bounds_of( mb )
	path = os.path.join( OUT, kind + '.glb' )
	tris = finish( mb, 'SM_Frigate' if kind == 'frigate' else 'SM_Revenue', path )
	measure( H, info, extra, path, tris, b )
