# Wave 21A: a Blender render of Meridian's plan (the Meridian Twins and the city round them) to check the massing by eye:
# the plan's buildings as boxes (the Twins chamfered, pinstripe facades from a sine across the facade, the north mast), the
# island as a slab, a low sun. The plan comes as JSON (tools/meridian/plan-json.mjs).
#
#   node tools/meridian/plan-json.mjs <plan.json>
#   D:\blender\blender.exe -b --factory-startup --python tools/meridian/towers.py -- <plan.json> <out.png> [close]
import bpy, bmesh, json, math, sys
from mathutils import Vector, Matrix

argv = sys.argv[ sys.argv.index( '--' ) + 1: ]
PLAN, OUT = argv[ 0 ], argv[ 1 ]
CLOSE = len( argv ) > 2 and argv[ 2 ] == 'close'
plan = json.load( open( PLAN ) )
for o in list( bpy.data.objects ): bpy.data.objects.remove( o )
C = plan[ 'center' ]

def mat( name, rgb, rough = 0.8, metal = 0.0, pin = False ):

	m = bpy.data.materials.new( name )
	m.use_nodes = True
	nt = m.node_tree
	b = nt.nodes[ 'Principled BSDF' ]
	b.inputs[ 'Roughness' ].default_value = rough
	b.inputs[ 'Metallic' ].default_value = metal
	if pin:
		# narrow dark windows between aluminium columns 1.02 m apart: sin( 2 pi ( x + y ) / 1.02 ) through a sharp ramp
		tc = nt.nodes.new( 'ShaderNodeTexCoord' )
		sep = nt.nodes.new( 'ShaderNodeSeparateXYZ' )
		nt.links.new( tc.outputs[ 'Object' ], sep.inputs[ 0 ] )
		add = nt.nodes.new( 'ShaderNodeMath' ); add.operation = 'ADD'
		nt.links.new( sep.outputs[ 0 ], add.inputs[ 0 ] ); nt.links.new( sep.outputs[ 1 ], add.inputs[ 1 ] )
		mul = nt.nodes.new( 'ShaderNodeMath' ); mul.operation = 'MULTIPLY'; mul.inputs[ 1 ].default_value = math.pi * 2 / 1.02
		nt.links.new( add.outputs[ 0 ], mul.inputs[ 0 ] )
		sn = nt.nodes.new( 'ShaderNodeMath' ); sn.operation = 'SINE'
		nt.links.new( mul.outputs[ 0 ], sn.inputs[ 0 ] )
		mr = nt.nodes.new( 'ShaderNodeMapRange' )
		mr.inputs[ 1 ].default_value = - 1; mr.inputs[ 2 ].default_value = 1
		nt.links.new( sn.outputs[ 0 ], mr.inputs[ 0 ] )
		ramp = nt.nodes.new( 'ShaderNodeValToRGB' )
		ramp.color_ramp.elements[ 0 ].position = 0.45; ramp.color_ramp.elements[ 0 ].color = ( 0.03, 0.035, 0.04, 1 )
		ramp.color_ramp.elements[ 1 ].position = 0.55; ramp.color_ramp.elements[ 1 ].color = ( *rgb, 1 )
		nt.links.new( mr.outputs[ 0 ], ramp.inputs[ 0 ] )
		nt.links.new( ramp.outputs[ 0 ], b.inputs[ 'Base Color' ] )
	else:
		b.inputs[ 'Base Color' ].default_value = ( *rgb, 1 )
	return m

KIND = {
	'tower': mat( 'tower', ( 0.62, 0.65, 0.68 ), 0.35, 0.7, pin = True ), 'highrise': mat( 'highrise', ( 0.28, 0.33, 0.38 ), 0.25, 0.4 ),
	'midrise': mat( 'midrise', ( 0.55, 0.45, 0.36 ) ), 'lowrise': mat( 'lowrise', ( 0.62, 0.52, 0.42 ) ), 'shop': mat( 'shop', ( 0.5, 0.36, 0.28 ) ),
	'warehouse': mat( 'warehouse', ( 0.4, 0.42, 0.4 ) ), 'station': mat( 'station', ( 0.6, 0.5, 0.38 ) ), 'landmark': mat( 'landmark', ( 0.85, 0.83, 0.78 ) ),
}

bms = {}
def bmfor( kind ):

	if kind not in bms: bms[ kind ] = bmesh.new()
	return bms[ kind ]

for b in plan[ 'buildings' ]:
	x, z = b[ 'x' ] - C[ 'x' ], b[ 'z' ] - C[ 'z' ]
	q = round( ( ( b[ 'yaw' ] % math.pi ) + math.pi ) % math.pi / ( math.pi / 2 ) ) % 2
	hx, hz = ( b[ 'd' ] if q else b[ 'w' ] ) / 2, ( b[ 'w' ] if q else b[ 'd' ] ) / 2
	y0, h = b[ 'y' ], b[ 'h' ]
	bm = bmfor( b[ 'kind' ] )
	# Blender: x east, y north (the game's -z), z up
	if b[ 'kind' ] == 'tower':
		c = 2.2
		ol = [ ( - hx + c, hz ), ( hx - c, hz ), ( hx, hz - c ), ( hx, - hz + c ), ( hx - c, - hz ), ( - hx + c, - hz ), ( - hx, - hz + c ), ( - hx, hz - c ) ]
		vb = [ bm.verts.new( ( x + u, - ( z + v ), y0 ) ) for ( u, v ) in ol ]
		vt = [ bm.verts.new( ( x + u, - ( z + v ), y0 + h ) ) for ( u, v ) in ol ]
		for i in range( 8 ):
			j = ( i + 1 ) % 8
			bm.faces.new( ( vb[ i ], vb[ j ], vt[ j ], vt[ i ] ) )
		bm.faces.new( vt )
		if b[ 'id' ] == 'twin-north':
			bmesh.ops.create_cone( bm, cap_ends = True, segments = 8, radius1 = 1.4, radius2 = 0.35, depth = 62, matrix = Matrix.Translation( ( x, - z, y0 + h + 31 ) ) )
	else:
		bmesh.ops.create_cube( bm, size = 1, matrix = Matrix.LocRotScale( Vector( ( x, - z, y0 + h / 2 - 1 ) ), None, Vector( ( hx * 2, hz * 2, h + 2 ) ) ) )

for k, bm in bms.items():
	me = bpy.data.meshes.new( k )
	bmesh.ops.recalc_face_normals( bm, faces = bm.faces[ : ] )
	bm.to_mesh( me ); bm.free()
	me.materials.append( KIND[ k ] )
	bpy.context.scene.collection.objects.link( bpy.data.objects.new( k, me ) )

bpy.ops.mesh.primitive_plane_add( size = 1, location = ( - 40, 0, 4 ) )
g = bpy.context.object; g.scale = ( 1440, 1060, 1 ); g.data.materials.append( mat( 'ground', ( 0.45, 0.44, 0.4 ), 0.95 ) )
bpy.ops.mesh.primitive_plane_add( size = 6000, location = ( 0, 0, 0 ) )
bpy.context.object.data.materials.append( mat( 'sea', ( 0.02, 0.08, 0.12 ), 0.08 ) )

sc = bpy.context.scene
sun = bpy.data.objects.new( 'sun', bpy.data.lights.new( 'sun', 'SUN' ) )
sc.collection.objects.link( sun )
sun.data.energy = 4.5
sun.data.color = ( 1.0, 0.78, 0.55 )
sun.rotation_euler = ( math.radians( 72 ), 0, math.radians( 250 ) )
world = bpy.data.worlds.new( 'w' ); sc.world = world; world.use_nodes = True
world.node_tree.nodes[ 'Background' ].inputs[ 0 ].default_value = ( 0.55, 0.62, 0.75, 1 )
world.node_tree.nodes[ 'Background' ].inputs[ 1 ].default_value = 0.6
cam = bpy.data.objects.new( 'cam', bpy.data.cameras.new( 'cam' ) )
sc.collection.objects.link( cam ); sc.camera = cam
cam.data.lens = 35
cam.data.clip_end = 10000
if CLOSE:
	cam.location = ( 520, - 140, 70 ); target = Vector( ( 168, - 15, 190 ) ) # from over the docks to the Twins
else:
	cam.location = ( 1500, - 650, 260 ); target = Vector( ( 60, 0, 90 ) )
cam.rotation_euler = ( target - cam.location ).to_track_quat( '-Z', 'Y' ).to_euler()
engines = [ e.identifier for e in bpy.types.RenderSettings.bl_rna.properties[ 'engine' ].enum_items ]
sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
sc.render.resolution_x = 1600; sc.render.resolution_y = 900
sc.render.filepath = OUT
bpy.ops.render.render( write_still = True )
print( 'RENDERED', OUT )
