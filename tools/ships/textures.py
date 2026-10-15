# Wave 24C: the ships' textures, painted procedurally with numpy (no downloads, no scans: original work, MIT with the repo).
# Every map tiles seamlessly (periodic value noise). Arrays are H x W x 3 floats in 0..1, row 0 at the BOTTOM (Blender's
# pixel order). Used by build_ships.py, which packs them into bpy images and the exporter writes them as JPEG.
#
#   paint()     light weathered painted planks (strakes run along the hull), tinted per livery by baseColorFactor:
#               seams, staggered butts, trenails, chipped paint showing grey wood, rust / grime streaks running down
#   bottom()    below the waterline: sheathing plates (copper on the navy, tallow / tar / antifouling by tint), weed toward
#               the top of the band (the waterline), barnacle speckle
#   deck()      holystoned deck planks with black caulking seams, butt ends and trenails, tar spots, foot-worn centre
#   timber()    spar / furniture wood: long grain, knots, a little tar
#   canvas()    one sail across 0..1: vertical cloths with seams, a doubled foot / leech band, reef band and points near the
#               head, a patch or two, soiling toward the foot; light cream, tinted per livery
#   flags()     a 2 x 2 atlas: the black flag (skull and crossed bones), the navy ensign, a merchant house flag, a pennant
import numpy as np

def _rng( seed ): return np.random.default_rng( seed )

def vnoise( n, freq, seed, fx = None ):
	"""periodic value noise n x n, `freq` cells across (fx: other cell count along x), smooth (cosine) interpolation"""
	fx = fx or freq
	r = _rng( seed ).random( ( freq, fx ) )
	ys = np.arange( n ) * freq / n; xs = np.arange( n ) * fx / n
	y0 = np.floor( ys ).astype( int ); x0 = np.floor( xs ).astype( int )
	ty = ys - y0; tx = xs - x0
	ty = ( 1 - np.cos( ty * np.pi ) ) / 2; tx = ( 1 - np.cos( tx * np.pi ) ) / 2
	y1 = ( y0 + 1 ) % freq; x1 = ( x0 + 1 ) % fx
	a = r[ np.ix_( y0, x0 ) ]; b = r[ np.ix_( y0, x1 ) ]; c = r[ np.ix_( y1, x0 ) ]; d = r[ np.ix_( y1, x1 ) ]
	TX = tx[ None, : ]; TY = ty[ :, None ]
	return ( a * ( 1 - TX ) + b * TX ) * ( 1 - TY ) + ( c * ( 1 - TX ) + d * TX ) * TY

def fbm( n, freq, seed, octaves = 4, fx = None, gain = 0.5 ):
	out = np.zeros( ( n, n ) ); amp = 1.0; tot = 0.0
	for o in range( octaves ):
		out += amp * vnoise( n, freq * 2 ** o, seed + 17 * o, ( fx or freq ) * 2 ** o ); tot += amp; amp *= gain
	return out / tot

def clamp( a ): return np.clip( a, 0, 1 )

def rgb( a, col ):
	return clamp( a[ :, :, None ] * np.array( col )[ None, None, : ] )

def mix( a, b, t ):
	t = t[ :, :, None ] if t.ndim == 2 else t
	return a * ( 1 - t ) + b * t

def planks( n, rows, seed, butt_every = 1.0, stagger = 0.37 ):
	"""strake index map: rows strakes across the tile (v), butts once per `butt_every` tile lengths per strake, staggered.
	-> ( row id, along-plank 0..1 pos, distance to the nearest seam in px (v), distance to the nearest butt in px (u), plank id )"""
	y = np.arange( n )[ :, None ] * np.ones( ( 1, n ) ); x = np.ones( ( n, 1 ) ) * np.arange( n )[ None, : ]
	h = n / rows
	row = np.floor( y / h ).astype( int )
	fy = y - row * h
	seam = np.minimum( fy, h - fy )
	plen = n * butt_every
	off = ( ( row * stagger ) % 1.0 ) * plen
	px = ( x + off ) % plen
	pid = row * 1000 + np.floor( ( x + off ) / plen ).astype( int )
	butt = np.minimum( px, plen - px )
	return row, fy / h, seam, butt, pid

def per_id( ids, seed ):
	"""a random 0..1 value per integer id"""
	u, inv = np.unique( ids, return_inverse = True )
	return _rng( seed ).random( len( u ) )[ inv ].reshape( ids.shape )

def grain( n, seed, along = 64, across = 3, rows = 8 ):
	"""wood grain running along x (lines parallel to u): fine along v (along: cells), stretched along u (across: cells)"""
	return fbm( n, along, seed, octaves = 4, fx = across )

def paint( n = 512 ):
	"""light weathered painted planks (tinted later): 10 strakes per tile"""
	row, fv, seam, butt, pid = planks( n, 10, 3, butt_every = 1.0, stagger = 0.41 )
	base = 0.86 + 0.06 * ( per_id( pid, 4 ) - 0.5 )
	# each strake a little rounder in the light, the seam dark
	shade = 0.94 + 0.06 * np.sin( fv * np.pi )
	s = np.clip( seam / 2.2, 0, 1 ); b = np.clip( butt / 1.6, 0, 1 )
	lum = base * shade * ( 0.45 + 0.55 * s ) * ( 0.55 + 0.45 * b )
	# brush marks along the planks and slight grain telegraphing through the paint
	lum *= 0.97 + 0.05 * ( grain( n, 5 ) - 0.5 )
	col = rgb( lum, ( 1.0, 0.99, 0.97 ) )
	# chips: paint gone, grey weathered wood shows (darker, warm)
	chips = fbm( n, 24, 9, octaves = 4 ) + 0.2 * fbm( n, 96, 11, octaves = 2 )
	chipm = np.clip( ( chips - 0.84 ) * 12, 0, 1 )
	wood = rgb( 0.42 + 0.12 * grain( n, 12 ), ( 0.62, 0.52, 0.4 ) )
	col = mix( col, wood, chipm * 0.85 )
	# grime streaks running down (along v), stronger under the seams
	streak = fbm( n, 2, 21, octaves = 3, fx = 48 )
	streak = np.clip( ( streak - 0.45 ) * 2.2, 0, 1 ) * 0.22
	col *= ( 1 - streak )[ :, :, None ]
	# trenails: two dots near each butt
	tn = ( butt < 5 ) & ( butt > 2.5 ) & ( np.abs( fv - 0.5 ) < 0.12 )
	col[ tn ] *= 0.6
	return clamp( col )

def bottom( n = 512 ):
	"""sheathing plates (0.35 x 1.2 m at a 2 x 2 m tile: 6 rows of 2 plates), a weed band toward the waterline (top: v 1)"""
	row, fv, seam, butt, pid = planks( n, 6, 31, butt_every = 0.5, stagger = 0.5 )
	base = 0.82 + 0.1 * ( per_id( pid, 32 ) - 0.5 )
	s = np.clip( seam / 1.5, 0, 1 ); b = np.clip( butt / 1.5, 0, 1 )
	lum = base * ( 0.6 + 0.4 * s ) * ( 0.6 + 0.4 * b )
	# nail rows along the plate edges
	nails = ( ( seam > 3 ) & ( seam < 5 ) & ( ( np.arange( n )[ None, : ] % 9 ) < 2 ) ) | ( ( butt > 3 ) & ( butt < 5 ) & ( ( np.arange( n )[ :, None ] % 9 ) < 2 ) )
	lum = np.where( nails, lum * 0.7, lum )
	mott = fbm( n, 8, 33, octaves = 5 )
	lum *= 0.8 + 0.35 * mott
	col = rgb( lum, ( 1.0, 0.98, 0.95 ) )
	# verdigris / tallow mottling (cool tint where the plates are oldest)
	ver = np.clip( ( fbm( n, 6, 34, octaves = 4 ) - 0.55 ) * 4, 0, 1 ) * 0.35
	col = mix( col, np.ones_like( col ) * np.array( ( 0.55, 0.78, 0.7 ) ), ver )
	# barnacle speckle
	sp = _rng( 35 ).random( ( n, n ) ) > 0.995
	col[ sp ] = col[ sp ] * 0.5 + 0.35
	return clamp( col )

def deck( n = 512 ):
	"""deck planks run along u (fore and aft), 8 per tile across (2.4 m tile: 0.3 m planks), caulked seams"""
	row, fv, seam, butt, pid = planks( n, 8, 41, butt_every = 1.0, stagger = 0.29 )
	tone = per_id( pid, 42 )
	g = grain( n, 43, along = 48, across = 4 )
	lum = 0.62 + 0.14 * ( tone - 0.5 ) + 0.12 * ( g - 0.5 )
	col = rgb( lum, ( 0.86, 0.74, 0.58 ) )
	# holystoned: bleached, a few darker planks
	col = mix( col, np.ones_like( col ) * np.array( ( 0.74, 0.68, 0.58 ) ), np.full( ( n, n ), 0.25 ) )
	cs = ( seam < 1.6 )
	col[ cs ] = np.array( ( 0.07, 0.06, 0.05 ) )
	cb = ( butt < 1.2 ) & ~cs
	col[ cb ] *= 0.45
	tn = ( butt > 4 ) & ( butt < 7 ) & ( np.abs( fv - 0.5 ) > 0.18 ) & ( np.abs( fv - 0.5 ) < 0.28 )
	col[ tn ] *= 0.55
	# tar spots and grime
	tar = np.clip( ( fbm( n, 24, 44, octaves = 3 ) - 0.76 ) * 6, 0, 1 ) * 0.35
	col *= ( 1 - tar )[ :, :, None ]
	return clamp( col )

def timber( n = 512 ):
	"""spars and joinery: long grain along u, knots"""
	g = grain( n, 51, along = 96, across = 6 )
	f = fbm( n, 3, 52, octaves = 3, fx = 12 )
	lum = 0.5 + 0.25 * ( g - 0.5 ) + 0.18 * ( f - 0.5 )
	# growth rings: thin dark lines across v
	rings = np.sin( ( np.arange( n )[ :, None ] / n * 24 + 3 * fbm( n, 6, 53, octaves = 2, fx = 2 ) ) * np.pi * 2 )
	lum *= 0.96 + 0.04 * rings
	col = rgb( lum, ( 0.78, 0.56, 0.36 ) )
	knots = np.clip( ( fbm( n, 10, 54, octaves = 2, fx = 5 ) - 0.8 ) * 8, 0, 1 )
	col *= ( 1 - 0.5 * knots )[ :, :, None ]
	return clamp( col )

def canvas( n = 512 ):
	"""one sail across 0..1 (u across, v up from the foot): 12 cloths, seams, reef band near the head"""
	x = np.arange( n )[ None, : ] * np.ones( ( n, 1 ) ); y = np.arange( n )[ :, None ] * np.ones( ( 1, n ) )
	cloth = n / 12
	cx = x % cloth
	seam = np.minimum( cx, cloth - cx )
	tone = per_id( np.floor( x / cloth ).astype( int ), 61 )
	weave = 0.97 + 0.03 * np.sin( x * 1.9 ) * np.sin( y * 1.7 )
	lum = ( 0.9 + 0.05 * ( tone - 0.5 ) ) * weave
	lum = np.where( seam < 2.0, lum * 0.8, lum )
	lum = np.where( ( seam >= 2.0 ) & ( seam < 3.0 ), lum * 0.92, lum )
	# the tabling round the edges (doubled cloth) and the boltrope shadow
	e = np.minimum( np.minimum( x, n - 1 - x ), np.minimum( y, n - 1 - y ) )
	lum = np.where( e < 10, lum * 0.86, lum )
	lum = np.where( e < 3, lum * 0.7, lum )
	# reef band near the head: a doubled strip and points (v from the foot: head at the top rows)
	vh = 1 - y / n
	band = ( vh > 0.17 ) & ( vh < 0.2 )
	lum = np.where( band, lum * 0.9, lum )
	pts = ( np.abs( vh - 0.185 ) < 0.008 ) & ( ( x % ( n / 20 ) ) < 3 )
	lum = np.where( pts, lum * 0.55, lum )
	band2 = ( vh > 0.33 ) & ( vh < 0.355 )
	lum = np.where( band2, lum * 0.92, lum )
	pts2 = ( np.abs( vh - 0.342 ) < 0.008 ) & ( ( x % ( n / 20 ) ) < 3 )
	lum = np.where( pts2, lum * 0.6, lum )
	col = rgb( lum, ( 1.0, 0.97, 0.9 ) )
	# soiling toward the foot and blotches, a darker patch sewn on
	soil = np.clip( 1 - y / n * 2.5, 0, 1 ) * 0.18 + np.clip( ( fbm( n, 5, 62, octaves = 4 ) - 0.5 ) * 1.2, 0, 1 ) * 0.25
	col *= ( 1 - soil )[ :, :, None ]
	patch = ( np.abs( x - n * 0.7 ) < n * 0.06 ) & ( np.abs( y - n * 0.42 ) < n * 0.05 )
	col[ patch ] *= np.array( ( 0.88, 0.85, 0.78 ) )
	pe = patch & ( ( np.abs( np.abs( x - n * 0.7 ) - n * 0.06 ) < 1.5 ) | ( np.abs( np.abs( y - n * 0.42 ) - n * 0.05 ) < 1.5 ) )
	col[ pe ] *= 0.7
	return clamp( col )

def _skull( h, w, cx, cy, s ):
	"""a mask of a skull over crossed bones centred at ( cx, cy ) (px, y up), size s (px)"""
	y = np.arange( h )[ :, None ] * np.ones( ( 1, w ) ); x = np.ones( ( h, 1 ) ) * np.arange( w )[ None, : ]
	X = ( x - cx ) / s; Y = ( y - cy ) / s
	head = ( X ** 2 + ( ( Y - 0.18 ) / 1.05 ) ** 2 ) < 0.3 ** 2
	jaw = ( np.abs( X ) < 0.16 ) & ( Y < - 0.02 ) & ( Y > - 0.26 )
	m = head | jaw
	eyes = ( ( ( X - 0.11 ) ** 2 + ( Y - 0.14 ) ** 2 ) < 0.075 ** 2 ) | ( ( ( X + 0.11 ) ** 2 + ( Y - 0.14 ) ** 2 ) < 0.075 ** 2 )
	nose = ( np.abs( X ) < 0.035 ) & ( Y > - 0.02 ) & ( Y < 0.06 )
	teeth = ( Y < - 0.12 ) & ( Y > - 0.22 ) & ( ( np.floor( ( X + 0.16 ) / 0.064 ) % 2 ) == 1 ) & ( np.abs( X ) < 0.15 )
	m = m & ~eyes & ~nose & ~teeth
	# crossed bones below
	bone = np.zeros_like( m )
	for sgn in ( 1, - 1 ):
		u = ( X * 0.8 + sgn * ( Y + 0.55 ) * 0.6 ); v = ( - sgn * X * 0.6 + ( Y + 0.55 ) * 0.8 )
		shaft = ( np.abs( v ) < 0.045 ) & ( np.abs( u ) < 0.55 )
		knob = ( ( ( np.abs( u ) - 0.58 ) ** 2 + ( np.abs( v ) - 0.05 ) ** 2 ) < 0.06 ** 2 ) | ( ( ( np.abs( u ) - 0.58 ) ** 2 + ( np.abs( v ) + 0.05 ) ** 2 ) < 0.06 ** 2 )
		bone |= shaft | knob
	return m | bone

def flags( n = 512 ):
	"""2 x 2 atlas (u right, v up): [0,.5)x[.5,1) black flag, [.5,1)x[.5,1) navy ensign, [0,.5)x[0,.5) merchant house flag,
	[.5,1)x[0,.5) pennants (navy blue / white over, pirate red under)"""
	h = n // 2
	img = np.zeros( ( n, n, 3 ) )
	cloth = 0.92 + 0.08 * fbm( n, 16, 71, octaves = 3 )
	# black flag (top left): weathered black, white skull and bones
	c = np.zeros( ( h, h, 3 ) ) + np.array( ( 0.05, 0.05, 0.055 ) )
	sk = _skull( h, h, h * 0.52, h * 0.56, h * 0.42 )
	c[ sk ] = np.array( ( 0.88, 0.86, 0.8 ) )
	img[ h:, :h ] = c
	# navy ensign (top right): blue field, a white cross, a white canton with a blue cross at the hoist (top)
	c = np.zeros( ( h, h, 3 ) ) + np.array( ( 0.07, 0.15, 0.42 ) )
	y = np.arange( h )[ :, None ] * np.ones( ( 1, h ) ); x = np.ones( ( h, 1 ) ) * np.arange( h )[ None, : ]
	cross = ( np.abs( y - h * 0.5 ) < h * 0.07 ) | ( np.abs( x - h * 0.32 ) < h * 0.07 )
	c[ cross ] = np.array( ( 0.93, 0.92, 0.88 ) )
	img[ h:, h: ] = c
	# merchant house flag (bottom left): red and white halves with a blue diamond
	c = np.zeros( ( h, h, 3 ) ) + np.array( ( 0.75, 0.12, 0.08 ) )
	c[ : h // 2 ] = np.array( ( 0.92, 0.9, 0.85 ) )
	dia = ( np.abs( x - h * 0.5 ) / h + np.abs( y - h * 0.5 ) / h ) < 0.18
	c[ dia ] = np.array( ( 0.1, 0.2, 0.5 ) )
	img[ : h, : h ] = c
	# pennants (bottom right): top half navy (white at the hoist, blue fly), bottom half pirate red
	c = np.zeros( ( h, h, 3 ) )
	c[ h // 2:, : ] = np.array( ( 0.07, 0.15, 0.42 ) )
	c[ h // 2:, : int( h * 0.28 ) ] = np.array( ( 0.93, 0.92, 0.88 ) )
	c[ : h // 2, : ] = np.array( ( 0.55, 0.06, 0.05 ) )
	img[ : h, h: ] = c
	img *= cloth[ :, :, None ]
	return clamp( img )

ALL = { 'T_ShipPaint': paint, 'T_ShipBottom': bottom, 'T_ShipDeck': deck, 'T_ShipTimber': timber, 'T_ShipCanvas': canvas, 'T_ShipFlags': flags }
