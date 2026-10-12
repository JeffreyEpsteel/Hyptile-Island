# Blender (background) face close-up of a roster GLB for before/after decimation checks (textured Workbench render,
# the base-colour and normal maps are what the engine uses).
#   blender -b --python face-closeup.py -- <model.glb> <out.png> [wire]
import bpy, sys, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
glb, out = argv[0], argv[1]
wire = len(argv) > 2
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
head = None
for o in bpy.data.objects:
    if o.type == 'ARMATURE':
        for b in o.data.bones:
            if b.name == 'head': head = o.matrix_world @ b.head_local
verts = []
for o in bpy.data.objects:
    if o.type == 'MESH':
        verts += [o.matrix_world @ v.co for v in o.data.vertices if (o.matrix_world @ v.co).z > head.z - 0.05]
# face centre: the front (most -Y after the importer's Y-up -> Z-up) cloud of the head
c = sum(verts, Vector()) / len(verts)
cam_d = bpy.data.cameras.new('c'); cam_d.lens = 85
cam = bpy.data.objects.new('c', cam_d); bpy.context.scene.collection.objects.link(cam)
cam.location = (c.x, c.y - 1.1, c.z - 0.02); cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.camera = cam
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_cavity = False
if wire: sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.show_wireframes = False
sc.render.resolution_x = 900; sc.render.resolution_y = 900
sc.render.film_transparent = False
sc.render.filepath = out
if wire:
    for o in bpy.data.objects:
        if o.type == 'MESH':
            m = o.modifiers.new('w', 'WIREFRAME'); m.thickness = 0.0015
bpy.ops.render.render(write_still=True)
print('CLOSEUP', out)
