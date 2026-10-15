# Wave 24C: every sailing ship of the game rebuilt in Blender (headless), three levels of detail each:
#   D:\blender\blender.exe -b --factory-startup -P tools/ships/build_ships.py -- [ships] [lods] [outRoot]
#     ships: all | comma list of trawler, sloop, brigantine, frigate, revenue     lods: 0,1,2 (default all)
# -> public/models/ships/<id>_v2.glb (+ _lod1, _lod2) for the merchant and the pirates, public/models/navy/<id>.glb (+ _lod1,
#    _lod2) for the navy; a MEASURE line per file on stdout (triangles, bytes, bounds, the checks below).
#
# Numbers come from the game (tools/ships/ships.json, written by tools/ships/ships-json.mjs): hull length / beam / draft, the
# walkable decks of ShipDecks.js (planks exactly at the designed levels, ramps as slopes over their steps), the rails at the
# local deck + the bulwark height, the masts where ShipDecks puts them, the helm wheels where ShipBoatModel / NavyModels look
# for them, the guns at the class stations. The hull must contain the collision lines (SimpleHullLines) at the sheer and the
# player's swivel mounts (checked and printed).
#
# Conventions: see shipkit.py (frame, UV codes the game's sail and flag shader reads). Materials keep the fork's names (MastFall
# picks spars / sails / rigging by name; the lantern glass glows at night), textures are textures.py's (procedural, original).
import bpy, sys, os, json, math, struct, time
sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import importlib, shipkit, textures
importlib.reload( shipkit ); importlib.reload( textures )
from shipkit import *
from mathutils import Vector
import numpy as np

ROOT = os.path.abspath( os.path.join( os.path.dirname( os.path.abspath( __file__ ) ), '..', '..' ) )
DATA = json.load( open( os.path.join( os.path.dirname( os.path.abspath( __file__ ) ), 'ships.json' ) ) )
argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
WHICH = ( argv[ 0 ] if argv else 'all' ).split( ',' )
LODS = [ int( x ) for x in ( argv[ 1 ] if len( argv ) > 1 else '0,1,2' ).split( ',' ) ]
OUT = argv[ 2 ] if len( argv ) > 2 else os.path.join( ROOT, 'public', 'models' )
TEX = 512

# ------------------------------------------------------------------ liveries (linear baseColorFactor tints, roughness, metal)
# textured materials multiply their map by the tint; the flat ones are the tint
TEXMAP = {
	'M_NavalHullPlank': 'T_ShipPaint', 'M_NavalSheerStripe': 'T_ShipPaint', 'M_NavalBlackPaint': 'T_ShipPaint', 'M_NavyHullBlue': 'T_ShipPaint',
	'M_NavyHullWhite': 'T_ShipPaint', 'M_NavalHullTar': 'T_ShipBottom', 'M_NavalDeckPlank': 'T_ShipDeck', 'M_NavalSparTimber': 'T_ShipTimber',
	'M_NavyHelmWheel': 'T_ShipTimber', 'M_NavalSailCanvas': 'T_ShipCanvas', 'M_NavalFurledCanvas': 'T_ShipCanvas', 'M_NavalTarp': 'T_ShipCanvas', 'M_NavalFlagCanvas': 'T_ShipFlags',
	'M_NavyBlueCanvas': 'T_ShipFlags',
}
BASE = {
	'M_NavalBlackPaint': ( ( 0.035, 0.034, 0.033 ), 0.6, 0 ),
	'M_NavalDeckPlank': ( ( 1, 1, 1 ), 0.85, 0 ),
	'M_NavalSparTimber': ( ( 0.95, 0.9, 0.85 ), 0.7, 0 ),
	'M_NavyHelmWheel': ( ( 0.95, 0.85, 0.75 ), 0.55, 0 ),
	'M_NavalIron': ( ( 0.07, 0.075, 0.08 ), 0.55, 0.65 ),
	'M_NavalAgedBrass': ( ( 0.55, 0.38, 0.13 ), 0.38, 0.9 ),
	'M_NavalRiggingHemp': ( ( 0.11, 0.085, 0.06 ), 0.9, 0 ),
	'M_NavalLanternGlass': ( ( 0.86, 0.62, 0.28 ), 0.15, 0 ),
	'M_NavalWindow': ( ( 0.035, 0.045, 0.055 ), 0.12, 0 ),
	'M_NavalFlagCanvas': ( ( 1, 1, 1 ), 0.9, 0 ),
	'M_NavyBlueCanvas': ( ( 1, 1, 1 ), 0.9, 0 ),
	'M_NavalTarp': ( ( 0.6, 0.55, 0.45 ), 0.85, 0 ),
}
LIVERY = {
	# the merchant trawler: deep green topsides, white sheer and wheelhouse, red antifouling, tan-red barked sails
	'trawler': { 'M_NavalHullPlank': ( ( 0.035, 0.12, 0.085 ), 0.6, 0 ), 'M_NavalSheerStripe': ( ( 0.85, 0.82, 0.74 ), 0.6, 0 ),
		'M_NavalHullTar': ( ( 0.42, 0.07, 0.045 ), 0.7, 0 ), 'M_NavalSailCanvas': ( ( 0.62, 0.27, 0.14 ), 0.9, 0 ), 'M_NavalTarp': ( ( 0.32, 0.3, 0.22 ), 0.85, 0 ) },
	# the Black Flag sloop: dark oiled planking, an ochre sheer stripe, a tarred bottom, dingy patched canvas
	'sloop': { 'M_NavalHullPlank': ( ( 0.1, 0.065, 0.042 ), 0.65, 0 ), 'M_NavalSheerStripe': ( ( 0.62, 0.38, 0.06 ), 0.6, 0 ),
		'M_NavalHullTar': ( ( 0.09, 0.08, 0.07 ), 0.75, 0 ), 'M_NavalSailCanvas': ( ( 0.66, 0.6, 0.5 ), 0.9, 0 ) },
	# the brigantine flagship: black hull, an oxblood band and bulwarks, a tallow bottom, smoke-dark sails
	'brigantine': { 'M_NavalHullPlank': ( ( 0.045, 0.042, 0.04 ), 0.6, 0 ), 'M_NavalSheerStripe': ( ( 0.36, 0.035, 0.025 ), 0.6, 0 ),
		'M_NavalHullTar': ( ( 0.7, 0.66, 0.56 ), 0.75, 0 ), 'M_NavalSailCanvas': ( ( 0.34, 0.31, 0.28 ), 0.9, 0 ) },
	# the navy: blue topsides, white strakes, red bulwarks inside, coppered bottoms, white canvas
	'frigate': { 'M_NavyHullBlue': ( ( 0.025, 0.05, 0.15 ), 0.55, 0 ), 'M_NavyHullWhite': ( ( 0.85, 0.82, 0.72 ), 0.55, 0 ), 'M_NavalSheerStripe': ( ( 0.42, 0.06, 0.04 ), 0.6, 0 ),
		'M_NavalHullTar': ( ( 0.95, 0.5, 0.3 ), 0.4, 0.75 ), 'M_NavalSailCanvas': ( ( 0.95, 0.93, 0.87 ), 0.9, 0 ), 'M_NavalTarp': ( ( 0.85, 0.83, 0.76 ), 0.85, 0 ) },
	'revenue': { 'M_NavyHullBlue': ( ( 0.025, 0.05, 0.15 ), 0.55, 0 ), 'M_NavyHullWhite': ( ( 0.85, 0.82, 0.72 ), 0.55, 0 ), 'M_NavalSheerStripe': ( ( 0.42, 0.06, 0.04 ), 0.6, 0 ),
		'M_NavalHullTar': ( ( 0.95, 0.5, 0.3 ), 0.4, 0.75 ), 'M_NavalSailCanvas': ( ( 0.95, 0.93, 0.87 ), 0.9, 0 ) },
}
# every material a ship may carry: the LOD files hold a primitive of each (see export)
PALETTE = [ 'M_NavalHullTar', 'M_NavalHullPlank', 'M_NavyHullBlue', 'M_NavyHullWhite', 'M_NavalSheerStripe', 'M_NavalBlackPaint', 'M_NavalDeckPlank',
	'M_NavalSparTimber', 'M_NavyHelmWheel', 'M_NavalIron', 'M_NavalAgedBrass', 'M_NavalSailCanvas', 'M_NavalFurledCanvas', 'M_NavalTarp',
	'M_NavalRiggingHemp', 'M_NavalLanternGlass', 'M_NavalWindow', 'M_NavalFlagCanvas', 'M_NavyBlueCanvas' ]
DOUBLE = { 'M_NavalSailCanvas', 'M_NavalFlagCanvas', 'M_NavyBlueCanvas', 'M_NavalRiggingHemp' }

def look( kind, name ):
	if name == 'M_NavalFurledCanvas': name = 'M_NavalSailCanvas'
	return LIVERY[ kind ].get( name ) or BASE.get( name ) or ( ( 0.8, 0.8, 0.8 ), 0.7, 0 )

# ------------------------------------------------------------------ deck levels and rails from the game's layout

def walk_levels( kind ):
	"""levelAt( x ): the highest walkable surface over x (Blender x = boat z), as ShipDecks' bulwark sizing reads it;
	sideAt( x, w ): the surfaces at the bulwark (|boat x| >= w); surfaces: the raw list (boat frame)"""
	if kind in DATA[ 'layout' ]:
		L = DATA[ 'layout' ][ kind ]; deckY = DATA[ 'boats' ][ kind ][ 'deckY' ]
		surf = L[ 'surfaces' ]
		def levelAt( x ):
			y = deckY
			for s in surf:
				if s[ 'z0' ] - 1e-6 <= x <= s[ 'z1' ] + 1e-6 and s[ 'y' ] > y: y = s[ 'y' ]
			return y
		def sideAt( x, w ):
			y = None
			for s in surf:
				if s[ 'z0' ] - 1e-6 <= x <= s[ 'z1' ] + 1e-6 and ( s[ 'x1' ] >= w or s[ 'x0' ] <= - w ):
					y = s[ 'y' ] if y is None else max( y, s[ 'y' ] )
			return y if y is not None else deckY
		return levelAt, sideAt, deckY
	c = DATA[ 'classes' ][ kind ]
	decks = c.get( 'decks' ) or [ { 'z0': - c[ 'length' ] / 2, 'z1': c[ 'length' ] / 2, 'y': c[ 'deck' ] } ]
	def levelAt( x ):
		y = c[ 'deck' ]
		for s in decks:
			if s[ 'z0' ] - 1e-6 <= x <= s[ 'z1' ] + 1e-6 and s[ 'y' ] > y: y = s[ 'y' ]
		return y
	return levelAt, ( lambda x, w: levelAt( x ) ), c[ 'deck' ]

def rail_fn( levelAt, L, bw, sweep = 0.22, slope = 0.55, xA = None ):
	"""the rail: the local deck + bw, dilated with a slope down from every raised level (never under level + bw), plus a sweep
	rising toward both ends"""
	xA = - L / 2 if xA is None else xA
	n = 400
	xs = [ xA - 0.5 + ( L + 1.0 ) * i / n for i in range( n + 1 ) ]
	lv = [ levelAt( x ) + bw for x in xs ]
	dil = []
	for i, x in enumerate( xs ):
		m = lv[ i ]
		for j in range( max( 0, i - 60 ), min( n + 1, i + 61 ) ):
			m = max( m, lv[ j ] - slope * abs( xs[ j ] - x ) )
		dil.append( m )
	# soften the corners (a 5-tap box), never below the level
	sm = []
	for i in range( n + 1 ):
		a = dil[ max( 0, i - 3 ): i + 4 ]
		sm.append( max( lv[ i ], sum( a ) / len( a ) ) )
	def rail( x ):
		f = clamp( ( x - xs[ 0 ] ) / ( xs[ - 1 ] - xs[ 0 ] ), 0, 1 ) * n
		i = min( n - 1, int( f ) ); t = f - i
		u = clamp( ( x - xA ) / L, 0, 1 ) * 2 - 1
		return lerp( sm[ i ], sm[ i + 1 ], t ) + sweep * abs( u ) ** 2.2
	return rail

# ------------------------------------------------------------------ shared pieces

class Ship:
	"""the common build of a ship: hull, bulwarks, decks, stern, head; the rig is per class"""

	def __init__( self, kind, lod ):
		self.kind, self.lod = kind, lod
		c = DATA[ 'classes' ][ kind ]
		self.c = c
		self.L, self.B, self.d = c[ 'length' ], c[ 'beam' ], c[ 'draft' ]
		self.boat = DATA[ 'boats' ].get( kind )
		self.navy = bool( c.get( 'navy' ) )
		self.paint = 'M_NavyHullBlue' if self.navy else 'M_NavalHullPlank'
		self.band = 'M_NavyHullWhite' if self.navy else 'M_NavalSheerStripe'
		# the head, the port lids, the galleries: black trim (the hull shell alone carries the hull paints: the game's tests
		# measure the hull by them)
		self.trim = 'M_NavalBlackPaint'
		mats = [ 'M_NavalHullTar', self.paint, 'M_NavalSheerStripe', 'M_NavalBlackPaint', 'M_NavalDeckPlank', 'M_NavalSparTimber', 'M_NavalIron',
			'M_NavalAgedBrass', 'M_NavalSailCanvas', 'M_NavalRiggingHemp', 'M_NavalLanternGlass' ]
		if self.navy: mats += [ 'M_NavyHullWhite', 'M_NavyBlueCanvas', 'M_NavyHelmWheel' ]
		else: mats += [ 'M_NavalFlagCanvas' ]
		self.mb = MB( mats )
		self.levelAt, self.sideAt, self.deckY = walk_levels( kind )
		self.flagMat = 'M_NavyBlueCanvas' if self.navy else 'M_NavalFlagCanvas'
		self.notes = []

	def hull( self, opts, bw, sweep = 0.22, bands = None, levels = None, rail = None ):
		L = self.L
		self.rail = rail or rail_fn( self.levelAt, L, bw, sweep )
		if self.boat and self.lod < 2: opts.setdefault( 'gaps', [ ( - DATA[ 'gap' ], DATA[ 'gap' ] ) ] )
		# the upper transom painted in the band colour, from a little under the stern windows
		opts.setdefault( 'sternMat', self.band )
		opts.setdefault( 'sternFrom', self.levelAt( - L / 2 + 0.5 ) - 1.15 )
		self.H = Hull( L, opts.pop( 'Bh', self.B / 2 ), self.d, self.rail, lambda x: self.sideAt( x, 1.0 ), opts )
		nu = [ 88, 30, 14 ][ self.lod ]
		top = min( self.rail( - L / 2 + i * L / 40 ) for i in range( 41 ) )
		if levels is None:
			base = [ - self.d * k for k in ( 0.82, 0.62, 0.45, 0.3, 0.17, 0.07 ) ] + [ 0.0, 0.15, 0.28 ]
			step = [ 0.32, 0.6, 1.2 ][ self.lod ]
			y = 0.5
			while y < top - 0.1:
				base.append( y ); y += step
			levels = base
		if self.lod == 2: levels = [ - self.d * 0.55, - self.d * 0.2, 0.0, 0.15, self.deckY * 0.6, self.deckY ]
		self.H.build( self.mb, bands, nu = nu, levels = levels + [ b[ 0 ] for b in bands if b[ 0 ] < top - 0.05 ] )
		return self.H

	def check_lines( self ):
		"""the visual hull must contain the collision lines' sheer (the walking clamp and the bulwark colliders) and the
		player's swivel mounts"""
		if self.kind not in DATA[ 'lines' ]: return
		Ls = DATA[ 'lines' ][ self.kind ]; deckEnd = DATA[ 'layout' ][ self.kind ][ 'deckEnd' ]
		worst, at = 0, None
		for s in Ls[ 'samples' ]:
			if s[ 'z' ] < Ls[ 'zAft' ] + 0.15 or s[ 'z' ] > deckEnd: continue
			y = self.levelAt( s[ 'z' ] ) + 0.5
			short = s[ 'sheerX' ] - self.H.hbAt( s[ 'z' ], y )
			if short > worst: worst, at = short, round( s[ 'z' ], 2 )
		self.notes.append( 'lines inside the hull: worst shortfall %.3f m (z %s)' % ( worst, at ) )
		b = self.boat.get( 'broadside' )
		if b:
			bad = []
			for z in b[ 'z' ]:
				o = max( self.H.hbAt( z, y ) for y in [ self.boat[ 'deckY' ] + k * 0.1 for k in range( 9 ) ] )
				if o < b[ 'x' ] + 0.1 + 0.01: bad.append( ( z, round( o, 3 ) ) )
			self.notes.append( 'swivels inside the outer face: %s' % ( 'ok' if not bad else bad ) )

	def bulwarks( self, inner = 'M_NavalSheerStripe', cap = 'M_NavalBlackPaint', t = 0.18 ):
		if self.lod == 2: return
		self.H.inner( self.mb, t, inner, cap )
		if self.lod == 0:
			# stanchions (timberheads) along the inside of the bulwarks, the rail's frames
			H = self.H
			x = H.xA + 0.9
			while x < H.xF - 1.6:
				if not H.in_gap( x ) and not H.in_gap( x + 0.1 ) and not H.in_gap( x - 0.1 ):
					yd = self.sideAt( x, 1.0 ); yr = self.rail( x )
					w = H.hbAt( x, yd + 0.5 ) - t
					if w > 0.4 and yr - yd > 0.4:
						for side in ( 1, - 1 ):
							box( self.mb, ( x, side * ( w - 0.05 ), ( yd + yr ) / 2 ), ( 0.12, 0.1, yr - yd ), 'M_NavalSparTimber', skip = ( '-z', '+z', '+y' if side > 0 else '-y' ) )
				x += 0.8

	def decks( self, t = 0.18 ):
		mb, H = self.mb, self.H
		if self.kind in DATA[ 'layout' ]:
			Lay = DATA[ 'layout' ][ self.kind ]
			for s in Lay[ 'raw' ]:
				deck_quads( mb, H, s[ 'z0' ], s[ 'z1' ], s[ 'y' ], s.get( 'x0', - 4 ), s.get( 'x1', 4 ), step = [ 0.5, 1.0, 3.0 ][ self.lod ], t = t )
			for r in Lay[ 'ramps' ]:
				z0, z1 = min( r[ 'from' ], r[ 'to' ] ), max( r[ 'from' ], r[ 'to' ] )
				yAt = lambda x, r = r: lerp( r[ 'yFrom' ], r[ 'yTo' ], ( x - r[ 'from' ] ) / ( r[ 'to' ] - r[ 'from' ] ) )
				for sgn in ( ( 1, - 1 ) if r.get( 'mirror' ) else ( 1, ) ):
					w0, w1 = sorted( ( sgn * r[ 'x0' ], sgn * r[ 'x1' ] ) )
					deck_quads( mb, H, z0, z1, 0, w0, w1, yAt = yAt, step = 0.5 )
					if self.lod < 2:
						# the ramp's open sides down to the deck (timber cheeks)
						for w in ( w0, w1 ):
							n = 6
							for i in range( n ):
								xa, xb = lerp( z0, z1, i / n ), lerp( z0, z1, ( i + 1 ) / n )
								mb.f( [ ( xa, w, self.deckY ), ( xb, w, self.deckY ), ( xb, w, yAt( xb ) ), ( xa, w, yAt( xa ) ) ], 'M_NavalSparTimber', facing = ( 0, 1 if w > 0 else - 1, 0 ) )
			# risers where a full-width level steps
			xs = [ - self.L / 2 + i * 0.02 for i in range( int( self.L / 0.02 ) + 1 ) ]
			for i in range( len( xs ) - 1 ):
				a, b = self.levelAt( xs[ i ] ), self.levelAt( xs[ i + 1 ] )
				if abs( a - b ) > 0.03:
					x = ( xs[ i ] + xs[ i + 1 ] ) / 2
					full = lambda xx: max( [ s[ 'y' ] for s in Lay[ 'raw' ] if s[ 'z0' ] - 1e-6 <= xx <= s[ 'z1' ] + 1e-6 and s.get( 'x0', - 4 ) <= - 1 and s.get( 'x1', 4 ) >= 1 ] or [ self.deckY ] )
					fa, fb = full( xs[ i ] ), full( xs[ i + 1 ] )
					if abs( fa - fb ) > 0.03:
						riser( mb, H, x, min( fa, fb ), max( fa, fb ), - 4, 4, 1 if fa > fb else - 1, mat = 'M_NavalSparTimber', t = t )
		else:
			c = self.c
			decks = c.get( 'decks' ) or [ { 'z0': - self.L / 2, 'z1': self.L / 2, 'y': c[ 'deck' ] } ]
			main = [ { 'z0': - self.L / 2, 'z1': self.L / 2, 'y': c[ 'deck' ] } ]
			for s in decks:
				deck_quads( mb, H, max( s[ 'z0' ], H.xS( s[ 'y' ] ) ), min( s[ 'z1' ], H.xB( s[ 'y' ] ) ), s[ 'y' ], - 5, 5, step = [ 0.5, 1.0, 3.0 ][ self.lod ], t = t )
			for s in decks:
				for x, f in ( ( s[ 'z0' ], - 1 ), ( s[ 'z1' ], 1 ) ):
					if s[ 'y' ] > c[ 'deck' ] + 0.05 and H.xS( s[ 'y' ] ) + 0.3 < x < H.xB( s[ 'y' ] ) - 0.3:
						riser( mb, H, x, c[ 'deck' ], s[ 'y' ], - 5, 5, f, mat = self.band if self.navy else 'M_NavalSheerStripe', t = t )

	def stern( self, windows = 4, wy = None, lanterns = 1, galleries = False, taffrail = True ):
		mb, H = self.mb, self.H
		self.sternBoard = getattr( self, 'sternBoard', self.band )
		yr = self.rail( H.xA )
		if self.lod < 2 and windows:
			y0, y1 = wy or ( self.levelAt( H.xA + 0.5 ) - 0.85, self.levelAt( H.xA + 0.5 ) - 0.25 )
			stern_windows( mb, H, windows, y0, y1 )
		# the taffrail: an arched board over the transom top, gilt along its edge; the lanterns on it (one at the crown, a pair
		# on the quarters)
		hw = H.hbAt( H.xS( yr - 0.1 ) + 0.05, yr - 0.1 )
		arch = 0.35 + 0.02 * self.L
		top = lambda s: yr + ( arch * max( 0.0, 1 - s * s ) ** 0.7 if taffrail else 0.0 )
		if self.lod < 2 and taffrail:
			K = 12
			for k in range( K ):
				sa, sb = 1 - 2 * k / K, 1 - 2 * ( k + 1 ) / K
				xa, xb = H.transom_x( yr, sa ) - 0.02, H.transom_x( yr, sb ) - 0.02
				ya, yb = sa * hw * 0.98, sb * hw * 0.98
				q = [ ( xa, ya, yr - 0.1 ), ( xb, yb, yr - 0.1 ), ( xb, yb, top( sb ) ), ( xa, ya, top( sa ) ) ]
				mb.f( q, self.sternBoard, facing = ( - 1, 0, 0 ), uvs = [ ( p[ 1 ] / 4, p[ 2 ] / 2 ) for p in q ] )
				mb.f( [ ( p[ 0 ] + 0.08, p[ 1 ], p[ 2 ] ) for p in q ], 'M_NavalSheerStripe', facing = ( 1, 0, 0 ) )
				cyl( mb, ( xa + 0.03, ya, top( sa ) ), ( xb + 0.03, yb, top( sb ) ), 0.05, 0.05, 'M_NavalAgedBrass', n = 5, cap0 = k == 0, cap1 = k == K - 1 )
		for i in range( lanterns ):
			s = 0.0 if lanterns == 1 else ( i - ( lanterns - 1 ) / 2 ) / ( ( lanterns - 1 ) / 2 ) * 0.8
			ly = s * hw
			lx = H.transom_x( yr, s ) - 0.32
			lz = top( s )
			if self.lod < 2: box( mb, ( lx + 0.16, ly, lz + 0.02 ), ( 0.36, 0.06, 0.06 ), 'M_NavalIron' )
			lantern( mb, lx, ly, lz + 0.05, s = 0.36 if abs( s ) < 0.1 else 0.28 )
		# the rudder on the sternpost, its head through the counter
		if self.lod < 2:
			yT = H.yTuck
			xp = H.xS( - self.d * 0.5 )
			pts = [ ( xp - 0.02, - self.d + 0.05 ), ( xp - 0.75, - self.d + 0.2 ), ( xp - 0.6, yT ), ( xp - 0.05, yT + 0.4 ) ]
			for side in ( 1, - 1 ):
				mb.f( [ ( p[ 0 ], side * 0.09, p[ 1 ] ) for p in pts ], 'M_NavalHullTar', facing = ( 0, side, 0 ) )
			mb.f( [ ( pts[ 1 ][ 0 ], 0.09, pts[ 1 ][ 1 ] ), ( pts[ 1 ][ 0 ], - 0.09, pts[ 1 ][ 1 ] ), ( pts[ 2 ][ 0 ], - 0.09, pts[ 2 ][ 1 ] ), ( pts[ 2 ][ 0 ], 0.09, pts[ 2 ][ 1 ] ) ], 'M_NavalHullTar', facing = ( - 1, 0, 0 ) )
		if galleries and self.lod < 2:
			# quarter galleries: a boxy bay with lights on each quarter
			for side in ( 1, - 1 ):
				gx = H.xA + 1.6
				y0 = self.levelAt( gx ) - 1.4
				hb = H.hbAt( gx, y0 + 0.6 )
				box( mb, ( gx, side * ( hb + 0.22 ), y0 + 0.6 ), ( 1.8, 0.5, 1.2 ), self.trim )
				box( mb, ( gx, side * ( hb + 0.5 ), y0 + 0.7 ), ( 1.2, 0.04, 0.5 ), 'M_NavalWindow' )
				box( mb, ( gx, side * ( hb + 0.25 ), y0 + 1.26 ), ( 2.0, 0.56, 0.12 ), 'M_NavalAgedBrass' )
				box( mb, ( gx, side * ( hb + 0.2 ), y0 - 0.06 ), ( 1.6, 0.42, 0.12 ), 'M_NavalAgedBrass' )

	def head( self, knee = 1.3, fig = True, catheads = True, anchors = True ):
		"""the cutwater knee under the bowsprit, a figurehead, the catheads with the anchors"""
		mb, H = self.mb, self.H
		if self.lod == 2: return
		yh = self.rail( H.xF ) - 0.5
		xs = H.xB( 0.4 )
		pts = [ ( H.xB( 0.2 ) - 0.1, 0.2 ), ( H.xB( 1.4 ) + knee * 0.55, 1.3 ), ( H.xB( yh ) + knee, yh - 0.25 ), ( H.xB( yh ) + knee * 0.75, yh + 0.08 ), ( H.xB( yh ) - 0.05, yh ) ]
		for side in ( 1, - 1 ):
			mb.f( [ ( p[ 0 ], side * 0.08, p[ 1 ] ) for p in pts ], self.trim, facing = ( 0, side, 0 ) )
		for i in range( len( pts ) - 1 ):
			a, b = pts[ i ], pts[ i + 1 ]
			mb.f( [ ( a[ 0 ], 0.08, a[ 1 ] ), ( a[ 0 ], - 0.08, a[ 1 ] ), ( b[ 0 ], - 0.08, b[ 1 ] ), ( b[ 0 ], 0.08, b[ 1 ] ) ], 'M_NavalAgedBrass' if i == 2 else self.trim, facing = ( b[ 1 ] - a[ 1 ], 0, - ( b[ 0 ] - a[ 0 ] ) ) )
		if fig:
			fx, fz = H.xB( yh ) + knee * 0.85, yh - 0.1
			sphere( mb, ( fx + 0.05, 0, fz + 0.32 ), 0.17, 'M_NavalAgedBrass', 8, 5 )
			cyl( mb, ( fx - 0.15, 0, fz - 0.25 ), ( fx + 0.05, 0, fz + 0.18 ), 0.16, 0.12, 'M_NavalAgedBrass', n = 8 )
		# head rails: from the bow's sides forward to the knee
		for side in ( 1, - 1 ):
			a = Vector( ( H.xB( yh ) - 1.4, side * H.hbAt( H.xB( yh ) - 1.4, yh - 0.3 ), yh - 0.3 ) )
			b = Vector( ( H.xB( yh ) + knee * 0.7, side * 0.1, yh - 0.15 ) )
			cyl( mb, a, b, 0.05, 0.04, self.trim, n = 5 )
		if catheads:
			for side in ( 1, - 1 ):
				cx = H.xB( yh ) - 1.2
				cy = H.hbAt( cx, yh )
				a = Vector( ( cx - 0.3, side * ( cy - 0.3 ), yh + 0.25 ) ); b = Vector( ( cx + 0.45, side * ( cy + 0.75 ), yh + 0.4 ) )
				box( mb, ( ( a + b ) / 2 ), ( ( b - a ).length, 0.2, 0.2 ), 'M_NavalBlackPaint', r = ( 0, 0, side * math.atan2( abs( b.y - a.y ), b.x - a.x ) ) )
				if anchors:
					anchor( mb, b.x - 0.05, side * ( abs( b.y ) - 0.05 ), b.z - 0.15, side, s = 0.65 + 0.03 * self.L / 10 )

	def bowsprit( self, length, rise, r0, jib = 0.0, heel = 2.0 ):
		"""the bowsprit from its heel inboard through the stem head, and a jib-boom beyond; -> ( tip, jib tip )"""
		mb, H = self.mb, self.H
		yh = self.rail( H.xF ) - 0.25
		x0 = H.xB( yh ) - heel
		a = Vector( ( x0, 0, yh - 0.1 ) )
		dirn = Vector( ( 1, 0, math.tan( math.radians( rise ) ) ) ).normalized()
		tip = Vector( ( H.xB( yh ), 0, yh + 0.1 ) ) + dirn * length
		cyl( mb, a, tip, r0, r0 * 0.6, 'M_NavalSparTimber', n = [ 10, 6, 4 ][ self.lod ] )
		jt = None
		if jib > 0:
			j0 = tip - dirn * length * 0.45 + Vector( ( 0, 0, r0 * 1.4 ) )
			jt = tip + dirn * jib + Vector( ( 0, 0, r0 * 1.2 ) )
			cyl( mb, j0, jt, r0 * 0.55, r0 * 0.35, 'M_NavalSparTimber', n = [ 8, 5, 4 ][ self.lod ] )
			if self.lod < 2: box( mb, tip + Vector( ( 0, 0, r0 * 0.6 ) ), ( 0.3, r0 * 2.6, r0 * 3.2 ), 'M_NavalBlackPaint' )
		if self.lod < 2:
			# the bobstay to the cutwater, the bowsprit shrouds to the bows
			rope( mb, tip, ( H.xB( 0.4 ) + 0.3, 0, 0.45 ), 0.03 )
			for side in ( 1, - 1 ):
				rope( mb, tip - dirn * 0.4, ( H.xB( 1.0 ) - 0.6, side * H.hbAt( H.xB( 1.0 ) - 0.6, 1.0 ), 1.0 ), 0.022 )
		return tip, jt or tip

	def channels_and_shrouds( self, x, z_head, count, top_z = None, out = 0.45, ratlines = True, fan = 0.32 ):
		"""the channel each side at the mast x, the lower shrouds from the masthead, ratlines"""
		mb, H = self.mb, self.H
		yc = self.rail( x ) - 0.4
		for side in ( 1, - 1 ):
			w = channel( mb, H, x - count * 0.45 * 0.5 - 0.3, x + count * 0.45 * 0.5 + 0.3, yc, side, out = out ) if self.lod < 2 else H.hbAt( x, yc ) + out
			shrouds( mb, x, z_head, ( x - 0.25, w, yc + 0.05 ), side, count if self.lod < 2 else 2, ratlines = ratlines and self.lod == 0, dead = self.lod == 0, fan = fan, r = 0.024 )

	def topmast_shrouds( self, x, z_top, z_head, half, count = 3 ):
		if self.lod == 2: return
		for side in ( 1, - 1 ):
			shrouds( self.mb, x, z_head, ( x - 0.15, half, z_top + 0.06 ), side, count, ratlines = self.lod == 0, dead = False, fan = 0.2, r = 0.017, rat_step = 0.38 )

	def gun_ports( self, xs, y, h = 0.5, w = 0.55, guns = True, open_ = True, lidOut = None ):
		if self.lod == 2: return
		for x in xs:
			for side in ( 1, - 1 ):
				self.H.port( self.mb, x, y, w, h, side, lid = lidOut or self.trim, lidIn = 'M_NavalSparTimber', frame = 'M_NavalBlackPaint', open_ = open_ and self.lod == 0, gun = guns )

	def flagstaff( self, x, z0, z1 ):
		cyl( self.mb, ( x, 0, z0 ), ( x, 0, z1 ), 0.05, 0.035, 'M_NavalSparTimber', n = 6 )

	def mast_fife( self, x ):
		"""the fife rail round a mast foot with belaying pins (the tabernacle ShipDecks makes solid)"""
		if self.lod == 2: return
		z = self.levelAt( x )
		for dx, dy, l, w in ( ( 0.4, 0, 0.1, 0.9 ), ( - 0.4, 0, 0.1, 0.9 ), ( 0, 0.4, 0.9, 0.1 ), ( 0, - 0.4, 0.9, 0.1 ) ):
			box( self.mb, ( x + dx, dy, z + 0.75 ), ( l, w, 0.08 ), 'M_NavalSparTimber' )
		for dx in ( - 0.4, 0.4 ):
			for dy in ( - 0.4, 0.4 ):
				box( self.mb, ( x + dx, dy, z + 0.38 ), ( 0.1, 0.1, 0.76 ), 'M_NavalSparTimber', skip = ( '-z', ) )
		if self.lod == 0:
			for k in range( 6 ):
				yy = - 0.3 + 0.12 * k
				cyl( self.mb, ( x + 0.4, yy, z + 0.65 ), ( x + 0.4, yy, z + 0.95 ), 0.02, 0.028, 'M_NavalSparTimber', n = 4, cap0 = False )
				cyl( self.mb, ( x - 0.4, yy, z + 0.65 ), ( x - 0.4, yy, z + 0.95 ), 0.02, 0.028, 'M_NavalSparTimber', n = 4, cap0 = False )
		box( self.mb, ( x, 0, z + 0.12 ), ( 0.7, 0.7, 0.24 ), 'M_NavalSparTimber', skip = ( '-z', ) )

	def helm( self, wheel_c, double = False, mat = 'M_NavalSparTimber', hub = 'M_NavalAgedBrass', binnacle = True ):
		"""the wheel (its own pieces, carved out by the game) on a stand that reaches the deck, the binnacle ahead"""
		mb = self.mb
		x, y, z = wheel_c
		deck = self.levelAt( x )
		if self.lod == 2: return
		if double:
			for dx in ( - 0.32, 0.32 ):
				ship_wheel( mb, ( x + dx, y, z ), ( 1, 0, 0 ), mat = mat, hub = mat )
			cyl( mb, ( x - 0.3, y, z ), ( x + 0.3, y, z ), 0.05, 0.05, mat, n = 8 )
		else:
			ship_wheel( mb, ( x, y, z ), ( 1, 0, 0 ), mat = mat, hub = hub if mat == 'M_NavalSparTimber' else mat )
			# the axle stub toward the stand and the hub nut aft (inside the wheel's slab: they turn with it; symmetric, so the
			# carved wheel's centre is the axle's)
			cyl( mb, ( x + 0.07, y, z ), ( x + 0.165, y, z ), 0.04, 0.04, hub if mat == 'M_NavalSparTimber' else mat, n = 8 )
			cyl( mb, ( x - 0.165, y, z ), ( x - 0.07, y, z ), 0.04, 0.04, hub if mat == 'M_NavalSparTimber' else mat, n = 8 )
		# the stand: a post from the deck to the axle, clear of the wheel's slab (+-0.17 along the axle)
		ax0 = x + ( 0.48 if double else 0.2 )
		box( mb, ( ax0 + 0.06, 0, ( deck + z - 0.12 ) / 2 ), ( 0.16, 0.24, z - 0.12 - deck ), 'M_NavalSparTimber', skip = ( '-z', ) )
		cyl( mb, ( ax0 - 0.02, 0, z ), ( ax0 + 0.14, 0, z ), 0.07, 0.07, 'M_NavalAgedBrass', n = 8 )
		box( mb, ( ax0 + 0.06, 0, deck + 0.05 ), ( 0.5, 0.6, 0.1 ), 'M_NavalSparTimber', skip = ( '-z', ) )
		if binnacle and self.lod == 0:
			bx = x + ( 1.25 if double else 0.95 )
			box( mb, ( bx, 0, deck + 0.5 ), ( 0.45, 0.45, 1.0 ), 'M_NavalSparTimber', skip = ( '-z', ) )
			sphere( mb, ( bx, 0, deck + 1.05 ), 0.2, 'M_NavalAgedBrass', 8, 4 )

	def finish_notes( self ):
		return self.notes

# ------------------------------------------------------------------ the rigs

# The square yards are braced round BRACE radians about their mast (the port yardarm forward: on a reach, and it shows the
# canvas from every side); the game's sail shader takes the same angle for the square sails' belly (Models.js SAIL_BRACE).
BRACE = 0.42

def ya( x_m, p ):
	"""a point of the square rig at mast x_m, braced round"""
	p = Vector( p ); c, s = math.cos( BRACE ), math.sin( BRACE )
	dx = p.x - x_m
	return Vector( ( x_m + dx * c - p.y * s, dx * s + p.y * c, p.z ) )

def sq_sail( S, x, y_head, half_head, y_foot, half_foot, depth, nu = 14, nv = 12 ):
	"""a square sail on the fore side of the mast at x: head bent to the yard, foot to the yard below (or sheeted)"""
	nu, nv = [ ( nu, nv ), ( 5, 4 ), ( 2, 2 ) ][ S.lod ]
	quad_sail( S.mb, ya( x, ( x + 0.22, half_head, y_head - 0.12 ) ), ya( x, ( x + 0.22, - half_head, y_head - 0.12 ) ), ya( x, ( x + 0.3, half_foot, y_foot ) ), ya( x, ( x + 0.3, - half_foot, y_foot ) ), nu, nv, depth, 0, ( math.cos( BRACE ), math.sin( BRACE ), 0 ) )

def fa_sail( S, throat, peak, tack, clew, depth, nu = 13, nv = 12 ):
	nu, nv = [ ( nu, nv ), ( 5, 4 ), ( 2, 2 ) ][ S.lod ]
	quad_sail( S.mb, throat, peak, tack, clew, nu, nv, depth, 1, ( 0, - 1, 0 ) )

def jib( S, head, tack, clew, depth, n = 12 ):
	nu, nv = [ ( n, n ), ( 4, 4 ), ( 2, 2 ) ][ S.lod ]
	tri_sail( S.mb, head, tack, clew, nu, nv, depth, ( 0, - 1, 0 ) )

def yard_set( S, x, z, half, r ):
	cap = S.c[ 'mast' ] - 0.15
	n = [ 8, 6, 4 ][ S.lod ]
	c = ya( x, ( x + 0.15, 0, z ) )
	for side in ( 1, - 1 ):
		cyl( S.mb, c, ya( x, ( x + 0.15, side * half, z ) ), r, r * 0.45, 'M_NavalSparTimber', n = n, cap0 = False )
	if S.lod == 0:
		# lifts from the yardarms to the masthead above, footropes under the yard
		for side in ( 1, - 1 ):
			rope( S.mb, ya( x, ( x + 0.15, side * half * 0.95, z ) ), ( x, side * 0.1, min( cap, z + min( 0.9, half * 0.3 ) ) ), 0.014 )
			rope( S.mb, ya( x, ( x + 0.25, side * half * 0.92, z - 0.05 ) ), ya( x, ( x + 0.25, side * 0.3, z - 0.05 ) ), 0.014, sag = 0.45 )

def furled( S, x, z, half, r = 0.16 ):
	"""a sail furled on its yard"""
	if S.lod == 2: return
	cyl( S.mb, ya( x, ( x + 0.22, half * 0.9, z - 0.08 ) ), ya( x, ( x + 0.22, - half * 0.9, z - 0.08 ) ), r * 0.6, r * 0.6, 'M_NavalFurledCanvas', n = 6 )
	cyl( S.mb, ya( x, ( x + 0.22, 0.6, z - 0.12 ) ), ya( x, ( x + 0.22, - 0.6, z - 0.12 ) ), r, r, 'M_NavalFurledCanvas', n = 6 )

def mast_parts( S, x, foot, lower, top_z, topmast, tg = None, r = 0.32, toplen = 1.6, topw = 2.3 ):
	"""lower mast, top, topmast (and topgallant): -> the heights ( lower head, topmast head, t'gallant head )"""
	mb = S.mb
	n = [ 12, 8, 4 ][ S.lod ]
	cyl( mb, ( x, 0, foot - 0.3 ), ( x, 0, lower ), r, r * 0.78, 'M_NavalSparTimber', n = n )
	if S.lod < 2:
		top( mb, x, top_z, topw, toplen )
		box( mb, ( x + 0.2, 0, lower - 0.05 ), ( 0.75, 0.5, 0.22 ), 'M_NavalBlackPaint' ) # the cap
	cyl( mb, ( x + 0.28, 0, top_z - 1.2 ), ( x + 0.28, 0, topmast ), r * 0.55, r * 0.4, 'M_NavalSparTimber', n = n )
	if tg:
		if S.lod < 2:
			box( mb, ( x + 0.28, 0, topmast - 0.6 ), ( 0.5, 1.6, 0.1 ), 'M_NavalSparTimber' ) # crosstrees
		cyl( mb, ( x + 0.42, 0, topmast - 0.9 ), ( x + 0.42, 0, tg ), r * 0.3, r * 0.2, 'M_NavalSparTimber', n = n )
		sphere( mb, ( x + 0.42, 0, tg - r * 0.25 ), r * 0.25, 'M_NavalSparTimber', 6, 3 ) if S.lod == 0 else None
	return lower, topmast, tg

# ------------------------------------------------------------------ the ships

def build_trawler( lod ):
	S = Ship( 'trawler', lod )
	bands = [ ( 0.12, 'M_NavalHullTar' ), ( 0.24, 'M_NavalBlackPaint' ), ( 2.05, 'M_NavalHullPlank' ), ( 99, 'M_NavalHullPlank' ) ]
	H = S.hull( { 'Bh': 3.08, 'um': 0.47, 'aft': ( 2.2, 1.0 ), 'fore': ( 2.7, 1.8 ), 'transom': 0.62, 'tuck': 0.9, 'counter': 1.15, 'stemRake': 0.45,
		'forefoot': 1.2, 'yMB': 1.9, 'tumble': 0.03, 'sharp': 2.2, 'fine': 1.2, 'transomRake': 0.12, 'sternMat': 'M_NavalHullPlank' }, DATA[ 'bulwark' ], sweep = 0.3, bands = bands )
	mb = S.mb
	S.check_lines()
	if lod < 2:
		H.strake( mb, 1.9, 2.12, 'M_NavalBlackPaint', out = 0.06 )
		# the white sheer strake following the rail
		rail_band( S, - 0.36, - 0.12, 'M_NavalSheerStripe', out = 0.025 )
	S.bulwarks( inner = 'M_NavalSheerStripe', cap = 'M_NavalSparTimber' )
	S.decks()
	S.stern( windows = 0, lanterns = 1, taffrail = False )
	S.head( knee = 0.35, fig = False, anchors = True )
	tip, _ = S.bowsprit( 3.2, 6, 0.13, heel = 1.6 )
	deckY = S.deckY
	# ---- the wheelhouse on the stern platform (3.0 m): walls 0.3 m thick at x +-1.6..1.9, aft wall at -8..-7.7, front open
	pz = 3.0
	x0, x1 = - 8.0, - 4.55
	if lod < 2:
		for side in ( 1, - 1 ):
			box( mb, ( ( - 7.85 + x1 ) / 2, side * 1.75, pz + 1.3 ), ( x1 + 7.85, 0.3, 2.6 ), 'M_NavalSheerStripe' )
			# windows along the sides, a darker sill line
			for wx in ( - 7.0, - 5.6 ):
				box( mb, ( wx, side * 1.91, pz + 1.85 ), ( 0.9, 0.04, 0.62 ), 'M_NavalWindow' )
				box( mb, ( wx, side * 1.92, pz + 1.5 ), ( 1.0, 0.05, 0.06 ), 'M_NavalSparTimber' )
			# corner posts at the open front, the front windscreen over head height
			box( mb, ( x1 - 0.08, side * 1.72, pz + 1.3 ), ( 0.16, 0.36, 2.6 ), 'M_NavalSparTimber' )
		box( mb, ( - 7.85, 0, pz + 1.3 ), ( 0.3, 3.8, 2.6 ), 'M_NavalSheerStripe' )
		box( mb, ( - 8.02, 0, pz + 1.9 ), ( 0.04, 1.6, 0.6 ), 'M_NavalWindow' )
		box( mb, ( x1 - 0.06, 0, pz + 2.35 ), ( 0.14, 3.4, 0.5 ), 'M_NavalSheerStripe' )
		box( mb, ( x1 - 0.14, 0, pz + 2.3 ), ( 0.04, 3.0, 0.32 ), 'M_NavalWindow' )
		# the roof with an overhang, a rail round it, the stack and the dinghy on it
		box( mb, ( ( x0 + x1 ) / 2, 0, pz + 2.68 ), ( x1 - x0 + 0.5, 4.1, 0.16 ), 'M_NavalSparTimber' )
		if lod == 0:
			for side in ( 1, - 1 ):
				cyl( mb, ( x0, side * 1.95, pz + 3.05 ), ( x1, side * 1.95, pz + 3.05 ), 0.03, 0.03, 'M_NavalAgedBrass', n = 5 )
				for k in range( 4 ):
					xx = lerp( x0, x1, k / 3 )
					cyl( mb, ( xx, side * 1.95, pz + 2.76 ), ( xx, side * 1.95, pz + 3.05 ), 0.025, 0.025, 'M_NavalAgedBrass', n = 4 )
			boat( mb, - 5.65, 0, pz + 2.82, L = 2.6, B = 1.1, D = 0.4 )
		cyl( mb, ( - 7.3, 1.0, pz + 2.7 ), ( - 7.3, 1.0, pz + 4.6 ), 0.22, 0.2, 'M_NavalIron', n = 10 )
		cyl( mb, ( - 7.3, 1.0, pz + 4.6 ), ( - 7.3, 1.0, pz + 4.85 ), 0.24, 0.24, 'M_NavalBlackPaint', n = 10 )
		# lifebuoys on the wheelhouse sides
		if lod == 0:
			for side in ( 1, - 1 ):
				torus( mb, ( - 6.3, side * 1.94, pz + 1.0 ), 0.3, 0.07, 'M_NavalSheerStripe', axis = ( 0, 1, 0 ), nu = 12, nv = 4 )
	else:
		box( mb, ( ( x0 + x1 ) / 2, 0, pz + 1.35 ), ( x1 - x0, 3.8, 2.7 ), 'M_NavalSheerStripe' )
	# the helm inside: the wheel at the helm + 0.55, 1.05 over the platform
	hz = S.boat[ 'helm' ][ 'z' ]
	S.helm( ( hz + 0.55, 0, pz + 1.05 ) )
	# ---- the rig: a ketch, the main at 1.3 with a gaff main and a jib, a mizzen aft of the wheelhouse; barked sails
	mx = DATA[ 'layout' ][ 'trawler' ][ 'masts' ][ 0 ][ 'z' ]
	truck = S.c[ 'mast' ]
	cyl( mb, ( mx, 0, deckY - 0.3 ), ( mx, 0, truck - 2.6 ), 0.24, 0.19, 'M_NavalSparTimber', n = [ 12, 8, 4 ][ lod ] )
	cyl( mb, ( mx + 0.2, 0, truck - 3.6 ), ( mx + 0.2, 0, truck ), 0.11, 0.07, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	if lod < 2: box( mb, ( mx + 0.1, 0, truck - 2.65 ), ( 0.6, 0.44, 0.16 ), 'M_NavalBlackPaint' )
	S.mast_fife( mx )
	throat, boom0 = Vector( ( mx - 0.25, 0, truck - 3.3 ) ), Vector( ( mx - 0.25, 0, deckY + 1.95 ) )
	peak, clew = Vector( ( mx - 4.2, 0, truck - 1.0 ) ), Vector( ( - 3.6, 0, deckY + 2.15 ) )
	cyl( mb, boom0, clew + Vector( ( - 0.3, 0, 0 ) ), 0.09, 0.07, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	cyl( mb, throat, peak + Vector( ( - 0.2, 0, 0.08 ) ), 0.08, 0.06, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	fa_sail( S, throat + Vector( ( - 0.05, 0, - 0.1 ) ), peak, boom0 + Vector( ( - 0.05, 0, 0.12 ) ), clew + Vector( ( 0, 0, 0.12 ) ), 0.35 )
	jib( S, ( mx + 0.25, 0, truck - 3.0 ), tip + Vector( ( - 0.2, 0, 0.1 ) ), ( mx + 2.4, 0, deckY + 1.45 ), 0.3 )
	S.channels_and_shrouds( mx, truck - 3.0, 3, ratlines = True )
	# the mizzen: a short mast through the counter abaft the wheelhouse, a small gaff sail sheeted to a bumkin
	zx = - 7.55
	zt = 9.6
	cyl( mb, ( zx, 0, pz + 2.7 ), ( zx, 0, zt ), 0.13, 0.09, 'M_NavalSparTimber', n = [ 10, 6, 4 ][ lod ] )
	mth, mpk = Vector( ( zx - 0.15, 0, zt - 0.6 ) ), Vector( ( zx - 2.3, 0, zt + 0.3 ) )
	mtk, mcl = Vector( ( zx - 0.15, 0, pz + 3.1 ) ), Vector( ( zx - 2.5, 0, pz + 3.2 ) )
	cyl( mb, mtk, mcl, 0.06, 0.05, 'M_NavalSparTimber', n = 6 )
	cyl( mb, mth, mpk, 0.05, 0.04, 'M_NavalSparTimber', n = 6 )
	fa_sail( S, mth, mpk, mtk + Vector( ( 0, 0, 0.1 ) ), mcl + Vector( ( 0, 0, 0.1 ) ), 0.2, nu = 6, nv = 5 )
	bump = Vector( ( zx - 2.6, 0, S.rail( H.xA ) + 0.1 ) )
	cyl( mb, ( H.xA + 0.6, 0, S.rail( H.xA ) + 0.05 ), bump, 0.05, 0.04, 'M_NavalSparTimber', n = 5 )
	if lod < 2:
		# stays and the main's running backstays; the mizzen's shrouds
		rope( mb, ( mx + 0.1, 0, truck - 2.9 ), ( H.xB( 3.3 ) - 0.1, 0, S.rail( H.xF ) - 0.1 ), 0.026 )
		rope( mb, ( mx + 0.2, 0, truck - 0.15 ), tip, 0.02 )
		rope( mb, ( mx - 0.1, 0, truck - 2.9 ), ( zx + 0.1, 0, zt - 0.2 ), 0.02 )
		for side in ( 1, - 1 ):
			rope( mb, ( zx, side * 0.08, zt - 0.4 ), ( zx + 0.3, side * H.hbAt( zx + 0.6, 3.6 ), S.rail( zx + 0.6 ) ), 0.018 )
			rope( mb, ( mx, side * 0.1, truck - 3.0 ), ( - 2.5, side * ( H.hbAt( - 2.5, 3.0 ) - 0.1 ), S.rail( - 2.5 ) ), 0.018 )
		rope( mb, clew, ( - 3.4, 0, 2.6 ), 0.018 )
		rope( mb, mcl, bump, 0.016 )
	# ---- the working deck: trawl gallows on the starboard rail fore and aft, otter boards, the net drum, the fish hold under a
	# tarp, fish boxes, the windlass
	if lod < 2:
		for gx in ( 4.6, - 2.6 ):
			yb = H.hbAt( gx, 3.0 ) - 0.1
			rz = S.rail( gx )
			for dx in ( - 0.35, 0.35 ):
				cyl( mb, ( gx + dx, - yb, deckY ), ( gx + dx, - yb - 0.25, rz + 1.3 ), 0.06, 0.06, 'M_NavalIron', n = 6 )
			cyl( mb, ( gx - 0.35, - yb - 0.25, rz + 1.3 ), ( gx + 0.35, - yb - 0.25, rz + 1.3 ), 0.06, 0.06, 'M_NavalIron', n = 6 )
			box( mb, ( gx, - yb - 0.45, rz + 0.2 ), ( 1.4, 0.12, 0.75 ), 'M_NavalSparTimber', r = ( 0.15, 0, 0 ) )
			box( mb, ( gx, - yb - 0.5, rz + 0.2 ), ( 1.45, 0.06, 0.12 ), 'M_NavalIron', r = ( 0.15, 0, 0 ) )
		# the net drum aft of the mast (axis across)
		dx = - 1.6
		cyl( mb, ( dx, - 1.1, deckY + 0.75 ), ( dx, 1.1, deckY + 0.75 ), 0.55, 0.55, 'M_NavalTarp', n = 14 )
		for s in ( - 1.15, 1.15 ):
			cyl( mb, ( dx, s - 0.04, deckY + 0.75 ), ( dx, s + 0.04, deckY + 0.75 ), 0.7, 0.7, 'M_NavalIron', n = 14 )
			box( mb, ( dx, s * 1.05, deckY + 0.4 ), ( 0.3, 0.12, 0.8 ), 'M_NavalIron', skip = ( '-z', ) )
		hatch( mb, 4.3, 0, deckY, 2.2, 1.8, cover = 'M_NavalTarp' )
		if lod == 0:
			for i, ( fx, fy ) in enumerate( ( ( 2.9, 1.7 ), ( 3.5, 1.75 ), ( 2.95, 1.7 ), ( - 0.2, - 1.9 ), ( 0.4, - 1.9 ) ) ):
				crate( mb, fx, fy, deckY + ( 0.32 if i == 2 else 0 ), s = 0.55, h = 0.32, a = 0.1 * i )
			# fish boxes stacked by the hold, the net heaped over the drum's side, a ladder up the wheelhouse back
			for i in range( 3 ):
				for j in range( 2 ):
					for k in range( 2 if ( i + j ) % 2 == 0 else 1 ):
						crate( mb, 2.4 + i * 0.62, - 1.75 + j * 0.5, deckY + k * 0.3, s = 0.58, h = 0.28, a = 0.04 * ( i - j ) )
			heap( mb, - 1.6, 1.25, deckY + 0.05, 1.5, 0.9, 0.55 )
			heap( mb, 5.6, 1.6, deckY + 0.05, 1.0, 0.7, 0.35 )
			for side in ( 1, - 1 ):
				box( mb, ( - 7.86 - 0.05, side * 0.32, pz + 1.35 ), ( 0.06, 0.06, 2.7 ), 'M_NavalIron' )
			for k in range( 8 ):
				box( mb, ( - 7.9, 0, pz + 0.3 + k * 0.32 ), ( 0.05, 0.62, 0.04 ), 'M_NavalIron' )
			barrel( mb, 6.6, - 1.3, deckY, r = 0.26, h = 0.75 )
			barrel( mb, 6.6, - 0.75, deckY, r = 0.26, h = 0.75 )
			coil( mb, 0.6, 1.4, deckY )
			coil( mb, - 3.0, - 1.6, deckY )
		# the windlass at the bow
		wx = DATA[ 'layout' ][ 'trawler' ][ 'deckEnd' ] - 0.6
		cyl( mb, ( wx, - 0.85, deckY + 0.45 ), ( wx, 0.85, deckY + 0.45 ), 0.2, 0.2, 'M_NavalSparTimber', n = 10 )
		bitts( mb, wx, 0, deckY, h = 0.75, w = 2.0 )
	# the house flag at the main truck, the ensign on the mizzen gaff
	flag( mb, ( mx + 0.15, 0, truck - 0.05 ), 1.1, 0.7, ( 0, 0 ), mat = 'M_NavalFlagCanvas' )
	flag( mb, ( mpk.x - 0.05, 0, mpk.z + 0.02 ), 0.9, 0.55, ( 0, 0 ), mat = 'M_NavalFlagCanvas' )
	return S, ( tip.x, min( clew.x, bump.x, mpk.x ) )

def heap( mb, x, y, z, l, w, h, nu = 12, nv = 7, mat = 'M_NavalTarp' ):
	"""a lumpy heap (a net, a tarpaulin over gear): a squashed noisy dome"""
	import random
	rnd = random.Random( int( x * 100 + y * 10 ) )
	bump = [ [ 1 + 0.18 * ( rnd.random() - 0.5 ) for i in range( nu ) ] for j in range( nv + 1 ) ]
	P = lambda i, j: Vector( ( x + l / 2 * math.cos( 2 * math.pi * i / nu ) * math.sin( math.pi / 2 * j / nv ) * bump[ j ][ i % nu ], y + w / 2 * math.sin( 2 * math.pi * i / nu ) * math.sin( math.pi / 2 * j / nv ) * bump[ j ][ i % nu ], z + h * math.cos( math.pi / 2 * j / nv ) * ( 0.8 + 0.4 * bump[ j ][ ( i + 3 ) % nu ] - 0.4 ) ) )
	for j in range( nv ):
		for i in range( nu ):
			q = [ P( i, j ), P( i + 1, j ), P( i + 1, j + 1 ), P( i, j + 1 ) ]
			mb.f( q, mat, facing = sum( q, Vector() ) / 4 - Vector( ( x, y, z ) ), smooth = True )

def rail_band( S, d0, d1, mat, out = 0.03, nu = 60 ):
	"""a painted / moulded band at rail( x ) + d0 .. d1, standing `out` proud"""
	H = S.H
	xa = H.xS( S.rail( H.xA ) + d1 ) + 0.06; xb = H.xB( S.rail( H.xF ) + d1 ) - 0.12
	xs = [ lerp( xa, xb, 0.5 - 0.5 * math.cos( math.pi * i / nu ) ) for i in range( nu + 1 ) ]
	for side in ( 1, - 1 ):
		P = []
		for x in xs:
			y0, y1 = S.rail( x ) + d0, S.rail( x ) + d1
			a, b = H.hbAt( x, y0 ), H.hbAt( x, y1 )
			P.append( ( Vector( ( x, side * ( a + out ), y0 ) ), Vector( ( x, side * ( b + out ), y1 ) ), Vector( ( x, side * a, y0 ) ), Vector( ( x, side * b, y1 ) ) ) if a > 0.1 and b > 0.1 else None )
		for i in range( nu ):
			A, B = P[ i ], P[ i + 1 ]
			if not A or not B: continue
			S.mb.f( [ A[ 0 ], B[ 0 ], B[ 1 ], A[ 1 ] ], mat, facing = ( 0, side, 0 ), smooth = True, uvs = [ ( xs[ i ] / 4, 0 ), ( xs[ i + 1 ] / 4, 0 ), ( xs[ i + 1 ] / 4, 0.1 ), ( xs[ i ] / 4, 0.1 ) ] )
			S.mb.f( [ A[ 1 ], B[ 1 ], B[ 3 ], A[ 3 ] ], mat, facing = ( 0, 0, 1 ) )
			S.mb.f( [ A[ 0 ], A[ 2 ], B[ 2 ], B[ 0 ] ], mat, facing = ( 0, 0, - 1 ) )

def build_sloop( lod ):
	S = Ship( 'sloop', lod )
	bands = [ ( 0.12, 'M_NavalHullTar' ), ( 0.22, 'M_NavalBlackPaint' ), ( 99, 'M_NavalHullPlank' ) ]
	H = S.hull( { 'Bh': 2.68, 'um': 0.48, 'aft': ( 2.4, 1.0 ), 'fore': ( 3.2, 2.2 ), 'transom': 0.62, 'tuck': 0.55, 'counter': 1.0, 'stemRake': 0.95,
		'forefoot': 1.7, 'yMB': 1.7, 'tumble': 0.02, 'sharp': 2.0, 'fine': 1.6, 'transomRake': 0.55 }, DATA[ 'bulwark' ], sweep = 0.24, bands = bands )
	mb = S.mb
	S.check_lines()
	deckY = S.deckY
	if lod < 2:
		H.strake( mb, 1.62, 1.86, 'M_NavalBlackPaint', out = 0.06 )
		rail_band( S, - 0.42, - 0.24, 'M_NavalSheerStripe', out = 0.025 )
	S.bulwarks( inner = 'M_NavalSheerStripe', cap = 'M_NavalBlackPaint' )
	S.decks()
	S.stern( windows = 3, wy = ( 2.2, 2.65 ), lanterns = 1 )
	S.head( knee = 0.9, fig = True )
	tip, _ = S.bowsprit( 5.3, 9, 0.16, heel = 1.8 )
	# guns: the class stations (two a side at z +-2.4) through ports in the bulwark
	st = [ s for s in S.c[ 'stations' ] if s[ 'side' ] == 'port' ]
	S.gun_ports( [ s[ 'z' ] for s in st ], st[ 0 ][ 'y' ], h = 0.42, w = 0.46, guns = False, open_ = True )
	if lod < 2:
		for s in st:
			for side in ( 1, - 1 ):
				cannon( mb, s[ 'z' ], side * ( H.hbAt( s[ 'z' ], st[ 0 ][ 'y' ] ) + 1.25 - 1.6 ), deckY, side, length = 1.6, r = 0.11, carriage = lod == 0 )
	# the helm
	hz = S.boat[ 'helm' ][ 'z' ]; hd = S.boat[ 'helmDeckY' ]
	S.helm( ( hz + 0.55, 0, hd + 1.05 ) )
	# ---- the rig: a gaff sloop with a square topsail on the topmast, jib and staysail, the boom over the stern
	mx = DATA[ 'layout' ][ 'sloop' ][ 'masts' ][ 0 ][ 'z' ]
	truck = S.c[ 'mast' ]
	lower, tm, _ = mast_parts( S, mx, deckY, 8.7, 8.2, truck, r = 0.27, toplen = 1.0, topw = 1.6 )
	S.mast_fife( mx )
	throat, peak = Vector( ( mx - 0.28, 0, 7.9 ) ), Vector( ( mx - 6.6, 0, 10.4 ) )
	tack, clew = Vector( ( mx - 0.28, 0, 5.05 ) ), Vector( ( - 8.9, 0, 5.55 ) )
	cyl( mb, tack + Vector( ( 0, 0, - 0.1 ) ), clew + Vector( ( - 0.35, 0, - 0.08 ) ), 0.12, 0.08, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	cyl( mb, throat + Vector( ( 0, 0, 0.12 ) ), peak + Vector( ( - 0.15, 0, 0.1 ) ), 0.1, 0.07, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	fa_sail( S, throat, peak, tack, clew, 0.55 )
	# the square topsail between the crossjack yard (at the cap) and the topsail yard
	yard_set( S, mx + 0.1, 8.55, 4.3, 0.12 )
	yard_set( S, mx + 0.1, 10.85, 3.2, 0.09 )
	sq_sail( S, mx + 0.1, 10.85, 3.0, 8.62, 4.0, 0.45 )
	# headsails
	jib( S, ( mx + 0.35, 0, truck - 0.7 ), tip + Vector( ( - 0.3, 0, 0.12 ) ), ( mx + 3.6, 0, deckY + 1.6 ), 0.5 )
	sh = Vector( ( H.xB( 3.4 ) - 0.15, 0, S.rail( H.xF ) + 0.05 ) )
	jib( S, ( mx + 0.3, 0, lower - 0.3 ), sh + Vector( ( - 0.2, 0, 0.12 ) ), ( mx + 1.6, 0, deckY + 1.3 ), 0.4 )
	S.channels_and_shrouds( mx, lower - 0.35, 3 )
	S.topmast_shrouds( mx + 0.28, 8.2, truck - 0.5, 0.75, 2 )
	if lod < 2:
		rope( mb, ( mx + 0.3, 0, lower - 0.25 ), sh, 0.028 )
		rope( mb, ( mx + 0.35, 0, truck - 0.6 ), tip, 0.022 )
		for side in ( 1, - 1 ):
			# running backstays, braces of the topsail yard, the boom's sheet
			rope( mb, ( mx + 0.3, side * 0.1, truck - 0.7 ), ( - 3.5, side * ( H.hbAt( - 3.5, 3.0 ) - 0.05 ), S.rail( - 3.5 ) ), 0.016 )
			rope( mb, ya( mx + 0.1, ( mx + 0.25, side * 3.15, 10.85 ) ), ( - 1.5, side * ( H.hbAt( - 1.5, 3.0 ) - 0.05 ), S.rail( - 1.5 ) + 0.1 ), 0.013 )
			rope( mb, ya( mx + 0.1, ( mx + 0.25, side * 4.2, 8.55 ) ), ( - 0.8, side * ( H.hbAt( - 0.8, 3.0 ) - 0.05 ), S.rail( - 0.8 ) + 0.1 ), 0.013 )
		rope( mb, clew + Vector( ( 0.6, 0, 0 ) ), ( H.xA + 0.5, 0, S.rail( H.xA ) ), 0.02 )
		rope( mb, peak, ( mx + 0.2, 0, truck - 0.4 ), 0.016 )
	# deck: a hatch, the windlass, kegs, coils, a lantern on the mast
	if lod < 2:
		hatch( mb, 4.0, 0, deckY, 1.3, 1.2, grating = True )
		wx = DATA[ 'layout' ][ 'sloop' ][ 'deckEnd' ] - 0.55
		cyl( mb, ( wx, - 0.7, deckY + 0.42 ), ( wx, 0.7, deckY + 0.42 ), 0.17, 0.17, 'M_NavalSparTimber', n = 10 )
		bitts( mb, wx, 0, deckY, h = 0.7, w = 1.7 )
		if lod == 0:
			barrel( mb, 0.2, 1.55, deckY, r = 0.26, h = 0.75 )
			barrel( mb, - 0.35, 1.6, deckY, r = 0.24, h = 0.7 )
			crate( mb, 5.2, - 1.25, deckY, s = 0.6, a = 0.3 )
			coil( mb, 2.9, - 1.0, deckY )
			coil( mb, - 5.6, 1.2, S.boat[ 'helmDeckY' ] )
			for x in ( - 2.4, 2.4 ):
				for side in ( 1, - 1 ):
					pinrail( mb, x - 0.6, x + 0.6, side * ( H.hbAt( x, 2.6 ) - 0.32 ), deckY + 0.75, side, pins = 5 )
	# the black flag at the peak, a red pennant at the truck
	flag( mb, ( peak.x - 0.05, 0, peak.z + 0.05 ), 1.6, 1.05, ( 0, 1 ) )
	flag( mb, ( mx + 0.32, 0, truck - 0.08 ), 2.4, 0.26, ( 1, 0 ), nu = 8, part = ( 0, 0.5 ), taper = 0.7 )
	return S, ( tip.x, clew.x - 0.4 )

def build_brigantine( lod ):
	S = Ship( 'brigantine', lod )
	bands = [ ( 0.14, 'M_NavalHullTar' ), ( 0.26, 'M_NavalBlackPaint' ), ( 99, 'M_NavalHullPlank' ) ]
	H = S.hull( { 'Bh': 3.48, 'um': 0.48, 'aft': ( 2.4, 1.0 ), 'fore': ( 3.2, 2.2 ), 'transom': 0.66, 'tuck': 0.65, 'counter': 1.3, 'stemRake': 1.15,
		'forefoot': 2.2, 'yMB': 2.2, 'tumble': 0.015, 'sharp': 2.1, 'fine': 1.5, 'transomRake': 0.6 }, DATA[ 'bulwark' ], sweep = 0.26, bands = bands )
	mb = S.mb
	S.check_lines()
	deckY = S.deckY
	if lod < 2:
		H.strake( mb, 2.05, 2.32, 'M_NavalBlackPaint', out = 0.07 )
		H.strake( mb, 1.5, 1.66, 'M_NavalBlackPaint', out = 0.05 )
		rail_band( S, - 0.62, - 0.3, 'M_NavalSheerStripe', out = 0.03 )
	S.bulwarks( inner = 'M_NavalSheerStripe', cap = 'M_NavalBlackPaint' )
	S.decks()
	S.stern( windows = 5, wy = ( 2.45, 3.0 ), lanterns = 3 )
	S.head( knee = 1.3, fig = True )
	tip, jt = S.bowsprit( 5.6, 11, 0.22, jib = 3.6, heel = 2.2 )
	st = [ s for s in S.c[ 'stations' ] if s[ 'side' ] == 'port' ]
	S.gun_ports( [ s[ 'z' ] for s in st ], st[ 0 ][ 'y' ], h = 0.46, w = 0.5, guns = False )
	if lod < 2:
		for s in st:
			for side in ( 1, - 1 ):
				cannon( mb, s[ 'z' ], side * ( H.hbAt( s[ 'z' ], st[ 0 ][ 'y' ] ) + 1.25 - 1.8 ), deckY, side, length = 1.8, r = 0.12, carriage = lod == 0 )
	hz = S.boat[ 'helm' ][ 'z' ]; hd = S.boat[ 'helmDeckY' ]
	S.helm( ( hz + 0.55, 0, hd + 1.05 ) )
	# ---- the rig: the foremast square rigged (course, topsail, t'gallant), the main fore-and-aft with a gaff topsail;
	# headsails on the bowsprit and jib-boom, a main staysail between the masts
	fx, mx = [ m[ 'z' ] for m in DATA[ 'layout' ][ 'brigantine' ][ 'masts' ] ]
	truck = S.c[ 'mast' ]
	flo, ftm, ftg = mast_parts( S, fx, deckY, 10.6, 10.0, 13.6, tg = truck, r = 0.3, toplen = 1.5, topw = 2.4 )
	mlo, mtm, _ = mast_parts( S, mx, deckY, 10.9, 10.3, truck - 0.35, r = 0.31, toplen = 1.2, topw = 1.8 )
	S.mast_fife( fx ); S.mast_fife( mx )
	# fore yards and square sails
	yards = [ ( 9.8, 5.4, 0.17 ), ( 12.45, 4.1, 0.13 ), ( 14.55, 2.85, 0.09 ) ]
	for z, h, r in yards: yard_set( S, fx, z, h, r )
	foot = S.rail( fx ) + 1.15
	sq_sail( S, fx, 9.8, 5.1, foot, 5.6, 0.6 )
	sq_sail( S, fx, 12.45, 3.85, 9.95, 5.15, 0.55 )
	sq_sail( S, fx, 14.55, 2.65, 12.6, 3.85, 0.4, nu = 8, nv = 6 )
	# main gaff sail (boom over the quarterdeck, clear of the helmsman) and gaff topsail
	throat, peak = Vector( ( mx - 0.3, 0, 10.25 ) ), Vector( ( mx - 8.0, 0, 12.6 ) )
	tack, clew = Vector( ( mx - 0.3, 0, 6.05 ) ), Vector( ( - 12.0, 0, 6.5 ) )
	cyl( mb, tack + Vector( ( 0, 0, - 0.12 ) ), clew + Vector( ( - 0.5, 0, - 0.1 ) ), 0.15, 0.1, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	cyl( mb, throat + Vector( ( 0, 0, 0.14 ) ), peak + Vector( ( - 0.2, 0, 0.12 ) ), 0.12, 0.08, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	fa_sail( S, throat, peak, tack, clew, 0.7 )
	jib( S, ( mx + 0.05, 0, truck - 0.55 ), throat + Vector( ( 0.05, 0, 0.55 ) ), peak + Vector( ( 0.4, 0, 0.3 ) ), 0.3, n = 6 )
	# headsails: fore staysail to the stem head, jib to the bowsprit end, flying jib to the jib-boom end
	sh = Vector( ( H.xB( 3.6 ) - 0.1, 0, S.rail( H.xF ) + 0.0 ) )
	jib( S, ( fx + 0.3, 0, flo - 0.4 ), sh + Vector( ( - 0.2, 0, 0.15 ) ), ( fx + 1.4, 0, deckY + 1.9 ), 0.45 )
	jib( S, ( fx + 0.35, 0, ftm - 0.5 ), tip + Vector( ( - 0.4, 0, 0.12 ) ), ( fx + 3.2, 0, deckY + 2.6 ), 0.55 )
	jib( S, ( fx + 0.45, 0, truck - 0.6 ), jt + Vector( ( - 0.4, 0, 0.1 ) ), ( fx + 5.0, 0, deckY + 3.6 ), 0.45 )
	# main staysail on the main stay (main head to the foremast foot)
	jib( S, ( mx + 0.25, 0, mlo - 0.6 ), ( fx - 0.6, 0, deckY + 1.8 ), ( mx + 0.4, 0, deckY + 2.0 ), 0.35, n = 6 )
	S.channels_and_shrouds( fx, flo - 0.35, 4 )
	S.channels_and_shrouds( mx, mlo - 0.35, 4 )
	S.topmast_shrouds( fx + 0.28, 10.0, ftm - 0.3, 1.15, 3 )
	S.topmast_shrouds( mx + 0.28, 10.3, mtm - 0.4, 0.85, 2 )
	if lod < 2:
		rope( mb, ( fx + 0.3, 0, flo - 0.3 ), sh, 0.03 )
		rope( mb, ( fx + 0.35, 0, ftm - 0.4 ), tip, 0.024 )
		rope( mb, ( fx + 0.45, 0, truck - 0.5 ), jt, 0.018 )
		rope( mb, ( mx + 0.25, 0, mlo - 0.5 ), ( fx - 0.35, 0, deckY + 0.6 ), 0.026 )
		rope( mb, ( mx + 0.3, 0, mtm - 0.3 ), ( fx + 0.3, 0, ftm - 0.2 ), 0.018 )
		for side in ( 1, - 1 ):
			# braces of the fore yards to the main mast, the course's sheets and tacks, topmast backstays
			for z, h, r in yards:
				rope( mb, ya( fx, ( fx + 0.2, side * h * 0.97, z ) ), ( mx + 0.2, side * 0.25, min( z - 1.2, mlo - 0.8 ) ), 0.013 )
			rope( mb, ya( fx, ( fx + 0.3, side * 5.6, foot ) ), ( fx - 2.6, side * ( H.hbAt( fx - 2.6, 3.4 ) - 0.05 ), S.rail( fx - 2.6 ) + 0.05 ), 0.016 )
			rope( mb, ya( fx, ( fx + 0.3, side * 5.6, foot ) ), ( fx + 2.2, side * ( H.hbAt( fx + 2.2, 3.4 ) - 0.05 ), S.rail( fx + 2.2 ) + 0.05 ), 0.016 )
			rope( mb, ( fx + 0.3, side * 0.12, ftm - 0.4 ), ( fx - 3.4, side * ( H.hbAt( fx - 3.4, 3.4 ) + 0.4 ), S.rail( fx - 3.4 ) - 0.35 ), 0.016 )
			rope( mb, ( mx + 0.3, side * 0.12, mtm - 0.5 ), ( mx - 3.6, side * ( H.hbAt( mx - 3.6, 3.4 ) + 0.4 ), S.rail( mx - 3.6 ) - 0.35 ), 0.016 )
		rope( mb, clew + Vector( ( 0.8, 0, 0 ) ), ( H.xA + 0.6, 0, S.rail( H.xA ) ), 0.022 )
		rope( mb, peak, ( mx + 0.2, 0, mtm - 0.3 ), 0.016 )
	# deck: gratings, capstan, the belfry at the forecastle break, kegs, coils, pin rails
	if lod < 2:
		hatch( mb, 1.0, 0, deckY, 2.0, 1.7, grating = True )
		hatch( mb, - 3.3, 0, deckY, 1.1, 1.1, grating = True )
		capstan( mb, 2.85, 0, deckY, r = 0.3, h = 0.95 )
		wx = DATA[ 'layout' ][ 'brigantine' ][ 'deckEnd' ] - 0.6
		bitts( mb, wx, 0, S.levelAt( wx ), h = 0.8, w = 1.9 )
		cyl( mb, ( wx - 0.35, - 0.85, S.levelAt( wx ) + 0.45 ), ( wx - 0.35, 0.85, S.levelAt( wx ) + 0.45 ), 0.2, 0.2, 'M_NavalSparTimber', n = 10 )
		if lod == 0:
			bx = 6.35
			for side in ( 1, - 1 ): box( mb, ( bx, side * 0.45, deckY + 1.0 ), ( 0.12, 0.12, 2.0 ), 'M_NavalSparTimber', skip = ( '-z', ) )
			box( mb, ( bx, 0, deckY + 2.05 ), ( 0.3, 1.1, 0.14 ), 'M_NavalSparTimber' )
			cyl( mb, ( bx, 0, deckY + 1.95 ), ( bx, 0, deckY + 1.6 ), 0.06, 0.2, 'M_NavalAgedBrass', n = 10 )
			barrel( mb, - 1.0, 2.35, deckY, r = 0.3, h = 0.85 )
			barrel( mb, - 1.6, 2.4, deckY, r = 0.28, h = 0.8 )
			barrel( mb, - 1.3, 2.3, deckY + 0.85, r = 0.26, upright = False, h = 0.75 )
			crate( mb, 5.4, - 2.2, deckY, s = 0.65, a = 0.2 )
			crate( mb, 5.45, - 2.15, deckY + 0.65, s = 0.5, a = - 0.3 )
			coil( mb, 3.6, 1.6, deckY ); coil( mb, - 2.4, - 1.7, deckY ); coil( mb, - 8.6, 1.6, hd )
			for x in ( fx, mx ):
				for side in ( 1, - 1 ):
					pinrail( mb, x - 1.0, x + 1.0, side * ( H.hbAt( x, 3.0 ) - 0.33 ), S.levelAt( x ) + 0.75, side, pins = 7 )
	flag( mb, ( peak.x - 0.08, 0, peak.z + 0.08 ), 2.3, 1.5, ( 0, 1 ) )
	flag( mb, ( fx + 0.5, 0, truck - 0.1 ), 3.4, 0.3, ( 1, 0 ), nu = 9, part = ( 0, 0.5 ), taper = 0.7 )
	flag( mb, ( mx + 0.4, 0, mtm - 0.15 ), 1.3, 0.85, ( 0, 1 ) )
	return S, ( jt.x, clew.x - 0.5 )

def build_frigate( lod ):
	S = Ship( 'frigate', lod )
	c = S.c
	# rail: the waist 4.75, the quarterdeck and forecastle a metre over their decks
	lv = S.levelAt
	S.rail = None
	rail = rail_fn( lambda x: lv( x ) + ( 0.0 if lv( x ) > c[ 'deck' ] + 0.1 else 0.35 ), S.L, 1.0, sweep = 0.3 )
	bands = [ ( 0.14, 'M_NavalHullTar' ), ( 0.3, 'M_NavalBlackPaint' ), ( 2.15, 'M_NavyHullBlue' ), ( 2.82, 'M_NavyHullWhite' ), ( 3.62, 'M_NavyHullBlue' ), ( 4.3, 'M_NavyHullWhite' ), ( 99, 'M_NavyHullBlue' ) ]
	H = S.hull( { 'Bh': 3.95, 'um': 0.47, 'aft': ( 2.4, 1.0 ), 'fore': ( 3.0, 2.1 ), 'transom': 0.68, 'tuck': 0.85, 'counter': 1.6, 'stemRake': 1.4,
		'forefoot': 3.0, 'yMB': 2.6, 'tumble': 0.07, 'sharp': 2.1, 'fine': 1.5, 'transomRake': 0.8, 'sternFrom': 2.35 }, 1.0, bands = bands, rail = rail )
	mb = S.mb
	deckY = c[ 'deck' ]
	if lod < 2:
		H.strake( mb, 3.0, 3.3, 'M_NavalBlackPaint', out = 0.08 )
		H.strake( mb, 1.75, 1.98, 'M_NavalBlackPaint', out = 0.06 )
	S.bulwarks( inner = 'M_NavalSheerStripe', cap = 'M_NavalBlackPaint', t = 0.2 )
	S.decks()
	S.stern( windows = 6, wy = ( 3.6, 4.2 ), lanterns = 3, galleries = True )
	if lod < 2:
		stern_windows( mb, H, 6, 2.55, 3.05 )
	S.head( knee = 1.8, fig = True )
	tip, jt = S.bowsprit( 7.2, 13, 0.3, jib = 5.0, heel = 2.6 )
	# two tiers of ports: the lower on the white strake (stations at 2.48), the upper in the waist (4.0) with carronades aft
	lower = [ - 10.8, - 8.1, - 5.4, - 2.7, 0.0, 2.7, 5.4, 8.1, 10.6 ]
	S.gun_ports( lower, 2.48, h = 0.5, w = 0.56, guns = True )
	upper = [ - 5.4, - 2.7, 0.0, 2.7, 5.4 ]
	S.gun_ports( upper, 4.0, h = 0.46, w = 0.52, guns = False )
	if lod < 2:
		for x in upper:
			for side in ( 1, - 1 ):
				cannon( mb, x, side * ( H.hbAt( x, 4.0 ) + 1.25 - 2.0 ), deckY, side, length = 2.0, r = 0.13, carriage = lod == 0 )
		# carronades on the quarterdeck rail
		for x in ( - 9.6, - 12.0 ):
			for side in ( 1, - 1 ):
				cannon( mb, x, side * ( H.hbAt( x, 5.2 ) + 1.25 - 1.1 ), lv( x ), side, length = 1.1, r = 0.14, carriage = lod == 0 )
	# the double wheel on the quarterdeck
	w = c[ 'wheel' ]
	S.helm( ( w[ 'z' ], 0, w[ 'y' ] ), double = True, mat = 'M_NavyHelmWheel', hub = 'M_NavyHelmWheel' )
	# ---- three masts, ship rigged
	FX, MX, ZX = 10.4, 0.9, - 8.6
	truck = c[ 'mast' ]
	m_lo, m_tm, m_tg = mast_parts( S, MX, deckY, 16.4, 15.7, 23.2, tg = truck, r = 0.42, toplen = 2.2, topw = 3.4 )
	f_lo, f_tm, f_tg = mast_parts( S, FX, lv( FX ), 15.2, 14.6, 21.4, tg = truck - 2.4, r = 0.38, toplen = 2.0, topw = 3.1 )
	z_lo, z_tm, z_tg = mast_parts( S, ZX, lv( ZX ), 13.4, 12.8, 18.0, tg = truck - 6.2, r = 0.3, toplen = 1.6, topw = 2.5 )
	for x in ( FX, MX, ZX ): S.mast_fife( x )
	def rig_square( x, lo, tm, tg, course = True, scale = 1.0 ):
		ys = [ ( lo - 0.9, 7.6 * scale, 0.22 ), ( tm - 0.9, 5.7 * scale, 0.16 ), ( tg - 1.2, 3.9 * scale, 0.11 ) ]
		for z, h, r in ys: yard_set( S, x, z, h, r )
		if course: sq_sail( S, x, ys[ 0 ][ 0 ], ys[ 0 ][ 1 ] - 0.3, rail( x ) + 1.6, ys[ 0 ][ 1 ] + 0.2, 0.8 * scale )
		sq_sail( S, x, ys[ 1 ][ 0 ], ys[ 1 ][ 1 ] - 0.3, ys[ 0 ][ 0 ] + 0.15, ys[ 0 ][ 1 ] - 0.4, 0.7 * scale )
		sq_sail( S, x, ys[ 2 ][ 0 ], ys[ 2 ][ 1 ] - 0.25, ys[ 1 ][ 0 ] + 0.15, ys[ 1 ][ 1 ] - 0.4, 0.5 * scale, nu = 8, nv = 6 )
		return ys
	my = rig_square( MX, m_lo, m_tm, m_tg )
	fy = rig_square( FX, f_lo, f_tm, f_tg, scale = 0.92 )
	# mizzen: the crossjack (no sail), the mizzen topsail, the spanker on its gaff and boom
	zy = [ ( z_lo - 0.8, 5.4, 0.16 ), ( z_tm - 0.8, 4.0, 0.12 ), ( z_tg - 1.0, 2.7, 0.09 ) ]
	for z, h, r in zy: yard_set( S, ZX, z, h, r )
	sq_sail( S, ZX, zy[ 1 ][ 0 ], zy[ 1 ][ 1 ] - 0.25, zy[ 0 ][ 0 ] + 0.15, zy[ 0 ][ 1 ] - 0.35, 0.5 )
	furled( S, ZX, zy[ 2 ][ 0 ], zy[ 2 ][ 1 ] )
	throat, peak = Vector( ( ZX - 0.35, 0, z_lo - 1.4 ) ), Vector( ( ZX - 7.0, 0, z_lo + 0.6 ) )
	tack, clew = Vector( ( ZX - 0.35, 0, lv( ZX ) + 2.5 ) ), Vector( ( - 17.0, 0, lv( ZX ) + 2.7 ) )
	cyl( mb, tack + Vector( ( 0, 0, - 0.12 ) ), clew + Vector( ( - 0.5, 0, - 0.1 ) ), 0.15, 0.1, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	cyl( mb, throat + Vector( ( 0, 0, 0.14 ) ), peak + Vector( ( - 0.2, 0, 0.12 ) ), 0.12, 0.08, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	fa_sail( S, throat, peak, tack, clew, 0.6 )
	# headsails
	sh = Vector( ( H.xB( 4.5 ) - 0.2, 0, rail( H.xF ) ) )
	jib( S, ( FX + 0.35, 0, f_lo - 0.5 ), sh + Vector( ( - 0.2, 0, 0.2 ) ), ( FX + 2.0, 0, lv( FX ) + 2.3 ), 0.55 )
	jib( S, ( FX + 0.4, 0, f_tm - 0.6 ), tip + Vector( ( - 0.5, 0, 0.15 ) ), ( FX + 4.0, 0, lv( FX ) + 3.3 ), 0.7 )
	jib( S, ( FX + 0.5, 0, f_tg - 0.5 ), jt + Vector( ( - 0.5, 0, 0.1 ) ), ( FX + 6.5, 0, lv( FX ) + 4.8 ), 0.55 )
	for x, lo, tm, n in ( ( FX, f_lo, f_tm, 5 ), ( MX, m_lo, m_tm, 5 ), ( ZX, z_lo, z_tm, 4 ) ):
		S.channels_and_shrouds( x, lo - 0.45, n, out = 0.55, fan = 0.36 )
		S.topmast_shrouds( x + 0.28, lo - 0.6, tm - 0.4, 1.5 if x != ZX else 1.15, 3 )
	if lod < 2:
		rope( mb, ( FX + 0.35, 0, f_lo - 0.4 ), sh, 0.04 )
		rope( mb, ( FX + 0.4, 0, f_tm - 0.5 ), tip, 0.03 )
		rope( mb, ( FX + 0.5, 0, f_tg - 0.4 ), jt, 0.022 )
		rope( mb, ( MX + 0.3, 0, m_lo - 0.45 ), ( FX - 0.5, 0, lv( FX ) + 0.8 ), 0.04 )
		rope( mb, ( MX + 0.35, 0, m_tm - 0.4 ), ( FX + 0.3, 0, f_lo - 0.6 ), 0.026 )
		rope( mb, ( ZX + 0.3, 0, z_lo - 0.4 ), ( MX - 0.5, 0, deckY + 1.0 ), 0.03 )
		rope( mb, ( ZX + 0.35, 0, z_tm - 0.4 ), ( MX + 0.3, 0, m_lo - 0.6 ), 0.022 )
		for side in ( 1, - 1 ):
			for ( z, h, r ), tx in zip( fy, ( MX + 0.3, MX + 0.3, MX + 0.3 ) ):
				rope( mb, ya( FX, ( FX + 0.2, side * h * 0.97, z ) ), ( tx, side * 0.3, z - 2.5 ), 0.016 )
			for ( z, h, r ) in my:
				rope( mb, ya( MX, ( MX + 0.2, side * h * 0.97, z ) ), ( ZX + 0.3, side * 0.3, z - 3.0 ), 0.016 )
			for x, tm in ( ( FX, f_tm ), ( MX, m_tm ), ( ZX, z_tm ) ):
				rope( mb, ( x + 0.3, side * 0.12, tm - 0.4 ), ( x - 4.2, side * ( H.hbAt( x - 4.2, 4.5 ) + 0.5 ), rail( x - 4.2 ) - 0.45 ), 0.02 )
			rope( mb, ya( MX, ( MX + 0.3, side * 7.8, my[ 0 ][ 0 ] ) ), ( MX - 3.2, side * ( H.hbAt( MX - 3.2, 4.5 ) - 0.05 ), rail( MX - 3.2 ) ), 0.02 )
			rope( mb, ya( FX, ( FX + 0.3, side * 7.0, fy[ 0 ][ 0 ] ) ), ( FX - 3.0, side * ( H.hbAt( FX - 3.0, 4.5 ) - 0.05 ), rail( FX - 3.0 ) ), 0.02 )
		rope( mb, clew + Vector( ( 0.8, 0, 0 ) ), ( H.xA + 0.5, 0, rail( H.xA ) ), 0.024 )
		# hammock nettings along the waist rails (white bundles), the ship's boats on the booms between the masts
		for side in ( 1, - 1 ):
			x0, x1 = - 6.6, 9.0
			n = 10
			for i in range( n ):
				xa, xb = lerp( x0, x1, i / n ), lerp( x0, x1, ( i + 1 ) / n )
				wa_, wb_ = H.hbAt( xa, 4.6 ) - 0.12, H.hbAt( xb, 4.6 ) - 0.12
				box( mb, ( ( xa + xb ) / 2, side * ( wa_ + wb_ ) / 2, rail( ( xa + xb ) / 2 ) + 0.28 ), ( xb - xa + 0.02, 0.36, 0.5 ), 'M_NavalTarp', skip = ( '-z', ) )
		for bx in ( 4.6, - 2.2 ):
			for dy in ( - 0.0, ):
				boat( mb, bx, dy, deckY + 1.75, L = 5.6 if bx > 0 else 4.6, B = 1.7, D = 0.62, mat = 'M_NavyHullWhite' )
		for x in ( 3.0, 6.4, - 0.9, - 3.6 ):
			box( mb, ( x, 0, deckY + 1.55 ), ( 0.18, 3.6, 0.2 ), 'M_NavalSparTimber' )
			for side in ( 1, - 1 ): box( mb, ( x, side * 1.6, deckY + 0.78 ), ( 0.16, 0.16, 1.56 ), 'M_NavalSparTimber', skip = ( '-z', ) )
		capstan( mb, - 4.6, 0, deckY, r = 0.38, h = 1.0 )
		hatch( mb, - 0.8, 0, deckY, 1.6, 1.6 ) if lod == 0 else None
		if lod == 0:
			bx = 9.6
			for side in ( 1, - 1 ): box( mb, ( bx, side * 0.5, lv( bx ) + 1.1 ), ( 0.14, 0.14, 2.2 ), 'M_NavalSparTimber', skip = ( '-z', ) )
			box( mb, ( bx, 0, lv( bx ) + 2.25 ), ( 0.4, 1.3, 0.16 ), 'M_NavalAgedBrass' )
			cyl( mb, ( bx, 0, lv( bx ) + 2.15 ), ( bx, 0, lv( bx ) + 1.75 ), 0.07, 0.24, 'M_NavalAgedBrass', n = 10 )
			for x in ( FX, MX ):
				for side in ( 1, - 1 ):
					pinrail( mb, x - 1.2, x + 1.2, side * ( H.hbAt( x, 4.3 ) - 0.34 ), lv( x ) + 0.85, side, pins = 8 )
	# the ensign at the spanker peak, the long pennant at the main truck, the jack on the jib-boom
	flag( mb, ( peak.x - 0.1, 0, peak.z + 0.1 ), 3.0, 1.9, ( 1, 1 ), mat = 'M_NavyBlueCanvas' )
	flag( mb, ( MX + 0.45, 0, truck - 0.15 ), 6.5, 0.4, ( 1, 0 ), mat = 'M_NavyBlueCanvas', nu = 10, part = ( 0.5, 1 ), taper = 0.75 )
	flag( mb, ( jt.x - 0.6, 0, jt.z + 0.9 ), 1.0, 0.65, ( 1, 1 ), mat = 'M_NavyBlueCanvas' )
	cyl( mb, ( jt.x - 0.6, 0, jt.z ), ( jt.x - 0.6, 0, jt.z + 0.95 ), 0.03, 0.025, 'M_NavalSparTimber', n = 4 )
	S.notes.append( 'wheel hub %s' % ( [ round( w[ 'z' ], 2 ), 0, round( w[ 'y' ], 2 ) ] ) )
	return S, ( jt.x, clew.x - 0.5 )

def build_revenue( lod ):
	S = Ship( 'revenue', lod )
	c = S.c
	rail = rail_fn( S.levelAt, S.L, 0.75, sweep = 0.22 )
	bands = [ ( 0.12, 'M_NavalHullTar' ), ( 0.24, 'M_NavalBlackPaint' ), ( 2.14, 'M_NavyHullBlue' ), ( 2.68, 'M_NavyHullWhite' ), ( 99, 'M_NavyHullBlue' ) ]
	H = S.hull( { 'Bh': 2.65, 'um': 0.47, 'aft': ( 2.4, 1.0 ), 'fore': ( 2.8, 1.9 ), 'transom': 0.6, 'tuck': 0.5, 'counter': 1.0, 'stemRake': 0.5,
		'forefoot': 1.6, 'yMB': 1.55, 'tumble': 0.03, 'sharp': 2.0, 'fine': 1.7, 'transomRake': 0.5 }, 0.75, bands = bands, rail = rail )
	mb = S.mb
	deckY = c[ 'deck' ]
	if lod < 2: H.strake( mb, 1.85, 2.05, 'M_NavalBlackPaint', out = 0.05 )
	S.bulwarks( inner = 'M_NavalSheerStripe', cap = 'M_NavalBlackPaint', t = 0.16 )
	S.decks()
	S.stern( windows = 3, wy = ( 1.4, 1.8 ), lanterns = 1 )
	S.head( knee = 0.6, fig = False )
	tip, _ = S.bowsprit( 7.5, 4, 0.17, heel = 2.6 )
	ports = sorted( set( s[ 'z' ] for s in c[ 'stations' ] ) )
	S.gun_ports( ports, 2.42, h = 0.36, w = 0.42, guns = False )
	if lod < 2:
		for s in c[ 'stations' ]:
			side = 1 if s[ 'side' ] == 'port' else - 1
			cannon( mb, s[ 'z' ], side * ( H.hbAt( s[ 'z' ], 2.42 ) + 1.25 - 1.5 ), deckY, side, length = 1.5, r = 0.1, carriage = lod == 0 )
	w = c[ 'wheel' ]
	S.helm( ( w[ 'z' ], 0, w[ 'y' ] ), mat = 'M_NavyHelmWheel', hub = 'M_NavyHelmWheel' )
	# ---- the rig: a gaff cutter, a long running bowsprit, a square topsail, gaff topsail, two headsails
	mx = 1.6
	truck = c[ 'mast' ]
	lo, tm, _ = mast_parts( S, mx, deckY, 11.6, 11.1, truck, r = 0.27, toplen = 1.0, topw = 1.5 )
	S.mast_fife( mx )
	throat, peak = Vector( ( mx - 0.28, 0, 11.0 ) ), Vector( ( mx - 7.6, 0, 13.6 ) )
	tack, clew = Vector( ( mx - 0.28, 0, deckY + 2.3 ) ), Vector( ( - 11.0, 0, deckY + 2.8 ) )
	cyl( mb, tack + Vector( ( 0, 0, - 0.1 ) ), clew + Vector( ( - 0.4, 0, - 0.08 ) ), 0.14, 0.09, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	cyl( mb, throat + Vector( ( 0, 0, 0.12 ) ), peak + Vector( ( - 0.15, 0, 0.1 ) ), 0.11, 0.07, 'M_NavalSparTimber', n = [ 8, 6, 4 ][ lod ] )
	fa_sail( S, throat, peak, tack, clew, 0.65 )
	jib( S, ( mx + 0.05, 0, truck - 0.6 ), throat + Vector( ( 0.05, 0, 0.55 ) ), peak + Vector( ( 0.4, 0, 0.3 ) ), 0.25, n = 6 )
	yard_set( S, mx, 11.4, 4.6, 0.13 )
	yard_set( S, mx, 14.4, 3.3, 0.09 )
	sq_sail( S, mx, 14.4, 3.1, 11.55, 4.3, 0.5 )
	sh = Vector( ( H.xB( 2.7 ) - 0.1, 0, rail( H.xF ) ) )
	jib( S, ( mx + 0.3, 0, lo - 0.4 ), sh + Vector( ( - 0.2, 0, 0.12 ) ), ( mx + 1.9, 0, deckY + 1.4 ), 0.45 )
	jib( S, ( mx + 0.4, 0, truck - 1.2 ), tip + Vector( ( - 0.3, 0, 0.1 ) ), ( mx + 4.3, 0, deckY + 1.9 ), 0.6 )
	S.channels_and_shrouds( mx, lo - 0.35, 3 )
	S.topmast_shrouds( mx + 0.28, 11.1, truck - 0.6, 0.75, 2 )
	if lod < 2:
		rope( mb, ( mx + 0.3, 0, lo - 0.3 ), sh, 0.028 )
		rope( mb, ( mx + 0.4, 0, truck - 1.1 ), tip, 0.022 )
		for side in ( 1, - 1 ):
			rope( mb, ( mx + 0.3, side * 0.1, truck - 1.0 ), ( - 3.6, side * ( H.hbAt( - 3.6, 2.2 ) - 0.05 ), rail( - 3.6 ) ), 0.016 )
			rope( mb, ya( mx, ( mx + 0.2, side * 4.45, 11.4 ) ), ( - 1.6, side * ( H.hbAt( - 1.6, 2.2 ) - 0.05 ), rail( - 1.6 ) + 0.1 ), 0.013 )
			rope( mb, ya( mx, ( mx + 0.2, side * 3.2, 14.4 ) ), ( - 2.4, side * ( H.hbAt( - 2.4, 2.2 ) - 0.05 ), rail( - 2.4 ) + 0.1 ), 0.013 )
		rope( mb, clew + Vector( ( 0.6, 0, 0 ) ), ( H.xA + 0.5, 0, rail( H.xA ) ), 0.02 )
		hatch( mb, 3.8, 0, deckY, 1.2, 1.1 )
		if lod == 0:
			coil( mb, - 1.5, 1.2, deckY ); coil( mb, 4.9, - 1.0, deckY )
			barrel( mb, - 1.0, - 1.6, deckY, r = 0.25, h = 0.7 )
	flag( mb, ( peak.x - 0.06, 0, peak.z + 0.06 ), 2.2, 1.4, ( 1, 1 ), mat = 'M_NavyBlueCanvas' )
	flag( mb, ( mx + 0.32, 0, truck - 0.1 ), 4.2, 0.32, ( 1, 0 ), mat = 'M_NavyBlueCanvas', nu = 9, part = ( 0.5, 1 ), taper = 0.75 )
	return S, ( tip.x, clew.x - 0.4 )

BUILD = { 'trawler': build_trawler, 'sloop': build_sloop, 'brigantine': build_brigantine, 'frigate': build_frigate, 'revenue': build_revenue }
NODE = { 'trawler': 'SM_Trawler', 'sloop': 'SM_Sloop', 'brigantine': 'SM_Brigantine', 'frigate': 'SM_Frigate', 'revenue': 'SM_Revenue' }
# the fork's scene layout offsets the game's tests know (StaticGLB bakes them, ShipFrame.centreOnHull takes them out again)
ROOT_X = { 'trawler': 54.666, 'sloop': 0.0, 'brigantine': 24.533, 'frigate': 0.0, 'revenue': 0.0 }

# ------------------------------------------------------------------ materials, images, export

IMAGES = {}
def image( name ):
	if name in IMAGES: return IMAGES[ name ]
	a = textures.ALL[ name ]( TEX ); n = a.shape[ 0 ]
	im = bpy.data.images.new( name + '_BaseColor', n, n, alpha = False )
	px = np.ones( ( n, n, 4 ), dtype = np.float32 ); px[ :, :, :3 ] = a
	im.pixels.foreach_set( px.ravel() )
	im.pack()
	IMAGES[ name ] = im
	return im

def material( kind, name ):
	key = kind + ':' + name
	m = bpy.data.materials.get( key )
	if m: return m
	m = bpy.data.materials.new( key )
	m.use_nodes = True
	m.use_backface_culling = name not in DOUBLE
	b = m.node_tree.nodes.get( 'Principled BSDF' )
	tint, rough, metal = look( kind, name )
	if name in TEXMAP:
		t = m.node_tree.nodes.new( 'ShaderNodeTexImage' ); t.image = image( TEXMAP[ name ] )
		m.node_tree.links.new( t.outputs[ 'Color' ], b.inputs[ 'Base Color' ] )
	else:
		b.inputs[ 'Base Color' ].default_value = ( *tint, 1.0 )
	b.inputs[ 'Roughness' ].default_value = rough
	b.inputs[ 'Metallic' ].default_value = metal
	return m

def export( kind, lod, S, ext ):
	mb = S.mb
	fwd, aft = ext
	# the X extent symmetric: a 2 mm triangle balances the bowsprit / the boom
	xs = [ v.co.x for v in mb.bm.verts ]
	lo, hi = min( xs ), max( xs )
	if abs( lo + hi ) > 0.01:
		balance( mb, - hi if hi > - lo else - lo, z = 1.0 )
	if lod > 0:
		# every material of the palette gets a primitive (a 2 mm triangle inside the hull if it has none): the game swaps each
		# full-model mesh's geometry for the LOD's of the same name
		have = set( mb.mats[ f.material_index ] for f in mb.bm.faces )
		navy = DATA[ 'classes' ][ kind ].get( 'navy' )
		for n in PALETTE:
			if n in have: continue
			if navy and n in ( 'M_NavalHullPlank', 'M_NavalFlagCanvas' ): continue
			if not navy and n.startswith( 'M_Navy' ): continue
			mb.f( [ ( 0, 0, 1.0 ), ( 0.002, 0, 1.0 ), ( 0.001, 0, 1.002 ) ], n )
	name = NODE[ kind ] + ( '' if lod == 0 else '_LOD%d' % lod )
	me = bpy.data.meshes.new( name )
	mb.bm.normal_update()
	mb.bm.to_mesh( me ); mb.bm.free()
	used = sorted( set( p.material_index for p in me.polygons ) )
	for n in mb.mats: me.materials.append( material( kind, n ) )
	ob = bpy.data.objects.new( name, me )
	ob.location.x = ROOT_X[ kind ]
	bpy.context.scene.collection.objects.link( ob )
	for o in bpy.context.scene.objects: o.select_set( o == ob )
	bpy.context.view_layer.objects.active = ob
	# drop unused material slots (one primitive per material: the navy test counts them)
	for i in reversed( range( len( me.materials ) ) ):
		if i not in used:
			ob.active_material_index = i
			bpy.ops.object.material_slot_remove()
	sub = 'navy' if DATA[ 'classes' ][ kind ].get( 'navy' ) else 'ships'
	base = kind if sub == 'navy' else kind + '_v2'
	path = os.path.join( OUT, sub, base + ( '' if lod == 0 else '_lod%d' % lod ) + '.glb' )
	os.makedirs( os.path.dirname( path ), exist_ok = True )
	bpy.ops.export_scene.gltf( filepath = path, export_format = 'GLB', use_selection = True, export_yup = True, export_apply = True,
		export_texcoords = True, export_normals = True, export_materials = 'EXPORT', export_cameras = False, export_lights = False,
		export_extras = False, export_animations = False, export_skins = False, export_morph = False, export_image_format = 'JPEG' if lod == 0 else 'NONE',
		export_jpeg_quality = 86 )
	patch( path, kind )
	me.calc_loop_triangles()
	tris = len( me.loop_triangles )
	bb = [ [ round( min( v.co[ i ] for v in me.vertices ), 3 ), round( max( v.co[ i ] for v in me.vertices ), 3 ) ] for i in range( 3 ) ]
	bpy.data.objects.remove( ob, do_unlink = True )
	print( 'MEASURE', json.dumps( { 'file': os.path.basename( path ), 'tris': tris, 'bytes': os.path.getsize( path ), 'bounds': bb, 'notes': S.notes } ) )
	return path

def patch( path, kind ):
	"""the material names without the per-ship key, the tints as baseColorFactor of the textured materials"""
	with open( path, 'rb' ) as fh: data = fh.read()
	jlen = struct.unpack_from( '<I', data, 12 )[ 0 ]
	j = json.loads( data[ 20: 20 + jlen ] )
	rest = data[ 20 + jlen: ]
	for m in j.get( 'materials', [] ):
		name = m[ 'name' ].split( ':', 1 )[ - 1 ]
		m[ 'name' ] = name
		tint, rough, metal = look( kind, name )
		pbr = m.setdefault( 'pbrMetallicRoughness', {} )
		pbr[ 'baseColorFactor' ] = [ *tint, 1.0 ]
		pbr[ 'roughnessFactor' ] = rough
		pbr[ 'metallicFactor' ] = metal
	js = json.dumps( j, separators = ( ',', ':' ) ).encode( 'utf8' )
	js += b' ' * ( ( 4 - len( js ) % 4 ) % 4 )
	out = struct.pack( '<III', 0x46546C67, 2, 12 + 8 + len( js ) + len( rest ) ) + struct.pack( '<II', len( js ), 0x4E4F534A ) + js + rest
	with open( path, 'wb' ) as fh: fh.write( out )

bpy.ops.wm.read_factory_settings( use_empty = True )
for kind in BUILD:
	if WHICH != [ 'all' ] and kind not in WHICH: continue
	for lod in LODS:
		t0 = time.time()
		S, ext = BUILD[ kind ]( lod )
		export( kind, lod, S, ext )
		print( 'built', kind, lod, round( time.time() - t0, 1 ), 's' )
