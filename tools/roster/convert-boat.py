# Blender 5.x: one FishingFleet hull FBX -> GLB (visible mesh only, UCX collision boxes dropped).
# Blender frame: -Y bow, +Z up, +X port; glTF (+Y up export): bow +Z, +X port = the game's boat frame.
#   blender -b --python convert-boat.py -- <hull.fbx> <out.glb>
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=src, use_anim=False)
for o in list(bpy.data.objects):
    if o.name.startswith('UCX_') or o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
for m in bpy.data.materials:
    m.name = m.name.replace('M_', '')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='AUTO', export_yup=True, export_apply=True,
                          export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False)
print('EXPORTED', out, os.path.getsize(out))
