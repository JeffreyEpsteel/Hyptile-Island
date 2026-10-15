# Wave 24C: the player's four small boats rebuilt with the ship kit (Blender headless):
#   D:\blender\blender.exe -b --factory-startup -P tools/ships/build_boats.py -- [skiff,canoe,cutter,launch] [outDir]
# -> public/models/fleet/SM_MarshSkiff.glb, SM_Outrigger.glb, SM_SailCutter.glb, SM_CabinLaunch.glb (one node each).
#
# The fleet's conventions (world/boat/FleetBoatModel.js, tools/roster/convert-boat.py): the GLB is in the game's boat frame
# (+Z bow, +X port, y = 0 the design waterline, centred on the catalog length), keel at -draft, the floorboards at the
# catalog's deckY (0.31), the gunwale at its freeboard; a tiller on the centreline over the aft 30 % (a beam rising forward
# from the rudder head, |x| <= 6 cm, 0.29 .. 0.72 m up) with the rudder blade hanging behind it, apart from the tiller (the game
# lifts both out and turns them); the launch's cuddy inside FleetBoatModel's WHEELHOUSE box, its windows the one glass.
# Built in the kit's frame (X bow, Y port) and turned to the boat frame before export.
import bpy, sys, os, json, math, struct
sys.path.insert( 0, os.path.dirname( os.path.abspath( __file__ ) ) )
import importlib, shipkit, textures
importlib.reload( shipkit ); importlib.reload( textures )
from shipkit import *
from mathutils import Vector, Matrix
import numpy as np

ROOT = os.path.abspath( os.path.join( os.path.dirname( os.path.abspath( __file__ ) ), '..', '..' ) )
argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
WHICH = ( argv[ 0 ] if argv else 'skiff,canoe,cutter,launch' ).split( ',' )
OUT = argv[ 1 ] if len( argv ) > 1 else os.path.join( ROOT, 'public', 'models', 'fleet' )

# the catalog (src/game/Boats.js) and the GLB names
BOATS = {
	'skiff': { 'file': 'SM_MarshSkiff', 'L': 4.13, 'B': 1.79, 'd': 0.22, 'deck': 0.31, 'fb': 0.62 },
	'canoe': { 'file': 'SM_Outrigger', 'L': 4.53, 'B': 2.97, 'd': 0.22, 'deck': 0.31, 'fb': 0.66 },
	'cutter': { 'file': 'SM_SailCutter', 'L': 4.48, 'B': 1.97, 'd': 0.3, 'deck': 0.31, 'fb': 0.7 },
	'launch': { 'file': 'SM_CabinLaunch', 'L': 4.63, 'B': 2.02, 'd': 0.28, 'deck': 0.31, 'fb': 0.7 },
}
TEXMAP = {
	'M_NavalHullPlank': 'T_ShipPaint', 'M_NavalSheerStripe': 'T_ShipPaint', 'M_NavalBlackPaint': 'T_ShipPaint', 'M_NavalHullTar': 'T_ShipBottom',
	'M_NavalDeckPlank': 'T_ShipDeck', 'M_NavalSparTimber': 'T_ShipTimber', 'M_NavalSailCanvas': 'T_ShipCanvas', 'M_NavalTarp': 'T_ShipCanvas',
}
BASE = {
	'M_NavalBlackPaint': ( ( 0.035, 0.034, 0.033 ), 0.6, 0 ), 'M_NavalDeckPlank': ( ( 1, 1, 1 ), 0.85, 0 ), 'M_NavalSparTimber': ( ( 0.95, 0.88, 0.8 ), 0.6, 0 ),
	'M_NavalIron': ( ( 0.07, 0.075, 0.08 ), 0.55, 0.65 ), 'M_NavalAgedBrass': ( ( 0.55, 0.38, 0.13 ), 0.38, 0.9 ), 'M_NavalRiggingHemp': ( ( 0.32, 0.25, 0.15 ), 0.9, 0 ),
	'M_CabinGlass': ( ( 0.07, 0.24, 0.27 ), 0.1, 0 ), 'M_NavalTarp': ( ( 0.62, 0.58, 0.48 ), 0.85, 0 ), 'M_NavalSailCanvas': ( ( 0.93, 0.9, 0.82 ), 0.9, 0 ),
}
LIVERY = {
	'skiff': { 'M_NavalHullPlank': ( ( 0.2, 0.3, 0.22 ), 0.6, 0 ), 'M_NavalSheerStripe': ( ( 0.78, 0.74, 0.62 ), 0.6, 0 ), 'M_NavalHullTar': ( ( 0.34, 0.08, 0.05 ), 0.7, 0 ) },
	'canoe': { 'M_NavalHullPlank': ( ( 0.05, 0.045, 0.04 ), 0.55, 0 ), 'M_NavalSheerStripe': ( ( 0.36, 0.05, 0.035 ), 0.6, 0 ), 'M_NavalHullTar': ( ( 0.09, 0.08, 0.07 ), 0.7, 0 ) },
	'cutter': { 'M_NavalHullPlank': ( ( 0.04, 0.11, 0.3 ), 0.55, 0 ), 'M_NavalSheerStripe': ( ( 0.86, 0.84, 0.78 ), 0.6, 0 ), 'M_NavalHullTar': ( ( 0.42, 0.07, 0.045 ), 0.7, 0 ) },
	'launch': { 'M_NavalHullPlank': ( ( 0.3, 0.05, 0.04 ), 0.5, 0 ), 'M_NavalSheerStripe': ( ( 0.86, 0.84, 0.78 ), 0.6, 0 ), 'M_NavalHullTar': ( ( 0.08, 0.07, 0.07 ), 0.7, 0 ) },
}
DOUBLE = { 'M_NavalSailCanvas', 'M_NavalRiggingHemp' }
def look( kind, name ): return LIVERY[ kind ].get( name ) or BASE.get( name ) or ( ( 0.8, 0.8, 0.8 ), 0.7, 0 )

class Boat:

	def __init__( self, kind ):
		self.kind = kind
		self.c = BOATS[ kind ]
		self.mb = MB( [ 'M_NavalHullTar', 'M_NavalHullPlank', 'M_NavalSheerStripe', 'M_NavalBlackPaint', 'M_NavalDeckPlank', 'M_NavalSparTimber', 'M_NavalAgedBrass' ] )

	def hull( self, o, Bh = None, rail = None, bands = None, nu = 44 ):
		c = self.c
		L, d, fb = c[ 'L' ], c[ 'd' ], c[ 'fb' ]
		self.rail = rail or ( lambda x: fb + 0.12 * abs( 2 * x / L ) ** 2.2 + ( 0.04 if x > 0 else 0.0 ) * abs( 2 * x / L ) ** 3 )
		self.H = Hull( L, Bh or c[ 'B' ] / 2, d, self.rail, lambda x: c[ 'deck' ], o )
		levels = [ - d * 0.7, - d * 0.4, - d * 0.15, 0.0, 0.06, 0.16, 0.28, 0.4, 0.52 ]
		self.H.build( self.mb, bands or [ ( 0.06, 'M_NavalHullTar' ), ( 0.12, 'M_NavalBlackPaint' ), ( 99, 'M_NavalHullPlank' ) ], nu = nu, levels = levels )
		return self.H

	def inside( self, t = 0.035 ):
		"""the planking's inside, the gunwale capping, ribs, the floorboards"""
		H, mb, c = self.H, self.mb, self.c
		H.inner( mb, t, 'M_NavalSparTimber', 'M_NavalSparTimber', capW = 0.05, capH = 0.04 )
		# the inner skin below the floor up to the deck (seen past the floorboards' edges): the hull's inside painted
		# ribs every 0.3 m from the floor to the gunwale
		x = H.xA + 0.35
		while x < H.xF - 0.45:
			for side in ( 1, - 1 ):
				pts = []
				for k in range( 5 ):
					y = lerp( c[ 'deck' ] - 0.02, self.rail( x ) - 0.04, k / 4 )
					pts.append( Vector( ( x, side * ( H.hbAt( x, y ) - t - 0.015 ), y ) ) )
				for a, b in zip( pts, pts[ 1: ] ):
					cyl( mb, a, b, 0.018, 0.018, 'M_NavalSparTimber', n = 4, cap0 = False, cap1 = False, flat = True )
			x += 0.3
		# the floorboards: planks at the deck height between the ribs
		deck_quads( mb, H, H.xS( c[ 'deck' ] ) + 0.05, H.xB( c[ 'deck' ] ) - 0.25, c[ 'deck' ], - 2, 2, step = 0.25, t = t + 0.03 )

	def thwart( self, x, y = None, w = 0.22, mat = 'M_NavalSparTimber' ):
		H = self.H
		y = y or ( self.rail( x ) - 0.16 )
		hw = H.hbAt( x, y ) - 0.05
		box( self.mb, ( x, 0, y ), ( w, 2 * hw, 0.035 ), mat )
		# a knee each side under it
		for side in ( 1, - 1 ):
			box( self.mb, ( x, side * ( hw - 0.05 ), y - 0.08 ), ( 0.05, 0.08, 0.14 ), mat )

	def tiller( self, stock_y = 0.46, length = 0.78, rise = 0.16, rudder_depth = None, rudder_w = 0.34 ):
		"""the rudder blade hanging on the transom and, apart from it, the tiller from the rudder head forward and up"""
		H, mb = self.H, self.mb
		rudder_depth = rudder_depth or self.c[ 'd' ]
		xa = H.xS( 0.3 )
		# pintles and gudgeons (wider than the game's slab: they stay on the hull)
		for y in ( - 0.05, 0.25 ):
			box( mb, ( xa - 0.04, 0, y ), ( 0.1, 0.14, 0.03 ), 'M_NavalAgedBrass' )
		z0 = xa - 0.08
		# (a barn-door blade: its trailing edge, not its head, is the farthest from the stock's foot)
		pts = [ ( z0, 0.4 ), ( z0, - rudder_depth + 0.08 ), ( z0 - 0.22, - rudder_depth ), ( z0 - 0.46, - rudder_depth + 0.12 ), ( z0 - 0.5, 0.2 ), ( z0 - 0.12, 0.4 ) ]
		for side in ( 1, - 1 ):
			mb.f( [ ( p[ 0 ], side * 0.018, p[ 1 ] ) for p in pts ], 'M_NavalSparTimber', facing = ( 0, side, 0 ) )
		for a, b in zip( pts, pts[ 1: ] + pts[ : 1 ] ):
			mb.f( [ ( a[ 0 ], 0.018, a[ 1 ] ), ( a[ 0 ], - 0.018, a[ 1 ] ), ( b[ 0 ], - 0.018, b[ 1 ] ), ( b[ 0 ], 0.018, b[ 1 ] ) ], 'M_NavalSparTimber', facing = ( ( a[ 1 ] - b[ 1 ] ), 0, ( b[ 0 ] - a[ 0 ] ) ) )
		# the tiller: from just behind the rudder head over the transom, forward and up
		s0 = Vector( ( z0 + 0.04, 0, stock_y ) )
		s1 = s0 + Vector( ( length, 0, rise ) )
		cyl( mb, s0, s1, 0.028, 0.02, 'M_NavalSparTimber', n = 8 )
		sphere( mb, s1 + Vector( ( 0.01, 0, 0 ) ), 0.026, 'M_NavalSparTimber', 6, 3 )

	def oarlocks( self, x ):
		for side in ( 1, - 1 ):
			w = self.H.hbAt( x, self.rail( x ) )
			y = self.rail( x ) + 0.04
			cyl( self.mb, ( x, side * w, y ), ( x, side * w, y + 0.09 ), 0.012, 0.012, 'M_NavalAgedBrass', n = 5 )
			torus( self.mb, ( x, side * w, y + 0.12 ), 0.04, 0.009, 'M_NavalAgedBrass', axis = ( 1, 0, 0 ), nu = 8, nv = 3 )

def build_skiff():
	B = Boat( 'skiff' )
	H = B.hull( { 'um': 0.5, 'aft': ( 2.0, 1.0 ), 'fore': ( 2.1, 1.5 ), 'transom': 0.62, 'tuck': 0.02, 'counter': 0.05, 'stemRake': 0.35, 'forefoot': 0.5,
		'yMB': 0.5, 'tumble': 0.0, 'sharp': 1.4, 'fine': 1.0, 'transomRake': 0.2, 'postRake': 0.05, 'bulge': 0.04 } )
	mb = B.mb
	rail_band_boat( B, - 0.11, - 0.03, 'M_NavalSheerStripe' )
	B.inside()
	for x in ( - 0.15, - 0.91, 1.1 ): B.thwart( x )
	B.thwart( - 1.62, y = B.rail( - 1.62 ) - 0.2, w = 0.45 ) # the stern sheets
	B.oarlocks( 0.25 )
	B.tiller()
	coil( mb, 1.55, 0, B.c[ 'deck' ] + 0.02, r = 0.18 )
	# a bailer and a fish basket
	cyl( mb, ( - 1.25, 0.45, B.c[ 'deck' ] ), ( - 1.25, 0.45, B.c[ 'deck' ] + 0.22 ), 0.13, 0.16, 'M_NavalTarp', n = 10, cap1 = False )
	return B

def build_canoe():
	B = Boat( 'canoe' )
	H = B.hull( { 'um': 0.5, 'aft': ( 2.4, 1.6 ), 'fore': ( 2.4, 1.6 ), 'transom': 0.0, 'tuck': 0.5, 'counter': 0.05, 'stemRake': 0.3, 'forefoot': 0.45,
		'yMB': 0.45, 'tumble': 0.0, 'sharp': 1.6, 'fine': 0.8, 'transomRake': 0.0, 'postRake': 0.25, 'bulge': 0.0 }, Bh = 0.74 )
	mb = B.mb
	rail_band_boat( B, - 0.1, - 0.02, 'M_NavalSheerStripe' )
	B.inside( t = 0.03 )
	for x in ( - 0.15, - 0.91, 1.0 ): B.thwart( x, w = 0.18 )
	B.tiller( length = 0.6, rise = 0.12 )
	# the outrigger: a float (ama) to port on two curved booms (iako) with stanchions, lashed
	fx = 1.94
	nu = 16
	for side in ( 1, ):
		pts = []
		for i in range( nu + 1 ):
			u = i / nu
			z = lerp( - 1.7, 1.7, u )
			r = 0.17 * math.sin( math.pi * u ) ** 0.45 + 0.02
			pts.append( ( z, r ) )
		for i in range( nu ):
			( za, ra ), ( zb, rb ) = pts[ i ], pts[ i + 1 ]
			cyl( mb, ( za, fx, 0.02 + 0.08 * ( 1 - math.sin( math.pi * i / nu ) ) ), ( zb, fx, 0.02 + 0.08 * ( 1 - math.sin( math.pi * ( i + 1 ) / nu ) ) ), ra, rb, 'M_NavalHullTar' if i in ( 0, nu - 1 ) else 'M_NavalSheerStripe', n = 10, cap0 = i == 0, cap1 = i == nu - 1 )
	for bx in ( - 0.75, 0.85 ):
		yr = B.rail( bx )
		a = Vector( ( bx, - 0.3, yr + 0.03 ) )
		m1 = Vector( ( bx, 0.9, yr + 0.12 ) )
		b = Vector( ( bx, fx, 0.42 ) )
		cyl( mb, a, m1, 0.04, 0.04, 'M_NavalSparTimber', n = 6 )
		cyl( mb, m1, b, 0.04, 0.035, 'M_NavalSparTimber', n = 6 )
		for dz in ( - 0.09, 0.09 ):
			cyl( mb, ( bx + dz, fx, 0.15 ), ( bx, fx, 0.42 ), 0.022, 0.022, 'M_NavalSparTimber', n = 4 )
		for t in ( 0.35, 0.7 ):
			torus( mb, ( bx, - 0.3 + ( 0.9 + 0.3 ) * t, yr + 0.03 + 0.09 * t ), 0.05, 0.012, 'M_NavalRiggingHemp', axis = ( 0, 1, 0 ), nu = 8, nv = 3 )
	# a slatted platform between the booms, a furled sail and its spar lashed along them
	for k in range( 6 ):
		y = 0.75 + k * 0.14
		box( mb, ( 0.05, y, B.rail( 0 ) + 0.2 ), ( 1.75, 0.09, 0.025 ), 'M_NavalSparTimber' )
	cyl( mb, ( - 1.2, - 0.45, B.rail( 0 ) + 0.1 ), ( 1.5, - 0.45, B.rail( 0 ) + 0.1 ), 0.07, 0.07, 'M_NavalTarp', n = 8 )
	cyl( mb, ( - 1.35, - 0.45, B.rail( 0 ) + 0.1 ), ( 1.65, - 0.45, B.rail( 0 ) + 0.1 ), 0.025, 0.025, 'M_NavalSparTimber', n = 6 )
	return B

def build_cutter():
	B = Boat( 'cutter' )
	H = B.hull( { 'um': 0.48, 'aft': ( 2.2, 1.0 ), 'fore': ( 2.4, 1.6 ), 'transom': 0.58, 'tuck': 0.05, 'counter': 0.25, 'stemRake': 0.3, 'forefoot': 0.7,
		'yMB': 0.5, 'tumble': 0.0, 'sharp': 1.7, 'fine': 1.4, 'transomRake': 0.25, 'postRake': 0.1, 'bulge': 0.05 } )
	mb = B.mb
	rail_band_boat( B, - 0.11, - 0.03, 'M_NavalSheerStripe' )
	B.inside()
	# a short foredeck with a coaming, the mast through it
	fd = 1.25
	xs = [ fd + ( H.xB( 0.6 ) - 0.05 - fd ) * i / 6 for i in range( 7 ) ]
	for a, b in zip( xs, xs[ 1: ] ):
		wa, wb = H.hbAt( a, 0.6 ) - 0.03, H.hbAt( b, 0.6 ) - 0.03
		mb.f( [ ( a, - wa, 0.6 ), ( b, - wb, 0.6 ), ( b, wb, 0.6 ), ( a, wa, 0.6 ) ], 'M_NavalDeckPlank', facing = ( 0, 0, 1 ) )
	box( mb, ( fd, 0, 0.64 ), ( 0.05, 2 * ( H.hbAt( fd, 0.6 ) - 0.04 ), 0.1 ), 'M_NavalSparTimber' )
	B.thwart( - 0.91 )
	B.thwart( 0.75 )
	B.thwart( - 1.62, y = B.rail( - 1.62 ) - 0.2, w = 0.45 )
	B.tiller()
	# the rig: a gaff mainsail on a 3.5 m mast with a boom, a small jib to the stemhead; the sail code the ship shader reads
	mx = 1.45
	top = 3.6
	cyl( mb, ( mx, 0, 0.1 ), ( mx, 0, top ), 0.055, 0.035, 'M_NavalSparTimber', n = 10 )
	throat, peak = Vector( ( mx - 0.08, 0, 2.6 ) ), Vector( ( mx - 1.7, 0, 3.45 ) )
	tack, clew = Vector( ( mx - 0.08, 0, 0.95 ) ), Vector( ( - 1.55, 0, 1.0 ) )
	cyl( mb, tack + Vector( ( 0, 0, - 0.04 ) ), clew + Vector( ( - 0.12, 0, - 0.04 ) ), 0.035, 0.03, 'M_NavalSparTimber', n = 6 )
	cyl( mb, throat + Vector( ( 0, 0, 0.04 ) ), peak + Vector( ( - 0.06, 0, 0.03 ) ), 0.03, 0.025, 'M_NavalSparTimber', n = 6 )
	quad_sail( mb, throat, peak, tack, clew, 10, 9, 0.2, 1, ( 0, - 1, 0 ) )
	sh = Vector( ( H.xB( 0.7 ) - 0.04, 0, B.rail( H.xF ) + 0.02 ) )
	tri_sail( mb, ( mx + 0.05, 0, 3.05 ), sh + Vector( ( - 0.05, 0, 0.06 ) ), ( mx + 0.35, 0, 0.95 ), 8, 8, 0.12, ( 0, - 1, 0 ) )
	rope( mb, ( mx + 0.04, 0, 3.1 ), sh, 0.008 )
	for side in ( 1, - 1 ):
		w = H.hbAt( mx - 0.1, B.rail( mx ) )
		rope( mb, ( mx, side * 0.04, 3.0 ), ( mx - 0.1, side * w, B.rail( mx ) + 0.02 ), 0.007 )
	rope( mb, clew, ( H.xA + 0.15, 0, B.rail( H.xA ) + 0.05 ), 0.008 )
	coil( mb, 0.25, 0.55, B.c[ 'deck' ] + 0.01, r = 0.14 )
	return B

def build_launch():
	B = Boat( 'launch' )
	H = B.hull( { 'um': 0.46, 'aft': ( 2.2, 1.0 ), 'fore': ( 2.5, 1.7 ), 'transom': 0.66, 'tuck': 0.05, 'counter': 0.2, 'stemRake': 0.35, 'forefoot': 0.7,
		'yMB': 0.5, 'tumble': 0.0, 'sharp': 1.6, 'fine': 1.3, 'transomRake': 0.15, 'postRake': 0.1, 'bulge': 0.06 } )
	mb = B.mb
	rail_band_boat( B, - 0.12, - 0.03, 'M_NavalSheerStripe' )
	strake_boat( B, 0.2, 0.26, 'M_NavalSheerStripe' )
	B.inside()
	B.thwart( - 0.91 )
	B.thwart( - 1.62, y = B.rail( - 1.62 ) - 0.2, w = 0.45 )
	B.tiller()
	# the cuddy (FleetBoatModel's WHEELHOUSE: |x| < 0.63, y 0.31 .. 1.68, z 1.2 .. 1.8): white sides with portlights, a sage roof,
	# brass handrails, the exhaust stack
	z0, z1, w, y0, yr = 1.2, 1.8, 0.62, 0.31, 1.24
	for side in ( 1, - 1 ):
		box( mb, ( ( z0 + z1 ) / 2, side * w, ( y0 + yr ) / 2 ), ( z1 - z0, 0.05, yr - y0 ), 'M_NavalSheerStripe' )
		box( mb, ( ( z0 + z1 ) / 2, side * ( w + 0.026 ), 0.98 ), ( 0.42, 0.012, 0.2 ), 'M_CabinGlass' )
		cyl( mb, ( z0 + 0.05, side * ( w - 0.05 ), yr + 0.15 ), ( z1 - 0.05, side * ( w - 0.05 ), yr + 0.15 ), 0.015, 0.015, 'M_NavalAgedBrass', n = 5 )
	box( mb, ( z0, 0, ( y0 + yr ) / 2 ), ( 0.05, 2 * w, yr - y0 ), 'M_NavalSheerStripe' )
	box( mb, ( z0 - 0.026, 0, 0.98 ), ( 0.012, 0.8, 0.22 ), 'M_CabinGlass' )
	box( mb, ( ( z0 + z1 ) / 2, 0, yr + 0.05 ), ( z1 - z0 + 0.14, 2 * w + 0.12, 0.08 ), 'M_NavalHullPlank' )
	cyl( mb, ( 1.42, 0.38, yr + 0.08 ), ( 1.42, 0.38, 1.66 ), 0.05, 0.045, 'M_NavalIron', n = 8 )
	cyl( mb, ( 1.42, 0.38, 1.6 ), ( 1.42, 0.38, 1.68 ), 0.06, 0.06, 'M_NavalBlackPaint', n = 8 )
	# fenders, a lifebuoy on the cuddy's back, a mooring coil, an engine box aft of the cuddy
	box( mb, ( 0.62, 0, B.c[ 'deck' ] + 0.22 ), ( 0.6, 0.6, 0.44 ), 'M_NavalSparTimber', skip = ( '-z', ) )
	torus( mb, ( z0 - 0.04, 0.3, 0.8 ), 0.17, 0.045, 'M_NavalSheerStripe', axis = ( 1, 0, 0 ), nu = 12, nv = 4 )
	for zf in ( - 0.9, 0.2 ):
		for side in ( 1, - 1 ):
			hb = H.hbAt( zf, 0.45 )
			cyl( mb, ( zf, side * ( hb + 0.06 ), 0.58 ), ( zf, side * ( hb + 0.07 ), 0.3 ), 0.06, 0.06, 'M_NavalTarp', n = 8 )
	coil( mb, 2.0, 0, 0.6, r = 0.12 )
	return B

def rail_band_boat( B, d0, d1, mat ):
	"""the sheer strake: a painted band under the gunwale following the sheer"""
	H, nu = B.H, 40
	xa, xb = H.xS( B.rail( H.xA ) + d1 ) + 0.03, H.xB( B.rail( H.xF ) + d1 ) - 0.06
	xs = [ lerp( xa, xb, 0.5 - 0.5 * math.cos( math.pi * i / nu ) ) for i in range( nu + 1 ) ]
	for side in ( 1, - 1 ):
		P = []
		for x in xs:
			y0, y1 = B.rail( x ) + d0, B.rail( x ) + d1
			a, b = H.hbAt( x, y0 ), H.hbAt( x, y1 )
			P.append( ( Vector( ( x, side * ( a + 0.008 ), y0 ) ), Vector( ( x, side * ( b + 0.008 ), y1 ) ) ) if a > 0.05 and b > 0.05 else None )
		for i in range( nu ):
			if P[ i ] and P[ i + 1 ]:
				B.mb.f( [ P[ i ][ 0 ], P[ i + 1 ][ 0 ], P[ i + 1 ][ 1 ], P[ i ][ 1 ] ], mat, facing = ( 0, side, 0 ), smooth = True, uvs = [ ( xs[ i ] / 4, 0 ), ( xs[ i + 1 ] / 4, 0 ), ( xs[ i + 1 ] / 4, 0.05 ), ( xs[ i ] / 4, 0.05 ) ] )

def strake_boat( B, y0, y1, mat ):
	B.H.strake( B.mb, y0, y1, mat, out = 0.012, nu = 30 )

# ------------------------------------------------------------------ export (the boat frame)

IMAGES = {}
def image( name ):
	if name in IMAGES: return IMAGES[ name ]
	a = textures.ALL[ name ]( 512 ); n = a.shape[ 0 ]
	im = bpy.data.images.new( name + '_BaseColor', n, n, alpha = False )
	px = np.ones( ( n, n, 4 ), dtype = np.float32 ); px[ :, :, :3 ] = a
	im.pixels.foreach_set( px.ravel() ); im.pack()
	IMAGES[ name ] = im
	return im

def material( kind, name ):
	key = kind + ':' + name
	m = bpy.data.materials.get( key )
	if m: return m
	m = bpy.data.materials.new( key ); m.use_nodes = True
	m.use_backface_culling = name not in DOUBLE
	b = m.node_tree.nodes.get( 'Principled BSDF' )
	tint, rough, metal = look( kind, name )
	if name in TEXMAP:
		t = m.node_tree.nodes.new( 'ShaderNodeTexImage' ); t.image = image( TEXMAP[ name ] )
		m.node_tree.links.new( t.outputs[ 'Color' ], b.inputs[ 'Base Color' ] )
	else: b.inputs[ 'Base Color' ].default_value = ( *tint, 1.0 )
	b.inputs[ 'Roughness' ].default_value = rough; b.inputs[ 'Metallic' ].default_value = metal
	return m

def export( kind, B ):
	mb = B.mb
	name = BOATS[ kind ][ 'file' ]
	me = bpy.data.meshes.new( name )
	mb.bm.normal_update(); mb.bm.to_mesh( me ); mb.bm.free()
	# the kit's frame (X bow, Y port) -> Blender's for the fleet (-Y bow, +X port): -90 degrees about Z
	me.transform( Matrix.Rotation( - math.pi / 2, 4, 'Z' ) )
	me.update()
	used = sorted( set( p.material_index for p in me.polygons ) )
	for n in mb.mats: me.materials.append( material( kind, n ) )
	ob = bpy.data.objects.new( name, me ); bpy.context.scene.collection.objects.link( ob )
	for o in bpy.context.scene.objects: o.select_set( o == ob )
	bpy.context.view_layer.objects.active = ob
	for i in reversed( range( len( me.materials ) ) ):
		if i not in used:
			ob.active_material_index = i; bpy.ops.object.material_slot_remove()
	path = os.path.join( OUT, name + '.glb' )
	os.makedirs( OUT, exist_ok = True )
	bpy.ops.export_scene.gltf( filepath = path, export_format = 'GLB', use_selection = True, export_yup = True, export_apply = True, export_texcoords = True,
		export_normals = True, export_materials = 'EXPORT', export_cameras = False, export_lights = False, export_extras = False, export_animations = False,
		export_skins = False, export_morph = False, export_image_format = 'JPEG', export_jpeg_quality = 86 )
	with open( path, 'rb' ) as fh: data = fh.read()
	jlen = struct.unpack_from( '<I', data, 12 )[ 0 ]
	j = json.loads( data[ 20: 20 + jlen ] ); rest = data[ 20 + jlen: ]
	for m in j.get( 'materials', [] ):
		n = m[ 'name' ].split( ':', 1 )[ - 1 ]; m[ 'name' ] = n
		tint, rough, metal = look( kind, n )
		p = m.setdefault( 'pbrMetallicRoughness', {} ); p[ 'baseColorFactor' ] = [ *tint, 1.0 ]; p[ 'roughnessFactor' ] = rough; p[ 'metallicFactor' ] = metal
	js = json.dumps( j, separators = ( ',', ':' ) ).encode( 'utf8' ); js += b' ' * ( ( 4 - len( js ) % 4 ) % 4 )
	with open( path, 'wb' ) as fh: fh.write( struct.pack( '<III', 0x46546C67, 2, 12 + 8 + len( js ) + len( rest ) ) + struct.pack( '<II', len( js ), 0x4E4F534A ) + js + rest )
	me.calc_loop_triangles()
	bb = [ [ round( min( v.co[ i ] for v in me.vertices ), 3 ), round( max( v.co[ i ] for v in me.vertices ), 3 ) ] for i in range( 3 ) ]
	print( 'MEASURE', json.dumps( { 'file': os.path.basename( path ), 'tris': len( me.loop_triangles ), 'bytes': os.path.getsize( path ), 'bounds': bb } ) )
	bpy.data.objects.remove( ob, do_unlink = True )

bpy.ops.wm.read_factory_settings( use_empty = True )
for kind, fn in ( ( 'skiff', build_skiff ), ( 'canoe', build_canoe ), ( 'cutter', build_cutter ), ( 'launch', build_launch ) ):
	if kind in WHICH: export( kind, fn() )
