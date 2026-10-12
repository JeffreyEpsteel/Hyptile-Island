# Blender 5.x: the naval fork's ship-module kit (Assets/NavalModules/exports/*.fbx) -> public/models/modules/*.glb,
# plus a lantern rig built here (the kit has no lantern).
#   blender -b --python convert.py -- <NavalModules/exports dir> <out dir>
# Run through tools/modules/build.ps1 (it resolves the fork's paths).
#
# The kit is authored +X forward, +Z up, metres, origin at the fitting base (manifest.json "origin fitting-kit base").
# Each mesh is turned about Z by -90 degrees so +X forward becomes Blender -Y, which the glTF export (+Y up) turns
# into +Z: the game's boat frame (+Z forward, +X port, y up). Materials keep the kit's flat colours
# (NavalModule_Wood / Iron / Brass / Canvas); the lantern's glass material is named 'LanternGlass' so StaticGLB makes
# it transparent and names its mesh '<prefix>glass' (naval/ModuleModels.js lights it at night).
import bpy, sys, os, math

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[:2]
os.makedirs(out, exist_ok=True)

KIT = ['SM_Module_Cannon', 'SM_Module_CargoCrate', 'SM_Module_CrewBerth', 'SM_Module_HullReinforcement', 'SM_Module_NavigationKit',
       'SM_Module_OarRack', 'SM_Module_Outboard', 'SM_Module_RodRack', 'SM_Module_SpareRigging']


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(path):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_image_format='AUTO', export_yup=True, export_apply=True,
                              export_animations=False, export_skins=False, export_morph=False, export_cameras=False, export_lights=False)
    print('EXPORTED', path, os.path.getsize(path))


def bbox(objs):
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for o in objs:
        for v in o.data.vertices:
            w = o.matrix_world @ v.co
            for k in range(3):
                lo[k] = min(lo[k], w[k]); hi[k] = max(hi[k], w[k])
    return [round(x, 3) for x in lo], [round(x, 3) for x in hi]


def tris(objs):
    return sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)


def turn_forward(meshes):
    # bake whatever the importer left, then +X forward -> -Y forward (about Z by -90 degrees)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in meshes:
        o.rotation_euler = (0.0, 0.0, -math.pi / 2)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def colour_of(m):
    try:
        b = m.node_tree.nodes.get('Principled BSDF')
        return [round(c, 3) for c in b.inputs['Base Color'].default_value[:3]] if b else None
    except Exception:
        return None


# the kit's four materials as NavalModules.blend has them (base colour, metallic, roughness): most FBXs come in with
# the importer's default grey, so the colours are set again by name
KIT_MATS = {
    'NavalModule_Wood': ((0.22, 0.105, 0.045), 0.0, 0.78),
    'NavalModule_Iron': ((0.09, 0.105, 0.115), 0.8, 0.78),
    'NavalModule_Brass': ((0.39, 0.28, 0.1), 0.8, 0.78),
    'NavalModule_Canvas': ((0.63, 0.56, 0.4), 0.0, 0.78),
}


def recolour():
    for m in bpy.data.materials:
        key = next((k for k in KIT_MATS if m.name.startswith(k)), None)
        if not key:
            continue
        m.name = key
        rgb, metal, rough = KIT_MATS[key]
        b = m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
        if not b:
            continue
        b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
        b.inputs['Metallic'].default_value = metal
        b.inputs['Roughness'].default_value = rough


for name in KIT:
    reset()
    bpy.ops.import_scene.fbx(filepath=os.path.join(src, name + '.fbx'), use_anim=False)
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    turn_forward(meshes)
    recolour()
    mats = sorted({(s.material.name, str(colour_of(s.material))) for o in meshes for s in o.material_slots if s.material})
    lo, hi = bbox(meshes)
    print('MODULE', name, 'tris', tris(meshes), 'bbox', lo, hi, 'materials', mats)
    export(os.path.join(out, name + '.glb'))


# ---------------------------------------------------------------------------------------------- the lantern rig
# A 1.5 m iron pole with a short arm, a brass-framed lantern hanging from it and a glass box inside the frame.
reset()


def mat(name, rgb, metal=0.0, rough=0.6, alpha=1.0):
    m = bpy.data.materials.new(name)
    if not m.node_tree:
        m.use_nodes = True  # (Blender 5 materials have their node tree already)
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    return m


iron = mat('NavalModule_Iron', (0.09, 0.105, 0.115), 0.8, 0.6)
brass = mat('NavalModule_Brass', (0.39, 0.28, 0.1), 0.8, 0.5)
glass = mat('LanternGlass', (1.0, 0.82, 0.45), 0.0, 0.15, 0.5)
parts = []


def box(name, size, loc, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.data.materials.append(m)
    parts.append(o)
    return o


def cyl(name, r, h, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=r, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    parts.append(o)
    return o


# Blender Z up; the arm reaches forward (+X, the kit's forward) so the export puts it along +Z
cyl('pole', 0.03, 1.5, (0, 0, 0.75), iron)
box('foot', (0.16, 0.16, 0.04), (0, 0, 0.02), iron)
cyl('arm', 0.018, 0.34, (0.17, 0, 1.47), iron, rot=(0, math.pi / 2, 0))
cyl('hook', 0.008, 0.08, (0.32, 0, 1.43), iron)
box('cap', (0.2, 0.2, 0.04), (0.32, 0, 1.38), brass)
box('base', (0.2, 0.2, 0.03), (0.32, 0, 1.13), brass)
for i, (dx, dy) in enumerate([(-1, -1), (-1, 1), (1, -1), (1, 1)]):
    box('post%d' % i, (0.018, 0.018, 0.22), (0.32 + dx * 0.088, dy * 0.088, 1.255), brass)
box('glass', (0.15, 0.15, 0.2), (0.32, 0, 1.255), glass)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
turn_forward(meshes)
lo, hi = bbox(meshes)
print('MODULE SM_Module_Lantern tris', tris(meshes), 'bbox', lo, hi)
export(os.path.join(out, 'SM_Module_Lantern.glb'))
print('DONE')
