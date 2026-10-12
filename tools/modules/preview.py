# Blender 5.x preview of fitted modules on a fleet hull (mount list from a node dump of Modules.fitMounts).
#   blender -b --python preview.py -- <mounts.json> <boat id> <boat glb> <modules dir> <out png>
import bpy, sys, os, json, math
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index('--') + 1:]
mounts, boat, boat_glb, mods, out = a[0], a[1], a[2], a[3], a[4]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=boat_glb)
C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # game (x port, y up, z fwd) -> Blender
for m in json.load(open(mounts))[boat]:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(mods, m['mesh'] + '.glb'))
    new = [o for o in bpy.data.objects if o not in before and o.parent is None]
    M = Matrix.Translation((m['x'], m['y'], m['z'])) @ Matrix.Rotation(m['yaw'], 4, 'Y') @ Matrix.Rotation(m['roll'], 4, 'Z') @ Matrix.Scale(m['scale'], 4)
    Mb = C @ M @ C.inverted()
    for o in new:
        o.matrix_world = Mb @ o.matrix_world
scene = bpy.context.scene
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
scene.collection.objects.link(cam)
cam.location = (5.5, -5.0, 4.2)  # port bow quarter, above (Blender: -Y is game +Z forward)
d = Vector((0, 0, 0.4)) - cam.location
cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 35
scene.camera = cam
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 4
sun.rotation_euler = (0.7, 0.2, 0.6)
scene.collection.objects.link(sun)
w = bpy.data.worlds.new('w'); w.color = (0.5, 0.55, 0.6); scene.world = w
scene.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_WORKBENCH'
scene.render.resolution_x, scene.render.resolution_y = 900, 600
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
