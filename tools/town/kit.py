# Wave 18C: the town dressing kit, modelled in Blender (headless) and exported as one GLB.
#
#   D:\blender\blender.exe -b --factory-startup --python tools/town/kit.py -- public/models/town/kit.glb [preview.png]
#
# Every piece is one root object named after it (src/world/village/TownKit.js reads them by name), its origin the anchor
# the game places it by (ground centre, or the wall mount for signs, lanterns and awnings). Blender front is -Y (glTF +Z:
# the game's local front), up +Z. No textures: one material per colour whose name tells the game's prop material its
# pattern (wood_*, paint_*, cloth_*, stone_*, iron, rust_*, gold, glow_* = lamp glass lit at night, water, leaf_*, ...).
# Triangle budget: ~600-4000 per piece (lettering is the bulk of the signs).
import bpy, bmesh, math, sys
from mathutils import Matrix, Vector

argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
OUT = argv[ 0 ] if argv else 'kit.glb'
PREVIEW = argv[ 1 ] if len( argv ) > 1 else None

# name: ( sRGB hex, roughness, metallic )
MATS = {
	'wood_dark': ( 0x4a3526, 0.85, 0 ), 'wood_mid': ( 0x7a5a3c, 0.85, 0 ), 'wood_light': ( 0xa07c55, 0.85, 0 ),
	'wood_grey': ( 0x6e6458, 0.9, 0 ),
	'paint_green': ( 0x2f5a46, 0.55, 0 ), 'paint_navy': ( 0x23384f, 0.55, 0 ), 'paint_cream': ( 0xeee3c8, 0.6, 0 ),
	'paint_red': ( 0x8e2f25, 0.55, 0 ), 'paint_white': ( 0xf0ece2, 0.6, 0 ), 'paint_black': ( 0x1c1c1c, 0.5, 0 ),
	'paint_teal': ( 0x2d7f7a, 0.55, 0 ), 'paint_blue': ( 0x3f79ae, 0.55, 0 ), 'paint_yellow': ( 0xe0b545, 0.55, 0 ),
	'gold': ( 0xc9a24a, 0.35, 0.9 ), 'iron': ( 0x1f2226, 0.5, 0.7 ), 'rust_iron': ( 0x5a3d2c, 0.7, 0.4 ),
	'stone_light': ( 0xc2b9a6, 0.95, 0 ), 'stone_mid': ( 0xa39b8c, 0.95, 0 ), 'stone_dark': ( 0x7b746a, 0.95, 0 ),
	'brick': ( 0x9a4a36, 0.9, 0 ), 'terracotta': ( 0xb5653a, 0.85, 0 ),
	'cloth_red': ( 0xb03a2e, 0.9, 0 ), 'cloth_cream': ( 0xece2c6, 0.9, 0 ), 'cloth_green': ( 0x2f6a5a, 0.9, 0 ),
	'cloth_blue': ( 0x2f5b8a, 0.9, 0 ), 'cloth_net': ( 0x3d5a4a, 0.95, 0 ), 'cloth_sail': ( 0xb8ac94, 0.95, 0 ),
	'leaf_mid': ( 0x3f7a35, 0.8, 0 ), 'leaf_dark': ( 0x2d5a28, 0.8, 0 ), 'soil': ( 0x3a2a1e, 1.0, 0 ),
	'flower_red': ( 0xd8343a, 0.7, 0 ), 'flower_pink': ( 0xe87fa8, 0.7, 0 ), 'flower_yellow': ( 0xf2c53a, 0.7, 0 ),
	'flower_white': ( 0xf4f0e6, 0.7, 0 ), 'flower_blue': ( 0x5a7fd8, 0.7, 0 ),
	'water': ( 0x4f97a2, 0.05, 0 ), 'bone': ( 0xe6dcc0, 0.6, 0 ), 'glow_warm': ( 0xffd9a0, 0.3, 0 ),
}

def srgb( h ):

	c = [ ( ( h >> s ) & 255 ) / 255 for s in ( 16, 8, 0 ) ]
	return [ ( x / 12.92 if x <= 0.04045 else ( ( x + 0.055 ) / 1.055 ) ** 2.4 ) for x in c ] + [ 1 ]

def material( name ):

	m = bpy.data.materials.get( name )
	if m: return m
	h, r, mt = MATS[ name ]
	m = bpy.data.materials.new( name )
	m.use_nodes = True
	b = m.node_tree.nodes.get( 'Principled BSDF' )
	b.inputs[ 'Base Color' ].default_value = srgb( h )
	b.inputs[ 'Roughness' ].default_value = r
	b.inputs[ 'Metallic' ].default_value = mt
	m.diffuse_color = srgb( h )
	return m

# ---- a piece: one bmesh, faces tagged with a material slot; smooth flags per primitive

class Piece:

	def __init__( self, name ):

		self.name = name
		self.bm = bmesh.new()
		self.mats = []
		self.keep = set() # faces wound by hand (lathes, two-sided quads, drapes): not re-oriented

	def slot( self, mat ):

		if mat not in self.mats: self.mats.append( mat )
		return self.mats.index( mat )

	def _take( self, geom_verts, mat, smooth ):

		faces = set()
		for v in geom_verts:
			for f in v.link_faces: faces.add( f )
		i = self.slot( mat )
		for f in faces:
			f.material_index = i
			f.smooth = smooth

	def box( self, size, loc, mat, rot = ( 0, 0, 0 ) ):

		r = bmesh.ops.create_cube( self.bm, size = 1, matrix = M( loc, rot, size ) )
		self._take( r[ 'verts' ], mat, False )

	def cyl( self, r1, r2, h, loc, mat, seg = 12, rot = ( 0, 0, 0 ), smooth = True, caps = True ):

		# along +Z from loc (base) to loc + h
		m = M( loc, rot ) @ Matrix.Translation( ( 0, 0, h / 2 ) )
		r = bmesh.ops.create_cone( self.bm, cap_ends = caps, cap_tris = False, segments = seg, radius1 = r1, radius2 = r2, depth = h, matrix = m )
		self._take( r[ 'verts' ], mat, smooth )
		if caps:
			for f in { f for v in r[ 'verts' ] for f in v.link_faces }:
				if len( f.verts ) > 4: f.smooth = False

	def sphere( self, r, loc, mat, scale = ( 1, 1, 1 ), sub = 1, rot = ( 0, 0, 0 ), smooth = True ):

		res = bmesh.ops.create_icosphere( self.bm, subdivisions = sub, radius = r, matrix = M( loc, rot, scale ) )
		self._take( res[ 'verts' ], mat, smooth )

	def torus( self, R, r, loc, mat, rot = ( 0, 0, 0 ), seg = 12, rseg = 6, arc = 2 * math.pi ):

		verts = []
		ring = []
		n = seg if arc >= 2 * math.pi - 1e-6 else seg + 1
		for i in range( n ):
			a = arc * i / seg
			row = []
			for j in range( rseg ):
				b = 2 * math.pi * j / rseg
				p = Vector( ( ( R + r * math.cos( b ) ) * math.cos( a ), ( R + r * math.cos( b ) ) * math.sin( a ), r * math.sin( b ) ) )
				row.append( self.bm.verts.new( M( loc, rot ) @ p ) )
			ring.append( row )
		closed = n == seg
		for i in range( seg if closed else n - 1 ):
			a, b = ring[ i ], ring[ ( i + 1 ) % n ]
			for j in range( rseg ):
				self.bm.faces.new( ( a[ j ], b[ j ], b[ ( j + 1 ) % rseg ], a[ ( j + 1 ) % rseg ] ) )
			verts += a
		self._take( verts + ring[ - 1 ], mat, True )

	def lathe( self, prof, loc, mat, seg = 16, smooth = True ):

		# prof: [ ( r, z ) ] bottom to top, around +Z
		rings = []
		for ( r, z ) in prof:
			row = []
			for i in range( seg ):
				a = 2 * math.pi * i / seg
				row.append( self.bm.verts.new( Vector( loc ) + Vector( ( max( r, 1e-4 ) * math.cos( a ), max( r, 1e-4 ) * math.sin( a ), z ) ) ) )
			rings.append( row )
		for k in range( len( rings ) - 1 ):
			a, b = rings[ k ], rings[ k + 1 ]
			for i in range( seg ):
				self.keep.add( self.bm.faces.new( ( a[ i ], a[ ( i + 1 ) % seg ], b[ ( i + 1 ) % seg ], b[ i ] ) ) )
		self._take( [ v for r in rings for v in r ], mat, smooth )

	def quad( self, pts, mat, smooth = False ):

		vs = [ self.bm.verts.new( Vector( p ) ) for p in pts ]
		self.keep.add( self.bm.faces.new( vs ) )
		self._take( vs, mat, smooth )

	def text( self, body, size, loc, mat, depth = 0.015, rot = ( math.pi / 2, 0, 0 ), align = 'CENTER', font = None, shear = 0 ):

		cu = bpy.data.curves.new( 'txt', 'FONT' )
		cu.body = body
		cu.size = size
		cu.extrude = depth / 2
		cu.align_x = align
		cu.align_y = 'CENTER'
		cu.resolution_u = 2
		cu.shear = shear
		ob = bpy.data.objects.new( 'txt', cu )
		bpy.context.scene.collection.objects.link( ob )
		dg = bpy.context.evaluated_depsgraph_get()
		me = bpy.data.meshes.new_from_object( ob.evaluated_get( dg ) )
		bm2 = bmesh.new()
		bm2.from_mesh( me )
		bmesh.ops.triangulate( bm2, faces = bm2.faces[ : ] )
		bmesh.ops.transform( bm2, matrix = M( loc, rot ), verts = bm2.verts[ : ] )
		tmp = bpy.data.meshes.new( 'tmp' )
		bm2.to_mesh( tmp )
		bm2.free()
		before = set( self.bm.verts )
		self.bm.from_mesh( tmp )
		new = [ v for v in self.bm.verts if v not in before ]
		self._take( new, mat, False )
		bpy.data.objects.remove( ob )
		bpy.data.curves.remove( cu )
		bpy.data.meshes.remove( me )
		bpy.data.meshes.remove( tmp )
		return

	def finish( self ):

		me = bpy.data.meshes.new( self.name )
		bmesh.ops.recalc_face_normals( self.bm, faces = [ f for f in self.bm.faces if f not in self.keep ] )
		self.bm.to_mesh( me )
		self.bm.free()
		for m in self.mats: me.materials.append( material( m ) )
		ob = bpy.data.objects.new( self.name, me )
		bpy.context.scene.collection.objects.link( ob )
		return ob

def M( loc, rot = ( 0, 0, 0 ), scale = ( 1, 1, 1 ) ):

	if isinstance( scale, ( int, float ) ): scale = ( scale, scale, scale )
	S = Matrix.Diagonal( ( scale[ 0 ], scale[ 1 ], scale[ 2 ], 1 ) )
	R = ( Matrix.Rotation( rot[ 2 ], 4, 'Z' ) @ Matrix.Rotation( rot[ 1 ], 4, 'Y' ) @ Matrix.Rotation( rot[ 0 ], 4, 'X' ) )
	return Matrix.Translation( loc ) @ R @ S

# ---------------------------------------------------------------------------------------------------- the pieces

def fascia( name, w, h, board, frame, ink, words, size, emblem = None, tilt = 0.0, rough = False ):

	# a name board on the wall: origin at its back centre (on the wall), the lettering facing -Y
	p = Piece( name )
	t = 0.07
	p.box( ( w, t, h ), ( 0, - t / 2, 0 ), board, rot = ( 0, tilt, 0 ) )
	if frame:
		for s in ( - 1, 1 ):
			p.box( ( w + 0.08, 0.05, 0.06 ), ( 0, - t - 0.02, s * ( h / 2 + 0.01 ) ), frame, rot = ( 0, tilt, 0 ) )
			p.box( ( 0.06, 0.05, h + 0.08 ), ( s * ( w / 2 + 0.01 ), - t - 0.02, 0 ), frame, rot = ( 0, tilt, 0 ) )
	p.text( words, size, ( 0, - t - 0.008, - size * 0.05 ), ink, rot = ( math.pi / 2, tilt, 0 ), shear = 0.08 if rough else 0 )
	if emblem == 'fish':
		for s in ( - 1, 1 ):
			x = s * ( w / 2 - 0.45 )
			p.sphere( 0.17, ( x, - t - 0.02, 0 ), ink, scale = ( 1.6, 0.25, 0.75 ), sub = 1 )
			p.box( ( 0.16, 0.03, 0.22 ), ( x + s * 0.3, - t - 0.02, 0 ), ink, rot = ( 0, math.pi / 4, 0 ) )
	if emblem == 'skull':
		for s in ( - 1, 1 ):
			x = s * ( w / 2 - 0.22 )
			p.sphere( 0.16, ( x, - t - 0.05, 0.03 ), 'bone', scale = ( 1, 0.6, 1 ), sub = 1 )
			p.box( ( 0.18, 0.06, 0.1 ), ( x, - t - 0.05, - 0.13 ), 'bone' )
			for e in ( - 1, 1 ): p.sphere( 0.04, ( x + e * 0.06, - t - 0.14, 0.04 ), 'paint_black', sub = 0 )
	# two iron hangers on top
	for s in ( - 1, 1 ): p.box( ( 0.04, 0.12, 0.12 ), ( s * w * 0.35, - 0.06, h / 2 + 0.04 ), 'iron' )
	return p.finish()

def hanging_sign( name, board, ink, emblem ):

	# a projecting bracket off the wall (+Y is the wall, the arm runs out along -Y), the board hangs edge-on to the wall
	p = Piece( name )
	p.box( ( 0.12, 0.04, 0.5 ), ( 0, - 0.02, 0 ), 'iron' )
	p.box( ( 0.05, 1.15, 0.05 ), ( 0, - 0.58, 0.2 ), 'iron' )
	p.box( ( 0.04, 0.04, 0.6 ), ( 0, - 0.35, - 0.02 ), 'iron', rot = ( - 0.9, 0, 0 ) )
	p.torus( 0.12, 0.012, ( 0, - 0.3, 0.07 ), 'iron', rot = ( 0, math.pi / 2, 0 ), seg = 10, rseg = 4 )
	for y in ( - 0.78, - 1.06 ):
		p.box( ( 0.015, 0.015, 0.22 ), ( 0, y, 0.07 ), 'iron' )
	p.box( ( 0.06, 0.62, 0.5 ), ( 0, - 0.92, - 0.29 ), board )
	p.box( ( 0.07, 0.66, 0.04 ), ( 0, - 0.92, - 0.04 ), 'gold' )
	p.box( ( 0.07, 0.66, 0.04 ), ( 0, - 0.92, - 0.54 ), 'gold' )
	if emblem == 'tankard':
		for s in ( - 1, 1 ):
			p.cyl( 0.1, 0.11, 0.24, ( s * 0.04, - 0.9, - 0.42 ), 'gold', seg = 10, rot = ( 0, 0, 0 ) )
			p.cyl( 0.115, 0.115, 0.04, ( s * 0.04, - 0.9, - 0.2 ), ink, seg = 10 )
			p.torus( 0.07, 0.018, ( s * 0.045, - 0.77, - 0.3 ), 'gold', rot = ( math.pi / 2, 0, 0 ), seg = 8, rseg = 4, arc = math.pi )
	elif emblem == 'anchor':
		for s in ( - 1, 1 ):
			x = s * 0.04
			p.box( ( 0.02, 0.05, 0.3 ), ( x, - 0.92, - 0.3 ), ink )
			p.box( ( 0.02, 0.2, 0.04 ), ( x, - 0.92, - 0.18 ), ink )
			p.torus( 0.1, 0.02, ( x, - 0.92, - 0.38 ), ink, rot = ( 0, math.pi / 2, 0 ), seg = 10, rseg = 4, arc = math.pi )
	return p.finish()

def lamp_street():

	p = Piece( 'lamp_street' )
	p.cyl( 0.22, 0.2, 0.25, ( 0, 0, 0 ), 'iron', seg = 8, smooth = False )
	p.cyl( 0.15, 0.12, 0.3, ( 0, 0, 0.25 ), 'iron', seg = 8 )
	p.cyl( 0.075, 0.055, 2.75, ( 0, 0, 0.55 ), 'iron', seg = 8 )
	for z in ( 0.6, 1.6, 3.2 ): p.torus( 0.08, 0.02, ( 0, 0, z ), 'iron', seg = 10, rseg = 4 )
	# the lantern: a tapering iron cage round four glass panes, a cap and a finial
	z0 = 3.3
	p.cyl( 0.14, 0.18, 0.06, ( 0, 0, z0 ), 'iron', seg = 4, rot = ( 0, 0, math.pi / 4 ), smooth = False )
	p.cyl( 0.15, 0.2, 0.5, ( 0, 0, z0 + 0.06 ), 'glow_warm', seg = 4, rot = ( 0, 0, math.pi / 4 ), smooth = False, caps = False )
	for a in range( 4 ):
		ang = a * math.pi / 2 + math.pi / 4
		x, y = math.cos( ang ) * 0.17, math.sin( ang ) * 0.17
		p.box( ( 0.03, 0.03, 0.52 ), ( x, y, z0 + 0.32 ), 'iron', rot = ( 0, 0, ang ) )
	p.cyl( 0.27, 0.05, 0.22, ( 0, 0, z0 + 0.56 ), 'iron', seg = 4, rot = ( 0, 0, math.pi / 4 ), smooth = False )
	p.sphere( 0.045, ( 0, 0, z0 + 0.82 ), 'iron', sub = 1 )
	return p.finish()

def lantern_wall():

	# origin on the wall (the plate), the lantern hangs 0.45 m out (-Y), its glass at z -0.35
	p = Piece( 'lantern_wall' )
	p.box( ( 0.14, 0.03, 0.26 ), ( 0, - 0.015, 0 ), 'iron' )
	p.box( ( 0.03, 0.5, 0.03 ), ( 0, - 0.26, 0.08 ), 'iron' )
	p.box( ( 0.025, 0.025, 0.36 ), ( 0, - 0.16, - 0.06 ), 'iron', rot = ( - 0.95, 0, 0 ) )
	p.box( ( 0.015, 0.015, 0.1 ), ( 0, - 0.46, 0.03 ), 'iron' )
	p.cyl( 0.13, 0.04, 0.1, ( 0, - 0.46, - 0.07 ), 'iron', seg = 6, smooth = False )
	p.cyl( 0.09, 0.07, 0.24, ( 0, - 0.46, - 0.31 ), 'glow_warm', seg = 6, smooth = False, caps = False )
	for a in range( 3 ):
		ang = a * 2 * math.pi / 3
		p.box( ( 0.018, 0.018, 0.26 ), ( math.cos( ang ) * 0.09, - 0.46 + math.sin( ang ) * 0.09, - 0.2 ), 'iron' )
	p.cyl( 0.1, 0.1, 0.04, ( 0, - 0.46, - 0.35 ), 'iron', seg = 6, smooth = False )
	return p.finish()

def bench():

	# a park bench, seat facing -Y, seat 0.45 m up, 1.8 m long; origin on the ground at its centre
	p = Piece( 'bench' )
	for s in ( - 1, 1 ):
		x = s * 0.78
		p.box( ( 0.06, 0.5, 0.06 ), ( x, 0, 0.42 ), 'iron' )
		p.box( ( 0.06, 0.06, 0.44 ), ( x, - 0.2, 0.21 ), 'iron', rot = ( 0.12, 0, 0 ) )
		p.box( ( 0.06, 0.06, 0.48 ), ( x, 0.2, 0.22 ), 'iron', rot = ( - 0.12, 0, 0 ) )
		p.box( ( 0.06, 0.06, 0.5 ), ( x, 0.24, 0.68 ), 'iron', rot = ( - 0.25, 0, 0 ) )
		p.box( ( 0.05, 0.42, 0.05 ), ( x, - 0.02, 0.66 ), 'iron' )
		p.box( ( 0.07, 0.09, 0.06 ), ( x, - 0.24, 0.68 ), 'iron' )
	for k in range( 4 ):
		p.box( ( 1.8, 0.1, 0.035 ), ( 0, - 0.17 + k * 0.115, 0.46 ), 'paint_green' )
	for k in range( 3 ):
		p.box( ( 1.8, 0.035, 0.09 ), ( 0, 0.2 + k * 0.03, 0.6 + k * 0.12 ), 'paint_green', rot = ( - 0.25, 0, 0 ) )
	return p.finish()

FLOWERS = { 'a': ( 'flower_red', 'flower_pink', 'flower_white' ), 'b': ( 'flower_yellow', 'flower_white', 'flower_blue' ) }

def flowerbox( v, paint ):

	# a window box: origin at its back bottom centre (on the wall under a sill), 1.1 m long
	p = Piece( 'flowerbox_' + v )
	p.box( ( 1.1, 0.24, 0.2 ), ( 0, - 0.14, 0.1 ), paint )
	p.box( ( 1.04, 0.2, 0.02 ), ( 0, - 0.14, 0.19 ), 'soil' )
	for s in ( - 1, 1 ): p.box( ( 0.05, 0.2, 0.08 ), ( s * 0.4, - 0.08, - 0.04 ), 'iron' )
	cols = FLOWERS[ v ]
	import random
	rnd = random.Random( 7 if v == 'a' else 11 )
	for k in range( 9 ):
		x = - 0.47 + k * 0.118 + rnd.uniform( - 0.03, 0.03 )
		p.sphere( 0.085, ( x, - 0.14 + rnd.uniform( - 0.04, 0.04 ), 0.26 ), 'leaf_mid' if k % 2 else 'leaf_dark', scale = ( 1, 1, 0.7 ), sub = 0, smooth = False )
	for k in range( 12 ):
		x = - 0.48 + k * 0.087 + rnd.uniform( - 0.02, 0.02 )
		p.sphere( 0.045, ( x, - 0.16 + rnd.uniform( - 0.06, 0.05 ), 0.3 + rnd.uniform( 0, 0.08 ) ), cols[ k % 3 ], sub = 0, smooth = False )
	# a few trailing leaves over the front
	for k in range( 4 ):
		p.sphere( 0.05, ( - 0.4 + k * 0.27, - 0.27, 0.13 ), 'leaf_mid', scale = ( 1, 0.6, 1.8 ), sub = 0, smooth = False )
	return p.finish()

def planter():

	# a half barrel tub with a bush and flowers; origin on the ground
	import random
	rnd = random.Random( 5 )
	p = Piece( 'planter' )
	p.lathe( [ ( 0.36, 0 ), ( 0.4, 0.2 ), ( 0.42, 0.42 ), ( 0.4, 0.45 ), ( 0.36, 0.45 ), ( 0.35, 0.4 ) ], ( 0, 0, 0 ), 'wood_mid', seg = 12 )
	for z in ( 0.08, 0.36 ): p.torus( 0.405 if z > 0.2 else 0.385, 0.015, ( 0, 0, z ), 'iron', seg = 12, rseg = 3 )
	p.cyl( 0.36, 0.36, 0.02, ( 0, 0, 0.38 ), 'soil', seg = 12 )
	for k in range( 7 ):
		a = k / 7 * math.pi * 2
		p.sphere( 0.2, ( math.cos( a ) * 0.18, math.sin( a ) * 0.18, 0.62 + rnd.uniform( 0, 0.12 ) ), 'leaf_dark' if k % 2 else 'leaf_mid', sub = 1, smooth = False )
	p.sphere( 0.24, ( 0, 0, 0.82 ), 'leaf_mid', sub = 1, smooth = False )
	for k in range( 9 ):
		a = rnd.uniform( 0, math.pi * 2 )
		r = rnd.uniform( 0.12, 0.3 )
		p.sphere( 0.05, ( math.cos( a ) * r, math.sin( a ) * r, 0.75 + rnd.uniform( 0, 0.25 ) ), ( 'flower_red', 'flower_yellow', 'flower_pink' )[ k % 3 ], sub = 0, smooth = False )
	return p.finish()

def fountain():

	# the square's fountain: an octagonal basin, a pedestal with two bowls, water falling into each; origin ground centre
	p = Piece( 'fountain' )
	R = 2.3
	p.cyl( R + 0.15, R + 0.2, 0.12, ( 0, 0, 0 ), 'stone_dark', seg = 8, smooth = False )
	p.lathe( [ ( R, 0.1 ), ( R, 0.55 ), ( R - 0.32, 0.55 ), ( R - 0.32, 0.2 ) ], ( 0, 0, 0 ), 'stone_light', seg = 8, smooth = False )
	p.lathe( [ ( R + 0.06, 0.55 ), ( R + 0.06, 0.63 ), ( R - 0.38, 0.63 ), ( R - 0.38, 0.55 ) ], ( 0, 0, 0 ), 'stone_mid', seg = 8, smooth = False )
	p.cyl( R - 0.32, R - 0.32, 0.02, ( 0, 0, 0.42 ), 'water', seg = 16 )
	# pedestal and bowls (lathe profiles)
	p.lathe( [ ( 0.42, 0.2 ), ( 0.36, 0.35 ), ( 0.24, 0.5 ), ( 0.2, 1.0 ), ( 0.28, 1.12 ), ( 0.3, 1.18 ) ], ( 0, 0, 0 ), 'stone_light', seg = 12 )
	p.lathe( [ ( 0.25, 1.15 ), ( 0.75, 1.24 ), ( 1.05, 1.36 ), ( 1.1, 1.45 ), ( 1.0, 1.45 ), ( 0.3, 1.32 ) ], ( 0, 0, 0 ), 'stone_mid', seg = 16 )
	p.cyl( 1.0, 1.0, 0.02, ( 0, 0, 1.4 ), 'water', seg = 16 )
	p.lathe( [ ( 0.16, 1.4 ), ( 0.12, 1.75 ), ( 0.17, 1.85 ) ], ( 0, 0, 0 ), 'stone_light', seg = 10 )
	p.lathe( [ ( 0.15, 1.85 ), ( 0.42, 1.92 ), ( 0.6, 2.02 ), ( 0.62, 2.08 ), ( 0.55, 2.08 ), ( 0.18, 1.98 ) ], ( 0, 0, 0 ), 'stone_mid', seg = 14 )
	p.cyl( 0.55, 0.55, 0.02, ( 0, 0, 2.04 ), 'water', seg = 14 )
	p.lathe( [ ( 0.08, 2.04 ), ( 0.06, 2.3 ), ( 0.1, 2.36 ), ( 0.001, 2.52 ) ], ( 0, 0, 0 ), 'stone_light', seg = 8 )
	# falling water: thin streams from the bowls' lips (eight from the lower, six from the upper) and the jet on top
	for k in range( 8 ):
		a = k / 8 * 2 * math.pi
		p.cyl( 0.03, 0.045, 0.98, ( math.cos( a ) * 1.12, math.sin( a ) * 1.12, 0.45 ), 'water', seg = 5, caps = False )
	for k in range( 6 ):
		a = ( k + 0.5 ) / 6 * 2 * math.pi
		p.cyl( 0.025, 0.035, 0.62, ( math.cos( a ) * 0.64, math.sin( a ) * 0.64, 1.42 ), 'water', seg = 5, caps = False )
	p.cyl( 0.03, 0.05, 0.3, ( 0, 0, 2.5 ), 'water', seg = 6, caps = False )
	p.sphere( 0.08, ( 0, 0, 2.82 ), 'water', sub = 1 )
	return p.finish()

def awning( name, a, b, w = 3.0, depth = 1.3, drop = 0.45, n = 10 ):

	# a striped shop awning: origin at its top centre on the wall, sloping out and down to -Y; a scalloped valance
	p = Piece( name )
	for k in range( n ):
		x0 = - w / 2 + k * w / n
		x1 = x0 + w / n
		m = a if k % 2 == 0 else b
		p.quad( [ ( x0, 0, 0 ), ( x0, - depth, - drop ), ( x1, - depth, - drop ), ( x1, 0, 0 ) ], m )
		p.quad( [ ( x1, 0, 0.01 ), ( x1, - depth, - drop + 0.01 ), ( x0, - depth, - drop + 0.01 ), ( x0, 0, 0.01 ) ], m )
		xm = ( x0 + x1 ) / 2
		for sgn in ( 1, - 1 ):
			pts = [ ( x0, - depth, - drop ), ( x1, - depth, - drop ), ( xm, - depth, - drop - 0.22 ) ]
			p.quad( pts if sgn > 0 else pts[ : : - 1 ], m )
	p.box( ( w + 0.06, 0.06, 0.05 ), ( 0, 0.0, 0.0 ), 'iron' )
	p.box( ( w + 0.04, 0.04, 0.04 ), ( 0, - depth, - drop ), 'iron' )
	for s in ( - 1, 1 ):
		# a brace from the wall 0.75 m down to the front rail
		dz = 0.75 - drop
		L = math.hypot( depth, dz )
		p.box( ( 0.03, 0.03, L ), ( s * w / 2, - depth / 2, - 0.75 + dz / 2 ), 'iron', rot = ( math.atan2( depth, dz ), 0, 0 ) )
	return p.finish()

def netrack():

	# two posts, a rail, a net drying over it with floats; origin ground centre, 3 m long along X
	p = Piece( 'netrack' )
	for s in ( - 1, 1 ):
		p.box( ( 0.12, 0.12, 2.0 ), ( s * 1.5, 0, 1.0 ), 'wood_grey' )
		p.box( ( 0.08, 0.5, 0.08 ), ( s * 1.5, 0, 0.3 ), 'wood_grey', rot = ( 0.0, 0, 0 ) )
	p.cyl( 0.045, 0.045, 3.3, ( - 1.65, 0, 1.92 ), 'wood_grey', seg = 6, rot = ( 0, math.pi / 2, 0 ) )
	# the net: a draped sheet on both sides of the rail with folds
	cols, rows = 16, 6
	for side in ( - 1, 1 ):
		grid = []
		for j in range( rows + 1 ):
			row = []
			for i in range( cols + 1 ):
				x = - 1.4 + 2.8 * i / cols
				t = j / rows
				fold = math.sin( i * 1.3 + side ) * 0.05 * t
				z = 1.9 - t * ( 1.1 + 0.25 * math.sin( i * 0.7 ) ** 2 )
				y = side * ( 0.05 + t * 0.18 ) + fold
				row.append( p.bm.verts.new( ( x, y, z ) ) )
			grid.append( row )
		vs = []
		for j in range( rows ):
			for i in range( cols ):
				q = ( grid[ j ][ i ], grid[ j ][ i + 1 ], grid[ j + 1 ][ i + 1 ], grid[ j + 1 ][ i ] )
				p.keep.add( p.bm.faces.new( q if side > 0 else q[ : : - 1 ] ) )
			vs += grid[ j ]
		p._take( vs + grid[ rows ], 'cloth_net', True )
	for k in range( 7 ):
		p.sphere( 0.07, ( - 1.3 + k * 0.43, 0, 1.97 ), 'paint_red' if k % 2 else 'paint_white', sub = 1 )
	return p.finish()

def rum_barrels():

	# Blackwater: a rack of three rum barrels and a tap; origin ground centre
	p = Piece( 'rum_barrels' )
	prof = [ ( 0.3, - 0.42 ), ( 0.36, - 0.2 ), ( 0.38, 0 ), ( 0.36, 0.2 ), ( 0.3, 0.42 ) ]
	for k, ( x, z ) in enumerate( [ ( - 0.4, 0.55 ), ( 0.4, 0.55 ), ( 0, 1.2 ) ] ):
		b = Piece( 'tmp' )
		p.lathe( [ ( r, h ) for r, h in prof ], ( 0, 0, 0 ), 'wood_mid', seg = 12 )
		# rotate the last lathe (its 5 rings) onto its side: lathe is along Z, the barrels lie along Y
		new = list( p.bm.verts )[ - 12 * 5: ]
		bmesh.ops.transform( p.bm, matrix = M( ( x, 0, z ), ( math.pi / 2, 0, 0 ) ), verts = new )
		for zz in ( - 0.3, 0.3 ):
			p.torus( 0.37, 0.015, ( x, zz, z ), 'iron', rot = ( math.pi / 2, 0, 0 ), seg = 12, rseg = 3 )
		p.cyl( 0.3, 0.3, 0.01, ( x, - 0.43, z ), 'wood_dark', seg = 12, rot = ( math.pi / 2, 0, 0 ) )
		b.bm.free()
	p.box( ( 1.6, 0.9, 0.12 ), ( 0, 0, 0.06 ), 'wood_dark' )
	for s in ( - 1, 1 ): p.box( ( 0.12, 0.9, 0.2 ), ( s * 0.78, 0, 0.18 ), 'wood_dark' )
	p.cyl( 0.025, 0.025, 0.12, ( 0, - 0.44, 1.12 ), 'gold', seg = 6, rot = ( math.pi / 2, 0, 0 ) )
	return p.finish()

def skull_pole():

	# Blackwater: a pole with a skull and crossed bones, rags tied below; origin ground
	p = Piece( 'skull_pole' )
	p.cyl( 0.06, 0.05, 2.6, ( 0, 0, 0 ), 'wood_grey', seg = 6 )
	p.sphere( 0.15, ( 0, 0, 2.75 ), 'bone', scale = ( 1, 1.05, 1 ), sub = 2 )
	p.box( ( 0.17, 0.12, 0.09 ), ( 0, - 0.04, 2.6 ), 'bone' )
	for s in ( - 1, 1 ):
		p.sphere( 0.04, ( s * 0.06, - 0.13, 2.76 ), 'paint_black', sub = 1 )
		p.cyl( 0.025, 0.025, 0.6, ( - s * 0.25, 0, 2.15 ), 'bone', seg = 6, rot = ( 0, s * 0.95, 0 ) )
	p.box( ( 0.25, 0.02, 0.4 ), ( 0.06, - 0.06, 1.7 ), 'cloth_red', rot = ( 0, 0.2, 0.1 ) )
	return p.finish()

def chimney_pots():

	# a brick stack with two clay pots (cap of the taller houses); origin at its base centre
	p = Piece( 'chimney_pots' )
	p.box( ( 0.8, 0.55, 1.2 ), ( 0, 0, 0.6 ), 'brick' )
	p.box( ( 0.92, 0.67, 0.1 ), ( 0, 0, 1.22 ), 'stone_mid' )
	for s in ( - 1, 1 ):
		p.lathe( [ ( 0.12, 1.25 ), ( 0.1, 1.45 ), ( 0.08, 1.55 ), ( 0.1, 1.6 ), ( 0.06, 1.6 ) ], ( s * 0.2, 0, 0 ), 'terracotta', seg = 8 )
	return p.finish()

# ---------------------------------------------------------------------------------------------------- build, export

for o in list( bpy.data.objects ): bpy.data.objects.remove( o )

pieces = [
	fascia( 'sign_tavern', 5.4, 0.8, 'paint_green', 'gold', 'gold', 'THE TIDE & TANKARD', 0.38 ),
	fascia( 'sign_chandler', 5.6, 0.72, 'paint_navy', 'paint_cream', 'paint_cream', "MARLOW'S CHANDLERY", 0.36 ),
	fascia( 'sign_fishhall', 5.4, 0.85, 'paint_white', 'paint_navy', 'paint_navy', 'FISH HALL', 0.5, emblem = 'fish' ),
	fascia( 'sign_harbour', 3.8, 0.5, 'paint_navy', 'paint_white', 'paint_white', 'HARBOURMASTER', 0.3 ),
	fascia( 'sign_rumhole', 3.9, 0.85, 'wood_dark', None, 'bone', 'RUM HOLE', 0.44, emblem = 'skull', tilt = 0.05, rough = True ),
	fascia( 'sign_blackmarket', 3.6, 0.6, 'wood_dark', None, 'cloth_red', 'BLACK MARKET', 0.36, tilt = - 0.04, rough = True ),
	hanging_sign( 'hang_tavern', 'paint_green', 'paint_cream', 'tankard' ),
	hanging_sign( 'hang_chandler', 'paint_navy', 'paint_cream', 'anchor' ),
	lamp_street(), lantern_wall(), bench(), flowerbox( 'a', 'paint_white' ), flowerbox( 'b', 'paint_teal' ), planter(), fountain(),
	awning( 'awning_red', 'cloth_red', 'cloth_cream' ), awning( 'awning_green', 'cloth_green', 'cloth_cream' ),
	awning( 'awning_blue', 'cloth_blue', 'cloth_cream', w = 2.4, n = 8 ),
	netrack(), rum_barrels(), skull_pole(), chimney_pots(),
]

tris = {}
for ob in pieces:
	ob.data.calc_loop_triangles()
	tris[ ob.name ] = len( ob.data.loop_triangles )
print( 'TRIS', tris, 'total', sum( tris.values() ) )

bpy.ops.object.select_all( action = 'SELECT' )
kw = dict( filepath = OUT, export_format = 'GLB', use_selection = False, export_apply = True, export_yup = True, export_normals = True, export_texcoords = False, export_materials = 'EXPORT', export_extras = False, export_animations = False )
try:
	bpy.ops.export_scene.gltf( **kw, export_vertex_color = 'NONE' )
except TypeError:
	bpy.ops.export_scene.gltf( **kw )
print( 'EXPORTED', OUT )

if PREVIEW:
	# a contact sheet: the pieces in a row on a ground plane, a sun, workbench render
	# a grid of 6 columns (6.5 m apart), rows 4.5 m apart going back; each piece lifted to stand on the ground
	cols = 6
	for i, ob in enumerate( pieces ):
		zmin = min( ( ob.matrix_world @ Vector( c ) ).z for c in ob.bound_box )
		ob.location = ( ( i % cols ) * 6.5, ( i // cols ) * 4.5, - zmin )
	W = ( cols - 1 ) * 6.5
	sc = bpy.context.scene
	bpy.ops.mesh.primitive_plane_add( size = 200, location = ( W / 2, 0, - 0.01 ) )
	cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) )
	sc.collection.objects.link( cam )
	cam.data.type = 'ORTHO'
	cam.data.ortho_scale = W + 6
	cam.location = ( W / 2, - 24, 14 )
	cam.rotation_euler = ( math.radians( 68 ), 0, 0 )
	sc.camera = cam
	sc.render.engine = 'BLENDER_WORKBENCH'
	sc.display.shading.light = 'STUDIO'
	sc.display.shading.color_type = 'MATERIAL'
	sc.display.shading.show_shadows = True
	sc.display.shading.show_cavity = True
	sc.render.resolution_x = 2400
	sc.render.resolution_y = 1000
	sc.render.filepath = PREVIEW
	bpy.ops.render.render( write_still = True )
	print( 'PREVIEW', PREVIEW )
