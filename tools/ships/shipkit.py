# Wave 24C ship kit: the mesh builder and the parts every ship is made of (hull loft, decks, bulwarks, rails, masts, yards,
# sails, rigging, guns, deck furniture), used by tools/ships/build_ships.py inside Blender (headless).
#
# Frame while building: Blender X forward (bow), Y port, Z up; the exporter's +Y up turns it into the glTF frame the game
# reads (+X forward, +Y up, +Z starboard). Game data (the boat frame: +Z forward, +X port, y up) maps as Bx = z, By = x, Bz = y.
#
# UV conventions the game's shader relies on (features/naval/Models.js shipMaterials):
#   sails  (M_NavalSailCanvas): u = s + 2 * code, v = ( 1 - t ) + 2 * type, s across (0 luff / weather leech .. 1), t from the
#          head (0) to the foot (1), code = belly depth in 5 cm steps, type 0 square (belly toward +X), 1 fore-and-aft (belly
#          toward -Y, starboard: glTF +Z). The static belly is depth * W( s, t ): W = sin( pi s ) sin( 0.75 pi t ) square,
#          sin( pi s ) sin( pi t ) fore-and-aft. The shader moves the belly to the side the wind fills and lets it flutter.
#   flags  (M_NavalFlagCanvas / M_NavyBlueCanvas): flat in the X-Z plane flying aft from the hoist; u = cell0 + 0.48 s + 2 * code
#          (s 0 at the hoist .. 1 at the fly, code = the flag's length in 10 cm steps, cell0 0.01 or 0.51 of the 2 x 2 atlas)
import bmesh, math
from mathutils import Vector, Matrix

def lerp( a, b, t ): return a + ( b - a ) * t
def clamp( v, a, b ): return a if v < a else b if v > b else v
def smooth( a, b, x ):
	t = clamp( ( x - a ) / ( b - a ), 0, 1 ) if b != a else ( 1.0 if x >= a else 0.0 )
	return t * t * ( 3 - 2 * t )

# metres per texture tile (u, v) of the tiled materials (box projection / lofts)
TILE = {
	'M_NavalHullPlank': ( 4.0, 2.0 ), 'M_NavalSheerStripe': ( 4.0, 2.0 ), 'M_NavalBlackPaint': ( 4.0, 2.0 ), 'M_NavyHullBlue': ( 4.0, 2.0 ),
	'M_NavyHullWhite': ( 4.0, 2.0 ), 'M_NavalHullTar': ( 2.4, 2.4 ), 'M_NavalDeckPlank': ( 2.4, 2.4 ), 'M_NavalSparTimber': ( 3.0, 0.6 ),
	'M_NavyHelmWheel': ( 1.0, 0.5 ), 'M_NavalStowedCanvas': ( 2.0, 2.0 ),
}

class MB:
	"""a bmesh with a material index per face and one UV layer; faces carry their uvs (box projection by default)"""

	def __init__( self, mats ):
		self.bm = bmesh.new()
		self.uv = self.bm.loops.layers.uv.new( 'UVMap' )
		self.mats = list( mats )
		self.mi = { n: i for i, n in enumerate( self.mats ) }

	def mat( self, name ):
		if name not in self.mi:
			self.mi[ name ] = len( self.mats ); self.mats.append( name )
		return self.mi[ name ]

	def v( self, p ):
		return self.bm.verts.new( Vector( p ) )

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
		face.material_index = self.mat( mat )
		face.smooth = smooth
		if uvs is None: uvs = boxuv( [ x.co for x in vs ], TILE.get( mat, ( 1.0, 1.0 ) ) )
		for l, uv in zip( face.loops, uvs ): l[ self.uv ].uv = uv
		return face

	def tri_count( self ):
		return sum( len( f.verts ) - 2 for f in self.bm.faces )

def normal_of( pts ):
	n = Vector( ( 0, 0, 0 ) )
	for i in range( len( pts ) ):
		a, b = pts[ i ], pts[ ( i + 1 ) % len( pts ) ]
		n.x += ( a.y - b.y ) * ( a.z + b.z ); n.y += ( a.z - b.z ) * ( a.x + b.x ); n.z += ( a.x - b.x ) * ( a.y + b.y )
	return n.normalized() if n.length > 1e-12 else Vector( ( 0, 0, 1 ) )

def boxuv( pts, s ):
	su, sv = s
	n = normal_of( pts )
	ax = max( range( 3 ), key = lambda i: abs( n[ i ] ) )
	out = []
	for p in pts:
		if ax == 2: u, v = p.x, p.y
		elif ax == 1: u, v = p.x, p.z
		else: u, v = p.y, p.z
		out.append( ( u / su, v / sv ) )
	return out

def rot( r ):
	if r is None: return Matrix.Identity( 3 )
	if isinstance( r, Matrix ): return r
	return Matrix.Rotation( r[ 2 ], 3, 'Z' ) @ Matrix.Rotation( r[ 1 ], 3, 'Y' ) @ Matrix.Rotation( r[ 0 ], 3, 'X' )

def box( mb, c, size, mat, r = None, skip = () ):
	"""a box: centre, size ( x, y, z ), rotation ( euler or 3x3 ); skip: face keys ( '+x', '-z' ... ) left out"""
	R = rot( r ); c = Vector( c ); hx, hy, hz = size[ 0 ] / 2, size[ 1 ] / 2, size[ 2 ] / 2
	P = lambda x, y, z: c + R @ Vector( ( x, y, z ) )
	faces = { '+x': ( ( 1, 0, 0 ), [ ( hx, - hy, - hz ), ( hx, hy, - hz ), ( hx, hy, hz ), ( hx, - hy, hz ) ] ),
		'-x': ( ( - 1, 0, 0 ), [ ( - hx, - hy, - hz ), ( - hx, - hy, hz ), ( - hx, hy, hz ), ( - hx, hy, - hz ) ] ),
		'+y': ( ( 0, 1, 0 ), [ ( - hx, hy, - hz ), ( - hx, hy, hz ), ( hx, hy, hz ), ( hx, hy, - hz ) ] ),
		'-y': ( ( 0, - 1, 0 ), [ ( - hx, - hy, - hz ), ( hx, - hy, - hz ), ( hx, - hy, hz ), ( - hx, - hy, hz ) ] ),
		'+z': ( ( 0, 0, 1 ), [ ( - hx, - hy, hz ), ( hx, - hy, hz ), ( hx, hy, hz ), ( - hx, hy, hz ) ] ),
		'-z': ( ( 0, 0, - 1 ), [ ( - hx, - hy, - hz ), ( - hx, hy, - hz ), ( hx, hy, - hz ), ( hx, - hy, - hz ) ] ) }
	for k, ( n, q ) in faces.items():
		if k in skip: continue
		mb.f( [ P( *p ) for p in q ], mat, facing = R @ Vector( n ) )

def frame_of( ax ):
	ax = ax.normalized()
	ref = Vector( ( 0, 0, 1 ) ) if abs( ax.z ) < 0.9 else Vector( ( 1, 0, 0 ) )
	e1 = ax.cross( ref ).normalized(); e2 = ax.cross( e1 ).normalized()
	return e1, e2

def cyl( mb, p0, p1, r0, r1, mat, n = 8, cap0 = True, cap1 = True, smooth = True, ulen = None, flat = False ):
	"""a tapered cylinder p0 -> p1; uv: around (u, 1 per turn) x along (v, metres / tile v); flat: faceted"""
	p0, p1 = Vector( p0 ), Vector( p1 )
	ax = p1 - p0; L = ax.length
	if L < 1e-6: return
	e1, e2 = frame_of( ax ); axn = ax.normalized()
	tu, tv = TILE.get( mat, ( 1.0, 1.0 ) )
	ring0, ring1 = [], []
	for i in range( n + 1 ):
		a = 2 * math.pi * i / n
		d = e1 * math.cos( a ) + e2 * math.sin( a )
		ring0.append( mb.v( p0 + d * r0 ) if i < n else ring0[ 0 ] )
		ring1.append( mb.v( p1 + d * r1 ) if i < n else ring1[ 0 ] )
	circ = 2 * math.pi * max( r0, r1 )
	for i in range( n ):
		u0, u1 = i / n * circ / tv, ( i + 1 ) / n * circ / tv
		mid = ( ring0[ i ].co + ring0[ i + 1 ].co ) / 2
		out = mid - p0 - axn * ( mid - p0 ).dot( axn )
		mb.f( [ ring0[ i ], ring0[ i + 1 ], ring1[ i + 1 ], ring1[ i ] ], mat, facing = out, uvs = [ ( 0, u0 ), ( 0, u1 ), ( L / tu, u1 ), ( L / tu, u0 ) ], smooth = smooth and not flat )
	if cap0 and r0 > 0.004: mb.f( [ x.co.copy() for x in ring0[ : n ] ], mat, facing = - axn )
	if cap1 and r1 > 0.004: mb.f( [ x.co.copy() for x in ring1[ : n ] ], mat, facing = axn )

def rope( mb, a, b, r = 0.02, mat = 'M_NavalRiggingHemp', n = 3, sag = 0.0 ):
	"""a line a -> b (3-sided), optionally sagging (two segments)"""
	a, b = Vector( a ), Vector( b )
	if sag > 0:
		m = ( a + b ) / 2 - Vector( ( 0, 0, sag ) )
		cyl( mb, a, m, r, r, mat, n = n, cap0 = False, cap1 = False, smooth = False )
		cyl( mb, m, b, r, r, mat, n = n, cap0 = False, cap1 = False, smooth = False )
	else:
		cyl( mb, a, b, r, r, mat, n = n, cap0 = False, cap1 = False, smooth = False )

def sphere( mb, c, r, mat, nu = 8, nv = 5 ):
	c = Vector( c )
	rings = []
	for j in range( nv + 1 ):
		ph = math.pi * j / nv
		rings.append( [ c + Vector( ( r * math.sin( ph ) * math.cos( 2 * math.pi * i / nu ), r * math.sin( ph ) * math.sin( 2 * math.pi * i / nu ), r * math.cos( ph ) ) ) for i in range( nu ) ] )
	for j in range( nv ):
		for i in range( nu ):
			q = [ rings[ j ][ i ], rings[ j ][ ( i + 1 ) % nu ], rings[ j + 1 ][ ( i + 1 ) % nu ], rings[ j + 1 ][ i ] ]
			if j == 0: q = [ q[ 0 ], q[ 2 ], q[ 3 ] ] if ( q[ 0 ] - q[ 1 ] ).length < 1e-6 else q
			if j == nv - 1 and ( q[ 2 ] - q[ 3 ] ).length < 1e-6: q = [ q[ 0 ], q[ 1 ], q[ 2 ] ]
			mid = sum( q, Vector() ) / len( q )
			mb.f( q, mat, facing = mid - c, smooth = True )

def torus( mb, c, R, r, mat, axis = ( 0, 0, 1 ), nu = 12, nv = 4 ):
	c = Vector( c ); axn = Vector( axis ).normalized(); e1, e2 = frame_of( axn )
	P = lambda i, j: c + ( e1 * math.cos( 2 * math.pi * i / nu ) + e2 * math.sin( 2 * math.pi * i / nu ) ) * ( R + r * math.cos( 2 * math.pi * j / nv ) ) + axn * r * math.sin( 2 * math.pi * j / nv )
	for i in range( nu ):
		for j in range( nv ):
			q = [ P( i, j ), P( i + 1, j ), P( i + 1, j + 1 ), P( i, j + 1 ) ]
			cen = c + ( e1 * math.cos( 2 * math.pi * ( i + 0.5 ) / nu ) + e2 * math.sin( 2 * math.pi * ( i + 0.5 ) / nu ) ) * R
			mb.f( q, mat, facing = sum( q, Vector() ) / 4 - cen, smooth = True )

# ------------------------------------------------------------------ the hull

class Hull:
	"""A fair hull of length L (stern xA .. stem xF), half beam Bh, keel at -d. Breadth hb( un, y ): the max-breadth section
	H( y ) times the plan shape P( un ) (a superellipse: full aft, a bluff entry and a fine run below the water), between the stern
	line xS( y ) (sternpost below the tuck, the counter and a raking transom above) and the stem line xB( y ) (a forefoot curve
	under the water, raking forward to the stem head). rail( x ): top of the side (the rail cap). deckAt( x ): the local deck."""

	def __init__( self, L, Bh, d, rail, deckAt, o ):
		self.L, self.Bh, self.d, self.rail, self.deckAt, self.o = L, Bh, d, rail, deckAt, o
		self.xA, self.xF = - L / 2, L / 2
		self.yMB = o.get( 'yMB', 0.6 * deckAt( 0 ) )   # height of the maximum breadth
		self.tumble = o.get( 'tumble', 0.05 )
		self.um = o.get( 'um', 0.47 )                 # where the plan is widest (0 stern .. 1 stem)
		self.a1, self.b1 = o.get( 'aft', ( 2.4, 1.0 ) )
		self.a2, self.b2 = o.get( 'fore', ( 3.0, 2.0 ) )
		self.tr = o.get( 'transom', 0.64 )            # transom breadth / max breadth, above the tuck
		self.yTuck = o.get( 'tuck', 0.35 )
		self.counter = o.get( 'counter', 1.0 )        # how far the sternpost stands forward of the transom at the waterline
		self.stemRake = o.get( 'stemRake', 0.9 )      # the stem head stands this far forward of the waterline stem
		self.forefoot = o.get( 'forefoot', 1.6 * d )  # forefoot radius
		self.postRake = o.get( 'postRake', 0.25 )
		self.transomRake = o.get( 'transomRake', 0.5 )
		self.fine = o.get( 'fine', 1.4 )              # ends finer below the water (P ** ( 1 + fine * depth ))
		self.sharp = o.get( 'sharp', 2.4 )            # section exponent: the turn of the bilge
		self.yTop = max( rail( x ) for x in [ self.xA + i * L / 40 for i in range( 41 ) ] )
		self.w0 = 0.07                                # stem / sternpost half width
		self.gaps = o.get( 'gaps', [] )               # boarding openings in the bulwarks: [ ( x0, x1 ) ] (both sides)

	# the stem line: forefoot circle below the water, a straight rake above (the stem head at xF at the rail)
	def xB( self, y ):
		xw = self.xF - self.stemRake
		if y >= 0: return xw + self.stemRake * clamp( y / max( 0.5, self.rail( self.xF ) ), 0, 1 )
		R = self.forefoot; cy = - self.d + R
		dy = y - cy
		cx = xw - math.sqrt( max( 0.0, R * R - cy * cy ) )
		return cx + math.sqrt( max( 0.0, R * R - dy * dy ) )

	# the stern line: the sternpost (raked) under the tuck, the counter curving aft to the transom, the transom raking aft
	def xS( self, y ):
		xt = self.xA
		xpost = xt + self.counter
		if y <= self.yTuck:
			return xpost + self.postRake * ( self.yTuck - y ) / ( self.yTuck + self.d )
		top = self.yTop
		k = smooth( self.yTuck, self.yTuck + 0.7, y )
		xtr = xt + self.transomRake * ( 1 - clamp( ( y - self.yTuck ) / max( 0.5, top - self.yTuck ), 0, 1 ) )
		return lerp( xpost, xtr, k )

	def H( self, y, x = 0.0 ):
		"""max-breadth section (fraction of Bh) at height y"""
		d = self.d
		if y < self.yMB:
			z = clamp( ( self.yMB - y ) / ( self.yMB + d ), 0, 1 )
			return max( 0.0, ( 1 - z ** self.sharp ) ) ** ( 1 / 1.6 )
		top = self.rail( x )
		z = clamp( ( y - self.yMB ) / max( 0.3, top - self.yMB ), 0, 1.2 )
		return 1 - self.tumble * z * z

	def P( self, un, y ):
		um = self.um
		depth = clamp( - y / self.d, 0, 1 )
		if un >= um:
			s = clamp( ( un - um ) / ( 1 - um ), 0, 1 )
			p = max( 0.0, 1 - s ** self.a2 ) ** ( 1 / self.b2 )
			return p ** ( 1 + self.fine * depth )
		s = clamp( 1 - un / um, 0, 1 )
		k = smooth( self.yTuck - 0.9, self.yTuck + 0.25, y )
		tr = lerp( 0.0, self.tr, k )
		p = tr + ( 1 - tr ) * max( 0.0, 1 - s ** self.a1 ) ** ( 1 / self.b1 )
		return p ** ( 1 + self.fine * 0.8 * depth * ( 1 - k ) )

	def at( self, un, y ):
		"""-> ( x, half breadth ) of the hull surface at station un (0 stern .. 1 stem) and height y"""
		xs, xb = self.xS( y ), self.xB( y )
		x = lerp( xs, xb, un )
		hb = self.Bh * self.H( y, x ) * self.P( un, y )
		return x, max( hb, self.w0 )

	def in_gap( self, x ):
		return any( g[ 0 ] < x < g[ 1 ] for g in self.gaps )

	def top_at( self, x ):
		"""the top of the side: the rail, or the deck's edge in a boarding opening"""
		return self.deckAt( x ) + 0.04 if self.in_gap( x ) else self.rail( x )

	def hbAt( self, x, y ):
		"""half breadth at ( x, y ) (0 outside the hull's ends)"""
		xs, xb = self.xS( y ), self.xB( y )
		if x <= xs or x >= xb: return 0.0
		un = ( x - xs ) / ( xb - xs )
		return max( self.Bh * self.H( y, x ) * self.P( un, y ), self.w0 )

	def build( self, mb, bands, nu = 56, levels = None, keelMat = 'M_NavalHullTar' ):
		"""the shell, both sides: nu stations (cosine spaced), rows at `levels` (fixed heights) plus the rail on top; bands:
		[ ( y top, material ) ] by the row's mid height. UV: u along the hull (metres), v up the girth (metres)."""
		top0 = min( self.rail( self.xA + i * self.L / 40 ) for i in range( 41 ) )
		ys = sorted( set( [ - self.d ] + [ y for y in levels if - self.d < y < top0 - 0.05 ] ) )
		uns = [ 0.5 - 0.5 * math.cos( math.pi * i / nu ) for i in range( nu + 1 ) ]
		# the boarding openings: a station just outside and one just inside each edge (a near-vertical cut in the side)
		yd = self.deckAt( 0 ) + 0.5
		for g in self.gaps:
			for xe in g:
				ue = ( xe - self.xS( yd ) ) / ( self.xB( yd ) - self.xS( yd ) )
				uns += [ ue - 2e-4, ue + 2e-4 ]
		uns = sorted( uns )
		self.grid = []
		for side in ( 1, - 1 ):
			G = []
			for un in uns:
				col = []
				# the rail row: y = rail( x ) where x itself depends on y (fixed-point steps); in an opening the deck edge
				x, _ = self.at( un, top0 )
				for _ in range( 3 ):
					yr = self.top_at( x ); x, hb = self.at( un, yr )
				for y in ys:
					x2, hb2 = self.at( un, min( y, yr ) )
					col.append( Vector( ( x2, side * hb2, min( y, yr ) ) ) )
				col.append( Vector( ( x, side * hb, yr ) ) )
				G.append( col )
			# girth per column for v
			V = []
			for col in G:
				g = [ 0.0 ]
				for j in range( 1, len( col ) ): g.append( g[ - 1 ] + ( col[ j ] - col[ j - 1 ] ).length )
				off = g[ next( j for j, p in enumerate( col ) if p.z >= - 1e-6 ) ] if any( p.z >= - 1e-6 for p in col ) else 0.0
				V.append( [ x - off for x in g ] )
			verts = [ [ mb.v( p ) for p in col ] for col in G ]
			for i in range( len( G ) - 1 ):
				for j in range( len( G[ 0 ] ) - 1 ):
					q = [ verts[ i ][ j ], verts[ i + 1 ][ j ], verts[ i + 1 ][ j + 1 ], verts[ i ][ j + 1 ] ]
					ym = ( G[ i ][ j ].z + G[ i ][ j + 1 ].z ) / 2
					mat = next( m for t, m in bands if ym < t )
					su, sv = TILE.get( mat, ( 4.0, 2.0 ) )
					uvs = [ ( G[ i ][ j ].x / su, V[ i ][ j ] / sv ), ( G[ i + 1 ][ j ].x / su, V[ i + 1 ][ j ] / sv ), ( G[ i + 1 ][ j + 1 ].x / su, V[ i + 1 ][ j + 1 ] / sv ), ( G[ i ][ j + 1 ].x / su, V[ i ][ j + 1 ] / sv ) ]
					if ( q[ 0 ].co - q[ 1 ].co ).length + ( q[ 2 ].co - q[ 3 ].co ).length < 1e-5: continue
					mb.f( q, mat, facing = ( 0, side, 0 ), uvs = uvs, smooth = True )
			self.grid.append( G )
		self.ys, self.uns = ys, uns
		# the transom: the aft column of both sides closed by one face per row band above the tuck, the stern below by
		# the sternpost (the columns meet at w0)
		Gp, Gs = self.grid[ 0 ][ 0 ], self.grid[ 1 ][ 0 ]
		for j in range( len( Gp ) - 1 ):
			q = [ Gp[ j ], Gp[ j + 1 ], Gs[ j + 1 ], Gs[ j ] ]
			ym = ( Gp[ j ].z + Gp[ j + 1 ].z ) / 2
			mat = next( m for t, m in bands if ym < t )
			mb.f( [ p.copy() for p in q ], mat, facing = ( - 1, 0, 0 ) )
		# the stem: the fore column of both sides joined
		Gp, Gs = self.grid[ 0 ][ - 1 ], self.grid[ 1 ][ - 1 ]
		for j in range( len( Gp ) - 1 ):
			q = [ Gp[ j ], Gp[ j + 1 ], Gs[ j + 1 ], Gs[ j ] ]
			ym = ( Gp[ j ].z + Gp[ j + 1 ].z ) / 2
			mb.f( [ p.copy() for p in q ], next( m for t, m in bands if ym < t ), facing = ( 1, 0, 0 ) )
		# the keel strip along the bottom (the two bottom rows meet at w0: close them)
		Gp, Gs = self.grid[ 0 ], self.grid[ 1 ]
		for i in range( len( Gp ) - 1 ):
			q = [ Gp[ i ][ 0 ], Gp[ i + 1 ][ 0 ], Gs[ i + 1 ][ 0 ], Gs[ i ][ 0 ] ]
			mb.f( [ p.copy() for p in q ], keelMat, facing = ( 0, 0, - 1 ) )

	def inner( self, mb, t, mat, capMat, capW = 0.06, capH = 0.07, ends = True ):
		"""the bulwarks' inside (thickness t) from the local deck to the rail, and the rail cap over both faces"""
		uns = self.uns
		for side in ( 1, - 1 ):
			prev = None
			for un in uns:
				x, _ = self.at( un, self.rail( 0 ) )
				for _ in range( 3 ):
					yr = self.rail( x ); x, hbr = self.at( un, yr )
				yd = self.deckAt( x ) - 0.02
				hbd = self.hbAt( x, yd ) if self.hbAt( x, yd ) > 0 else hbr
				w = max( 0.05, min( hbr, hbd ) - t )
				cur = ( x, w, yd, yr, hbr )
				gin = self.in_gap( x )
				if prev and self.in_gap( prev[ 0 ] ) != gin:
					# the end of the bulwark at an opening: close its thickness
					( xe, we, de, re, he ) = prev if gin else cur
					mb.f( [ ( xe, side * we, de ), ( xe, side * he, de ), ( xe, side * he, re + capH ), ( xe, side * we, re + capH ) ], capMat, facing = ( 1 if gin else - 1, 0, 0 ) )
				if prev and gin and self.in_gap( prev[ 0 ] ):
					( xa, wa, da, ra, ha ), ( xb, wb, db, rb, hb ) = prev, cur
					ya, yb2 = self.deckAt( xa ) + 0.04, self.deckAt( xb ) + 0.04
					mb.f( [ ( xa, side * wa, ya ), ( xb, side * wb, yb2 ), ( xb, side * self.hbAt( xb, yb2 ), yb2 ), ( xa, side * self.hbAt( xa, ya ), ya ) ], capMat, facing = ( 0, 0, 1 ) )
					prev = cur
					continue
				if prev and gin != self.in_gap( prev[ 0 ] ):
					prev = cur
					continue
				if prev and min( prev[ 1 ], cur[ 1 ] ) > 0.12:
					( xa, wa, da, ra, ha ), ( xb, wb, db, rb, hb ) = prev, cur
					mb.f( [ ( xa, side * wa, da ), ( xb, side * wb, db ), ( xb, side * wb, rb ), ( xa, side * wa, ra ) ], mat, facing = ( 0, - side, 0 ), smooth = True,
						uvs = [ ( xa / 4, da / 2 ), ( xb / 4, db / 2 ), ( xb / 4, rb / 2 ), ( xa / 4, ra / 2 ) ] )
					# the cap: a flat plank over the top, a little proud of both faces
					oa, ob = ha + capW * 0.5, hb + capW * 0.5
					ia, ib = wa - capW * 0.5, wb - capW * 0.5
					mb.f( [ ( xa, side * ia, ra + capH ), ( xb, side * ib, rb + capH ), ( xb, side * ob, rb + capH ), ( xa, side * oa, ra + capH ) ], capMat, facing = ( 0, 0, 1 ) )
					mb.f( [ ( xa, side * oa, ra - 0.02 ), ( xb, side * ob, rb - 0.02 ), ( xb, side * ob, rb + capH ), ( xa, side * oa, ra + capH ) ], capMat, facing = ( 0, side, 0 ) )
					mb.f( [ ( xa, side * ia, ra ), ( xb, side * ib, rb ), ( xb, side * ib, rb + capH ), ( xa, side * ia, ra + capH ) ], capMat, facing = ( 0, - side, 0 ) )
				prev = cur
		self.innerW = lambda x: max( 0.05, ( self.hbAt( x, self.deckAt( x ) ) or 0.1 ) - t )

	def strake( self, mb, y0, y1, mat, out = 0.04, x0 = None, x1 = None, nu = 48 ):
		"""a raised band (a wale) standing `out` proud of the side between heights y0 .. y1"""
		x0 = self.xS( y1 ) + 0.05 if x0 is None else x0
		x1 = self.xB( y1 ) - 0.15 if x1 is None else x1
		xs = [ lerp( x0, x1, 0.5 - 0.5 * math.cos( math.pi * i / nu ) ) for i in range( nu + 1 ) ]
		for side in ( 1, - 1 ):
			pts = []
			for x in xs:
				a, b = self.hbAt( x, y0 ), self.hbAt( x, y1 )
				if a <= 0 or b <= 0: pts.append( None ); continue
				pts.append( ( Vector( ( x, side * ( a + out ), y0 ) ), Vector( ( x, side * ( b + out ), y1 ) ), Vector( ( x, side * a, y0 - 0.005 ) ), Vector( ( x, side * b, y1 + 0.005 ) ) ) )
			for i in range( len( xs ) - 1 ):
				A, B = pts[ i ], pts[ i + 1 ]
				if not A or not B: continue
				mb.f( [ A[ 0 ], B[ 0 ], B[ 1 ], A[ 1 ] ], mat, facing = ( 0, side, 0 ), smooth = True, uvs = [ ( xs[ i ] / 4, 0 ), ( xs[ i + 1 ] / 4, 0 ), ( xs[ i + 1 ] / 4, ( y1 - y0 ) / 2 ), ( xs[ i ] / 4, ( y1 - y0 ) / 2 ) ] )
				mb.f( [ A[ 1 ], B[ 1 ], B[ 3 ], A[ 3 ] ], mat, facing = ( 0, 0, 1 ) )
				mb.f( [ A[ 0 ], A[ 2 ], B[ 2 ], B[ 0 ] ], mat, facing = ( 0, 0, - 1 ) )

	def side_point( self, x, y, side, out = 0.0 ):
		"""a point on the outer face at ( x, y ), side +1 port / -1 starboard, `out` metres proud, with the outward normal"""
		hb = self.hbAt( x, y )
		dx = 0.05
		dhx = ( self.hbAt( x + dx, y ) - self.hbAt( x - dx, y ) ) / ( 2 * dx )
		dhy = ( self.hbAt( x, y + dx ) - self.hbAt( x, y - dx ) ) / ( 2 * dx )
		n = Vector( ( - dhx, 1, - dhy ) ).normalized()
		n.y *= side
		return Vector( ( x, side * hb, y ) ) + n * out, n

	def port( self, mb, x, y, w, h, side, lid = 'M_NavalHullPlank', lidIn = 'M_NavalSheerStripe', frame = 'M_NavalBlackPaint', dark = 'M_NavalIron', open_ = True, gun = True ):
		"""a gun port: a dark opening on the side, its frame, the lid hinged up (painted outside, red inside) and the muzzle"""
		c, n = self.side_point( x, y, side, 0.012 )
		t = Vector( ( 1, 0, 0 ) ); t = ( t - n * t.dot( n ) ).normalized(); up = n.cross( t ).normalized()
		if up.z < 0: up = - up
		P = lambda a, b, o = 0.0: c + t * a + up * b + n * o
		mb.f( [ P( - w / 2, - h / 2 ), P( w / 2, - h / 2 ), P( w / 2, h / 2 ), P( - w / 2, h / 2 ) ], dark, facing = n )
		fw = 0.06
		for a0, a1, b0, b1 in ( ( - w / 2 - fw, w / 2 + fw, - h / 2 - fw, - h / 2 ), ( - w / 2 - fw, w / 2 + fw, h / 2, h / 2 + fw ), ( - w / 2 - fw, - w / 2, - h / 2, h / 2 ), ( w / 2, w / 2 + fw, - h / 2, h / 2 ) ):
			box( mb, ( P( ( a0 + a1 ) / 2, ( b0 + b1 ) / 2, 0.02 ) ), ( a1 - a0, b1 - b0, 0.05 ), frame, r = Matrix( ( t, up, n ) ).transposed() )
		if open_:
			# the lid swung up ~70 degrees about its top edge
			ang = math.radians( 70 )
			hinge = P( 0, h / 2 + fw, 0.03 )
			ld = up * math.cos( ang ) + n * math.sin( ang )
			a = hinge - t * ( w / 2 + fw ); b = hinge + t * ( w / 2 + fw )
			a2 = a + ld * ( h + fw ); b2 = b + ld * ( h + fw )
			mb.f( [ a, b, b2, a2 ], lid, facing = up * - math.sin( ang ) + n * math.cos( ang ) )
			off = ( up * math.sin( ang ) - n * math.cos( ang ) ) * - 0.05
			mb.f( [ a + off, b + off, b2 + off, a2 + off ], lidIn, facing = - ( up * - math.sin( ang ) + n * math.cos( ang ) ) )
		if gun:
			m0 = c - n * 0.6; m1 = c + n * 0.42
			cyl( mb, m0, m1, 0.13, 0.1, 'M_NavalIron', n = 10, cap0 = False, cap1 = False )
			cyl( mb, m1 - n * 0.06, m1 + n * 0.02, 0.125, 0.125, 'M_NavalIron', n = 10, cap0 = False, cap1 = True )

# ------------------------------------------------------------------ decks

def deck_quads( mb, hull, x0, x1, y, w0, w1, mat = 'M_NavalDeckPlank', step = 0.5, t = 0.18, yAt = None ):
	"""a walkable plank surface from x0 to x1 at height y (or yAt( x ) for ramps) across y w0 .. w1 (boat frame x), clipped to
	the bulwarks' inner face; returns the outline points for risers"""
	n = max( 1, int( math.ceil( ( x1 - x0 ) / step ) ) )
	xs = [ x0 + ( x1 - x0 ) * i / n for i in range( n + 1 ) ]
	def edge( x ):
		yy = yAt( x ) if yAt else y
		hb = hull.hbAt( x, yy + 0.01 )
		lim = max( 0.0, hb - t )
		return yy, max( w0, - lim ), min( w1, lim )
	for i in range( n ):
		ya, la, ra = edge( xs[ i ] ); yb, lb, rb = edge( xs[ i + 1 ] )
		if ra - la < 0.02 and rb - lb < 0.02: continue
		su, sv = TILE[ mat ]
		q = [ ( xs[ i ], la, ya ), ( xs[ i + 1 ], lb, yb ), ( xs[ i + 1 ], rb, yb ), ( xs[ i ], ra, ya ) ]
		mb.f( q, mat, facing = ( 0, 0, 1 ), uvs = [ ( p[ 0 ] / su, p[ 1 ] / sv ) for p in q ] )

def riser( mb, hull, x, y0, y1, w0, w1, facing, mat = 'M_NavalSheerStripe', t = 0.18 ):
	"""a vertical face across the deck at x from y0 up to y1 (the break of a raised deck), clipped to the bulwarks"""
	if y1 - y0 < 0.01: return
	hb = hull.hbAt( x, y1 )
	lim = max( 0.0, hb - t )
	l, r = max( w0, - lim ), min( w1, lim )
	if r - l < 0.02: return
	mb.f( [ ( x, l, y0 ), ( x, r, y0 ), ( x, r, y1 ), ( x, l, y1 ) ], mat, facing = ( facing, 0, 0 ) )

# ------------------------------------------------------------------ sails, flags

def sail_grid( mb, P, nu, nv, depth, kind, belly_dir, mat = 'M_NavalSailCanvas' ):
	"""a sail P( s, t ) -> point (flat), s across 0..1, t head 0 .. foot 1, bellied by depth * W along belly_dir; kind 0 square
	1 fore-and-aft. UVs carry the code the game's shader reads (see the header)."""
	code = int( round( depth / 0.05 ) )
	bd = Vector( belly_dir ).normalized()
	W = ( lambda s, t: math.sin( math.pi * s ) * math.sin( 0.75 * math.pi * t ) ) if kind == 0 else ( lambda s, t: math.sin( math.pi * s ) * math.sin( math.pi * t ) )
	V = [ [ mb.v( Vector( P( i / nu, j / nv ) ) + bd * ( code * 0.05 ) * W( i / nu, j / nv ) ) for i in range( nu + 1 ) ] for j in range( nv + 1 ) ]
	uv = lambda s, t: ( s + 2 * code, ( 1 - t ) + 2 * kind )
	for j in range( nv ):
		for i in range( nu ):
			q = [ V[ j ][ i ], V[ j ][ i + 1 ], V[ j + 1 ][ i + 1 ], V[ j + 1 ][ i ] ]
			uvs = [ uv( i / nu, j / nv ), uv( ( i + 1 ) / nu, j / nv ), uv( ( i + 1 ) / nu, ( j + 1 ) / nv ), uv( i / nu, ( j + 1 ) / nv ) ]
			mb.f( q, mat, uvs = uvs, smooth = True )
	return V

def tri_sail( mb, head, tack, clew, nu, nv, depth, belly_dir, mat = 'M_NavalSailCanvas' ):
	"""a triangular fore-and-aft sail: head, tack (luff foot), clew; s from the luff (head-tack) to the leech (head-clew)"""
	A, B, C = Vector( head ), Vector( tack ), Vector( clew )
	return sail_grid( mb, lambda s, t: A + ( ( B - A ) * ( 1 - s ) + ( C - A ) * s ) * t, nu, nv, depth, 1, belly_dir, mat )

def quad_sail( mb, a0, a1, b0, b1, nu, nv, depth, kind, belly_dir, mat = 'M_NavalSailCanvas' ):
	"""a four-cornered sail: head corners a0 (luff) a1, foot corners b0 (luff) b1"""
	a0, a1, b0, b1 = Vector( a0 ), Vector( a1 ), Vector( b0 ), Vector( b1 )
	return sail_grid( mb, lambda s, t: a0.lerp( a1, s ).lerp( b0.lerp( b1, s ), t ), nu, nv, depth, kind, belly_dir, mat )

def flag( mb, hoist, length, height, cell, mat = 'M_NavalFlagCanvas', nu = 6, droop = 0.0, part = ( 0, 1 ), taper = 0.0 ):
	"""a flag flying aft (-X) from the hoist's top ( x, y, z ); cell ( cu, cv ) 0/1 in the 2 x 2 atlas (v up); part: the v range
	of the cell used (0..1, e.g. ( 0.5, 1 ) the upper half: the pennants' cell holds two); taper: the fly's height lost (pennants)"""
	hx, hy, hz = hoist
	code = int( round( length / 0.1 ) )
	c0 = 0.01 if cell[ 0 ] == 0 else 0.51
	vb = ( 0.01 if cell[ 1 ] == 0 else 0.51 ) + 0.48 * part[ 0 ]
	vt = ( 0.01 if cell[ 1 ] == 0 else 0.51 ) + 0.48 * part[ 1 ]
	V = [ [ mb.v( ( hx - length * i / nu, hy, hz - height * ( 1 - taper * i / nu ) * j - droop * ( i / nu ) ** 2 ) ) for i in range( nu + 1 ) ] for j in range( 2 ) ]
	for i in range( nu ):
		q = [ V[ 0 ][ i ], V[ 0 ][ i + 1 ], V[ 1 ][ i + 1 ], V[ 1 ][ i ] ]
		u = lambda k: c0 + 0.48 * k / nu + 2 * code
		uvs = [ ( u( i ), vt - 0.01 ), ( u( i + 1 ), vt - 0.01 ), ( u( i + 1 ), vb + 0.01 ), ( u( i ), vb + 0.01 ) ]
		mb.f( q, mat, uvs = uvs, smooth = True )

# ------------------------------------------------------------------ spars and rigging

def mast( mb, x, y0, y1, r0, r1, mat = 'M_NavalSparTimber', n = 10, y = 0.0 ):
	cyl( mb, ( x, y, y0 ), ( x, y, y1 ), r0, r1, mat, n = n )

def yard( mb, x, z, half, r, mat = 'M_NavalSparTimber', n = 8, arms = True ):
	"""a yard across the ship at height z, tapered to the yardarms"""
	cyl( mb, ( x, 0, z ), ( x, half, z ), r, r * 0.45, mat, n = n, cap0 = False )
	cyl( mb, ( x, 0, z ), ( x, - half, z ), r, r * 0.45, mat, n = n, cap0 = False )

def top( mb, x, z, w, l, mat = 'M_NavalSparTimber' ):
	"""a fighting top: a platform round the masthead with its rim"""
	box( mb, ( x - 0.1, 0, z ), ( l, w, 0.12 ), mat )
	box( mb, ( x - 0.1 - l / 2 + 0.05, 0, z + 0.25 ), ( 0.06, w, 0.4 ), mat, skip = ( '-z', ) )

def shrouds( mb, x_mast, z_head, chain, side, count, ratlines = True, r = 0.022, rat_step = 0.42, fan = 0.35, dead = True ):
	"""shrouds from the masthead down to the channel at chain = ( x, y_out, z ) on side, `count` of them fanned fore and aft;
	ratlines as flat strips across them every rat_step; deadeyes at the foot"""
	cx, cy, cz = chain
	feet = [ Vector( ( cx + fan * ( i - ( count - 1 ) / 2 ) * 1.4, side * cy, cz ) ) for i in range( count ) ]
	heads = [ Vector( ( x_mast + 0.06 * ( i - ( count - 1 ) / 2 ), side * 0.18, z_head ) ) for i in range( count ) ]
	for h, f in zip( heads, feet ):
		rope( mb, h, f + Vector( ( 0, 0, 0.45 ) ), r )
		if dead:
			cyl( mb, f + Vector( ( 0, 0, 0.36 ) ), f + Vector( ( 0, 0, 0.5 ) ), 0.07, 0.07, 'M_NavalSparTimber', n = 6 )
			rope( mb, f + Vector( ( 0, 0, 0.36 ) ), f, 0.03, 'M_NavalIron' )
	if ratlines and count >= 3:
		H = z_head - cz - 0.8
		k = 0.6
		while k < H:
			t = k / ( z_head - cz - 0.45 )
			a = feet[ 0 ] + Vector( ( 0, 0, 0.45 ) ); b = feet[ - 1 ] + Vector( ( 0, 0, 0.45 ) )
			pa = a.lerp( heads[ 0 ], t ); pb = b.lerp( heads[ - 1 ], t )
			# a thin flat strip (two triangles) facing out
			mb.f( [ pa, pb, pb + Vector( ( 0, 0, 0.03 ) ), pa + Vector( ( 0, 0, 0.03 ) ) ], 'M_NavalRiggingHemp', facing = ( 0, side, 0 ) )
			k += rat_step
	return feet

def channel( mb, hull, x0, x1, y, side, out = 0.42, mat = 'M_NavalBlackPaint' ):
	"""a channel (chain-wale): a plank standing out from the side at height y between x0 .. x1 -> its outer y"""
	ya = hull.hbAt( x0, y ); yb = hull.hbAt( x1, y )
	w = max( ya, yb ) + out
	box( mb, ( ( x0 + x1 ) / 2, side * ( min( ya, yb ) + w ) / 2, y ), ( x1 - x0, w - min( ya, yb ), 0.1 ), mat )
	return w - 0.08

# ------------------------------------------------------------------ deck furniture

def cannon( mb, x, y, z, side, length = 1.9, r = 0.13, carriage = True ):
	"""a carriage gun on deck at ( x, y_beam, z deck ) pointing outboard (side +1 port / -1 starboard)"""
	ax = Vector( ( 0, side, 0 ) )
	h = 0.55
	if carriage:
		box( mb, ( x, y - side * 0.25, z + 0.18 ), ( 0.62, 1.0, 0.24 ), 'M_NavalSparTimber' )
		for dx in ( - 0.27, 0.27 ):
			box( mb, ( x + dx, y - side * 0.25, z + 0.38 ), ( 0.1, 0.95, 0.42 ), 'M_NavalSparTimber' )
			for dy in ( 0.25, - 0.65 ):
				cyl( mb, ( x + dx * 1.25, y + side * dy - side * 0.0, z + 0.14 ), ( x + dx * 1.25 + math.copysign( 0.06, dx ), y + side * dy, z + 0.14 ), 0.14, 0.14, 'M_NavalSparTimber', n = 8 )
	b0 = Vector( ( x, y - side * 0.95, z + h ) ); b1 = b0 + ax * length
	cyl( mb, b0, b1, r * 1.25, r * 0.95, 'M_NavalIron', n = 10, cap0 = True, cap1 = False )
	cyl( mb, b1 - ax * 0.08, b1 + ax * 0.02, r * 1.05, r * 1.05, 'M_NavalIron', n = 10 )
	sphere( mb, b0 - ax * 0.08, r * 0.6, 'M_NavalIron', 6, 4 )

def swivel( mb, x, y, z, side ):
	cyl( mb, ( x, y, z - 0.35 ), ( x, y, z ), 0.04, 0.04, 'M_NavalIron', n = 6 )
	cyl( mb, ( x, y - side * 0.35, z + 0.06 ), ( x, y + side * 0.55, z + 0.06 ), 0.06, 0.045, 'M_NavalIron', n = 8 )

def capstan( mb, x, y, z, r = 0.35, h = 1.0 ):
	cyl( mb, ( x, y, z ), ( x, y, z + 0.12 ), r * 1.3, r * 1.3, 'M_NavalSparTimber', n = 12 )
	cyl( mb, ( x, y, z + 0.12 ), ( x, y, z + h * 0.75 ), r, r * 0.8, 'M_NavalSparTimber', n = 12 )
	cyl( mb, ( x, y, z + h * 0.75 ), ( x, y, z + h ), r * 1.2, r * 1.2, 'M_NavalSparTimber', n = 12 )
	for k in range( 4 ):
		a = k * math.pi / 4
		d = Vector( ( math.cos( a ), math.sin( a ), 0 ) )
		c = Vector( ( x, y, z + h * 0.88 ) )
		cyl( mb, c - d * r * 4, c + d * r * 4, 0.035, 0.035, 'M_NavalSparTimber', n = 5 )

def hatch( mb, x, y, z, l, w, grating = True, cover = None ):
	"""a hatch: a coaming and a grating (or a tarpaulin cover: cover = material)"""
	hc = 0.28
	box( mb, ( x, y, z + hc / 2 ), ( l, w, hc ), 'M_NavalSparTimber', skip = ( '-z', ) )
	if cover:
		box( mb, ( x, y, z + hc + 0.05 ), ( l + 0.08, w + 0.08, 0.1 ), cover, skip = ( '-z', ) )
		return
	if grating:
		mb.f( [ ( x - l / 2 + 0.05, y - w / 2 + 0.05, z + hc + 0.002 ), ( x + l / 2 - 0.05, y - w / 2 + 0.05, z + hc + 0.002 ), ( x + l / 2 - 0.05, y + w / 2 - 0.05, z + hc + 0.002 ), ( x - l / 2 + 0.05, y + w / 2 - 0.05, z + hc + 0.002 ) ], 'M_NavalIron', facing = ( 0, 0, 1 ) )
		n = max( 2, int( l / 0.16 ) )
		for i in range( 1, n ):
			xx = x - l / 2 + l * i / n
			box( mb, ( xx, y, z + hc + 0.025 ), ( 0.04, w - 0.08, 0.05 ), 'M_NavalSparTimber', skip = ( '-z', ) )
		m = max( 2, int( w / 0.16 ) )
		for j in range( 1, m ):
			yy = y - w / 2 + w * j / m
			box( mb, ( x, yy, z + hc + 0.02 ), ( l - 0.08, 0.04, 0.04 ), 'M_NavalSparTimber', skip = ( '-z', ) )

def barrel( mb, x, y, z, r = 0.3, h = 0.85, upright = True, n = 10 ):
	if upright:
		cyl( mb, ( x, y, z ), ( x, y, z + h * 0.5 ), r * 0.88, r, 'M_NavalSparTimber', n = n, cap0 = False )
		cyl( mb, ( x, y, z + h * 0.5 ), ( x, y, z + h ), r, r * 0.88, 'M_NavalSparTimber', n = n, cap1 = True, cap0 = False )
		for zz in ( 0.12, h - 0.12 ):
			cyl( mb, ( x, y, z + zz - 0.03 ), ( x, y, z + zz + 0.03 ), r * 0.93 + 0.012, r * 0.93 + 0.012, 'M_NavalIron', n = n, cap0 = False, cap1 = False )
	else:
		cyl( mb, ( x - h / 2, y, z + r ), ( x, y, z + r ), r * 0.88, r, 'M_NavalSparTimber', n = n, cap1 = False )
		cyl( mb, ( x, y, z + r ), ( x + h / 2, y, z + r ), r, r * 0.88, 'M_NavalSparTimber', n = n, cap0 = False )

def crate( mb, x, y, z, s = 0.6, h = None, a = 0.0 ):
	h = h or s
	box( mb, ( x, y, z + h / 2 ), ( s, s * 0.9, h ), 'M_NavalSparTimber', r = ( 0, 0, a ), skip = ( '-z', ) )

def coil( mb, x, y, z, r = 0.32 ):
	torus( mb, ( x, y, z + 0.04 ), r, 0.045, 'M_NavalRiggingHemp', nu = 10, nv = 3 )
	torus( mb, ( x, y, z + 0.11 ), r * 0.78, 0.045, 'M_NavalRiggingHemp', nu = 10, nv = 3 )

def pinrail( mb, x0, x1, y, z, side, pins = 6 ):
	"""a belaying-pin rail along the inside of the bulwark"""
	box( mb, ( ( x0 + x1 ) / 2, y, z ), ( x1 - x0, 0.12, 0.08 ), 'M_NavalSparTimber' )
	for i in range( pins ):
		xx = lerp( x0 + 0.15, x1 - 0.15, i / max( 1, pins - 1 ) )
		cyl( mb, ( xx, y, z - 0.12 ), ( xx, y, z + 0.18 ), 0.022, 0.03, 'M_NavalSparTimber', n = 5, cap0 = False )

def bitts( mb, x, y, z, h = 0.8, w = 0.9 ):
	for s in ( - 1, 1 ):
		box( mb, ( x, y + s * w / 2, z + h / 2 ), ( 0.2, 0.2, h ), 'M_NavalSparTimber', skip = ( '-z', ) )
	box( mb, ( x, y, z + h * 0.72 ), ( 0.16, w + 0.3, 0.16 ), 'M_NavalSparTimber' )

def lantern( mb, x, y, z, s = 0.28, glass = 'M_NavalLanternGlass' ):
	"""a stern lantern on a bracket: brass cap and base, glass sides"""
	cyl( mb, ( x, y, z ), ( x, y, z + s * 0.15 ), s * 0.55, s * 0.55, 'M_NavalAgedBrass', n = 8 )
	cyl( mb, ( x, y, z + s * 0.15 ), ( x, y, z + s * 1.1 ), s * 0.45, s * 0.5, glass, n = 8 )
	cyl( mb, ( x, y, z + s * 1.1 ), ( x, y, z + s * 1.5 ), s * 0.55, 0.02, 'M_NavalAgedBrass', n = 8 )

def ship_wheel( mb, c, axis, R = 0.44, tube = 0.045, spokes = 8, mat = 'M_NavalSparTimber', hub = 'M_NavalAgedBrass', reach = 0.52 ):
	"""a spoked helm wheel at c, its axle along `axis`; every piece lies inside a disc of radius `reach` and +-0.1 along the
	axle, separate from the stand (ShipBoatModel._carveWheel lifts it out of the hull by that test)"""
	c = Vector( c ); ax = Vector( axis ).normalized(); e1, e2 = frame_of( ax )
	torus( mb, c, R, tube, mat, axis = ax, nu = 20, nv = 5 )
	for k in range( spokes ):
		a = 2 * math.pi * k / spokes
		d = e1 * math.cos( a ) + e2 * math.sin( a )
		cyl( mb, c + d * 0.07, c + d * ( R - tube * 0.5 ), 0.022, 0.018, mat, n = 5, cap0 = False, cap1 = False )
		cyl( mb, c + d * ( R + tube * 0.6 ), c + d * ( reach - 0.005 ), 0.024, 0.016, mat, n = 5 )
	cyl( mb, c - ax * 0.07, c + ax * 0.07, 0.08, 0.08, hub, n = 10 )

def boat( mb, x, y, z, L = 4.2, B = 1.4, D = 0.55, keelUp = False, mat = 'M_NavalHullPlank', inside = 'M_NavalSparTimber' ):
	"""a ship's boat (a small open hull) resting at ( x, y, z bottom ), bow +X"""
	nu, nv = 10, 3
	def hb( u, v ):
		p = math.sin( math.pi * clamp( u, 0, 1 ) ) ** 0.6 if u > 0.08 else lerp( 0.55, math.sin( math.pi * 0.08 ) ** 0.6, u / 0.08 )
		return B / 2 * p * ( 0.35 + 0.65 * math.sin( math.pi / 2 * v ) ** 0.7 )
	for side in ( 1, - 1 ):
		G = [ [ Vector( ( x - L / 2 + L * i / nu, y + side * hb( i / nu, j / nv ), z + D * j / nv ) ) for j in range( nv + 1 ) ] for i in range( nu + 1 ) ]
		for i in range( nu ):
			for j in range( nv ):
				q = [ G[ i ][ j ], G[ i + 1 ][ j ], G[ i + 1 ][ j + 1 ], G[ i ][ j + 1 ] ]
				mb.f( q, mat, facing = ( 0, side, 0 ), smooth = True )
				qi = [ p - Vector( ( 0, side * 0.04, 0 ) ) for p in q ]
				mb.f( qi, inside, facing = ( 0, - side, 0 ), smooth = True )
	mb.f( [ ( x - L / 2 + 0.05, y - B * 0.15, z + 0.06 ), ( x + L / 2 - 0.3, y - B * 0.1, z + 0.06 ), ( x + L / 2 - 0.3, y + B * 0.1, z + 0.06 ), ( x - L / 2 + 0.05, y + B * 0.15, z + 0.06 ) ], inside, facing = ( 0, 0, 1 ) )
	mb.f( [ ( x - L / 2, y - hb( 0, 1 ), z + D ), ( x - L / 2, y + hb( 0, 1 ), z + D ), ( x - L / 2, y + hb( 0, 0 ), z ), ( x - L / 2, y - hb( 0, 0 ), z ) ], mat, facing = ( - 1, 0, 0 ) )
	for k in range( 3 ):
		xx = x - L / 2 + L * ( 0.3 + 0.2 * k )
		w = hb( 0.3 + 0.2 * k, 0.8 ) * 2 - 0.1
		box( mb, ( xx, y, z + D * 0.65 ), ( 0.22, w, 0.05 ), inside )

def anchor( mb, x, y, z, side, s = 1.0 ):
	"""a fisherman anchor hanging at the cathead, shank vertical, stock across"""
	cyl( mb, ( x, y, z ), ( x, y, z - 1.5 * s ), 0.05 * s, 0.05 * s, 'M_NavalIron', n = 6 )
	cyl( mb, ( x - 0.8 * s, y, z - 0.15 * s ), ( x + 0.8 * s, y, z - 0.15 * s ), 0.05 * s, 0.05 * s, 'M_NavalSparTimber', n = 6 )
	for d in ( 1, - 1 ):
		cyl( mb, ( x, y, z - 1.5 * s ), ( x + d * 0.55 * s, y, z - 1.05 * s ), 0.05 * s, 0.04 * s, 'M_NavalIron', n = 6 )
		box( mb, ( x + d * 0.55 * s, y, z - 1.05 * s ), ( 0.2 * s, 0.05 * s, 0.25 * s ), 'M_NavalIron' )
	torus( mb, ( x, y, z + 0.08 ), 0.1 * s, 0.025 * s, 'M_NavalIron', axis = ( 0, 1, 0 ), nu = 8, nv = 3 )

def stern_windows( mb, hull, n, y0, y1, glass = 'M_NavalLanternGlass', frame = 'M_NavalAgedBrass', out = 0.02 ):
	"""a row of n lights across the transom between heights y0 .. y1"""
	ym = ( y0 + y1 ) / 2
	x = hull.xS( ym ) - out
	hw = hull.hbAt( hull.xS( ym ) + 0.05, ym ) * 0.82
	w = 2 * hw / n
	for i in range( n ):
		yy = - hw + w * ( i + 0.5 )
		mb.f( [ ( x, yy - w * 0.36, y0 ), ( x, yy + w * 0.36, y0 ), ( x, yy + w * 0.36, y1 ), ( x, yy - w * 0.36, y1 ) ], glass, facing = ( - 1, 0, 0 ) )
		for dy in ( - w * 0.42, w * 0.42 ):
			box( mb, ( x, yy + dy, ym ), ( 0.05, 0.07, y1 - y0 + 0.1 ), frame )
	box( mb, ( x, 0, y1 + 0.06 ), ( 0.06, 2 * hw + 0.1, 0.1 ), frame )
	box( mb, ( x, 0, y0 - 0.06 ), ( 0.06, 2 * hw + 0.1, 0.1 ), frame )

def balance( mb, x, z = 0.5 ):
	"""a 2 mm triangle at x: the X extent of the mesh comes out symmetric (the game centres a ship on its X extent)"""
	mb.f( [ ( x, 0, z ), ( x + 0.002, 0, z ), ( x + 0.001, 0, z + 0.002 ) ], 'M_NavalRiggingHemp' )
