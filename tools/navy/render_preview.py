# Preview renders of a ship GLB from three angles (bow quarter, broadside, stern quarter), headless:
#   blender -b --factory-startup -P tools/navy/render_preview.py -- <in.glb> <out_prefix> [size]
# Writes <out_prefix>-bow.png, -side.png, -stern.png (EEVEE, sky-ish world, a sea-blue ground plane at the waterline).
import bpy, sys, math, mathutils

argv = sys.argv[ sys.argv.index( '--' ) + 1: ]
src, prefix = argv[ 0 ], argv[ 1 ]
size = int( argv[ 2 ] ) if len( argv ) > 2 else 900

bpy.ops.wm.read_factory_settings( use_empty = True )
bpy.ops.import_scene.gltf( filepath = src )
objs = [ o for o in bpy.context.scene.objects if o.type == 'MESH' ]
lo = mathutils.Vector( ( 1e9, 1e9, 1e9 ) ); hi = - lo
for o in objs:
	for c in o.bound_box:
		w = o.matrix_world @ mathutils.Vector( c )
		lo = mathutils.Vector( [ min( lo[ i ], w[ i ] ) for i in range( 3 ) ] ); hi = mathutils.Vector( [ max( hi[ i ], w[ i ] ) for i in range( 3 ) ] )
cx, cy = ( lo.x + hi.x ) / 2, ( lo.y + hi.y ) / 2
L = hi.x - lo.x; H = hi.z

sc = bpy.context.scene
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = size; sc.render.resolution_y = int( size * 0.62 )
sc.view_settings.view_transform = 'Standard'
world = bpy.data.worlds.new( 'w' ); sc.world = world
world.use_nodes = True
world.node_tree.nodes[ 'Background' ].inputs[ 0 ].default_value = ( 0.55, 0.7, 0.85, 1 )
world.node_tree.nodes[ 'Background' ].inputs[ 1 ].default_value = 0.9
sun = bpy.data.objects.new( 'sun', bpy.data.lights.new( 'sun', 'SUN' ) ); sc.collection.objects.link( sun )
sun.data.energy = 3.5; sun.rotation_euler = ( math.radians( 50 ), math.radians( 10 ), math.radians( 35 ) )
bpy.ops.mesh.primitive_plane_add( size = 400, location = ( cx, cy, 0 ) )
sea = bpy.context.active_object
m = bpy.data.materials.new( 'sea' ); m.use_nodes = True
b = m.node_tree.nodes[ 'Principled BSDF' ]; b.inputs[ 'Base Color' ].default_value = ( 0.05, 0.16, 0.22, 1 ); b.inputs[ 'Roughness' ].default_value = 0.3
b.inputs[ 'Alpha' ].default_value = 0.85
sea.data.materials.append( m )

cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) ); sc.collection.objects.link( cam ); sc.camera = cam
cam.data.lens = 40
target = mathutils.Vector( ( cx, cy, H * 0.38 ) )
views = { 'bow': ( 35, 14 ), 'side': ( 92, 8 ), 'stern': ( 150, 16 ) } # azimuth from the bow (deg, toward -y = starboard), elevation
dist = max( L, H ) * 1.45
for name, ( az, el ) in views.items():
	a, e = math.radians( az ), math.radians( el )
	pos = target + mathutils.Vector( ( math.cos( a ) * math.cos( e ), - math.sin( a ) * math.cos( e ), math.sin( e ) ) ) * dist
	cam.location = pos
	cam.rotation_euler = ( target - pos ).to_track_quat( '-Z', 'Y' ).to_euler()
	sc.render.filepath = f'{ prefix }-{ name }.png'
	bpy.ops.render.render( write_still = True )
	print( 'wrote', sc.render.filepath )

# close-ups (pass 'detail' as the 4th argument): the stern and the gun ports amidships
if len( argv ) > 3 and argv[ 3 ] == 'detail':
	for name, tgt, az, el, d in ( ( 'stern-close', ( lo.x + 1, cy, H * 0.2 ), 160, 10, L * 0.42 ), ( 'ports-close', ( cx, cy, H * 0.12 ), 70, 8, L * 0.45 ), ( 'deck', ( cx, cy, H * 0.12 ), 120, 38, L * 0.8 ) ):
		t = mathutils.Vector( tgt ); a, e = math.radians( az ), math.radians( el )
		pos = t + mathutils.Vector( ( math.cos( a ) * math.cos( e ), - math.sin( a ) * math.cos( e ), math.sin( e ) ) ) * d
		cam.location = pos
		cam.rotation_euler = ( t - pos ).to_track_quat( '-Z', 'Y' ).to_euler()
		sc.render.filepath = f'{ prefix }-{ name }.png'
		bpy.ops.render.render( write_still = True )
		print( 'wrote', sc.render.filepath )
