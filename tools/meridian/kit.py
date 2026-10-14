# Wave 21A: Meridian's street kit, modelled in Blender (headless) and exported as one GLB. The helpers and conventions are the
# town kit's (tools/town/kit.py, copied below): one root object per piece named after it, front -Y (glTF +Z), up +Z, one
# material per colour named for the prop material's pattern (glow_* lights up at night). Meridian.js places the pieces.
#
#   D:\blender\blender.exe -b --factory-startup --python tools/meridian/kit.py -- public/models/meridian/kit.glb [preview.png]
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

# ---------------------------------------------------------------------------------------------------- Meridian's pieces
# Blender front is -Y (the game's local +z), up +Z; origins on the ground at the piece's foot.

MATS.update( {
	'paint_grey': ( 0x4a4f54, 0.5, 0.3 ), 'paint_signal': ( 0x2b2f2a, 0.6, 0 ), 'paint_orange': ( 0xd9772b, 0.55, 0 ),
	'steel': ( 0x8e959b, 0.4, 0.8 ), 'glow_cool': ( 0xf2f5ff, 0.3, 0 ), 'leaf_light': ( 0x5f8f3e, 0.8, 0 ), 'bark': ( 0x4b3a2c, 0.9, 0 ),
	'paint_cork': ( 0xa5794d, 0.9, 0 ), 'paper': ( 0xefe9da, 0.9, 0 ),
} )

def lamp_city():

	# an 8 m steel column, the arm out over the road (front, -Y), a flat LED head
	p = Piece( 'lamp_city' )
	p.cyl( 0.2, 0.17, 0.5, ( 0, 0, 0 ), 'paint_grey', seg = 8, smooth = False )
	p.cyl( 0.1, 0.07, 7.6, ( 0, 0, 0.5 ), 'paint_grey', seg = 8 )
	p.box( ( 0.08, 2.2, 0.08 ), ( 0, - 1.1, 7.95 ), 'paint_grey', rot = ( - 0.08, 0, 0 ) )
	p.box( ( 0.36, 0.9, 0.12 ), ( 0, - 2.25, 7.85 ), 'paint_grey' )
	p.box( ( 0.3, 0.8, 0.03 ), ( 0, - 2.25, 7.78 ), 'glow_cool' )
	return p.finish()

def signal_pole():

	# a traffic signal on the corner: the mast arm over the lanes to its left (the game's local -x: Blender -X), the heads facing
	# the traffic (-Y); the lenses are drawn by the game (Meridian.js SIGNAL_LENSES) so they can change colour
	p = Piece( 'signal_pole' )
	p.cyl( 0.2, 0.16, 0.4, ( 0, 0, 0 ), 'paint_signal', seg = 8, smooth = False )
	p.cyl( 0.11, 0.09, 6.4, ( 0, 0, 0.4 ), 'paint_signal', seg = 8 )
	p.box( ( 5.0, 0.12, 0.12 ), ( - 2.4, 0, 6.3 ), 'paint_signal' )
	p.box( ( 2.0, 0.06, 0.06 ), ( - 1.0, 0, 5.75 ), 'paint_signal', rot = ( 0, - 0.5, 0 ) )
	for ( x, z ) in ( ( - 4.5, 5.85 ), ( 0.0, 2.95 ) ):
		p.box( ( 0.38, 0.3, 1.1 ), ( x, 0.05, z ), 'paint_signal' )
		p.box( ( 0.62, 0.04, 1.3 ), ( x, 0.22, z ), 'paint_black' )
		for k in range( 3 ):
			p.box( ( 0.3, 0.16, 0.05 ), ( x, - 0.15, z + 0.49 - k * 0.36 ), 'paint_signal' )
	p.box( ( 0.14, 0.12, 0.2 ), ( 0.0, - 0.13, 1.1 ), 'paint_yellow' )
	return p.finish()

def bench_city():

	p = Piece( 'bench_city' )
	for s in ( - 1, 1 ):
		x = s * 0.8
		p.box( ( 0.08, 0.5, 0.45 ), ( x, 0, 0.225 ), 'steel' )
		p.box( ( 0.08, 0.08, 0.5 ), ( x, 0.24, 0.65 ), 'steel', rot = ( - 0.2, 0, 0 ) )
	for k in range( 4 ):
		p.box( ( 1.9, 0.1, 0.04 ), ( 0, - 0.17 + k * 0.115, 0.46 ), 'wood_mid' )
	for k in range( 2 ):
		p.box( ( 1.9, 0.04, 0.1 ), ( 0, 0.25 + k * 0.03, 0.62 + k * 0.14 ), 'wood_mid', rot = ( - 0.2, 0, 0 ) )
	return p.finish()

def hydrant():

	p = Piece( 'hydrant' )
	p.cyl( 0.2, 0.2, 0.08, ( 0, 0, 0 ), 'paint_red', seg = 10, smooth = False )
	p.cyl( 0.14, 0.14, 0.55, ( 0, 0, 0.08 ), 'paint_red', seg = 10 )
	p.sphere( 0.15, ( 0, 0, 0.66 ), 'paint_red', scale = ( 1, 1, 0.7 ) )
	p.cyl( 0.05, 0.05, 0.36, ( - 0.18, 0, 0.45 ), 'paint_red', seg = 6, rot = ( 0, math.pi / 2, 0 ) )
	p.cyl( 0.07, 0.07, 0.1, ( 0, - 0.12, 0.45 ), 'gold', seg = 6, rot = ( math.pi / 2, 0, 0 ) )
	return p.finish()

def tree_city( name, leaf, h = 7.5 ):

	p = Piece( name )
	p.cyl( 0.22, 0.14, h * 0.5, ( 0, 0, 0 ), 'bark', seg = 7 )
	p.cyl( 0.08, 0.05, 1.6, ( 0, 0, h * 0.42 ), 'bark', seg = 5, rot = ( 0.6, 0, 0.3 ) )
	p.sphere( h * 0.28, ( 0, 0, h * 0.68 ), leaf, scale = ( 1, 1, 0.85 ), sub = 1 )
	p.sphere( h * 0.2, ( h * 0.16, - h * 0.08, h * 0.58 ), leaf, sub = 1 )
	p.sphere( h * 0.19, ( - h * 0.14, h * 0.1, h * 0.6 ), 'leaf_dark', sub = 1 )
	p.sphere( h * 0.17, ( 0.05, 0.1, h * 0.86 ), leaf, sub = 1 )
	return p.finish()

def crane():

	# a harbour crane: the portal legs, the machinery house, the jib out over the water (front, -Y)
	p = Piece( 'crane' )
	for x in ( - 4.5, 4.5 ):
		for y in ( - 4.5, 4.5 ):
			p.box( ( 0.7, 0.7, 12 ), ( x, y, 6 ), 'paint_orange' )
		p.box( ( 0.8, 10, 0.8 ), ( x, 0, 12 ), 'paint_orange' )
		p.box( ( 0.8, 10, 0.8 ), ( x, 0, 1.0 ), 'paint_orange' )
	p.box( ( 10, 0.8, 0.8 ), ( 0, - 4.5, 12 ), 'paint_orange' )
	p.box( ( 10, 0.8, 0.8 ), ( 0, 4.5, 12 ), 'paint_orange' )
	p.cyl( 1.6, 1.6, 2.0, ( 0, 0, 12.4 ), 'paint_orange', seg = 12 )
	p.box( ( 5, 7, 4.5 ), ( 0, 1.5, 16.6 ), 'paint_cream' )
	p.box( ( 1.2, 1.4, 1.6 ), ( 1.5, - 2.4, 16 ), 'glow_warm' )
	p.box( ( 0.8, 30, 0.9 ), ( - 0.8, - 15, 19 ), 'paint_orange', rot = ( 0.32, 0, 0 ) )
	p.box( ( 0.8, 30, 0.9 ), ( 0.8, - 15, 19 ), 'paint_orange', rot = ( 0.32, 0, 0 ) )
	p.box( ( 0.25, 8, 0.25 ), ( 0, 2, 24 ), 'steel', rot = ( - 0.7, 0, 0 ) )
	p.box( ( 0.06, 0.06, 14 ), ( 0, - 27.5, 16 ), 'steel' )
	p.box( ( 1.4, 0.8, 0.8 ), ( 0, - 27.5, 8.6 ), 'paint_yellow' )
	return p.finish()

def stall_market():

	# a market stall: the counter at the front (-Y), four posts, a striped canvas roof; the vendor stands behind (+Y)
	p = Piece( 'stall_market' )
	p.box( ( 2.6, 0.9, 0.9 ), ( 0, 0, 0.45 ), 'wood_mid' )
	p.box( ( 2.7, 1.0, 0.06 ), ( 0, 0, 0.92 ), 'wood_light' )
	for x in ( - 1.25, 1.25 ):
		for y in ( - 0.55, 0.65 ):
			p.cyl( 0.04, 0.04, 2.3 if y < 0 else 2.6, ( x, y, 0 ), 'wood_dark', seg = 6 )
	for k in range( 6 ):
		p.box( ( 0.46, 1.5, 0.04 ), ( - 1.15 + k * 0.46, 0.05, 2.45 ), 'cloth_red' if k % 2 else 'cloth_cream', rot = ( - 0.2, 0, 0 ) )
	for k in range( 5 ):
		p.sphere( 0.12, ( - 0.9 + k * 0.45, - 0.2, 1.02 ), ( 'flower_yellow', 'flower_red', 'leaf_light', 'paint_orange', 'flower_red' )[ k ], sub = 1 )
	return p.finish()

def board_notice():

	p = Piece( 'board_notice' )
	for x in ( - 0.9, 0.9 ):
		p.cyl( 0.05, 0.05, 2.2, ( x, 0, 0 ), 'paint_navy', seg = 6 )
	p.box( ( 1.9, 0.08, 1.2 ), ( 0, 0, 1.5 ), 'paint_cork' )
	p.box( ( 2.1, 0.5, 0.06 ), ( 0, 0, 2.2 ), 'paint_navy', rot = ( 0.1, 0, 0 ) )
	for ( x, z, w, h ) in ( ( - 0.5, 1.7, 0.4, 0.5 ), ( 0.1, 1.55, 0.5, 0.35 ), ( 0.6, 1.75, 0.35, 0.45 ), ( - 0.2, 1.2, 0.6, 0.3 ), ( 0.55, 1.25, 0.3, 0.3 ) ):
		p.box( ( w, 0.02, h ), ( x, - 0.05, z ), 'paper' )
	return p.finish()

def bollard():

	p = Piece( 'bollard' )
	p.cyl( 0.28, 0.24, 0.5, ( 0, 0, 0 ), 'iron', seg = 10 )
	p.cyl( 0.3, 0.3, 0.12, ( 0, 0, 0.5 ), 'iron', seg = 10 )
	return p.finish()

def bus_stop():

	p = Piece( 'bus_stop' )
	for x in ( - 1.6, 1.6 ):
		p.box( ( 0.08, 0.08, 2.5 ), ( x, 0.6, 1.25 ), 'steel' )
	p.box( ( 3.6, 1.6, 0.08 ), ( 0, 0.0, 2.55 ), 'steel' )
	p.box( ( 3.2, 0.03, 2.0 ), ( 0, 0.62, 1.3 ), 'water' )
	p.box( ( 2.6, 0.35, 0.05 ), ( 0, 0.35, 0.48 ), 'wood_mid' )
	p.box( ( 0.06, 0.06, 2.8 ), ( 1.9, - 0.2, 1.4 ), 'steel' )
	p.box( ( 0.5, 0.04, 0.5 ), ( 1.9, - 0.22, 2.75 ), 'paint_blue' )
	return p.finish()

for o in list( bpy.data.objects ): bpy.data.objects.remove( o )

pieces = [ lamp_city(), signal_pole(), bench_city(), hydrant(), tree_city( 'tree_a', 'leaf_mid' ), tree_city( 'tree_b', 'leaf_light', 9.0 ),
	crane(), stall_market(), board_notice(), bollard(), bus_stop() ]

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
	cols = 6
	for i, ob in enumerate( pieces ):
		zmin = min( ( ob.matrix_world @ Vector( c ) ).z for c in ob.bound_box )
		ob.location = ( ( i % cols ) * 9, ( i // cols ) * 14, - zmin )
	W = ( cols - 1 ) * 9
	sc = bpy.context.scene
	bpy.ops.mesh.primitive_plane_add( size = 300, location = ( W / 2, 0, - 0.01 ) )
	cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) )
	sc.collection.objects.link( cam )
	cam.data.type = 'ORTHO'
	cam.data.ortho_scale = W + 14
	cam.location = ( W / 2, - 60, 34 )
	cam.rotation_euler = ( math.radians( 64 ), 0, 0 )
	sc.camera = cam
	sc.render.engine = 'BLENDER_WORKBENCH'
	sc.display.shading.light = 'STUDIO'
	sc.display.shading.color_type = 'MATERIAL'
	sc.display.shading.show_shadows = True
	sc.display.shading.show_cavity = True
	sc.render.resolution_x = 2000
	sc.render.resolution_y = 1100
	sc.render.filepath = PREVIEW
	bpy.ops.render.render( write_still = True )
	print( 'PREVIEW', PREVIEW )
