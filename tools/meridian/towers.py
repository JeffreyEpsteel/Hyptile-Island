# Wave 23A: Blender check renders of Meridian's skyline from the game's own geometry (SkylineMesh via skyline-json.mjs):
#   one sheet per skyscraper (whole / an upper section broken off / fallen), golden-hour sun, the facade codes as materials
#   (a window grid from the floors and bays, LED lines and warning lights emissive, planting green), and an overview of the
#   skyline among the plan's other buildings (boxes) from the east, the way it shows from home.
#
#   node tools/meridian/plan-json.mjs <plan.json>
#   node tools/meridian/skyline-json.mjs <skyline.json>
#   D:\blender\blender.exe -b --factory-startup --python tools/meridian/towers.py -- <plan.json> <skyline.json> <out dir> [night]
import bpy, bmesh, json, math, sys, os
from mathutils import Vector, Matrix

argv = sys.argv[ sys.argv.index( '--' ) + 1: ]
PLAN, SKY, OUT = argv[ 0 ], argv[ 1 ], argv[ 2 ]
NIGHT = len( argv ) > 3 and argv[ 3 ] == 'night'
plan = json.load( open( PLAN ) )
sky = json.load( open( SKY ) )
os.makedirs( OUT, exist_ok = True )
C = plan[ 'center' ]

def clear():
	for o in list( bpy.data.objects ): bpy.data.objects.remove( o )

def principled( name ):
	m = bpy.data.materials.new( name ); m.use_nodes = True
	return m, m.node_tree, m.node_tree.nodes[ 'Principled BSDF' ]

def vcol( nt ):
	a = nt.nodes.new( 'ShaderNodeAttribute' ); a.attribute_name = 'Col'
	return a

def facade_mat():
	# the vertex colour as the wall, dark glass where a floor band and a bay band cross (object space: x east, y north, z up)
	m, nt, b = principled( 'facade' )
	a = vcol( nt )
	geo = nt.nodes.new( 'ShaderNodeNewGeometry' )
	sep = nt.nodes.new( 'ShaderNodeSeparateXYZ' ); nt.links.new( geo.outputs[ 'Position' ], sep.inputs[ 0 ] )
	def band( src, period, lo ):
		mul = nt.nodes.new( 'ShaderNodeMath' ); mul.operation = 'MULTIPLY'; mul.inputs[ 1 ].default_value = 2 * math.pi / period
		nt.links.new( src, mul.inputs[ 0 ] )
		sn = nt.nodes.new( 'ShaderNodeMath' ); sn.operation = 'SINE'; nt.links.new( mul.outputs[ 0 ], sn.inputs[ 0 ] )
		gt = nt.nodes.new( 'ShaderNodeMath' ); gt.operation = 'GREATER_THAN'; gt.inputs[ 1 ].default_value = lo
		nt.links.new( sn.outputs[ 0 ], gt.inputs[ 0 ] )
		return gt.outputs[ 0 ]
	add = nt.nodes.new( 'ShaderNodeMath' ); add.operation = 'ADD'
	nt.links.new( sep.outputs[ 0 ], add.inputs[ 0 ] ); nt.links.new( sep.outputs[ 1 ], add.inputs[ 1 ] )
	f = band( sep.outputs[ 2 ], 3.8, - 0.35 ); bb = band( add.outputs[ 0 ], 2.2, - 0.5 )
	w = nt.nodes.new( 'ShaderNodeMath' ); w.operation = 'MULTIPLY'; nt.links.new( f, w.inputs[ 0 ] ); nt.links.new( bb, w.inputs[ 1 ] )
	mix = nt.nodes.new( 'ShaderNodeMix' ); mix.data_type = 'RGBA'
	nt.links.new( w.outputs[ 0 ], mix.inputs[ 'Factor' ] ); nt.links.new( a.outputs[ 'Color' ], mix.inputs[ 6 ] )
	mix.inputs[ 7 ].default_value = ( 0.03, 0.04, 0.05, 1 )
	nt.links.new( mix.outputs[ 2 ], b.inputs[ 'Base Color' ] )
	b.inputs[ 'Roughness' ].default_value = 0.45; b.inputs[ 'Metallic' ].default_value = 0.2
	if NIGHT:
		# a share of the windows lit: a hash of the cell from noise
		nz = nt.nodes.new( 'ShaderNodeTexNoise' ); nz.inputs[ 'Scale' ].default_value = 0.9
		nt.links.new( geo.outputs[ 'Position' ], nz.inputs[ 'Vector' ] )
		gt = nt.nodes.new( 'ShaderNodeMath' ); gt.operation = 'GREATER_THAN'; gt.inputs[ 1 ].default_value = 0.56
		nt.links.new( nz.outputs[ 'Fac' ], gt.inputs[ 0 ] )
		e = nt.nodes.new( 'ShaderNodeMath' ); e.operation = 'MULTIPLY'; nt.links.new( gt.outputs[ 0 ], e.inputs[ 0 ] ); nt.links.new( w.outputs[ 0 ], e.inputs[ 1 ] )
		b.inputs[ 'Emission Color' ].default_value = ( 1.0, 0.78, 0.5, 1 )
		nt.links.new( e.outputs[ 0 ], b.inputs[ 'Emission Strength' ] )
	return m

def flat_mat( name, rough = 0.85, metal = 0.0, emit = 0.0 ):
	m, nt, b = principled( name )
	a = vcol( nt )
	nt.links.new( a.outputs[ 'Color' ], b.inputs[ 'Base Color' ] )
	b.inputs[ 'Roughness' ].default_value = rough; b.inputs[ 'Metallic' ].default_value = metal
	if emit:
		nt.links.new( a.outputs[ 'Color' ], b.inputs[ 'Emission Color' ] )
		b.inputs[ 'Emission Strength' ].default_value = emit
	return m

MATS = None
def mats():
	global MATS
	if MATS is None:
		MATS = [ facade_mat(), flat_mat( 'plain' ), flat_mat( 'metal', 0.35, 0.8 ), flat_mat( 'led', 0.4, 0.0, 6.0 if NIGHT else 0.6 ), flat_mat( 'green', 0.95 ), flat_mat( 'beacon', 0.3, 0.0, 8.0 ) ]
	return MATS

def slot( code ):
	if code < 89.5: return 0
	if abs( code - 92 ) < 0.5: return 2
	if abs( code - 100 ) < 0.5: return 3
	if abs( code - 101 ) < 0.5: return 4
	if abs( code - 102 ) < 0.5: return 5
	return 1

def mesh_obj( name, g, at ):
	# game: x east, y up, z south -> Blender: x east, y north, z up
	P = g[ 'pos' ]
	verts = [ ( P[ i ] + at[ 0 ], - P[ i + 2 ] + at[ 1 ], P[ i + 1 ] ) for i in range( 0, len( P ), 3 ) ]
	I = g[ 'idx' ]
	faces = [ ( I[ i ], I[ i + 1 ], I[ i + 2 ] ) for i in range( 0, len( I ), 3 ) ] # (x, -z, y: a rotation, the winding holds)
	me = bpy.data.meshes.new( name )
	me.from_pydata( verts, [], faces )
	ca = me.color_attributes.new( 'Col', 'FLOAT_COLOR', 'POINT' )
	col = g[ 'col' ]
	for i in range( len( verts ) ): ca.data[ i ].color = ( col[ i * 3 ], col[ i * 3 + 1 ], col[ i * 3 + 2 ], 1 )
	for m in mats(): me.materials.append( m )
	code = g[ 'code' ]
	for p in me.polygons: p.material_index = slot( code[ p.vertices[ 0 ] ] )
	me.update()
	o = bpy.data.objects.new( name, me )
	bpy.context.scene.collection.objects.link( o )
	return o

def stage( ortho_target, ortho_scale, cam_from, res ):
	sc = bpy.context.scene
	sun = bpy.data.objects.new( 'sun', bpy.data.lights.new( 'sun', 'SUN' ) )
	sc.collection.objects.link( sun )
	sun.data.energy = 0.25 if NIGHT else 4.0
	sun.data.color = ( 0.6, 0.7, 1.0 ) if NIGHT else ( 1.0, 0.8, 0.58 )
	sun.rotation_euler = ( math.radians( 68 ), 0, math.radians( 215 ) )
	world = bpy.data.worlds.new( 'w' ); sc.world = world; world.use_nodes = True
	bg = world.node_tree.nodes[ 'Background' ]
	bg.inputs[ 0 ].default_value = ( 0.02, 0.03, 0.06, 1 ) if NIGHT else ( 0.62, 0.66, 0.78, 1 )
	bg.inputs[ 1 ].default_value = 0.5 if NIGHT else 0.7
	cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) )
	sc.collection.objects.link( cam ); sc.camera = cam
	cam.data.clip_end = 20000
	if ortho_scale:
		cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho_scale
	else:
		cam.data.lens = 50
	cam.location = cam_from
	cam.rotation_euler = ( Vector( ortho_target ) - cam.location ).to_track_quat( '-Z', 'Y' ).to_euler()
	engines = [ e.identifier for e in bpy.types.RenderSettings.bl_rna.properties[ 'engine' ].enum_items ]
	sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
	sc.render.resolution_x, sc.render.resolution_y = res
	sc.view_settings.view_transform = 'AgX' if 'AgX' in [ v.identifier for v in bpy.types.ColorManagedViewSettings.bl_rna.properties[ 'view_transform' ].enum_items ] else 'Filmic'

def ground( size, z = 0 ):
	bpy.ops.mesh.primitive_plane_add( size = size, location = ( 0, 0, z ) )
	g = bpy.context.object
	m, nt, b = principled( 'ground' ); b.inputs[ 'Base Color' ].default_value = ( 0.32, 0.31, 0.29, 1 ); b.inputs[ 'Roughness' ].default_value = 0.95
	g.data.materials.append( m )

def render( path ):
	bpy.context.scene.render.filepath = path
	bpy.ops.render.render( write_still = True )
	print( 'RENDERED', path )

suffix = '-night' if NIGHT else ''
# ---- one sheet per tower: whole, broken top, fallen
for t in sky[ 'towers' ]:
	clear(); MATS = None
	gap = max( t[ 'w' ], t[ 'd' ] ) + 30
	for k, key in enumerate( [ 'whole', 'cut', 'fallen' ] ): mesh_obj( t[ 'id' ] + '-' + key, t[ key ], ( ( k - 1 ) * gap, 0 ) )
	ground( gap * 5 )
	H = t[ 'top' ]
	scale = max( gap * 3.4, H * 1.2 * 1400 / 1100 )
	d = 900
	stage( ( 0, 0, H * 0.5 ), scale, ( d * 0.55, - d * 0.83, H * 0.5 + d * 0.16 ), ( 1400, 1100 ) )
	render( os.path.join( OUT, 'tower-' + t[ 'id' ] + suffix + '.png' ) )

# ---- the skyline among the city's other buildings (boxes), from the east at eye height over the harbour
clear(); MATS = None
for t in sky[ 'towers' ]:
	b = next( q for q in plan[ 'buildings' ] if q[ 'id' ] == t[ 'id' ] )
	o = mesh_obj( t[ 'id' ], t[ 'whole' ], ( b[ 'x' ] - C[ 'x' ], - ( b[ 'z' ] - C[ 'z' ] ) ) )
	o.location.z = b[ 'y' ]
bm = bmesh.new()
for b in plan[ 'buildings' ]:
	if b[ 'kind' ] == 'tower': continue
	q = round( ( ( b[ 'yaw' ] % math.pi ) + math.pi ) % math.pi / ( math.pi / 2 ) ) % 2
	hx, hz = ( b[ 'd' ] if q else b[ 'w' ] ) / 2, ( b[ 'w' ] if q else b[ 'd' ] ) / 2
	bmesh.ops.create_cube( bm, size = 1, matrix = Matrix.LocRotScale( Vector( ( b[ 'x' ] - C[ 'x' ], - ( b[ 'z' ] - C[ 'z' ] ), b[ 'y' ] + b[ 'h' ] / 2 ) ), None, Vector( ( hx * 2, hz * 2, b[ 'h' ] ) ) ) )
me = bpy.data.meshes.new( 'city' ); bm.to_mesh( me ); bm.free()
m, nt, bs = principled( 'city' ); bs.inputs[ 'Base Color' ].default_value = ( 0.5, 0.48, 0.45, 1 ); me.materials.append( m )
bpy.context.scene.collection.objects.link( bpy.data.objects.new( 'city', me ) )
ground( 1500, 3 )
stage( ( 180, 0, 110 ), None, ( 1500, 150, 60 ), ( 1800, 900 ) )
render( os.path.join( OUT, 'skyline-overview' + suffix + '.png' ) )
