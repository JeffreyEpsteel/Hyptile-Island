# Blender 5.x: the naval fork's marine-life FBXs and port-prop GLBs -> public/models/marine and public/models/harbour.
#   blender -b --python convert.py -- <MarineLife/exports dir> <out marine dir> <port dir with *_v1.glb> <out harbour dir>
# Run through tools/dressing/build.ps1 (it resolves the fork's paths).
#
# Marine (FBX: +X forward, +Z up, metres): Dolphin, Fish, KelpCluster, both LODs. The mesh is turned about Z so the
# nose points along Blender -Y, which the glTF export (+Y up) turns into +Z: the game's "forward" for boats and
# animals. Kelp keeps its height as the sway mask (the runtime bends by height; the fork's BendMask vertex colours
# are redundant with it and the engine loader does not read COLOR_0), materials are the flat colours of the slots.
# Gulls are not converted: Tidewater already has its own gulls.
#
# Harbour (already GLB): copied as they are, except the hanging net, whose 24 k triangles are collapsed to about a
# third (the strands stay: it is a thin plane seen from a few metres).
import bpy, sys, os, math, shutil

argv = sys.argv[sys.argv.index('--') + 1:]
marine_src, marine_out, port_src, port_out = argv[:4]
os.makedirs(marine_out, exist_ok=True)
os.makedirs(port_out, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_image_format='AUTO', export_yup=True, export_apply=True,
                              export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False)
    print('EXPORTED', path, os.path.getsize(path))


def tris(objs):
    return sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)


# ---------------------------------------------------------------------------------------------- marine
for name in ['Dolphin_LOD0', 'Dolphin_LOD1', 'Fish_LOD0', 'Fish_LOD1', 'KelpCluster_LOD0', 'KelpCluster_LOD1']:
    reset()
    bpy.ops.import_scene.fbx(filepath=os.path.join(marine_src, name + '.fbx'), use_anim=False)
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    # the FBX importer may leave a 90 degree armature-style rotation on the objects: bake whatever is there, then
    # turn +X forward into -Y forward (rotation about Z by -90 degrees)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in meshes:
        o.rotation_euler = (0.0, 0.0, -math.pi / 2)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    for m in bpy.data.materials:
        m.name = m.name.replace('Marine_', '')
    # sizes for the log: the game reads them from the GLB, this is a sanity line
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for o in meshes:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            for k in range(3):
                lo[k] = min(lo[k], w[k]); hi[k] = max(hi[k], w[k])
    print('MARINE', name, 'tris', tris(meshes), 'blender bbox', [round(x, 3) for x in lo], [round(x, 3) for x in hi])
    export(os.path.join(marine_out, name + '.glb'))

# ---------------------------------------------------------------------------------------------- harbour
for fn in sorted(os.listdir(port_src)):
    if not fn.endswith('.glb'):
        continue
    out = os.path.join(port_out, fn.replace('_v1', ''))
    if fn.startswith('hanging-net'):
        reset()
        bpy.ops.import_scene.gltf(filepath=os.path.join(port_src, fn))
        meshes = [o for o in bpy.data.objects if o.type == 'MESH']
        before = tris(meshes)
        for o in meshes:
            if len(o.data.polygons) < 3000:
                continue
            bpy.context.view_layer.objects.active = o
            md = o.modifiers.new('decimate', 'DECIMATE')
            md.ratio = 0.3
            bpy.ops.object.modifier_apply(modifier=md.name)
        print('NET tris', before, '->', tris(meshes))
        export(out)
    else:
        shutil.copyfile(os.path.join(port_src, fn), out)
        print('COPIED', out, os.path.getsize(out))
