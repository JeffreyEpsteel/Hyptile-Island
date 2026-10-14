# Blender (5.x, headless): the wave 18D arsenal as low-poly GLBs for the game's prop material.
#   D:\blender\blender.exe -b --factory-startup --python tools/weapons/build_weapons.py -- [--out public/models/weapons] [--preview <dir>] [ids...]
# Every model is authored in its game frame (src/features/weapons/WeaponModels.js): guns: origin at the grip, +Z the muzzle,
# +Y up, the lock on +X; melee: origin where the hand closes, +Z along the blade / shaft, +Y the back (the edge faces -Y);
# throwables: origin at the centre. The script builds with Blender's Z as the game's Z and Y as the game's Y, then turns the
# whole model +90 deg about X so the glTF exporter (+Y up) writes the game frame back exactly.
# Materials are named after WeaponModels.MATS (Wood, DarkWood, Steel, Bright, Brass, Iron, Rope, Leather, Glass, Cloth, Clay,
# Wick, Black): the game converts each primitive by its material name into vertex colour + roughness / metalness / pattern,
# so no textures are exported. Budget: <= 2500 triangles a model (checked). No downloaded assets: everything is modelled here.
# --preview renders contact sheets (Eevee, else Workbench) of every model to <dir>/weapons-*.png.
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

HERE = os.path.dirname( os.path.abspath( __file__ ) )
ROOT = os.path.abspath( os.path.join( HERE, '..', '..' ) )
argv = sys.argv[ sys.argv.index( '--' ) + 1: ] if '--' in sys.argv else []
OUT = os.path.join( ROOT, 'public', 'models', 'weapons' )
PREVIEW = None
only = []
i = 0
while i < len( argv ):
	if argv[ i ] == '--out': OUT = os.path.abspath( argv[ i + 1 ] ); i += 2; continue
	if argv[ i ] == '--preview': PREVIEW = os.path.abspath( argv[ i + 1 ] ); i += 2; continue
	only.append( argv[ i ] ); i += 1
BUDGET = 2500

# colour (sRGB hex), roughness, metalness: the preview's look (the game uses its own table by name)
MATS = {
	'Wood': ( 0x5b3920, 0.55, 0 ), 'DarkWood': ( 0x40271a, 0.6, 0 ), 'Steel': ( 0x2d3034, 0.34, 0.85 ), 'Bright': ( 0x9a9fa5, 0.22, 1 ),
	'Brass': ( 0xa8803a, 0.3, 1 ), 'Iron': ( 0x26262a, 0.6, 0.7 ), 'Rope': ( 0x9c8460, 0.9, 0 ), 'Leather': ( 0x3a2416, 0.7, 0 ),
	'Glass': ( 0x3f6b4a, 0.12, 0 ), 'Cloth': ( 0xc9b48a, 0.85, 0 ), 'Clay': ( 0x8a5634, 0.8, 0 ), 'Wick': ( 0xd8c39a, 0.9, 0 ),
	'Black': ( 0x141414, 0.5, 0.4 ),
}

def srgb( c ):
	return tuple( ( ( ( c >> s ) & 255 ) / 255 ) ** 2.2 for s in ( 16, 8, 0 ) )

def material( name ):
	m = bpy.data.materials.get( name )
	if m: return m
	m = bpy.data.materials.new( name )
	m.use_nodes = True
	col, rough, metal = MATS[ name ]
	b = m.node_tree.nodes.get( 'Principled BSDF' )
	b.inputs[ 'Base Color' ].default_value = ( *srgb( col ), 1 )
	b.inputs[ 'Roughness' ].default_value = rough
	b.inputs[ 'Metallic' ].default_value = metal
	m.diffuse_color = ( *srgb( col ), 1 )
	return m

# ---- building blocks (game frame: x side, y up, z forward); each returns the object

PARTS = []

def obj_from_bm( bm, mat, name = 'part' ):
	me = bpy.data.meshes.new( name )
	bm.to_mesh( me )
	bm.free()
	o = bpy.data.objects.new( name, me )
	bpy.context.collection.objects.link( o )
	o.data.materials.append( material( mat ) )
	PARTS.append( o )
	return o

def xform( bm, loc = ( 0, 0, 0 ), rot = ( 0, 0, 0 ), scale = None ):
	m = Matrix.Translation( Vector( loc ) ) @ ( Matrix.Rotation( rot[ 2 ], 4, 'Z' ) @ Matrix.Rotation( rot[ 1 ], 4, 'Y' ) @ Matrix.Rotation( rot[ 0 ], 4, 'X' ) )
	if scale: m = m @ Matrix.Diagonal( ( *scale, 1 ) )
	bmesh.ops.transform( bm, matrix = m, verts = bm.verts )

# a tube / cone along +Z from z0 to z1 (r0 at z0, r1 at z1), centred at ( x, y )
def cyl( mat, r0, r1, z0, z1, segs = 8, x = 0, y = 0, rot = None, cap = True ):
	bm = bmesh.new()
	bmesh.ops.create_cone( bm, cap_ends = cap, cap_tris = False, segments = segs, radius1 = r0, radius2 = r1, depth = abs( z1 - z0 ) )
	xform( bm, ( 0, 0, ( z0 + z1 ) / 2 ) )
	if rot: xform( bm, ( 0, 0, 0 ), rot )
	xform( bm, ( x, y, 0 ) )
	return obj_from_bm( bm, mat )

def box( mat, size, loc, rot = ( 0, 0, 0 ) ):
	bm = bmesh.new()
	bmesh.ops.create_cube( bm, size = 1 )
	xform( bm, ( 0, 0, 0 ), ( 0, 0, 0 ), size )
	xform( bm, loc, rot )
	return obj_from_bm( bm, mat )

def sphere( mat, r, loc, segs = 10, rings = 6, scale = None ):
	bm = bmesh.new()
	bmesh.ops.create_uvsphere( bm, u_segments = segs, v_segments = rings, radius = r )
	if scale: xform( bm, ( 0, 0, 0 ), ( 0, 0, 0 ), scale )
	xform( bm, loc )
	return obj_from_bm( bm, mat )

def ring( mat, R, r, loc, rot = ( 0, 0, 0 ), arc = 2 * math.pi, segs = 12, tube = 5 ):
	bm = bmesh.new()
	verts = []
	for i in range( segs + 1 ):
		a = arc * i / segs
		cx, cy = math.cos( a ) * R, math.sin( a ) * R
		row = []
		for j in range( tube ):
			b = 2 * math.pi * j / tube
			d = R + math.cos( b ) * r
			row.append( bm.verts.new( ( math.cos( a ) * d, math.sin( a ) * d, math.sin( b ) * r ) ) )
		verts.append( row )
	for i in range( segs ):
		for j in range( tube ):
			bm.faces.new( ( verts[ i ][ j ], verts[ i + 1 ][ j ], verts[ i + 1 ][ ( j + 1 ) % tube ], verts[ i ][ ( j + 1 ) % tube ] ) )
	xform( bm, loc, rot )
	return obj_from_bm( bm, mat )

# a side profile [ ( z, y ) ... ] (counter-clockwise or not) extruded across x by `width`, centred on x0; edge: [ ( axis, below,
# k ) ] thins the vertices under `below` on y to k of the width (a blade's edge)
def slab( mat, pts, width, x0 = 0, edge = None, bevel = 0 ):
	bm = bmesh.new()
	vs = [ bm.verts.new( ( x0 - width / 2, y, z ) ) for z, y in pts ]
	f = bm.faces.new( vs )
	bmesh.ops.recalc_face_normals( bm, faces = [ f ] )
	ext = bmesh.ops.extrude_face_region( bm, geom = [ f ] )
	moved = [ e for e in ext[ 'geom' ] if isinstance( e, bmesh.types.BMVert ) ]
	bmesh.ops.translate( bm, verts = moved, vec = ( width, 0, 0 ) )
	bmesh.ops.triangulate( bm, faces = [ fc for fc in bm.faces if len( fc.verts ) > 4 ] )
	if edge:
		below, k = edge
		for v in bm.verts:
			if v.co.y < below: v.co.x = x0 + ( v.co.x - x0 ) * k
	bmesh.ops.recalc_face_normals( bm, faces = bm.faces )
	o = obj_from_bm( bm, mat )
	if bevel:
		mod = o.modifiers.new( 'b', 'BEVEL' ); mod.width = bevel; mod.segments = 1; mod.limit_method = 'ANGLE'
	return o

# a lathe round +Z: [ ( r, z ) ... ] bottom to top
def lathe( mat, prof, segs = 12, x = 0, y = 0, axis = 'z' ):
	bm = bmesh.new()
	rows = []
	for r, z in prof:
		rows.append( [ bm.verts.new( ( math.cos( 2 * math.pi * k / segs ) * r, math.sin( 2 * math.pi * k / segs ) * r, z ) ) for k in range( segs ) ] )
	for a, b in zip( rows, rows[ 1: ] ):
		for k in range( segs ):
			bm.faces.new( ( a[ k ], a[ ( k + 1 ) % segs ], b[ ( k + 1 ) % segs ], b[ k ] ) )
	if prof[ 0 ][ 0 ] > 1e-4: bm.faces.new( list( reversed( rows[ 0 ] ) ) )
	if prof[ -1 ][ 0 ] > 1e-4: bm.faces.new( rows[ -1 ] )
	bmesh.ops.remove_doubles( bm, verts = bm.verts, dist = 1e-5 )
	bmesh.ops.recalc_face_normals( bm, faces = bm.faces )
	if axis == 'y': xform( bm, ( 0, 0, 0 ), ( -math.pi / 2, 0, 0 ) )
	xform( bm, ( x, y, 0 ) )
	return obj_from_bm( bm, mat )

HP = math.pi / 2

# ---- the flintlock parts every gun shares
def lock( x, y, z, scale = 1.0, metal = 'Steel' ):
	s = scale
	box( metal, ( 0.006, 0.026 * s, 0.07 * s ), ( x, y, z ) )                                  # lock plate
	slab( metal, [ ( -0.03 * s, 0.0 ), ( -0.012 * s, 0.0 ), ( -0.01 * s, 0.02 * s ), ( -0.022 * s, 0.032 * s ), ( -0.034 * s, 0.03 * s ), ( -0.026 * s, 0.016 * s ) ], 0.006, x + 0.004 ).location = ( 0, y + 0.004, z )
	box( 'Bright', ( 0.006, 0.022 * s, 0.006 * s ), ( x + 0.002, y + 0.016 * s, z + 0.03 * s ), ( 0.25, 0, 0 ) )   # frizzen
	box( metal, ( 0.008, 0.005, 0.016 * s ), ( x + 0.002, y + 0.004, z + 0.024 * s ) )        # pan

def trigger( z, y = 0.0, R = 0.02, metal = 'Brass' ):
	ring( metal, R, 0.0028, ( 0, y - 0.002, z ), ( 0, HP, 0 ), arc = math.pi, segs = 8, tube = 4 ).rotation_euler = ( 0, 0, math.pi )
	box( 'Steel', ( 0.004, 0.02, 0.005 ), ( 0, y - 0.008, z ), ( 0.3, 0, 0 ) )

# ---- the models

def m_pistol():
	cyl( 'Steel', 0.0125, 0.011, -0.01, 0.235, 8, y = 0.035 )
	cyl( 'Brass', 0.0145, 0.0145, 0.225, 0.245, 10, y = 0.035 )
	box( 'Brass', ( 0.003, 0.008, 0.008 ), ( 0, 0.05, 0.22 ) )
	slab( 'Wood', [ ( 0.205, 0.024 ), ( 0.205, 0.012 ), ( 0.03, 0.0 ), ( 0.0, -0.02 ), ( -0.035, -0.085 ), ( -0.07, -0.112 ), ( -0.1, -0.098 ), ( -0.092, -0.07 ), ( -0.058, -0.028 ), ( -0.03, 0.028 ), ( 0.0, 0.034 ) ], 0.028, bevel = 0.003 )
	sphere( 'Brass', 0.021, ( 0, -0.104, -0.088 ), 8, 5, ( 0.75, 0.9, 1.0 ) )
	lock( 0.016, 0.03, 0.0 )
	trigger( 0.012, 0.004 )
	cyl( 'DarkWood', 0.003, 0.003, 0.02, 0.2, 6, y = 0.012 )

def m_duelling():
	cyl( 'Steel', 0.0115, 0.0095, -0.01, 0.29, 8, y = 0.032 )
	cyl( 'Bright', 0.012, 0.012, 0.272, 0.29, 8, y = 0.032 )
	box( 'Bright', ( 0.003, 0.007, 0.009 ), ( 0, 0.045, 0.275 ) )
	slab( 'DarkWood', [ ( 0.245, 0.022 ), ( 0.245, 0.01 ), ( 0.03, 0.0 ), ( 0.0, -0.022 ), ( -0.03, -0.088 ), ( -0.058, -0.116 ), ( -0.086, -0.108 ), ( -0.08, -0.08 ), ( -0.052, -0.03 ), ( -0.028, 0.026 ), ( 0.0, 0.03 ) ], 0.025, bevel = 0.003 )
	box( 'Bright', ( 0.028, 0.012, 0.03 ), ( 0, -0.11, -0.074 ), ( -0.5, 0, 0 ) )
	lock( 0.015, 0.028, 0.0, 0.9, 'Bright' )
	trigger( 0.012, 0.004, 0.017, 'Bright' )
	cyl( 'DarkWood', 0.0028, 0.0028, 0.02, 0.24, 6, y = 0.012 )

def long_stock( mat, front, butt_drop = 0.1, comb = 0.0, w = 0.036 ):
	# forend under the barrel, the wrist, the butt
	slab( mat, [ ( front, 0.03 ), ( front, 0.008 ), ( 0.05, 0.0 ), ( 0.0, -0.022 ), ( -0.06, -0.04 ), ( -0.42, -0.04 - butt_drop ), ( -0.43, 0.012 + comb ), ( -0.2, 0.03 + comb ), ( -0.04, 0.03 ) ], w, bevel = 0.003 )
	box( 'Brass', ( w + 0.004, 0.13 + butt_drop * 0.35, 0.012 ), ( 0, -0.04 - butt_drop * 0.45, -0.43 ), ( -0.08, 0, 0 ) )

def m_musket():
	cyl( 'Steel', 0.0125, 0.0105, 0.0, 1.0, 10, y = 0.036 )
	cyl( 'Bright', 0.0135, 0.0135, 0.99, 1.02, 10, y = 0.036 )
	for z in ( 0.42, 0.62, 0.8 ): cyl( 'Brass', 0.02, 0.02, z, z + 0.016, 10, y = 0.03 )
	box( 'Brass', ( 0.004, 0.01, 0.012 ), ( 0, 0.052, 0.98 ) )
	long_stock( 'Wood', 0.86 )
	lock( 0.02, 0.03, 0.06 )
	trigger( 0.05 )
	cyl( 'DarkWood', 0.0035, 0.0035, 0.1, 0.95, 6, y = 0.004 )
	ring( 'Steel', 0.01, 0.002, ( 0, -0.004, 0.5 ), ( 0, HP, 0 ), segs = 8, tube = 4 )

def m_rifle():
	cyl( 'Steel', 0.0118, 0.0118, 0.0, 1.16, 8, y = 0.035 )
	box( 'Brass', ( 0.004, 0.012, 0.01 ), ( 0, 0.053, 1.13 ) )
	box( 'Steel', ( 0.012, 0.018, 0.018 ), ( 0, 0.054, 0.14 ) )   # the rear sight
	box( 'Steel', ( 0.002, 0.008, 0.006 ), ( 0, 0.065, 0.14 ) )
	long_stock( 'Wood', 1.1, 0.08, 0.008, 0.032 )
	box( 'Brass', ( 0.034, 0.03, 0.12 ), ( 0.002, -0.04, -0.28 ), ( 0.1, 0, 0 ) )   # the patch box on the butt
	for z in ( 0.5, 0.85 ): cyl( 'Brass', 0.006, 0.006, z, z + 0.03, 6, y = 0.006 )
	lock( 0.019, 0.03, 0.06 )
	trigger( 0.05 )
	cyl( 'DarkWood', 0.0032, 0.0032, 0.1, 1.08, 6, y = 0.005 )

def m_blunderbuss():
	lathe( 'Brass', [ ( 0.017, 0.0 ), ( 0.018, 0.2 ), ( 0.021, 0.42 ), ( 0.027, 0.6 ), ( 0.036, 0.68 ), ( 0.038, 0.7 ), ( 0.03, 0.7 ), ( 0.022, 0.66 ) ], 12, y = 0.04 )
	cyl( 'Brass', 0.022, 0.022, 0.0, 0.03, 10, y = 0.04 )
	slab( 'Wood', [ ( 0.5, 0.03 ), ( 0.5, 0.01 ), ( 0.05, 0.0 ), ( 0.0, -0.026 ), ( -0.06, -0.05 ), ( -0.36, -0.16 ), ( -0.38, 0.0 ), ( -0.2, 0.032 ), ( -0.04, 0.034 ) ], 0.044, bevel = 0.004 )
	box( 'Brass', ( 0.05, 0.17, 0.012 ), ( 0, -0.075, -0.37 ), ( -0.2, 0, 0 ) )
	lock( 0.024, 0.032, 0.06, 1.15 )
	trigger( 0.05, 0.0, 0.024 )
	box( 'Brass', ( 0.046, 0.03, 0.08 ), ( 0, 0.008, 0.46 ) )   # the nose cap

def m_harpoongun():
	cyl( 'Iron', 0.023, 0.023, 0.06, 0.78, 10, y = 0.04 )
	cyl( 'Iron', 0.028, 0.028, 0.74, 0.79, 10, y = 0.04 )
	cyl( 'Steel', 0.006, 0.006, 0.6, 0.94, 6, y = 0.04 )
	slab( 'Bright', [ ( 0.93, -0.004 ), ( 1.07, 0.0 ), ( 0.93, 0.004 ), ( 0.9, 0.034 ), ( 0.94, 0.0 ), ( 0.9, -0.034 ) ], 0.006 ).location = ( 0, 0.04, 0 )
	cyl( 'Rope', 0.034, 0.034, -0.035, 0.035, 12, rot = ( 0, HP, 0 ) ).location = ( 0, -0.03, 0.3 )
	box( 'Iron', ( 0.012, 0.05, 0.03 ), ( 0.022, -0.01, 0.3 ) )
	box( 'Iron', ( 0.012, 0.05, 0.03 ), ( -0.022, -0.01, 0.3 ) )
	slab( 'Wood', [ ( 0.62, 0.03 ), ( 0.62, 0.006 ), ( 0.05, 0.0 ), ( 0.0, -0.024 ), ( -0.06, -0.044 ), ( -0.38, -0.13 ), ( -0.4, 0.004 ), ( -0.2, 0.03 ), ( -0.04, 0.032 ) ], 0.042, bevel = 0.003 )
	box( 'Iron', ( 0.046, 0.15, 0.012 ), ( 0, -0.062, -0.39 ), ( -0.18, 0, 0 ) )
	box( 'Iron', ( 0.008, 0.03, 0.05 ), ( 0.024, 0.032, 0.05 ) )
	trigger( 0.05, 0.0, 0.022, 'Iron' )

def m_bolt():
	cyl( 'Steel', 0.006, 0.006, -0.25, 0.27, 6 )
	slab( 'Bright', [ ( 0.25, -0.004 ), ( 0.37, 0.0 ), ( 0.25, 0.004 ), ( 0.22, 0.032 ), ( 0.26, 0.0 ), ( 0.22, -0.032 ) ], 0.006 )
	ring( 'Rope', 0.009, 0.003, ( 0, 0, -0.24 ), ( 0, 0, 0 ), segs = 8, tube = 4 )

def m_paddle():
	cyl( 'Wood', 0.016, 0.016, -0.24, 0.72, 8 )
	box( 'DarkWood', ( 0.05, 0.034, 0.034 ), ( 0, 0, -0.26 ) )
	slab( 'Wood', [ ( 0.68, 0.016 ), ( 0.82, 0.07 ), ( 1.2, 0.072 ), ( 1.26, 0.04 ), ( 1.27, -0.04 ), ( 1.2, -0.072 ), ( 0.82, -0.07 ), ( 0.68, -0.016 ) ], 0.018, bevel = 0.004 )

def m_cutlass():
	# the blade: a broad back, slightly curved, the edge (-Y) ground thin, a clipped point
	pts = []
	for k in range( 9 ):
		t = k / 8
		z = 0.04 + 0.6 * t
		pts.append( ( z, 0.014 - 0.05 * t * t ) )           # the back, curving down to the point
	pts += [ ( 0.665, -0.05 ) ]                             # the point
	for k in range( 8, -1, -1 ):
		t = k / 8
		z = 0.04 + 0.58 * t
		pts.append( ( z, -0.026 - 0.05 * t * t - 0.012 * math.sin( t * math.pi ) + 0.022 * t ** 4 ) )   # the edge, broadest toward the point
	slab( 'Bright', pts, 0.007, edge = ( -0.012 - 0.0, 0.12 ) )
	box( 'Brass', ( 0.022, 0.05, 0.012 ), ( 0, -0.006, 0.038 ) )          # the guard's cross
	ring( 'Brass', 0.05, 0.0035, ( 0, -0.03, -0.005 ), ( 0, HP, 0 ), arc = math.pi * 1.05, segs = 10, tube = 4 ).rotation_euler = ( 0, HP, HP )  # the knuckle bow
	slab( 'Brass', [ ( 0.03, -0.01 ), ( 0.045, -0.012 ), ( 0.04, -0.06 ), ( 0.0, -0.075 ), ( -0.02, -0.07 ), ( 0.02, -0.04 ) ], 0.004, x0 = 0.012 )  # the shell
	cyl( 'Leather', 0.013, 0.015, -0.075, 0.032, 8 )
	for z in ( -0.05, -0.02, 0.01 ): ring( 'Brass', 0.0145, 0.0018, ( 0, 0, z ), segs = 8, tube = 3 )
	sphere( 'Brass', 0.017, ( 0, 0, -0.085 ), 8, 5, ( 1, 1, 0.8 ) )

def m_axe():
	slab( 'Wood', [ ( -0.14, 0.014 ), ( 0.3, 0.016 ), ( 0.6, 0.012 ), ( 0.6, -0.012 ), ( 0.3, -0.016 ), ( -0.14, -0.017 ) ], 0.028, bevel = 0.004 )
	cyl( 'Leather', 0.02, 0.02, -0.12, 0.0, 8 )
	# the bearded head on the edge side (-Y), the spike on the back (+Y)
	slab( 'Iron', [ ( 0.45, 0.02 ), ( 0.57, 0.02 ), ( 0.57, -0.03 ), ( 0.62, -0.11 ), ( 0.6, -0.175 ), ( 0.52, -0.16 ), ( 0.5, -0.08 ), ( 0.45, -0.03 ) ], 0.022, edge = ( -0.12, 0.25 ), bevel = 0.002 )
	slab( 'Bright', [ ( 0.62, -0.11 ), ( 0.63, -0.112 ), ( 0.61, -0.18 ), ( 0.6, -0.175 ) ], 0.008 )
	slab( 'Iron', [ ( 0.49, 0.02 ), ( 0.53, 0.02 ), ( 0.515, 0.1 ) ], 0.016 )
	cyl( 'Iron', 0.02, 0.02, 0.6, 0.62, 8 )

def m_pin():
	lathe( 'Wood', [ ( 0.0, -0.12 ), ( 0.009, -0.118 ), ( 0.012, -0.1 ), ( 0.013, 0.06 ), ( 0.022, 0.075 ), ( 0.018, 0.09 ), ( 0.024, 0.13 ), ( 0.027, 0.2 ), ( 0.025, 0.27 ), ( 0.016, 0.3 ), ( 0.0, 0.305 ) ], 10 )

def m_harpoon():
	cyl( 'Wood', 0.016, 0.016, -0.6, 1.25, 8 )
	cyl( 'Rope', 0.019, 0.019, 1.2, 1.27, 8 )
	cyl( 'Iron', 0.006, 0.007, 1.25, 1.5, 6 )
	slab( 'Bright', [ ( 1.48, -0.006 ), ( 1.64, 0.0 ), ( 1.48, 0.006 ), ( 1.44, 0.045 ), ( 1.5, 0.0 ), ( 1.44, -0.045 ) ], 0.008, bevel = 0.001 )
	ring( 'Rope', 0.03, 0.006, ( 0, 0, -0.56 ), segs = 10, tube = 4 )
	cyl( 'Leather', 0.019, 0.019, -0.1, 0.12, 8 )

def m_bomb():
	sphere( 'Black', 0.075, ( 0, 0, 0 ), 14, 9 )
	cyl( 'Iron', 0.024, 0.022, 0.066, 0.092, 10, rot = ( -HP, 0, 0 ) )
	ring( 'Iron', 0.024, 0.003, ( 0, 0.08, 0 ), ( HP, 0, 0 ), segs = 10, tube = 4 )
	cyl( 'Wick', 0.0045, 0.004, 0.0, 0.07, 5, rot = ( -HP + 0.35, 0, 0 ) ).location = ( 0, 0.088, 0 )

def m_firebottle():
	lathe( 'Glass', [ ( 0.0, -0.07 ), ( 0.038, -0.068 ), ( 0.044, -0.05 ), ( 0.045, 0.03 ), ( 0.036, 0.06 ), ( 0.016, 0.085 ), ( 0.014, 0.115 ), ( 0.018, 0.12 ), ( 0.015, 0.128 ) ], 12, axis = 'y' )
	cyl( 'Cloth', 0.012, 0.013, 0.1, 0.16, 6, rot = ( -HP, 0, 0 ) )
	box( 'Cloth', ( 0.02, 0.07, 0.004 ), ( 0.012, 0.13, 0.012 ), ( 0.3, 0, 0.4 ) )
	ring( 'Rope', 0.046, 0.003, ( 0, -0.01, 0 ), ( HP, 0, 0 ), segs = 12, tube = 3 )

def m_smoke():
	lathe( 'Clay', [ ( 0.0, -0.06 ), ( 0.045, -0.058 ), ( 0.062, -0.03 ), ( 0.064, 0.02 ), ( 0.052, 0.05 ), ( 0.05, 0.06 ), ( 0.055, 0.066 ) ], 12, axis = 'y' )
	cyl( 'DarkWood', 0.047, 0.047, 0.05, 0.068, 12, rot = ( -HP, 0, 0 ) )
	cyl( 'Wick', 0.004, 0.004, 0.06, 0.1, 5, rot = ( -HP, 0, 0 ) )
	ring( 'Rope', 0.064, 0.004, ( 0, 0.0, 0 ), ( HP, 0, 0 ), segs = 12, tube = 4 )
	for a in ( 0.6, 2.4, 4.2 ):
		sphere( 'Clay', 0.008, ( math.cos( a ) * 0.06, 0.02, math.sin( a ) * 0.06 ), 6, 4 )

MODELS = {
	'pistol': m_pistol, 'duelling': m_duelling, 'musket': m_musket, 'rifle': m_rifle, 'blunderbuss': m_blunderbuss, 'harpoongun': m_harpoongun,
	'bolt': m_bolt, 'paddle': m_paddle, 'cutlass': m_cutlass, 'axe': m_axe, 'pin': m_pin, 'harpoon': m_harpoon,
	'bomb': m_bomb, 'firebottle': m_firebottle, 'smoke': m_smoke,
}

def tris( o ):
	return sum( len( p.vertices ) - 2 for p in o.data.polygons )

def build( id ):
	PARTS.clear()
	MODELS[ id ]()
	# apply the modifiers, join, turn into the export frame
	for o in PARTS:
		bpy.context.view_layer.objects.active = o
		for m in list( o.modifiers ):
			bpy.ops.object.modifier_apply( modifier = m.name )
	bpy.ops.object.select_all( action = 'DESELECT' )
	for o in PARTS: o.select_set( True )
	bpy.context.view_layer.objects.active = PARTS[ 0 ]
	bpy.ops.object.transform_apply( location = True, rotation = True, scale = True )
	if len( PARTS ) > 1: bpy.ops.object.join()
	o = bpy.context.view_layer.objects.active
	o.name = id
	o.data.name = id
	bm = bmesh.new(); bm.from_mesh( o.data )
	bmesh.ops.triangulate( bm, faces = bm.faces )
	bm.to_mesh( o.data ); bm.free()
	for p in o.data.polygons: p.use_smooth = False
	o.data.validate()
	o.rotation_euler = ( HP, 0, 0 )
	bpy.ops.object.transform_apply( rotation = True )
	return o

def export( o, path ):
	bpy.ops.object.select_all( action = 'DESELECT' )
	o.select_set( True )
	bpy.context.view_layer.objects.active = o
	kw = dict( filepath = path, export_format = 'GLB', use_selection = True, export_yup = True, export_normals = True, export_texcoords = False, export_materials = 'EXPORT', export_apply = True )
	try:
		bpy.ops.export_scene.gltf( **kw, export_image_format = 'NONE' )
	except TypeError:
		bpy.ops.export_scene.gltf( **kw )

def preview( objs, path, title ):
	sc = bpy.context.scene
	cols = 4
	for k, o in enumerate( objs ):
		# lay them out on the XZ (Blender) plane for a camera looking along +Y; the model's game Z is Blender -Y after export
		# frame turning, so turn each to show its side: forward to the right
		o.rotation_euler = ( 0, 0, - HP ) # (the lock side to the camera)
		size = max( o.dimensions )
		o.scale = ( 0.9 / max( size, 0.15 ), ) * 3
		o.location = ( ( k % cols ) * 1.2, 0, - ( k // cols ) * 1.0 )
	cam_d = bpy.data.cameras.new( 'cam' ); cam_d.type = 'ORTHO'; cam_d.ortho_scale = 5.2
	cam = bpy.data.objects.new( 'cam', cam_d ); sc.collection.objects.link( cam )
	rows = ( len( objs ) + cols - 1 ) // cols
	cam.location = ( 1.8, -6, - ( rows - 1 ) * 0.5 + 0.6 ); cam.rotation_euler = ( math.radians( 82 ), 0, 0 )
	sc.camera = cam
	sun = bpy.data.lights.new( 'sun', 'SUN' ); sun.energy = 4
	so = bpy.data.objects.new( 'sun', sun ); so.rotation_euler = ( math.radians( 50 ), math.radians( 15 ), math.radians( 30 ) ); sc.collection.objects.link( so )
	w = bpy.data.worlds.new( 'w' ); w.use_nodes = True
	w.node_tree.nodes[ 'Background' ].inputs[ 'Color' ].default_value = ( 0.55, 0.6, 0.66, 1 ); w.node_tree.nodes[ 'Background' ].inputs[ 'Strength' ].default_value = 0.8
	sc.world = w
	sc.render.resolution_x, sc.render.resolution_y = 1600, max( 500, 420 * rows )
	sc.render.film_transparent = False
	sc.render.filepath = path
	for eng in ( 'BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH' ):
		try:
			sc.render.engine = eng
			if eng == 'BLENDER_WORKBENCH':
				sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'MATERIAL'
			bpy.ops.render.render( write_still = True )
			print( 'PREVIEW', title, eng, path )
			return
		except Exception as e:
			print( 'render failed with', eng, e )

def main():
	os.makedirs( OUT, exist_ok = True )
	ids = only or list( MODELS.keys() )
	bpy.ops.wm.read_factory_settings( use_empty = True )
	built = []
	for id in ids:
		o = build( id )
		n = tris( o )
		assert n <= BUDGET, f'{ id }: { n } triangles over { BUDGET }'
		export( o, os.path.join( OUT, id + '.glb' ) )
		print( f'MODEL { id } { n } tris -> { os.path.join( OUT, id + ".glb" ) }' )
		built.append( o )
	if PREVIEW:
		os.makedirs( PREVIEW, exist_ok = True )
		guns = [ o for o in built if o.name in ( 'pistol', 'duelling', 'musket', 'rifle', 'blunderbuss', 'harpoongun', 'bolt' ) ]
		rest = [ o for o in built if o not in guns ]
		for o in rest: o.hide_render = True
		if guns: preview( guns, os.path.join( PREVIEW, 'weapons-guns.png' ), 'guns' )
		for o in rest: o.hide_render = False
		for o in guns: o.hide_render = True
		for o in bpy.data.objects:
			if o.type in ( 'CAMERA', 'LIGHT' ): bpy.data.objects.remove( o )
		if rest: preview( rest, os.path.join( PREVIEW, 'weapons-melee.png' ), 'melee and throwables' )

main()
