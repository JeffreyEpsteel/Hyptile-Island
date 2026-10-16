# Close views of one car GLB (headless), for judging the bodies (wave 25E):
#   D:\blender\blender.exe -b --factory-startup -P tools/cars/render_body.py -- <glb> <out_prefix> [paint r,g,b] [views]
# Views: q34 (three-quarter front), r34 (three-quarter rear), side, front, rear, top, lod (the far LOD, three-quarter front),
# wheel (a close-up of the front wheel). Writes <out_prefix>-<view>.png (1280 x 720, EEVEE, a sky light and a sun).
import bpy, sys, math, mathutils, os

argv = sys.argv[ sys.argv.index( '--' ) + 1: ]
src, prefix = argv[ 0 ], argv[ 1 ]
paint = tuple( float( v ) for v in argv[ 2 ].split( ',' ) ) if len( argv ) > 2 and argv[ 2 ] != '-' else ( 0.5, 0.06, 0.05 )
views = argv[ 3 ].split( ',' ) if len( argv ) > 3 else [ 'q34', 'r34', 'side', 'front', 'rear', 'lod', 'wheel' ]

bpy.ops.wm.read_factory_settings( use_empty = True )
sc = bpy.context.scene
bpy.ops.import_scene.gltf( filepath = src )
objs = [ o for o in sc.objects if o.type == 'MESH' ]
for o in objs:
	for i, m in enumerate( o.data.materials ):
		if m and ( m.name.startswith( 'CarPaint' ) or m.name.startswith( 'Lod1Paint' ) ):
			mm = m.copy(); mm.name = 'paint'
			b = mm.node_tree.nodes[ 'Principled BSDF' ]
			b.inputs[ 'Base Color' ].default_value = ( *paint, 1 )
			b.inputs[ 'Roughness' ].default_value = 0.28
			b.inputs[ 'Metallic' ].default_value = 0.3
			try: b.inputs[ 'Coat Weight' ].default_value = 1.0
			except Exception: pass
			o.data.materials[ i ] = mm
		elif m and 'Trim' in m.name:
			b = m.node_tree.nodes[ 'Principled BSDF' ]
			b.inputs[ 'Roughness' ].default_value = 0.25
near = [ o for o in objs if 'Lod' not in o.name ]
far = [ o for o in objs if 'Lod' in o.name ]
lo = [ min( ( o.matrix_world @ mathutils.Vector( c ) )[ i ] for o in near for c in o.bound_box ) for i in range( 3 ) ]
hi = [ max( ( o.matrix_world @ mathutils.Vector( c ) )[ i ] for o in near for c in o.bound_box ) for i in range( 3 ) ]
L = hi[ 1 ] - lo[ 1 ]
H = hi[ 2 ]

sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1280; sc.render.resolution_y = 720
sc.view_settings.view_transform = 'AgX' if 'AgX' in [ i.identifier for i in sc.view_settings.bl_rna.properties[ 'view_transform' ].enum_items ] else 'Standard'
world = bpy.data.worlds.new( 'w' ); sc.world = world
world.use_nodes = True
bg = world.node_tree.nodes[ 'Background' ]
sky = world.node_tree.nodes.new( 'ShaderNodeTexSky' )
try:
	sky.sky_type = 'NISHITA'
except Exception:
	pass
world.node_tree.links.new( sky.outputs[ 0 ], bg.inputs[ 0 ] )
bg.inputs[ 1 ].default_value = 0.35
sun = bpy.data.objects.new( 'sun', bpy.data.lights.new( 'sun', 'SUN' ) ); sc.collection.objects.link( sun )
sun.data.energy = 4.0; sun.rotation_euler = ( math.radians( 40 ), math.radians( 8 ), math.radians( 35 ) )
sun.data.angle = math.radians( 2 )
bpy.ops.mesh.primitive_plane_add( size = 200, location = ( 0, 0, 0 ) )
road = bpy.context.active_object
m = bpy.data.materials.new( 'road' ); m.use_nodes = True
m.node_tree.nodes[ 'Principled BSDF' ].inputs[ 'Base Color' ].default_value = ( 0.12, 0.12, 0.13, 1 )
m.node_tree.nodes[ 'Principled BSDF' ].inputs[ 'Roughness' ].default_value = 0.8
road.data.materials.append( m )

cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) ); sc.collection.objects.link( cam ); sc.camera = cam
# the cars face glTF +Z = Blender -Y; +X (the car's left) stays +X
def shot( name, az, el, d, target, lens = 50, show = near, hide = far ):
	for o in show: o.hide_render = False
	for o in hide: o.hide_render = True
	cam.data.lens = lens
	a, e = math.radians( az ), math.radians( el )
	t = mathutils.Vector( target )
	pos = t + mathutils.Vector( ( math.cos( a ) * math.cos( e ), math.sin( a ) * math.cos( e ), math.sin( e ) ) ) * d
	cam.location = pos
	cam.rotation_euler = ( t - pos ).to_track_quat( '-Z', 'Y' ).to_euler()
	sc.render.filepath = f'{ prefix }-{ name }.png'
	bpy.ops.render.render( write_still = True )
	print( 'wrote', sc.render.filepath )

c = ( 0, ( lo[ 1 ] + hi[ 1 ] ) / 2, H * 0.45 )
D = max( L, 4 ) * 1.25
fy = lo[ 1 ]
for v in views:
	if v == 'q34': shot( v, - 55, 12, D, c )
	elif v == 'r34': shot( v, 125, 14, D, c )
	elif v == 'side': shot( v, 0, 4, D * 1.05, c )
	elif v == 'front': shot( v, - 90, 10, D * 1.1, c )
	elif v == 'rear': shot( v, 90, 12, D * 1.1, c )
	elif v == 'top': shot( v, - 60, 55, D, c )
	elif v == 'lod': shot( v, - 55, 12, D, c, show = far, hide = near )
	elif v == 'wheel':
		wy = [ ( o.matrix_world @ mathutils.Vector( cc ) ) for o in near if o.name == 'Wheel_FL' for cc in o.bound_box ]
		wc = sum( wy, mathutils.Vector() ) / len( wy )
		shot( v, - 25, 8, 1.6, ( wc.x, wc.y, wc.z ), lens = 50 )
