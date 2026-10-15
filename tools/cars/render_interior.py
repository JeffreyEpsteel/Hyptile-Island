# Preview renders of an interior GLB inside its body (headless EEVEE):
#   D:\blender\blender.exe -b --factory-startup -P tools/cars/render_interior.py -- <interior.glb> <body.glb|-> <out_prefix> <eye x,y,z> [views]
# views: eye (the driver's eye, forward), down (the instruments), back (over the shoulder), cut (outside, the roof and the
# near side hidden: the layout). Game frame (x left, y up, z fore) -> Blender ( x, -z, y ).
import bpy, sys, math, mathutils, os

argv = sys.argv[ sys.argv.index( '--' ) + 1: ]
interior, body, prefix, eye = argv[ 0 ], argv[ 1 ], argv[ 2 ], [ float( v ) for v in argv[ 3 ].split( ',' ) ]
views = argv[ 4 ].split( ',' ) if len( argv ) > 4 else [ 'eye', 'down', 'back', 'cut' ]
B = lambda x, y, z: mathutils.Vector( ( x, - z, y ) )

bpy.ops.wm.read_factory_settings( use_empty = True )
sc = bpy.context.scene
bpy.ops.import_scene.gltf( filepath = interior )
inner = list( sc.objects )
shell = []
if body != '-':
	before = set( sc.objects )
	bpy.ops.import_scene.gltf( filepath = body )
	shell = [ o for o in sc.objects if o not in before ]
	for o in shell:
		if o.type != 'MESH': continue
		for i, m in enumerate( o.data.materials ):
			if m and m.name.startswith( 'CarPaint' ):
				mm = m.copy(); mm.node_tree.nodes[ 'Principled BSDF' ].inputs[ 'Base Color' ].default_value = ( 0.4, 0.04, 0.04, 1 ); o.data.materials[ i ] = mm
			if m and m.name.startswith( 'CarTrim' ):
				# the atlas' glass cells: make the whole trim a little see-through for the preview only
				pass
for o in inner:
	if o.type == 'MESH':
		for m in o.data.materials:
			if m and m.name.startswith( ( 'Screen_' ) ):
				b = m.node_tree.nodes[ 'Principled BSDF' ]; b.inputs[ 'Emission Color' ].default_value = ( 0.1, 0.5, 0.45, 1 ); b.inputs[ 'Emission Strength' ].default_value = 1.5
			if m and m.name in ( 'RainGlass', 'Glass_Partition' ):
				m.blend_method = 'BLEND' if hasattr( m, 'blend_method' ) else None
				b = m.node_tree.nodes[ 'Principled BSDF' ]; b.inputs[ 'Alpha' ].default_value = 0.08
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1280; sc.render.resolution_y = 720
sc.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new( 'w' ); sc.world = world
world.use_nodes = True
world.node_tree.nodes[ 'Background' ].inputs[ 0 ].default_value = ( 0.62, 0.74, 0.88, 1 )
world.node_tree.nodes[ 'Background' ].inputs[ 1 ].default_value = 1.0
sun = bpy.data.objects.new( 'sun', bpy.data.lights.new( 'sun', 'SUN' ) ); sc.collection.objects.link( sun )
sun.data.energy = 3.5; sun.rotation_euler = ( math.radians( 40 ), math.radians( 15 ), math.radians( 30 ) )
cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) ); sc.collection.objects.link( cam ); sc.camera = cam
ex, ey, ez = eye
for v in views:
	cam.data.lens = 18 if v != 'cut' else 35
	for o in shell: o.hide_render = False
	if v == 'eye': pos, tgt = B( ex, ey, ez ), B( ex, ey - 0.12, ez + 1 )
	elif v == 'down': pos, tgt = B( ex, ey, ez ), B( ex - 0.15, ey - 0.45, ez + 1 )
	elif v == 'back': pos, tgt = B( ex, ey, ez ), B( ex - 0.4, ey - 0.25, ez - 1 )
	elif v == 'side': pos, tgt = B( ex, ey, ez ), B( ex - 1, ey - 0.3, ez + 0.2 )
	else:
		for o in shell: o.hide_render = True
		pos, tgt = B( ex + 3.2, ey + 2.4, ez + 2.6 ), B( 0, ey - 0.6, ez - 0.2 )
	cam.location = pos
	cam.rotation_euler = ( tgt - pos ).to_track_quat( '-Z', 'Y' ).to_euler()
	sc.render.filepath = f'{ prefix }-{ v }.png'
	bpy.ops.render.render( write_still = True )
	print( 'wrote', sc.render.filepath )
