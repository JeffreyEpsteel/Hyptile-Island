# Wave 19E: the interiors' furniture kit, modelled in Blender (headless) and exported as one GLB.
#
#   D:\blender\blender.exe -b --factory-startup --python tools/interiors/kit.py -- public/models/interiors/kit.glb [sheet.png] [rooms.json out_dir]
#
# Every piece is one root object named after it (src/world/interiors/Interiors.js reads them by name through
# village/TownKit.js parseKit), its origin the centre of its footprint on the floor (wall pieces too: their back
# against the wall at +Y). Blender front is -Y (glTF +Z: the game's local front), up +Z. No textures: one material
# per colour whose name tells the game's prop material its pattern (wood_*, paint_*, cloth_*, stone_*, iron, gold,
# glow_* = flame / ember / lamp glass, lit always indoors). The walls, floors and ceilings are not here: the game
# lines the rooms with the stalls' Poly Haven CC0 planks (game/StallKit.js) so the kit stays texture-free.
#
# With rooms.json (written by tools/interiors/rooms.mjs from src/world/interiors/Rooms.js) it also renders every room:
# the lining as plain boxes, the pieces where the game places them, the room's lights, a camera inside the door.
import bpy, bmesh, math, sys, json, os
from mathutils import Matrix, Vector

argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
OUT = argv[ 0 ] if argv else 'kit.glb'
PREVIEW = argv[ 1 ] if len( argv ) > 1 and argv[ 1 ] != '-' else None
ROOMS = argv[ 2 ] if len( argv ) > 2 else None
ROOM_OUT = argv[ 3 ] if len( argv ) > 3 else None

# name: ( sRGB hex, roughness, metallic )
MATS = {
	'wood_dark': ( 0x3e2c20, 0.8, 0 ), 'wood_mid': ( 0x6e4f34, 0.8, 0 ), 'wood_light': ( 0x9a7752, 0.85, 0 ),
	'wood_grey': ( 0x6a6155, 0.9, 0 ), 'wood_red': ( 0x5a2c1e, 0.7, 0 ), 'wood_raw': ( 0x8a6a48, 0.9, 0 ),
	'paint_green': ( 0x2f5a46, 0.55, 0 ), 'paint_navy': ( 0x23384f, 0.55, 0 ), 'paint_cream': ( 0xeee3c8, 0.6, 0 ),
	'paint_red': ( 0x8e2f25, 0.55, 0 ), 'paint_white': ( 0xf0ece2, 0.6, 0 ), 'paint_black': ( 0x1c1c1c, 0.5, 0 ),
	'paint_paper': ( 0xe6dcc0, 0.8, 0 ), 'paint_chart': ( 0xd9cba0, 0.8, 0 ), 'paint_sea': ( 0x7fa6a8, 0.8, 0 ),
	'paint_ink': ( 0x2a3346, 0.6, 0 ), 'paint_wax': ( 0xf0e6c8, 0.5, 0 ), 'paint_cork': ( 0xa0784a, 0.95, 0 ),
	'paint_glass_green': ( 0x2a6438, 0.25, 0 ), 'paint_glass_amber': ( 0x9a5a1a, 0.25, 0 ),
	'paint_glass_clear': ( 0xaebeb8, 0.2, 0 ), 'paint_glass_brown': ( 0x4a2814, 0.25, 0 ),
	'paint_pewter': ( 0x8c8a84, 0.45, 0 ), 'paint_fish': ( 0x6f8f9a, 0.4, 0 ),
	'gold': ( 0xb8913e, 0.35, 0.9 ), 'iron': ( 0x24272b, 0.5, 0.7 ), 'rust_iron': ( 0x5a3d2c, 0.7, 0.4 ),
	'stone_light': ( 0xb8ae9a, 0.95, 0 ), 'stone_mid': ( 0x938a7c, 0.95, 0 ), 'stone_dark': ( 0x5e5850, 0.95, 0 ),
	'stone_soot': ( 0x2e2a27, 0.95, 0 ), 'brick': ( 0x8a4632, 0.9, 0 ),
	'cloth_red': ( 0x9a3428, 0.9, 0 ), 'cloth_cream': ( 0xe2d6b8, 0.9, 0 ), 'cloth_green': ( 0x2f5a4a, 0.9, 0 ),
	'cloth_blue': ( 0x2f4f7a, 0.9, 0 ), 'cloth_net': ( 0x4a5a48, 0.95, 0 ), 'cloth_sail': ( 0xb0a48a, 0.95, 0 ),
	'cloth_rope': ( 0xb39a6c, 0.95, 0 ), 'cloth_rope_dark': ( 0x7a6644, 0.95, 0 ),
	'bone': ( 0xe0d6bc, 0.6, 0 ),
	'glow_fire': ( 0xff7a2a, 0.3, 0 ), 'glow_warm': ( 0xffd28a, 0.3, 0 ), 'glow_flame': ( 0xffe0a0, 0.3, 0 ),
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
	if name.startswith( 'glow' ):
		# the room renders: flames and embers glow (the game's glow material does the same)
		b.inputs[ 'Emission Color' ].default_value = srgb( h )
		b.inputs[ 'Emission Strength' ].default_value = 6.0
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
# (sizes in metres; the game's Rooms.js uses the same footprints for the colliders: keep them in step)

TAU = 2 * math.pi
RX = ( math.pi / 2, 0, 0 ) # a cylinder lying along -Y / +Y
RY = ( 0, math.pi / 2, 0 ) # a cylinder lying along +X

def bottle( p, x, y, z, mat, h = 0.3, r = 0.04 ):

	p.lathe( [ ( r * 0.9, 0 ), ( r, 0.01 ), ( r, h * 0.6 ), ( r * 0.45, h * 0.75 ), ( r * 0.28, h * 0.8 ), ( r * 0.28, h ), ( r * 0.32, h + 0.01 ), ( 0.0, h + 0.012 ) ], ( x, y, z ), mat, seg = 8 )

def tankard( p, x, y, z, mat = 'paint_pewter' ):

	p.cyl( 0.045, 0.05, 0.13, ( x, y, z ), mat, seg = 10 )
	p.torus( 0.04, 0.009, ( x + 0.06, y, z + 0.065 ), mat, rot = RX, seg = 8, rseg = 4, arc = math.pi )

def keg( p, x, y, z, r = 0.24, l = 0.55, axis = 'x', mat = 'wood_mid' ):

	# a small cask lying along `axis` (staves bulge: a lathe), iron hoops
	rot = RY if axis == 'x' else RX
	prof = [ ( 0.0, 0 ), ( r * 0.86, 0 ), ( r, l * 0.25 ), ( r * 1.02, l * 0.5 ), ( r, l * 0.75 ), ( r * 0.86, l ), ( 0.0, l ) ]
	ob = Piece( '_tmp' ) # (built in place, then merged: a lathe only turns about +Z)
	ob.lathe( prof, ( 0, 0, 0 ), mat, seg = 12 )
	for t in ( 0.1, 0.9 ):
		ob.torus( r * ( 0.9 if t < 0.5 else 0.9 ) + 0.005, 0.012, ( 0, 0, l * t ), 'iron', seg = 12, rseg = 4 )
	merge( p, ob, M( ( x, y, z ), rot ) @ Matrix.Translation( ( 0, 0, - l / 2 ) ) )

def merge( p, ob, m ):

	# append another Piece's geometry under matrix m (keeps its materials)
	bm2 = ob.bm
	bmesh.ops.transform( bm2, matrix = m, verts = bm2.verts[ : ] )
	tmp = bpy.data.meshes.new( 'tmp' )
	bm2.to_mesh( tmp )
	slots = [ p.slot( mt ) for mt in ob.mats ]
	before = set( p.bm.faces )
	p.bm.from_mesh( tmp )
	for f in p.bm.faces:
		if f in before: continue
		f.material_index = slots[ f.material_index ] if f.material_index < len( slots ) else 0
	bpy.data.meshes.remove( tmp )
	bm2.free()

def bar_counter():

	# 2.4 m long (X), 0.62 deep, 1.08 high; the customers at -Y, a brass foot rail
	p = Piece( 'bar_counter' )
	L, D, H = 2.4, 0.62, 1.08
	p.box( ( L, D - 0.1, H - 0.06 ), ( 0, 0.05, ( H - 0.06 ) / 2 ), 'wood_dark' )
	p.box( ( L + 0.06, D + 0.08, 0.06 ), ( 0, - 0.01, H - 0.03 ), 'wood_red' )
	for i in range( 4 ):
		x = - L / 2 + L * ( i + 0.5 ) / 4
		p.box( ( L / 4 - 0.14, 0.03, 0.62 ), ( x, - D / 2 + 0.04, 0.52 ), 'wood_mid' )
	p.box( ( L, 0.05, 0.1 ), ( 0, - D / 2 + 0.03, 0.05 ), 'wood_red' )
	p.cyl( 0.022, 0.022, L, ( - L / 2, - D / 2 - 0.13, 0.2 ), 'gold', seg = 8, rot = RY )
	for x in ( - L / 2 + 0.15, 0, L / 2 - 0.15 ): p.box( ( 0.025, 0.14, 0.025 ), ( x, - D / 2 - 0.06, 0.2 ), 'gold' )
	# the barman's side: a shelf of mugs under the top
	p.box( ( L - 0.1, 0.25, 0.03 ), ( 0, D / 2 - 0.12, 0.62 ), 'wood_mid' )
	for i in range( 6 ): tankard( p, - L / 2 + 0.25 + i * 0.38, D / 2 - 0.12, 0.635 )
	return p.finish()

def bar_back():

	# the bottle shelves behind the bar: 2.2 wide, 0.38 deep, 2.3 high
	p = Piece( 'bar_back' )
	W, D, H = 2.2, 0.38, 2.3
	p.box( ( W, D, 0.9 ), ( 0, 0, 0.45 ), 'wood_dark' )
	p.box( ( W + 0.04, D + 0.04, 0.04 ), ( 0, 0, 0.92 ), 'wood_red' )
	for i in range( 3 ): p.box( ( W / 3 - 0.08, 0.02, 0.7 ), ( - W / 3 + i * W / 3, - D / 2 - 0.005, 0.42 ), 'wood_mid' )
	for s in ( - 1, 1 ): p.box( ( 0.06, D * 0.7, H - 0.9 ), ( s * ( W / 2 - 0.03 ), D * 0.15, 0.9 + ( H - 0.9 ) / 2 ), 'wood_dark' )
	p.box( ( W, 0.03, H - 0.9 ), ( 0, D / 2 - 0.015, 0.9 + ( H - 0.9 ) / 2 ), 'wood_dark' )
	glass = [ 'paint_glass_green', 'paint_glass_amber', 'paint_glass_clear', 'paint_glass_brown' ]
	k = 0
	for z in ( 1.3, 1.72, 2.14 ):
		p.box( ( W - 0.1, D * 0.7, 0.03 ), ( 0, D * 0.15, z - 0.015 ), 'wood_mid' )
		n = 9
		for i in range( n ):
			if ( i * 7 + int( z * 10 ) ) % 5 == 0: continue
			x = - W / 2 + 0.16 + i * ( W - 0.32 ) / ( n - 1 )
			bottle( p, x, D * 0.12, z, glass[ k % 4 ], h = 0.26 + 0.06 * ( ( k * 5 ) % 3 ) / 2, r = 0.035 + 0.008 * ( k % 2 ) )
			k += 1
	p.box( ( W + 0.1, D * 0.8, 0.06 ), ( 0, D * 0.1, H + 0.03 ), 'wood_red' )
	return p.finish()

def keg_rack():

	# three casks on a timber cradle, brass taps toward the bar (-Y); 1.6 wide, 0.6 deep
	p = Piece( 'keg_rack' )
	for x in ( - 0.7, 0.7 ):
		p.box( ( 0.08, 0.55, 0.5 ), ( x, 0, 0.25 ), 'wood_dark' )
	p.box( ( 1.6, 0.08, 0.06 ), ( 0, - 0.22, 0.5 ), 'wood_dark' )
	p.box( ( 1.6, 0.08, 0.06 ), ( 0, 0.22, 0.5 ), 'wood_dark' )
	for i, x in enumerate( ( - 0.5, 0.0, 0.5 ) ):
		keg( p, x, 0, 0.74, r = 0.22, l = 0.55, axis = 'y', mat = 'wood_mid' if i % 2 else 'wood_light' )
		p.cyl( 0.02, 0.02, 0.1, ( x, - 0.27, 0.66 ), 'gold', seg = 6, rot = RX )
		p.box( ( 0.03, 0.03, 0.06 ), ( x, - 0.36, 0.66 ), 'gold' )
	# two more on top, between
	for x in ( - 0.25, 0.25 ): keg( p, x, 0.02, 1.14, r = 0.19, l = 0.5, axis = 'y', mat = 'wood_mid' )
	return p.finish()

def table_round():

	p = Piece( 'table_round' )
	p.cyl( 0.45, 0.45, 0.05, ( 0, 0, 0.71 ), 'wood_mid', seg = 16 )
	p.cyl( 0.06, 0.06, 0.68, ( 0, 0, 0.03 ), 'wood_dark', seg = 8 )
	for a in range( 4 ):
		t = a * TAU / 4 + 0.4
		p.box( ( 0.6, 0.07, 0.06 ), ( 0.27 * math.cos( t ), 0.27 * math.sin( t ), 0.03 ), 'wood_dark', rot = ( 0, 0, t ) )
	return p.finish()

def table_long():

	p = Piece( 'table_long' )
	p.box( ( 1.8, 0.8, 0.05 ), ( 0, 0, 0.735 ), 'wood_mid' )
	for sx in ( - 1, 1 ):
		for sy in ( - 1, 1 ): p.box( ( 0.07, 0.07, 0.71 ), ( sx * 0.8, sy * 0.32, 0.355 ), 'wood_dark' )
		p.box( ( 0.05, 0.6, 0.06 ), ( sx * 0.8, 0, 0.15 ), 'wood_dark' )
	p.box( ( 1.6, 0.05, 0.06 ), ( 0, 0, 0.15 ), 'wood_dark' )
	return p.finish()

def barrel_table():

	# the Rum Hole: a cask on end with a round plank top
	p = Piece( 'barrel_table' )
	p.lathe( [ ( 0.0, 0 ), ( 0.27, 0 ), ( 0.31, 0.25 ), ( 0.32, 0.45 ), ( 0.31, 0.65 ), ( 0.27, 0.88 ), ( 0.0, 0.88 ) ], ( 0, 0, 0 ), 'wood_raw', seg = 12 )
	for z in ( 0.1, 0.78 ): p.torus( 0.29, 0.012, ( 0, 0, z ), 'rust_iron', seg = 12, rseg = 4 )
	p.cyl( 0.42, 0.42, 0.04, ( 0, 0, 0.88 ), 'wood_grey', seg = 12 )
	return p.finish()

def stool():

	p = Piece( 'stool' )
	p.cyl( 0.18, 0.18, 0.045, ( 0, 0, 0.6 ), 'wood_mid', seg = 12 )
	for a in range( 3 ):
		t = a * TAU / 3
		p.cyl( 0.022, 0.026, 0.62, ( 0.13 * math.cos( t ), 0.13 * math.sin( t ), 0 ), 'wood_dark', seg = 6, rot = ( - 0.1 * math.sin( t ), 0.1 * math.cos( t ), 0 ) )
	p.torus( 0.13, 0.012, ( 0, 0, 0.25 ), 'wood_dark', seg = 10, rseg = 4 )
	return p.finish()

def chair():

	# the sitter faces -Y; seat 0.45
	p = Piece( 'chair' )
	p.box( ( 0.44, 0.42, 0.04 ), ( 0, 0, 0.45 ), 'wood_mid' )
	for sx in ( - 1, 1 ):
		for sy in ( - 1, 1 ): p.box( ( 0.035, 0.035, 0.45 ), ( sx * 0.19, sy * 0.18, 0.225 ), 'wood_dark' )
		p.box( ( 0.035, 0.035, 0.5 ), ( sx * 0.19, 0.19, 0.7 ), 'wood_dark' )
	for z in ( 0.72, 0.9 ): p.box( ( 0.4, 0.025, 0.07 ), ( 0, 0.19, z ), 'wood_mid' )
	return p.finish()

def bench():

	p = Piece( 'bench' )
	p.box( ( 1.5, 0.32, 0.05 ), ( 0, 0, 0.44 ), 'wood_mid' )
	for sx in ( - 1, 1 ): p.box( ( 0.06, 0.28, 0.42 ), ( sx * 0.62, 0, 0.21 ), 'wood_dark' )
	p.box( ( 1.3, 0.04, 0.06 ), ( 0, 0, 0.14 ), 'wood_dark' )
	return p.finish()

def crate_seat():

	p = Piece( 'crate_seat' )
	p.box( ( 0.46, 0.4, 0.42 ), ( 0, 0, 0.21 ), 'wood_raw' )
	for z in ( 0.08, 0.34 ): p.box( ( 0.48, 0.42, 0.05 ), ( 0, 0, z ), 'wood_grey' )
	p.box( ( 0.04, 0.42, 0.42 ), ( 0, 0, 0.21 ), 'wood_grey', rot = ( 0.9, 0, 0 ) )
	return p.finish()

def hearth():

	# a stone fireplace against the wall: 1.9 wide, 0.75 deep, its breast up to 2.7 m; logs and embers glow
	p = Piece( 'hearth' )
	W, D = 1.9, 0.75
	p.box( ( W + 0.3, D + 0.2, 0.12 ), ( 0, - 0.08, 0.06 ), 'stone_dark' )
	for s in ( - 1, 1 ): p.box( ( 0.4, D, 1.15 ), ( s * ( W / 2 - 0.2 ), 0, 0.12 + 0.575 ), 'stone_mid' )
	p.box( ( W, 0.2, 1.15 ), ( 0, D / 2 - 0.1, 0.12 + 0.575 ), 'stone_soot' )
	p.box( ( W - 0.8, D - 0.2, 0.04 ), ( 0, 0.05, 0.14 ), 'stone_soot' )
	p.box( ( W + 0.2, D + 0.12, 0.12 ), ( 0, - 0.03, 1.33 ), 'wood_dark' ) # the mantel
	p.box( ( W * 0.82, D * 0.7, 1.3 ), ( 0, D * 0.15, 1.39 + 0.65 ), 'stone_light' ) # the breast up to the ceiling
	p.box( ( W - 0.8, D - 0.2, 0.22 ), ( 0, 0.05, 1.27 - 0.11 ), 'stone_soot' )
	# stones proud of the face
	for i in range( 9 ):
		x = - W / 2 + 0.1 + ( i % 3 ) * 0.14 if i < 6 else W / 2 - 0.38 + ( i % 3 ) * 0.14
		z = 0.35 + ( i // 3 % 2 ) * 0.45 + 0.1 * ( i % 2 )
		p.box( ( 0.13, 0.04, 0.16 ), ( x, - D / 2 - 0.01, z ), 'stone_light' if i % 2 else 'stone_dark' )
	# the fire: logs, embers, low flames (glow)
	for k, t in enumerate( ( - 0.35, 0.3 ) ):
		p.cyl( 0.065, 0.06, 0.75, ( - 0.37, - 0.02 + 0.08 * k, 0.22 + 0.05 * k ), 'wood_dark', seg = 7, rot = ( 0, math.pi / 2, t ) )
	p.box( ( 0.7, 0.35, 0.05 ), ( 0, 0.02, 0.17 ), 'glow_fire' )
	for i in range( 4 ):
		p.sphere( 0.07 + 0.02 * ( i % 2 ), ( - 0.22 + i * 0.15, 0.0, 0.3 + 0.05 * ( i % 2 ) ), 'glow_flame', scale = ( 0.7, 0.6, 1.6 ), sub = 1 )
	# fire irons and a pot hook
	p.cyl( 0.012, 0.012, 0.8, ( W / 2 + 0.05, - D / 2 + 0.05, 0.12 ), 'iron', seg = 6 )
	p.box( ( 0.04, 0.04, 0.35 ), ( - 0.2, 0.15, 1.0 ), 'iron' )
	# tankards and a candle on the mantel
	for x in ( - 0.7, - 0.55, 0.62 ): tankard( p, x, - 0.05, 1.39 )
	p.cyl( 0.025, 0.025, 0.16, ( 0.2, - 0.05, 1.39 ), 'paint_wax', seg = 8 )
	p.sphere( 0.018, ( 0.2, - 0.05, 1.575 ), 'glow_flame', scale = ( 1, 1, 1.8 ), sub = 1 )
	return p.finish()

def stairs():

	# 1.0 wide, from the floor at the front (Y = 0) up 2.75 m to the back (+Y 3.3 m); open stringers, a handrail on X+
	p = Piece( 'stairs' )
	n, run, rise, W = 12, 3.3, 2.75, 1.0
	for i in range( n ):
		y = ( i + 0.5 ) * run / n
		z = ( i + 1 ) * rise / n
		p.box( ( W, run / n + 0.03, 0.04 ), ( 0, y, z - 0.02 ), 'wood_mid' )
		p.box( ( W - 0.04, 0.02, rise / n ), ( 0, y - run / n / 2 + 0.01, z - rise / n / 2 ), 'wood_dark' )
	L = math.hypot( run, rise )
	a = math.atan2( rise, run )
	for s in ( - 1, 1 ):
		p.box( ( 0.06, L, 0.24 ), ( s * ( W / 2 + 0.03 ), run / 2, rise / 2 - 0.08 ), 'wood_dark', rot = ( a, 0, 0 ) )
	# balusters and the handrail on the open side (+X)
	for i in range( 0, n, 2 ):
		y = ( i + 0.5 ) * run / n
		z = ( i + 1 ) * rise / n
		p.box( ( 0.04, 0.04, 0.9 ), ( W / 2 + 0.03, y, z + 0.45 ), 'wood_dark' )
	p.box( ( 0.07, L + 0.1, 0.06 ), ( W / 2 + 0.03, run / 2, rise / 2 + 0.92 ), 'wood_red', rot = ( a, 0, 0 ) )
	p.box( ( 0.1, 0.1, 1.05 ), ( W / 2 + 0.03, 0.05, 0.52 ), 'wood_red' ) # the newel post
	p.sphere( 0.06, ( W / 2 + 0.03, 0.05, 1.08 ), 'wood_red', sub = 1 )
	return p.finish()

def dice_table():

	# a round table with a dice cup, three dice, a slate of tallies and a few coins
	p = Piece( 'dice_table' )
	p.cyl( 0.5, 0.5, 0.05, ( 0, 0, 0.71 ), 'wood_red', seg = 16 )
	p.cyl( 0.42, 0.42, 0.005, ( 0, 0, 0.76 ), 'cloth_green', seg = 16 )
	p.cyl( 0.07, 0.07, 0.68, ( 0, 0, 0.03 ), 'wood_dark', seg = 8 )
	for a in range( 3 ):
		t = a * TAU / 3
		p.box( ( 0.62, 0.07, 0.06 ), ( 0.28 * math.cos( t ), 0.28 * math.sin( t ), 0.03 ), 'wood_dark', rot = ( 0, 0, t ) )
	p.cyl( 0.05, 0.045, 0.12, ( - 0.16, 0.12, 0.765 ), 'wood_dark', seg = 10 )
	for i, ( x, y ) in enumerate( ( ( 0.05, - 0.08 ), ( 0.13, 0.0 ), ( 0.0, 0.05 ) ) ):
		p.box( ( 0.03, 0.03, 0.03 ), ( x, y, 0.78 ), 'bone', rot = ( 0, 0, i * 0.6 ) )
	p.box( ( 0.22, 0.15, 0.01 ), ( 0.2, 0.22, 0.77 ), 'paint_black' )
	for i in range( 5 ): p.cyl( 0.012, 0.012, 0.004 + 0.003 * i, ( - 0.25 + 0.03 * ( i % 2 ), - 0.18, 0.765 ), 'gold', seg = 8 )
	return p.finish()

def mugs():

	# what stands on a table: tankards, a jug, a plate with bread (origin: the table top)
	p = Piece( 'mugs' )
	tankard( p, - 0.18, 0.05, 0 )
	tankard( p, 0.15, - 0.1, 0 )
	p.lathe( [ ( 0.0, 0 ), ( 0.07, 0 ), ( 0.08, 0.08 ), ( 0.06, 0.17 ), ( 0.045, 0.2 ), ( 0.05, 0.22 ), ( 0.0, 0.22 ) ], ( 0.02, 0.17, 0 ), 'paint_cream', seg = 10 )
	p.cyl( 0.12, 0.11, 0.015, ( 0.12, 0.14, 0 ), 'paint_white', seg = 12 )
	p.sphere( 0.06, ( 0.12, 0.14, 0.04 ), 'wood_light', scale = ( 1.3, 0.8, 0.6 ), sub = 1 )
	return p.finish()

def bottles():

	p = Piece( 'bottles' )
	for i, ( x, y ) in enumerate( ( ( - 0.12, 0 ), ( 0, 0.05 ), ( 0.1, - 0.04 ), ( 0.2, 0.03 ) ) ):
		bottle( p, x, y, 0, [ 'paint_glass_green', 'paint_glass_amber', 'paint_glass_brown', 'paint_glass_clear' ][ i ], h = 0.28 + 0.03 * ( i % 2 ) )
	return p.finish()

def candle():

	p = Piece( 'candle' )
	p.cyl( 0.07, 0.06, 0.015, ( 0, 0, 0 ), 'paint_pewter', seg = 10 )
	p.cyl( 0.022, 0.022, 0.14, ( 0, 0, 0.015 ), 'paint_wax', seg = 8 )
	p.sphere( 0.016, ( 0, 0, 0.175 ), 'glow_flame', scale = ( 1, 1, 1.9 ), sub = 1 )
	return p.finish()

def candle_bottle():

	# the Rum Hole: a candle stuck in an empty bottle, wax run down its neck
	p = Piece( 'candle_bottle' )
	bottle( p, 0, 0, 0, 'paint_glass_green', h = 0.27 )
	p.cyl( 0.016, 0.016, 0.09, ( 0, 0, 0.275 ), 'paint_wax', seg = 8 )
	for i in range( 4 ):
		t = i * TAU / 4 + 0.3
		p.sphere( 0.014, ( 0.012 * math.cos( t ), 0.012 * math.sin( t ), 0.24 - 0.03 * i ), 'paint_wax', scale = ( 1, 1, 2.5 ), sub = 1 )
	p.sphere( 0.014, ( 0, 0, 0.385 ), 'glow_flame', scale = ( 1, 1, 1.9 ), sub = 1 )
	return p.finish()

def lantern_hang():

	# hangs from the ceiling (origin at the hook: Z = 0 is the ceiling, the lantern below)
	p = Piece( 'lantern_hang' )
	for i in range( 6 ): p.torus( 0.025, 0.006, ( 0, 0, - 0.04 - i * 0.07 ), 'iron', rot = ( ( i % 2 ) * math.pi / 2, 0, 0 ), seg = 6, rseg = 3 )
	z = - 0.5
	p.cyl( 0.11, 0.06, 0.07, ( 0, 0, z ), 'iron', seg = 8 )
	p.cyl( 0.1, 0.1, 0.02, ( 0, 0, z - 0.3 ), 'iron', seg = 8 )
	for a in range( 4 ):
		t = a * TAU / 4 + math.pi / 4
		p.box( ( 0.015, 0.015, 0.28 ), ( 0.09 * math.cos( t ), 0.09 * math.sin( t ), z - 0.15 ), 'iron' )
	p.cyl( 0.08, 0.08, 0.26, ( 0, 0, z - 0.29 ), 'glow_warm', seg = 8 )
	p.torus( 0.04, 0.008, ( 0, 0, z + 0.1 ), 'iron', seg = 8, rseg = 3, rot = RX )
	return p.finish()

def chandelier():

	# a cartwheel on three chains with six candles (origin at the ceiling hook)
	p = Piece( 'chandelier' )
	z = - 0.75
	p.torus( 0.55, 0.035, ( 0, 0, z ), 'wood_dark', seg = 20, rseg = 5 )
	for a in range( 6 ):
		t = a * TAU / 6
		p.box( ( 0.55, 0.04, 0.04 ), ( 0.275 * math.cos( t ), 0.275 * math.sin( t ), z ), 'wood_dark', rot = ( 0, 0, t ) )
		x, y = 0.55 * math.cos( t ), 0.55 * math.sin( t )
		p.cyl( 0.04, 0.04, 0.02, ( x, y, z + 0.03 ), 'iron', seg = 8 )
		p.cyl( 0.022, 0.022, 0.13, ( x, y, z + 0.05 ), 'paint_wax', seg = 8 )
		p.sphere( 0.016, ( x, y, z + 0.2 ), 'glow_flame', scale = ( 1, 1, 1.9 ), sub = 1 )
	p.cyl( 0.07, 0.07, 0.1, ( 0, 0, z - 0.05 ), 'iron', seg = 8 )
	for a in range( 3 ):
		t = a * TAU / 3 + 0.5
		p.cyl( 0.008, 0.008, - z, ( 0.55 * math.cos( t ), 0.55 * math.sin( t ), z ), 'iron', seg = 4 )
	return p.finish()

def shelf_rope():

	# a chandler's shelving: 1.8 wide, 0.45 deep, 2.1 high; coils of rope, cork floats, blocks, a lantern
	p = Piece( 'shelf_rope' )
	W, D, H = 1.8, 0.45, 2.1
	for s in ( - 1, 1 ): p.box( ( 0.05, D, H ), ( s * ( W / 2 - 0.025 ), 0, H / 2 ), 'wood_mid' )
	p.box( ( W, 0.02, H ), ( 0, D / 2 - 0.01, H / 2 ), 'wood_dark' )
	for z in ( 0.08, 0.6, 1.12, 1.62, 2.08 ): p.box( ( W - 0.04, D, 0.03 ), ( 0, 0, z ), 'wood_mid' )
	# rope coils (low flat tori, stacked) on the two lower shelves
	k = 0
	for z in ( 0.095, 0.615 ):
		for i in range( 3 ):
			x = - 0.55 + i * 0.55
			for j in range( 2 ):
				p.torus( 0.17 - 0.02 * j, 0.035, ( x, 0.0, z + 0.04 + j * 0.07 ), 'cloth_rope' if ( k + j ) % 2 == 0 else 'cloth_rope_dark', seg = 14, rseg = 5 )
			k += 1
	# cork floats and net floats on the third, wooden blocks on the fourth
	for i in range( 7 ):
		p.sphere( 0.07, ( - 0.7 + i * 0.23, - 0.02, 1.2 ), 'paint_red' if i % 2 else 'paint_white', scale = ( 1, 1, 1.3 ), sub = 1 )
	for i in range( 4 ):
		x = - 0.6 + i * 0.4
		p.box( ( 0.12, 0.1, 0.22 ), ( x, 0, 1.75 ), 'wood_light' )
		p.cyl( 0.05, 0.05, 0.03, ( x, - 0.06, 1.78 ), 'iron', seg = 8, rot = RX )
	p.box( ( 0.3, 0.25, 0.12 ), ( 0.5, 0, 2.16 ), 'paint_green' ) # a tackle box on top
	return p.finish()

def shelf_lanterns():

	# lanterns, oil cans and tins: 1.4 wide, 0.4 deep, 2.0 high
	p = Piece( 'shelf_lanterns' )
	W, D, H = 1.4, 0.4, 2.0
	for s in ( - 1, 1 ): p.box( ( 0.05, D, H ), ( s * ( W / 2 - 0.025 ), 0, H / 2 ), 'wood_dark' )
	p.box( ( W, 0.02, H ), ( 0, D / 2 - 0.01, H / 2 ), 'wood_dark' )
	for z in ( 0.08, 0.7, 1.3, 1.95 ): p.box( ( W - 0.04, D, 0.03 ), ( 0, 0, z ), 'wood_mid' )
	for z in ( 0.095, 0.715 ):
		for i in range( 3 ):
			x = - 0.42 + i * 0.42
			p.cyl( 0.09, 0.07, 0.05, ( x, 0, z ), 'iron', seg = 8 )
			p.cyl( 0.07, 0.07, 0.2, ( x, 0, z + 0.05 ), 'paint_glass_clear', seg = 8 )
			p.cyl( 0.09, 0.03, 0.08, ( x, 0, z + 0.25 ), 'iron', seg = 8 )
			p.torus( 0.04, 0.007, ( x, 0, z + 0.36 ), 'iron', rot = RX, seg = 8, rseg = 3 )
	for i in range( 4 ):
		x = - 0.48 + i * 0.32
		p.box( ( 0.18, 0.12, 0.26 ), ( x, 0, 1.315 + 0.13 ), 'paint_red' if i % 2 else 'paint_green' )
		p.cyl( 0.015, 0.015, 0.05, ( x + 0.05, 0, 1.575 ), 'gold', seg = 6 )
	return p.finish()

def firearms_rack():

	# on the wall (origin at the floor, the back at +Y 0.06): four muskets standing in a rack, two pistols on pegs, a powder horn
	p = Piece( 'firearms_rack' )
	W = 1.5
	p.box( ( W, 0.04, 0.12 ), ( 0, 0.03, 0.55 ), 'wood_red' )
	p.box( ( W, 0.04, 0.12 ), ( 0, 0.03, 1.55 ), 'wood_red' )
	p.box( ( W, 0.12, 0.06 ), ( 0, - 0.03, 0.4 ), 'wood_red' )
	for i in range( 4 ):
		x = - 0.55 + i * 0.36
		p.box( ( 0.06, 0.05, 0.62 ), ( x, - 0.02, 0.4 + 0.31 ), 'wood_mid' ) # the stock
		p.box( ( 0.045, 0.06, 0.18 ), ( x, - 0.02, 0.43 ), 'wood_mid' )
		p.cyl( 0.014, 0.014, 0.95, ( x, - 0.03, 1.0 ), 'iron', seg = 6 ) # the barrel
		p.box( ( 0.03, 0.04, 0.08 ), ( x, - 0.06, 1.0 ), 'iron' ) # the lock
	for i, x in enumerate( ( - 0.35, 0.35 ) ):
		p.cyl( 0.012, 0.012, 0.1, ( x, 0.03, 1.9 ), 'wood_dark', seg = 6, rot = RX )
		p.cyl( 0.012, 0.012, 0.32, ( x - 0.14, - 0.04, 1.86 ), 'iron', seg = 6, rot = RY )
		p.box( ( 0.05, 0.035, 0.14 ), ( x + 0.17, - 0.04, 1.81 ), 'wood_mid', rot = ( 0, 0.5, 0 ) )
	p.box( ( W + 0.1, 0.05, 0.08 ), ( 0, 0.03, 2.02 ), 'wood_red' )
	p.lathe( [ ( 0.0, 0 ), ( 0.015, 0.01 ), ( 0.03, 0.12 ), ( 0.045, 0.22 ), ( 0.048, 0.26 ), ( 0.0, 0.27 ) ], ( 0.62, - 0.05, 1.2 ), 'bone', seg = 8 )
	return p.finish()

def shop_counter():

	# 2.2 wide, 0.7 deep, 1.0 high: a ledger, brass scales, a bell, a coil of line; the customer at -Y
	p = Piece( 'shop_counter' )
	W, D, H = 2.2, 0.7, 1.0
	p.box( ( W, D - 0.06, H - 0.05 ), ( 0, 0.03, ( H - 0.05 ) / 2 ), 'wood_mid' )
	p.box( ( W + 0.06, D + 0.04, 0.05 ), ( 0, 0, H - 0.025 ), 'wood_red' )
	for i in range( 5 ): p.box( ( 0.04, 0.02, H - 0.15 ), ( - W / 2 + 0.2 + i * ( W - 0.4 ) / 4, - D / 2 + 0.01, ( H - 0.05 ) / 2 ), 'wood_dark' )
	p.box( ( 0.36, 0.26, 0.03 ), ( - 0.55, 0, H + 0.015 ), 'paint_cream' ) # the ledger
	p.box( ( 0.37, 0.27, 0.012 ), ( - 0.55, 0, H + 0.004 ), 'wood_red' )
	p.box( ( 0.004, 0.24, 0.032 ), ( - 0.55, 0, H + 0.016 ), 'paint_ink' )
	p.cyl( 0.012, 0.012, 0.35, ( 0.45, 0.1, H ), 'gold', seg = 6 ) # the scales
	p.box( ( 0.4, 0.02, 0.02 ), ( 0.45, 0.1, H + 0.35 ), 'gold' )
	for s in ( - 1, 1 ): p.cyl( 0.08, 0.06, 0.02, ( 0.45 + s * 0.19, 0.1, H + 0.22 ), 'gold', seg = 10 )
	p.lathe( [ ( 0.0, 0 ), ( 0.045, 0 ), ( 0.04, 0.04 ), ( 0.02, 0.07 ), ( 0.008, 0.09 ), ( 0.0, 0.1 ) ], ( 0.85, - 0.15, H ), 'gold', seg = 10 )
	for j in range( 3 ): p.torus( 0.12 - 0.015 * j, 0.022, ( - 0.95, 0.1, H + 0.02 + j * 0.04 ), 'cloth_rope', seg = 12, rseg = 4 )
	return p.finish()

def chart_table():

	# the harbourmaster's: 1.6 x 1.0, a sloped top under a chart, dividers, a lamp; 0.95 high
	p = Piece( 'chart_table' )
	W, D = 1.6, 1.0
	for sx in ( - 1, 1 ):
		for sy in ( - 1, 1 ): p.box( ( 0.07, 0.07, 0.9 ), ( sx * ( W / 2 - 0.06 ), sy * ( D / 2 - 0.06 ), 0.45 ), 'wood_dark' )
	p.box( ( W, D, 0.18 ), ( 0, 0, 0.82 ), 'wood_red' )
	p.box( ( W - 0.1, D - 0.1, 0.02 ), ( 0, 0, 0.92 ), 'paint_chart', rot = ( 0.06, 0, 0 ) )
	for i in range( 5 ): p.box( ( 0.16 + 0.05 * i, 0.08, 0.004 ), ( - 0.3 + 0.12 * i, 0.1 - 0.06 * i, 0.932 ), 'paint_sea', rot = ( 0.06, 0, 0.3 * i ) )
	p.box( ( 0.5, 0.004, 0.004 ), ( 0.2, - 0.1, 0.934 ), 'paint_ink', rot = ( 0, 0, 0.5 ) )
	for s in ( - 1, 1 ): p.box( ( 0.008, 0.18, 0.006 ), ( 0.45 + s * 0.03, - 0.2, 0.94 ), 'gold', rot = ( 0, 0, s * 0.18 ) )
	p.box( ( W - 0.1, 0.03, 0.04 ), ( 0, - D / 2 + 0.02, 0.95 ), 'wood_dark' )
	p.box( ( 0.08, D - 0.2, 0.02 ), ( - W / 2 + 0.1, 0, 0.94 ), 'wood_dark' )
	p.cyl( 0.05, 0.05, 0.12, ( 0.62, 0.32, 0.93 ), 'gold', seg = 8 )
	p.cyl( 0.04, 0.04, 0.12, ( 0.62, 0.32, 1.05 ), 'glow_warm', seg = 8 )
	p.cyl( 0.06, 0.02, 0.05, ( 0.62, 0.32, 1.17 ), 'gold', seg = 8 )
	return p.finish()

def notice_board():

	# on the wall: a cork board 1.4 x 1.0 (1.0..2.0 m up) with notices pinned (origin at the floor, back at +Y)
	p = Piece( 'notice_board' )
	p.box( ( 1.5, 0.05, 1.1 ), ( 0, 0.0, 1.5 ), 'wood_dark' )
	p.box( ( 1.36, 0.02, 0.96 ), ( 0, - 0.03, 1.5 ), 'paint_cork' )
	k = 0
	for row in range( 3 ):
		for col in range( 4 ):
			if ( row * 4 + col ) % 5 == 3: continue
			x = - 0.5 + col * 0.33 + 0.03 * ( ( row + col ) % 2 )
			z = 1.8 - row * 0.3
			w, h = 0.2 + 0.04 * ( k % 2 ), 0.24 - 0.03 * ( k % 3 )
			p.box( ( w, 0.006, h ), ( x, - 0.045, z ), 'paint_paper' if k % 3 else 'paint_white', rot = ( 0, 0.06 * ( ( k % 3 ) - 1 ), 0 ) )
			p.box( ( w * 0.7, 0.004, 0.012 ), ( x, - 0.05, z + h * 0.3 ), 'paint_ink' )
			p.sphere( 0.012, ( x, - 0.055, z + h / 2 - 0.02 ), 'paint_red', sub = 1 )
			k += 1
	return p.finish()

def chart_frame():

	# a framed chart of the islands (1.2 x 0.8, centred 1.6 m up; origin at the floor, back at +Y)
	p = Piece( 'chart_frame' )
	p.box( ( 1.26, 0.04, 0.86 ), ( 0, 0, 1.6 ), 'wood_red' )
	p.box( ( 1.16, 0.01, 0.76 ), ( 0, - 0.022, 1.6 ), 'paint_chart' )
	for ( x, z, s ) in ( ( - 0.3, 1.7, 0.16 ), ( 0.1, 1.5, 0.22 ), ( 0.35, 1.78, 0.1 ), ( - 0.1, 1.82, 0.07 ), ( 0.32, 1.42, 0.08 ) ):
		p.sphere( s, ( x, - 0.03, z ), 'paint_sea', scale = ( 1.3, 0.05, 0.8 ), sub = 1 )
	p.box( ( 0.9, 0.004, 0.004 ), ( 0, - 0.03, 1.6 ), 'paint_ink', rot = ( 0, 0.4, 0 ) )
	p.box( ( 0.12, 0.004, 0.12 ), ( 0.48, - 0.03, 1.32 ), 'paint_ink', rot = ( 0, math.pi / 4, 0 ) )
	return p.finish()

def desk():

	# 1.3 x 0.65, 0.76 high, drawers on the right, a ledger, an inkwell and a quill; the sitter at -Y
	p = Piece( 'desk' )
	W, D = 1.3, 0.65
	p.box( ( W, D, 0.04 ), ( 0, 0, 0.74 ), 'wood_red' )
	p.box( ( 0.45, D - 0.04, 0.72 ), ( W / 2 - 0.24, 0, 0.36 ), 'wood_red' )
	for i in range( 3 ):
		p.box( ( 0.4, 0.02, 0.2 ), ( W / 2 - 0.24, - D / 2 + 0.01, 0.15 + i * 0.22 ), 'wood_mid' )
		p.sphere( 0.015, ( W / 2 - 0.24, - D / 2 - 0.01, 0.15 + i * 0.22 ), 'gold', sub = 1 )
	for sy in ( - 1, 1 ): p.box( ( 0.05, 0.05, 0.72 ), ( - W / 2 + 0.04, sy * ( D / 2 - 0.04 ), 0.36 ), 'wood_red' )
	p.box( ( 0.34, 0.24, 0.025 ), ( - 0.15, 0.05, 0.775 ), 'paint_paper' )
	p.cyl( 0.03, 0.035, 0.05, ( 0.25, 0.15, 0.76 ), 'paint_black', seg = 8 )
	p.box( ( 0.006, 0.006, 0.26 ), ( 0.26, 0.15, 0.88 ), 'paint_white', rot = ( 0.35, 0, 0 ) )
	p.box( ( 0.24, 0.18, 0.06 ), ( 0.38, 0.1, 0.79 ), 'paint_navy' )
	return p.finish()

def wheel_wall():

	# a ship's wheel on the wall (centre 1.6 m up; origin at the floor, back at +Y)
	p = Piece( 'wheel_wall' )
	p.torus( 0.36, 0.03, ( 0, - 0.05, 1.6 ), 'wood_red', rot = RX, seg = 20, rseg = 5 )
	p.cyl( 0.07, 0.07, 0.1, ( 0, - 0.1, 1.6 ), 'gold', seg = 10, rot = RX )
	for a in range( 8 ):
		t = a * TAU / 8
		p.cyl( 0.016, 0.022, 0.55, ( 0.03 * math.cos( t ), - 0.05, 1.6 + 0.03 * math.sin( t ) ), 'wood_red', seg = 6, rot = ( 0, math.pi / 2 - t, 0 ) )
	return p.finish()

def rug():

	p = Piece( 'rug' )
	p.box( ( 2.4, 1.6, 0.012 ), ( 0, 0, 0.006 ), 'cloth_red' )
	for s in ( - 1, 1 ):
		p.box( ( 2.2, 0.08, 0.004 ), ( 0, s * 0.68, 0.014 ), 'cloth_cream' )
		p.box( ( 0.08, 1.4, 0.004 ), ( s * 1.08, 0, 0.014 ), 'cloth_cream' )
	p.box( ( 1.2, 0.5, 0.004 ), ( 0, 0, 0.014 ), 'cloth_blue' )
	return p.finish()

def fish_mount():

	# a mounted marlin on a board (centre 1.9 m up; origin at the floor, back at +Y)
	p = Piece( 'fish_mount' )
	p.box( ( 1.3, 0.04, 0.42 ), ( 0, 0, 1.9 ), 'wood_red' )
	p.sphere( 0.32, ( 0, - 0.08, 1.9 ), 'paint_fish', scale = ( 1.8, 0.25, 0.42 ), sub = 2 )
	p.box( ( 0.5, 0.02, 0.012 ), ( - 0.78, - 0.08, 1.92 ), 'paint_fish', rot = ( 0, 0.05, 0 ) )
	p.box( ( 0.06, 0.03, 0.34 ), ( 0.6, - 0.08, 1.9 ), 'paint_fish', rot = ( 0, 0.5, 0 ) )
	p.box( ( 0.3, 0.02, 0.2 ), ( 0.05, - 0.08, 2.05 ), 'paint_navy', rot = ( 0, - 0.3, 0 ) )
	p.box( ( 0.3, 0.005, 0.06 ), ( 0, - 0.025, 1.73 ), 'gold' )
	return p.finish()

def door_leaf():

	# a plank door swung open against the wall: 1.0 wide, 2.1 high, 0.05 thick, hinged at X = 0 (origin at its hinge foot)
	p = Piece( 'door_leaf' )
	for i in range( 5 ): p.box( ( 0.19, 0.05, 2.08 ), ( 0.1 + i * 0.2, 0, 1.04 ), 'wood_mid' if i % 2 else 'wood_light' )
	for z in ( 0.35, 1.75 ): p.box( ( 0.96, 0.03, 0.12 ), ( 0.5, 0.04, z ), 'wood_dark' )
	p.box( ( 0.08, 0.03, 1.55 ), ( 0.5, 0.04, 1.05 ), 'wood_dark', rot = ( 0, 0.55, 0 ) )
	for z in ( 0.35, 1.75 ): p.box( ( 0.3, 0.012, 0.04 ), ( 0.15, - 0.03, z ), 'iron' )
	p.torus( 0.04, 0.008, ( 0.9, - 0.04, 1.0 ), 'iron', rot = RX, seg = 8, rseg = 3 )
	return p.finish()

def door_closed():

	# a closed inner door on a wall (to the back rooms / upstairs): 0.9 x 2.0 in its casing (origin floor, back at +Y)
	p = Piece( 'door_closed' )
	p.box( ( 1.06, 0.06, 2.1 ), ( 0, 0, 1.05 ), 'wood_dark' )
	p.box( ( 0.9, 0.05, 2.0 ), ( 0, - 0.03, 1.0 ), 'wood_mid' )
	for z in ( 0.5, 1.45 ): p.box( ( 0.7, 0.02, 0.6 ), ( 0, - 0.06, z ), 'wood_light' )
	p.sphere( 0.03, ( 0.36, - 0.08, 1.0 ), 'gold', sub = 1 )
	return p.finish()

def rum_casks():

	# the Rum Hole: casks on end and on their sides in a corner stack (1.4 x 0.9 footprint)
	p = Piece( 'rum_casks' )
	for x in ( - 0.4, 0.35 ):
		p.lathe( [ ( 0.0, 0 ), ( 0.25, 0 ), ( 0.29, 0.25 ), ( 0.3, 0.45 ), ( 0.29, 0.65 ), ( 0.25, 0.88 ), ( 0.0, 0.88 ) ], ( x, 0.1, 0 ), 'wood_raw', seg = 12 )
		for z in ( 0.1, 0.78 ): p.torus( 0.27, 0.012, ( x, 0.1, z ), 'rust_iron', seg = 12, rseg = 4 )
	keg( p, 0, 0.05, 1.12, r = 0.22, l = 0.6, axis = 'x', mat = 'wood_raw' )
	p.box( ( 0.3, 0.02, 0.2 ), ( 0.35, - 0.2, 0.55 ), 'paint_black' )
	p.box( ( 0.08, 0.005, 0.08 ), ( 0.35, - 0.212, 0.57 ), 'bone' )
	return p.finish()

def plank_bar():

	# the Rum Hole's bar: rough planks on two casks, 2.8 long, 1.05 high (the customers at -Y)
	p = Piece( 'plank_bar' )
	for x in ( - 1.05, 1.05 ):
		p.lathe( [ ( 0.0, 0 ), ( 0.27, 0 ), ( 0.31, 0.25 ), ( 0.32, 0.5 ), ( 0.31, 0.75 ), ( 0.27, 0.98 ), ( 0.0, 0.98 ) ], ( x, 0, 0 ), 'wood_raw', seg = 12 )
		for z in ( 0.12, 0.86 ): p.torus( 0.29, 0.012, ( x, 0, z ), 'rust_iron', seg = 12, rseg = 4 )
	for i in range( 3 ):
		p.box( ( 2.8 - 0.06 * i, 0.19, 0.05 ), ( 0.02 * i, - 0.2 + i * 0.2, 1.0 + 0.004 * ( i % 2 ) ), 'wood_grey' if i % 2 else 'wood_raw', rot = ( 0, 0.01 * ( i - 1 ), 0.004 * i ) )
	p.box( ( 0.3, 0.6, 0.6 ), ( 0, 0.02, 0.3 ), 'wood_grey' )
	p.box( ( 0.9, 0.04, 0.5 ), ( 0, - 0.24, 0.5 ), 'cloth_red', rot = ( 0.05, 0, 0 ) )
	return p.finish()

def rum_shelf():

	# rough plank shelves on the wall: bottles, a skull, tin cups (2.0 wide, 0.3 deep; 0.9..2.2 m up; origin floor, back at +Y)
	p = Piece( 'rum_shelf' )
	glass = [ 'paint_glass_brown', 'paint_glass_green', 'paint_glass_amber', 'paint_glass_clear' ]
	for k, z in enumerate( ( 1.2, 1.7, 2.15 ) ):
		p.box( ( 2.0, 0.3, 0.04 ), ( 0, 0, z ), 'wood_raw', rot = ( 0, 0.015 * ( k - 1 ), 0 ) )
		for s in ( - 1, 1 ): p.box( ( 0.04, 0.04, 0.25 ), ( s * 0.85, 0.12, z - 0.14 ), 'rust_iron', rot = ( 0.6, 0, 0 ) )
		for i in range( 7 ):
			if ( i + k ) % 4 == 2: continue
			bottle( p, - 0.8 + i * 0.27, 0.02, z + 0.02, glass[ ( i + k ) % 4 ], h = 0.25 + 0.05 * ( i % 2 ) )
	p.sphere( 0.11, ( 0.1, 0, 1.33 ), 'bone', scale = ( 0.9, 1.05, 1 ), sub = 2 )
	for s in ( - 1, 1 ): p.sphere( 0.025, ( 0.1 + s * 0.04, - 0.1, 1.35 ), 'paint_black', sub = 1 )
	p.box( ( 0.12, 0.09, 0.06 ), ( 0.1, - 0.03, 1.25 ), 'bone' )
	return p.finish()

def net_wall():

	# a fishing net hung on the wall with floats and a starfish (2.0 x 1.4, 0.9..2.3 m up; origin floor, back at +Y)
	p = Piece( 'net_wall' )
	for i in range( 9 ):
		p.box( ( 0.012, 0.01, 1.4 ), ( - 1.0 + i * 0.25, - 0.02, 1.6 ), 'cloth_net', rot = ( 0, 0.12 * math.sin( i ), 0 ) )
	for j in range( 7 ):
		p.box( ( 2.0, 0.01, 0.012 ), ( 0, - 0.02, 0.95 + j * 0.22 + 0.04 * math.sin( j * 1.7 ) ), 'cloth_net' )
	for i in range( 5 ): p.sphere( 0.06, ( - 0.8 + i * 0.4, - 0.06, 2.25 - 0.08 * ( i % 2 ) ), 'paint_red' if i % 2 else 'paint_cream', scale = ( 1, 0.7, 1.2 ), sub = 1 )
	for a in range( 5 ):
		t = a * TAU / 5
		p.box( ( 0.05, 0.02, 0.18 ), ( 0.4 + 0.08 * math.sin( t ), - 0.06, 1.4 + 0.08 * math.cos( t ) ), 'paint_red', rot = ( 0, t, 0 ) )
	return p.finish()

def hammock():

	# slung across a corner up high (decor): a sailcloth sag between two hooks 2.4 m apart, 2.0 m up
	p = Piece( 'hammock' )
	n = 10
	for i in range( n ):
		t0, t1 = i / n, ( i + 1 ) / n
		x0, x1 = - 1.0 + 2.0 * t0, - 1.0 + 2.0 * t1
		z0, z1 = 2.0 - 0.45 * math.sin( math.pi * t0 ), 2.0 - 0.45 * math.sin( math.pi * t1 )
		p.box( ( math.hypot( x1 - x0, z1 - z0 ) + 0.01, 0.7, 0.02 ), ( ( x0 + x1 ) / 2, 0, ( z0 + z1 ) / 2 ), 'cloth_sail', rot = ( 0, - math.atan2( z1 - z0, x1 - x0 ), 0 ) )
	for s in ( - 1, 1 ):
		p.box( ( 0.3, 0.012, 0.012 ), ( s * 1.12, 0, 2.05 ), 'cloth_rope', rot = ( 0, s * 0.3, 0 ) )
		p.torus( 0.04, 0.01, ( s * 1.25, 0, 2.1 ), 'rust_iron', rot = RX, seg = 8, rseg = 3 )
	return p.finish()

def plate_shelf():

	# a short wall shelf of plates and jugs (1.4 wide, 1.75 m up; origin floor, back at +Y)
	p = Piece( 'plate_shelf' )
	p.box( ( 1.4, 0.22, 0.03 ), ( 0, 0, 1.75 ), 'wood_red' )
	for s in ( - 1, 1 ): p.box( ( 0.03, 0.18, 0.18 ), ( s * 0.6, 0.01, 1.66 ), 'wood_red' )
	p.box( ( 1.4, 0.02, 0.04 ), ( 0, - 0.08, 1.79 ), 'wood_red' )
	for i in range( 4 ):
		p.cyl( 0.12, 0.12, 0.015, ( - 0.5 + i * 0.22, 0.04, 1.77 ), 'paint_white' if i % 2 else 'paint_navy', seg = 14, rot = ( - 1.35, 0, 0 ) )
	p.lathe( [ ( 0.0, 0 ), ( 0.06, 0 ), ( 0.07, 0.07 ), ( 0.05, 0.15 ), ( 0.04, 0.17 ), ( 0.0, 0.17 ) ], ( 0.48, 0, 1.765 ), 'paint_cream', seg = 10 )
	return p.finish()

def crates_stack():

	# a stack of shipping crates and a sack (1.3 x 0.8)
	p = Piece( 'crates_stack' )
	p.box( ( 0.7, 0.6, 0.55 ), ( - 0.25, 0, 0.275 ), 'wood_raw' )
	p.box( ( 0.6, 0.55, 0.5 ), ( 0.38, 0.05, 0.25 ), 'wood_light', rot = ( 0, 0, 0.1 ) )
	p.box( ( 0.55, 0.5, 0.45 ), ( - 0.2, 0.02, 0.775 ), 'wood_light', rot = ( 0, 0, - 0.15 ) )
	for ( x, z, w ) in ( ( - 0.25, 0.1, 0.7 ), ( - 0.25, 0.45, 0.7 ) ): p.box( ( w + 0.01, 0.61, 0.05 ), ( x, 0, z ), 'wood_grey' )
	p.sphere( 0.22, ( 0.38, 0.0, 0.66 ), 'cloth_sail', scale = ( 1, 0.8, 0.8 ), sub = 2 )
	return p.finish()

# ---------------------------------------------------------------------------------------------------- build, export

for o in list( bpy.data.objects ): bpy.data.objects.remove( o )

pieces = [
	bar_counter(), bar_back(), keg_rack(), table_round(), table_long(), barrel_table(), stool(), chair(), bench(), crate_seat(),
	hearth(), stairs(), dice_table(), mugs(), bottles(), candle(), candle_bottle(), lantern_hang(), chandelier(),
	shelf_rope(), shelf_lanterns(), firearms_rack(), shop_counter(), chart_table(), notice_board(), chart_frame(), desk(),
	wheel_wall(), rug(), fish_mount(), door_leaf(), door_closed(), rum_casks(), plank_bar(), rum_shelf(), net_wall(),
	hammock(), plate_shelf(), crates_stack(),
]
# (the temp pieces of merge() made no objects; drop any stray data blocks)
tris = {}
for ob in pieces:
	ob.data.calc_loop_triangles()
	tris[ ob.name ] = len( ob.data.loop_triangles )
print( 'TRIS', json.dumps( tris ), 'total', sum( tris.values() ) )

for ob in bpy.data.objects: ob.select_set( ob in pieces )
kw = dict( filepath = OUT, export_format = 'GLB', use_selection = True, export_apply = True, export_yup = True, export_normals = True, export_texcoords = False, export_materials = 'EXPORT', export_extras = False, export_animations = False )
try:
	bpy.ops.export_scene.gltf( **kw, export_vertex_color = 'NONE' )
except TypeError:
	bpy.ops.export_scene.gltf( **kw )
print( 'EXPORTED', OUT )

BY = { ob.name: ob for ob in pieces }

def render_setup( sc, w, h, engine = 'CYCLES' ):

	sc.render.engine = engine
	sc.render.resolution_x = w
	sc.render.resolution_y = h
	if engine == 'CYCLES':
		sc.cycles.device = 'CPU'
		sc.cycles.samples = 40
		try: sc.cycles.use_denoising = True
		except Exception: pass
	sc.view_settings.view_transform = 'AgX' if 'AgX' in [ i.identifier for i in sc.view_settings.bl_rna.properties[ 'view_transform' ].enum_items ] else 'Filmic'

if PREVIEW:
	# a contact sheet: the pieces in a grid on a ground plane (workbench, studio light)
	sc = bpy.context.scene
	cols = 8
	stash = {}
	for i, ob in enumerate( pieces ):
		stash[ ob.name ] = ob.location.copy()
		zmin = min( ( ob.matrix_world @ Vector( c ) ).z for c in ob.bound_box )
		ob.location = ( ( i % cols ) * 3.0, ( i // cols ) * 3.2, - zmin )
	Wd = ( cols - 1 ) * 3.0
	bpy.ops.mesh.primitive_plane_add( size = 200, location = ( Wd / 2, 0, - 0.01 ) )
	ground = bpy.context.active_object
	cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) )
	sc.collection.objects.link( cam )
	cam.data.type = 'ORTHO'
	cam.data.ortho_scale = Wd + 4
	cam.location = ( Wd / 2, - 16, 16 )
	cam.rotation_euler = ( math.radians( 58 ), 0, 0 )
	sc.camera = cam
	sc.render.engine = 'BLENDER_WORKBENCH'
	sc.display.shading.light = 'STUDIO'
	sc.display.shading.color_type = 'MATERIAL'
	sc.display.shading.show_shadows = True
	sc.display.shading.show_cavity = True
	sc.render.resolution_x = 2400
	sc.render.resolution_y = 1500
	sc.render.filepath = PREVIEW
	bpy.ops.render.render( write_still = True )
	print( 'PREVIEW', PREVIEW )
	for ob in pieces: ob.location = stash[ ob.name ]
	bpy.data.objects.remove( ground )
	bpy.data.objects.remove( cam )

if ROOMS and ROOM_OUT:
	# every room: the lining as boxes (floor, walls round the door, ceiling), the pieces, the lights, a camera inside the door
	rooms = json.load( open( ROOMS ) )
	os.makedirs( ROOM_OUT, exist_ok = True )
	sc = bpy.context.scene
	for ob in pieces: ob.hide_render = True
	G2B = lambda x, y, z: ( x, - z, y ) # game local (x, y up, z front) -> Blender
	lining_mat = {}
	def lmat( name, hexc, r = 0.85 ):
		if name in lining_mat: return lining_mat[ name ]
		m = bpy.data.materials.new( name )
		m.use_nodes = True
		b = m.node_tree.nodes.get( 'Principled BSDF' )
		b.inputs[ 'Base Color' ].default_value = srgb( hexc )
		b.inputs[ 'Roughness' ].default_value = r
		lining_mat[ name ] = m
		return m
	for room in rooms:
		made = []
		def boxL( cx, cy, cz, sx, sy, sz, mat ):
			bpy.ops.mesh.primitive_cube_add( size = 1, location = G2B( cx, cy, cz ) )
			o = bpy.context.active_object
			o.scale = ( sx, sz, sy )
			o.data.materials.append( mat )
			made.append( o )
		X, Z, H = room[ 'X' ], room[ 'Z' ], room[ 'h' ]
		dx, dw, dh = room[ 'doorX' ], room[ 'doorW' ], room[ 'doorH' ]
		L = room.get( 'lining', {} )
		floor = lmat( 'floor_' + room[ 'id' ], int( L.get( 'floor', '0x5a4430' ), 16 ) )
		wall = lmat( 'wall_' + room[ 'id' ], int( L.get( 'wall', '0x9a8468' ), 16 ) )
		wains = lmat( 'wains_' + room[ 'id' ], int( L.get( 'wainscot', '0x4a5a48' ), 16 ) )
		ceil = lmat( 'ceil_' + room[ 'id' ], int( L.get( 'ceiling', '0x6a5440' ), 16 ) )
		boxL( 0, - 0.05, 0, 2 * X + 0.4, 0.1, 2 * Z + 0.4, floor )
		boxL( 0, H + 0.05, 0, 2 * X + 0.4, 0.1, 2 * Z + 0.4, ceil )
		boxL( 0, H / 2, - Z - 0.1, 2 * X, H, 0.2, wall )
		for s in ( - 1, 1 ): boxL( s * ( X + 0.1 ), H / 2, 0, 0.2, H, 2 * Z, wall )
		# the front wall round the door
		lw = dx - dw / 2 + X
		rw = X - ( dx + dw / 2 )
		if lw > 0: boxL( - X + lw / 2, H / 2, Z + 0.1, lw, H, 0.2, wall )
		if rw > 0: boxL( X - rw / 2, H / 2, Z + 0.1, rw, H, 0.2, wall )
		boxL( dx, dh + ( H - dh ) / 2, Z + 0.1, dw, H - dh, 0.2, wall )
		# wainscot band
		for ( cx, cz, sx, sz ) in ( ( 0, - Z + 0.01, 2 * X, 0.02 ), ( - X + 0.01, 0, 0.02, 2 * Z ), ( X - 0.01, 0, 0.02, 2 * Z ) ):
			boxL( cx, 0.5, cz, sx, 1.0, sz, wains )
		# beams across the ceiling
		for i in range( int( 2 * X / 1.4 ) + 1 ):
			boxL( - X + 0.4 + i * 1.4, H - 0.09, 0, 0.14, 0.18, 2 * Z, ceil )
		for pl in room[ 'pieces' ]:
			src = BY.get( pl[ 'piece' ] )
			if not src: continue
			o = bpy.data.objects.new( src.name + '_inst', src.data )
			sc.collection.objects.link( o )
			o.location = G2B( pl[ 'x' ], pl[ 'y' ], pl[ 'z' ] )
			o.rotation_euler = ( 0, 0, pl.get( 'ry', 0 ) )
			s = pl.get( 's', 1 )
			o.scale = ( pl.get( 'sx', s ), pl.get( 'sz', s ), pl.get( 'sy', s ) )
			made.append( o )
		for li in room[ 'lights' ]:
			ld = bpy.data.lights.new( 'L', 'POINT' )
			ld.energy = li[ 'intensity' ] * 12
			ld.color = li.get( 'color', ( 1.0, 0.72, 0.42 ) )
			ld.shadow_soft_size = 0.08
			lo = bpy.data.objects.new( 'L', ld )
			sc.collection.objects.link( lo )
			lo.location = G2B( li[ 'x' ], li[ 'y' ], li[ 'z' ] )
			made.append( lo )
		# a faint daylight fill (the game's sky ambient)
		w = sc.world or bpy.data.worlds.new( 'w' )
		sc.world = w
		w.use_nodes = True
		bg = w.node_tree.nodes.get( 'Background' )
		bg.inputs[ 'Color' ].default_value = ( 0.55, 0.62, 0.7, 1 )
		bg.inputs[ 'Strength' ].default_value = 0.12
		for view in room[ 'views' ]:
			cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) )
			sc.collection.objects.link( cam )
			cam.data.lens = 18
			cam.location = G2B( *view[ 'from' ] )
			d = Vector( G2B( *view[ 'to' ] ) ) - cam.location
			cam.rotation_euler = d.to_track_quat( '-Z', 'Y' ).to_euler()
			sc.camera = cam
			# fill: the room's own ambient (a weak area light at the ceiling: the game's sky light through the walls)
			render_setup( sc, 960, 540 )
			sc.render.filepath = os.path.join( ROOM_OUT, room[ 'id' ] + '-' + view[ 'name' ] + '.png' )
			bpy.ops.render.render( write_still = True )
			print( 'ROOM', sc.render.filepath )
			bpy.data.objects.remove( cam )
		for o in made: bpy.data.objects.remove( o )
