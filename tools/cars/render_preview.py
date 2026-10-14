# A line-up render of the car GLBs (headless):
#   D:\blender\blender.exe -b --factory-startup -P tools/cars/render_preview.py -- <dir with the glbs> <out_prefix> [kinds]
# Writes <out_prefix>-front.png (three-quarter front), -rear.png (three-quarter rear) and -top.png; each car in a sample
# paint colour (the game tints CarPaint per instance), on a grey road plane.
import bpy, sys, math, mathutils, os

argv = sys.argv[ sys.argv.index( '--' ) + 1: ]
src, prefix = argv[ 0 ], argv[ 1 ]
kinds = argv[ 2 ].split( ',' ) if len( argv ) > 2 else [ 'sedan', 'taxi', 'police', 'pickup', 'van', 'sports', 'bus' ]
PAINT = { 'sedan': ( 0.5, 0.05, 0.05 ), 'taxi': ( 0.95, 0.62, 0.02 ), 'police': ( 0.92, 0.92, 0.92 ), 'pickup': ( 0.08, 0.2, 0.42 ),
	'van': ( 0.9, 0.9, 0.86 ), 'sports': ( 0.9, 0.25, 0.02 ), 'bus': ( 0.12, 0.45, 0.3 ) }

bpy.ops.wm.read_factory_settings( use_empty = True )
sc = bpy.context.scene
x = 0.0
for k in kinds:
	before = set( sc.objects )
	bpy.ops.import_scene.gltf( filepath = os.path.join( src, k + '.glb' ) )
	new = [ o for o in sc.objects if o not in before ]
	lo = min( ( o.matrix_world @ mathutils.Vector( c ) ).x for o in new if o.type == 'MESH' for c in o.bound_box )
	hi = max( ( o.matrix_world @ mathutils.Vector( c ) ).x for o in new if o.type == 'MESH' for c in o.bound_box )
	for o in new:
		if o.parent is None: o.location.x += x - lo
		if o.type == 'MESH':
			for i, m in enumerate( o.data.materials ):
				if m and m.name.startswith( 'CarPaint' ):
					mm = m.copy(); mm.name = 'paint-' + k
					mm.node_tree.nodes[ 'Principled BSDF' ].inputs[ 'Base Color' ].default_value = ( *PAINT[ k ], 1 )
					o.data.materials[ i ] = mm
	x += ( hi - lo ) + 1.2
span = x - 1.2

sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1600; sc.render.resolution_y = 700
sc.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new( 'w' ); sc.world = world
world.use_nodes = True
world.node_tree.nodes[ 'Background' ].inputs[ 0 ].default_value = ( 0.6, 0.72, 0.85, 1 )
world.node_tree.nodes[ 'Background' ].inputs[ 1 ].default_value = 0.8
sun = bpy.data.objects.new( 'sun', bpy.data.lights.new( 'sun', 'SUN' ) ); sc.collection.objects.link( sun )
sun.data.energy = 3.2; sun.rotation_euler = ( math.radians( 45 ), math.radians( 10 ), math.radians( 40 ) )
bpy.ops.mesh.primitive_plane_add( size = 200, location = ( span / 2, 0, 0 ) )
road = bpy.context.active_object
m = bpy.data.materials.new( 'road' ); m.use_nodes = True
m.node_tree.nodes[ 'Principled BSDF' ].inputs[ 'Base Color' ].default_value = ( 0.16, 0.16, 0.17, 1 )
road.data.materials.append( m )

cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) ); sc.collection.objects.link( cam ); sc.camera = cam
cam.data.lens = 50
target = mathutils.Vector( ( span / 2, 0, 1.0 ) )
# the cars face glTF +Z = Blender -Y
for name, az, el, d in ( ( 'front', - 60, 14, span * 0.95 ), ( 'rear', 120, 14, span * 0.95 ), ( 'top', - 90, 50, span * 0.8 ) ):
	a, e = math.radians( az ), math.radians( el )
	pos = target + mathutils.Vector( ( math.cos( a ) * math.cos( e ), math.sin( a ) * math.cos( e ), math.sin( e ) ) ) * d
	cam.location = pos
	cam.rotation_euler = ( target - pos ).to_track_quat( '-Z', 'Y' ).to_euler()
	sc.render.filepath = f'{ prefix }-{ name }.png'
	bpy.ops.render.render( write_still = True )
	print( 'wrote', sc.render.filepath )
