# Shared Blender helpers for the vehicle interiors (wave 24A): tools/cars/build_interiors.py and
# tools/helicopter/build_cockpit.py. Everything is authored in the GAME frame (+X the vehicle's left, +Y up, +Z forward,
# metres) and converted to Blender's frame ( x, -z, y ) only when a node becomes an object; the glTF exporter's +Y up
# turns it back, so the GLB is in the game frame.
#
#   k = Kit( MATS )                       MATS: { name: ( ( r, g, b ) sRGB 0..1, roughness, metallic ) }
#   n = k.node( 'Wheel', loc, rot )       a node with its own pivot (rot: game-frame XYZ euler, radians); parts are local
#   k.box( n, c, s, mat, r = bevel, seg, rot )   k.cyl( n, c, r1, r2, depth, mat, rot, seg, bevel )   k.torus( ... )
#   k.rod( n, a, b, radius, mat )   k.quad( n, corners, mat ) (a screen: uv 0..1 over the quad)   k.sphere( ... )
#   k.empty( name, loc, parent )   k.export( path )
# Faces get box-projected UVs in metres (the game's procedural materials scale them), smooth shading with sharp edges
# over 35 degrees, and one glTF material per name (base colour, roughness, metallic).

import bpy, bmesh, math
from mathutils import Matrix, Vector, Euler

G2B = Matrix( ( ( 1, 0, 0, 0 ), ( 0, 0, - 1, 0 ), ( 0, 1, 0, 0 ), ( 0, 0, 0, 1 ) ) )
B2G = G2B.inverted()

def srgb_to_linear( c ):
	return c / 12.92 if c <= 0.04045 else ( ( c + 0.055 ) / 1.055 ) ** 2.4

def xf( loc = ( 0, 0, 0 ), rot = ( 0, 0, 0 ), scale = ( 1, 1, 1 ) ):
	return Matrix.Translation( Vector( loc ) ) @ Euler( rot, 'XYZ' ).to_matrix().to_4x4() @ Matrix.Diagonal( ( *scale, 1 ) )

class Node:
	def __init__( self, name, loc, rot, parent ):
		self.name, self.loc, self.rot, self.parent = name, Vector( loc ), rot, parent
		self.bm = bmesh.new()
		self.mats = []
		self.screens = {}  # material name -> ( c0, u axis, v axis ) for 0..1 uvs

class Kit:

	def __init__( self, mats ):
		bpy.ops.wm.read_factory_settings( use_empty = True )
		self.defs = mats
		self.materials = {}
		self.nodes = []
		self.empties = []

	def material( self, name ):
		if name in self.materials: return self.materials[ name ]
		col, rough, metal = self.defs[ name ]
		m = bpy.data.materials.new( name )
		m.use_nodes = True
		b = m.node_tree.nodes[ 'Principled BSDF' ]
		b.inputs[ 'Base Color' ].default_value = ( *[ srgb_to_linear( c ) for c in col ], 1 )
		b.inputs[ 'Roughness' ].default_value = rough
		b.inputs[ 'Metallic' ].default_value = metal
		self.materials[ name ] = m
		return m

	def node( self, name, loc = ( 0, 0, 0 ), rot = ( 0, 0, 0 ), parent = None ):
		n = Node( name, loc, rot, parent )
		self.nodes.append( n )
		return n

	def empty( self, name, loc, parent = None ):
		self.empties.append( ( name, Vector( loc ), parent ) )

	# ---- primitives: a temporary bmesh, transformed into the node and appended with its material
	def _put( self, node, tmp, mat, m, smooth = True ):
		if mat not in node.mats: node.mats.append( mat )
		mi = node.mats.index( mat )
		tmp.transform( m )
		tmp.normal_update()
		for f in tmp.faces:
			f.material_index = mi
			f.smooth = smooth
		me = bpy.data.meshes.new( 'tmp' )
		tmp.to_mesh( me )
		tmp.free()
		node.bm.from_mesh( me )
		bpy.data.meshes.remove( me )

	def box( self, node, c, s, mat, r = 0.0, seg = 2, rot = ( 0, 0, 0 ), smooth = None ):
		t = bmesh.new()
		bmesh.ops.create_cube( t, size = 1.0 )
		for v in t.verts: v.co = Vector( ( v.co.x * s[ 0 ], v.co.y * s[ 1 ], v.co.z * s[ 2 ] ) )
		r = min( r, min( s ) * 0.49 )
		if r > 0: bmesh.ops.bevel( t, geom = list( t.edges ), offset = r, segments = seg, profile = 0.5, affect = 'EDGES', clamp_overlap = True )
		self._put( node, t, mat, xf( c, rot ), smooth if smooth is not None else r > 0 )

	# a wedge / any convex hull of points (game frame, node local)
	def hull( self, node, pts, mat, smooth = False ):
		t = bmesh.new()
		vs = [ t.verts.new( Vector( p ) ) for p in pts ]
		bmesh.ops.convex_hull( t, input = vs )
		self._put( node, t, mat, Matrix.Identity( 4 ), smooth )

	def cyl( self, node, c, r1, r2, depth, mat, rot = ( 0, 0, 0 ), seg = 16, bevel = 0.0, caps = True ):
		t = bmesh.new()
		bmesh.ops.create_cone( t, cap_ends = caps, cap_tris = False, segments = seg, radius1 = r1, radius2 = r2, depth = depth )
		if bevel > 0:
			rim = [ e for e in t.edges if abs( e.verts[ 0 ].co.z - e.verts[ 1 ].co.z ) < 1e-6 ]
			bmesh.ops.bevel( t, geom = rim, offset = bevel, segments = 2, profile = 0.5, affect = 'EDGES', clamp_overlap = True )
		self._put( node, t, mat, xf( c, rot ), True )

	def sphere( self, node, c, r, mat, scale = ( 1, 1, 1 ), rot = ( 0, 0, 0 ), seg = 16, rings = 10 ):
		t = bmesh.new()
		bmesh.ops.create_uvsphere( t, u_segments = seg, v_segments = rings, radius = r )
		self._put( node, t, mat, xf( c, rot, scale ), True )

	# a torus in the local XY plane (axis local Z), arc in radians from a0 (0 = +X), closed when the arc is 2 pi
	def torus( self, node, c, R, r, mat, rot = ( 0, 0, 0 ), seg = 40, ring = 10, a0 = 0.0, arc = math.pi * 2 ):
		t = bmesh.new()
		closed = arc >= math.pi * 2 - 1e-6
		n = seg if closed else seg + 1
		rings = []
		for i in range( n ):
			a = a0 + arc * i / seg
			ca, sa = math.cos( a ), math.sin( a )
			rings.append( [ t.verts.new( ( ( R + r * math.cos( b ) ) * ca, ( R + r * math.cos( b ) ) * sa, r * math.sin( b ) ) ) for b in [ j / ring * math.pi * 2 for j in range( ring ) ] ] )
		for i in range( seg if closed else seg ):
			A, B = rings[ i ], rings[ ( i + 1 ) % n ]
			for j in range( ring ):
				t.faces.new( ( A[ j ], B[ j ], B[ ( j + 1 ) % ring ], A[ ( j + 1 ) % ring ] ) )
		self._put( node, t, mat, xf( c, rot ), True )

	# a round bar from a to b (node local)
	def rod( self, node, a, b, radius, mat, seg = 10, r2 = None ):
		a, b = Vector( a ), Vector( b )
		d = b - a
		t = bmesh.new()
		bmesh.ops.create_cone( t, cap_ends = True, cap_tris = False, segments = seg, radius1 = radius, radius2 = r2 if r2 is not None else radius, depth = d.length )
		q = Vector( ( 0, 0, 1 ) ).rotation_difference( d.normalized() )
		self._put( node, t, mat, Matrix.Translation( ( a + b ) / 2 ) @ q.to_matrix().to_4x4(), True )

	# a polyline tube through points (handles, frames, harness straps)
	def tube( self, node, pts, radius, mat, seg = 8 ):
		for i in range( len( pts ) - 1 ): self.rod( node, pts[ i ], pts[ i + 1 ], radius, mat, seg )
		for p in pts[ 1:-1 ]: self.sphere( node, p, radius, mat, seg = seg, rings = 6 )

	# a flat strap / panel between 4 corners with thickness (normal side out)
	def slab( self, node, corners, thick, mat, smooth = False ):
		c = [ Vector( p ) for p in corners ]
		n = ( c[ 1 ] - c[ 0 ] ).cross( c[ 3 ] - c[ 0 ] ).normalized() * thick
		self.hull( node, [ *c, *[ p - n for p in c ] ], mat, smooth )

	# a screen quad: corners c0 (u0 v0 = top left), c1 (top right), c2 (bottom right), c3 (bottom left); faces the viewer
	def quad( self, node, corners, mat ):
		t = bmesh.new()
		vs = [ t.verts.new( Vector( p ) ) for p in corners ]
		t.faces.new( vs )
		c0 = Vector( corners[ 0 ] )
		U, V = Vector( corners[ 1 ] ) - c0, Vector( corners[ 3 ] ) - c0
		node.screens[ mat ] = ( c0, U, V - U * ( V.dot( U ) / U.length_squared ) )
		self._put( node, t, mat, Matrix.Identity( 4 ), False )

	# a grid of thin bars in a rectangle (cages, grilles): the rectangle's corners as in quad(), n x m bars
	def grid( self, node, corners, nu, nv, radius, mat ):
		c = [ Vector( p ) for p in corners ]
		for i in range( nu + 1 ):
			t = i / nu
			self.rod( node, c[ 0 ].lerp( c[ 1 ], t ), c[ 3 ].lerp( c[ 2 ], t ), radius, mat, 6 )
		for j in range( nv + 1 ):
			t = j / nv
			self.rod( node, c[ 0 ].lerp( c[ 3 ], t ), c[ 1 ].lerp( c[ 2 ], t ), radius, mat, 6 )

	# ---- objects, uvs, export
	def _finish( self, node ):
		bm = node.bm
		bmesh.ops.remove_doubles( bm, verts = bm.verts, dist = 1e-6 )
		uv = bm.loops.layers.uv.new( 'UVMap' )
		bm.normal_update()
		for f in bm.faces:
			mat = node.mats[ f.material_index ]
			sc = node.screens.get( mat )
			for l in f.loops:
				p = l.vert.co
				if sc:
					c0, U, V = sc
					d = p - c0
					l[ uv ].uv = ( d.dot( U ) / U.length_squared, 1 - d.dot( V ) / V.length_squared )
				else:
					n = f.normal
					ax = max( range( 3 ), key = lambda i: abs( n[ i ] ) )
					a, b = [ ( 2, 1 ), ( 0, 2 ), ( 0, 1 ) ][ ax ]
					l[ uv ].uv = ( p[ a ], p[ b ] )
		for e in bm.edges:
			if len( e.link_faces ) == 2 and e.calc_face_angle( 0 ) > math.radians( 35 ): e.smooth = False
		me = bpy.data.meshes.new( node.name )
		bm.transform( G2B )
		bm.to_mesh( me )
		bm.free()
		for m in node.mats: me.materials.append( self.material( m ) )
		ob = bpy.data.objects.new( node.name, me )
		bpy.context.scene.collection.objects.link( ob )
		return ob

	def export( self, path ):
		obs = {}
		for n in self.nodes:
			if not n.bm.verts: continue
			obs[ n.name ] = ( self._finish( n ), n )
		for name, loc, parent in self.empties:
			e = bpy.data.objects.new( name, None )
			bpy.context.scene.collection.objects.link( e )
			obs[ name ] = ( e, None )
			e[ 'loc' ] = loc
		# transforms after every object exists (parents first: nodes are declared parent-first)
		for name, ( ob, n ) in obs.items():
			if n is not None:
				ob.matrix_world = G2B @ xf( n.loc, n.rot ) @ B2G if n.parent is None else obs[ n.parent ][ 0 ].matrix_world @ G2B @ xf( n.loc, n.rot ) @ B2G
				if n.parent: ob.parent = obs[ n.parent ][ 0 ]; ob.matrix_parent_inverse = obs[ n.parent ][ 0 ].matrix_world.inverted()
		for name, loc, parent in self.empties:
			ob = obs[ name ][ 0 ]
			if parent:
				p = obs[ parent ][ 0 ]
				ob.matrix_world = p.matrix_world @ G2B @ Matrix.Translation( loc ) @ B2G
				ob.parent = p; ob.matrix_parent_inverse = p.matrix_world.inverted()
			else: ob.matrix_world = G2B @ Matrix.Translation( loc ) @ B2G
		bpy.context.view_layer.update()
		bpy.ops.export_scene.gltf( filepath = path, export_format = 'GLB', export_yup = True, export_apply = True, export_texcoords = True,
			export_normals = True, export_materials = 'EXPORT', export_cameras = False, export_lights = False, export_extras = False, export_animations = False )
		return obs
