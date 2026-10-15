# Preview renders of a ship GLB (tools/ships/build_ships.py output), headless EEVEE:
#   blender -b --factory-startup -P tools/ships/render_preview.py -- <in.glb> <out_prefix> [size] [views]
# views: comma list of bow, side, stern, deck, rig, close (default bow,side,stern); writes <out_prefix>-<view>.png.
# A sun from the starboard bow quarter, a sky-blue world, a sea-coloured plane at the waterline.
import bpy, sys, math, mathutils

argv = sys.argv[ sys.argv.index( '--' ) + 1: ]
src, prefix = argv[ 0 ], argv[ 1 ]
size = int( argv[ 2 ] ) if len( argv ) > 2 else 900
views = ( argv[ 3 ] if len( argv ) > 3 else 'bow,side,stern' ).split( ',' )

bpy.ops.wm.read_factory_settings( use_empty = True )
bpy.ops.import_scene.gltf( filepath = src )
objs = [ o for o in bpy.context.scene.objects if o.type == 'MESH' ]
lo = mathutils.Vector( ( 1e9, 1e9, 1e9 ) ); hi = - lo
for o in objs:
	for c in o.bound_box:
		w = o.matrix_world @ mathutils.Vector( c )
		lo = mathutils.Vector( [ min( lo[ i ], w[ i ] ) for i in range( 3 ) ] ); hi = mathutils.Vector( [ max( hi[ i ], w[ i ] ) for i in range( 3 ) ] )
# the hull's own centre: the GLB root may carry the fork's layout offset
cx, cy = ( lo.x + hi.x ) / 2, ( lo.y + hi.y ) / 2
L = hi.x - lo.x; H = hi.z

sc = bpy.context.scene
for eng in ( 'BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE' ):
	try:
		sc.render.engine = eng; break
	except TypeError: pass
sc.render.resolution_x = size; sc.render.resolution_y = int( size * 0.62 )
sc.view_settings.view_transform = 'AgX' if 'AgX' in [ i.identifier for i in sc.view_settings.bl_rna.properties[ 'view_transform' ].enum_items ] else 'Standard'
world = bpy.data.worlds.new( 'w' ); sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes[ 'Background' ]
bg.inputs[ 0 ].default_value = ( 0.42, 0.6, 0.85, 1 ); bg.inputs[ 1 ].default_value = 1.1
sun = bpy.data.objects.new( 'sun', bpy.data.lights.new( 'sun', 'SUN' ) ); sc.collection.objects.link( sun )
sun.data.energy = 4.0; sun.data.angle = math.radians( 1.5 )
sun.rotation_euler = ( math.radians( 48 ), math.radians( 8 ), math.radians( 40 ) )
bpy.ops.mesh.primitive_plane_add( size = 600, location = ( cx, cy, 0 ) )
sea = bpy.context.active_object
m = bpy.data.materials.new( 'sea' ); m.use_nodes = True
b = m.node_tree.nodes[ 'Principled BSDF' ]; b.inputs[ 'Base Color' ].default_value = ( 0.02, 0.09, 0.12, 1 ); b.inputs[ 'Roughness' ].default_value = 0.25
sea.data.materials.append( m )

cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) ); sc.collection.objects.link( cam ); sc.camera = cam
cam.data.lens = 40
def shoot( name, target, az, el, dist, lens = 40 ):
	cam.data.lens = lens
	t = mathutils.Vector( target ); a, e = math.radians( az ), math.radians( el )
	pos = t + mathutils.Vector( ( math.cos( a ) * math.cos( e ), - math.sin( a ) * math.cos( e ), math.sin( e ) ) ) * dist
	cam.location = pos
	cam.rotation_euler = ( t - pos ).to_track_quat( '-Z', 'Y' ).to_euler()
	sc.render.filepath = f'{ prefix }-{ name }.png'
	bpy.ops.render.render( write_still = True )
	print( 'wrote', sc.render.filepath )

hull = mathutils.Vector( ( cx, cy, H * 0.36 ) )
D = max( L, H ) * 1.2
V = {
	'bow': ( hull, 35, 12, D ), 'side': ( hull, 92, 6, D ), 'stern': ( hull, 150, 14, D ),
	'deck': ( mathutils.Vector( ( cx, cy, H * 0.12 ) ), 120, 34, L * 0.62 ),
	'rig': ( mathutils.Vector( ( cx, cy, H * 0.55 ) ), 60, 18, D * 0.9 ),
	'close': ( mathutils.Vector( ( lo.x + L * 0.25, cy, H * 0.12 ) ), 125, 10, L * 0.4 ),
	'helm': ( mathutils.Vector( ( lo.x + L * 0.22, cy, H * 0.2 ) ), 30, 25, L * 0.3 ),
}
for v in views:
	if v in V: shoot( v, *V[ v ] )
