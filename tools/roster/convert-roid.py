# Captain Roid variant of convert-character.py (same flow). Differences: the head mesh is 668k triangles and
# carries the likeness, so decimation gives the head ~60% of the budget; clip names are kept as given; the
# portrait is a 3/4-body front render from the first clip's mid pose. Original header follows.
# Blender 5.x batch converter: one rigged Hyptile-family character (SK_*.fbx on the accepted 48-bone
# JadeFisher rig) + animation-only FBXs on the same rig -> one GLB (decimated skin, downsized JPEG
# textures, one glTF animation per clip) and a portrait PNG for the character picker.
#   blender -b --python convert-character.py -- <character.fbx> <out.glb> <portrait.png> <maxTris> <Name=anim.fbx> ...
# Bone names match between the character and the clips, so every clip action is assigned directly
# (NLA track per clip) and the exporter samples it. Morph targets (blink / gaze) are dropped: the
# engine ignores them. Vertex-coloured lid / rim slots become their flat material colour.
import bpy, sys, os, math
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, portrait, max_tris = argv[0], argv[1], argv[2], int(argv[3])
clips = [a.split('=', 1) for a in argv[4:]]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True, automatic_bone_orientation=False, ignore_leaf_bones=False)
    return [o for o in bpy.data.objects if o not in before]

objs = import_fbx(src)
arm = next(o for o in objs if o.type == 'ARMATURE')
meshes = [o for o in objs if o.type == 'MESH']
for o in objs:
    if o.type == 'EMPTY': bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)
arm.name = 'Armature'
view_layer = bpy.context.view_layer

def tri_count(m):
    return sum(len(p.vertices) - 2 for p in m.data.polygons)


def bake_head(high, budget, size=2048):
    """The generated head's texture is a per-triangle chart atlas that collapses when decimated, so decimate a
    copy, give it a fresh smart-project UV layout and bake the high mesh's base colour onto it."""
    vl = bpy.context.view_layer
    for hm in high.data.materials:
        for n in hm.node_tree.nodes:
            if n.type == 'TEX_IMAGE': n.interpolation = 'Closest'
    low = high.copy(); low.data = high.data.copy(); low.name = high.name + '_low'
    bpy.context.scene.collection.objects.link(low)
    for o in vl.objects: o.select_set(False)
    vl.objects.active = low; low.select_set(True)
    mod = low.modifiers.new('decimate', 'DECIMATE'); mod.ratio = budget / tri_count(low); mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for k in [m for m in low.modifiers if m.type != 'ARMATURE']: low.modifiers.remove(k)
    low.data.uv_layers.new(name='BakeUV'); low.data.uv_layers.active = low.data.uv_layers['BakeUV']
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(89), island_margin=0.001, area_weight=0.6)
    bpy.ops.object.mode_set(mode='OBJECT')
    for u in list(low.data.uv_layers):
        if u.name != 'BakeUV': low.data.uv_layers.remove(u)
    img = bpy.data.images.new('roid_head_bake', size, size, alpha=False)
    mat = bpy.data.materials.new('M_CaptainRoid_Head'); mat.use_nodes = True
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage'); tex.image = img
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.6
    low.data.materials.clear(); low.data.materials.append(mat)
    mat.node_tree.nodes.active = tex
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    sc.cycles.bake_type = 'DIFFUSE'
    sc.render.bake.use_pass_direct = False; sc.render.bake.use_pass_indirect = False; sc.render.bake.use_pass_color = True
    sc.render.bake.use_selected_to_active = True; sc.render.bake.cage_extrusion = 0.02; sc.render.bake.max_ray_distance = 0.0
    sc.render.bake.margin = 10; sc.render.bake.margin_type = 'EXTEND'
    for o in vl.objects: o.select_set(False)
    high.select_set(True); low.select_set(True); vl.objects.active = low
    bpy.ops.object.bake(type='DIFFUSE')
    print('BAKED head', tri_count(high), '->', tri_count(low))
    bpy.data.objects.remove(high, do_unlink=True)
    low.name = 'CaptainRoid_ApprovedHead'
    return low

# ---- meshes: drop shape keys, decimate dense generations, keep the skin weights
all_tris = max(1, sum(tri_count(m) for m in meshes))
for m in list(meshes):
    view_layer.objects.active = m
    for o in view_layer.objects: o.select_set(False)
    m.select_set(True)
    if m.data.shape_keys:
        for k in list(m.data.shape_keys.key_blocks)[::-1]: m.shape_key_remove(k)
    tris = tri_count(m)
    is_head = 'head' in m.name.lower() or 'face' in m.name.lower()
    budget = max_tris * (0.6 if is_head else 0.4 / max(1, len(meshes) - 1)) if len(meshes) > 1 else max_tris
    print('MESH', m.name, tris, 'budget', int(budget))
    if is_head and tris > budget * 1.05:
        meshes[meshes.index(m)] = bake_head(m, int(budget))
    elif tris > budget * 1.05:
        mod = m.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = budget / tris
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        print('DECIMATED', m.name, tris, '->', tri_count(m))
    else:
        print('KEPT', m.name, tris)

# ---- materials: principled with the textures (scaled down), flat colours otherwise
def scale_image(img, size):
    if img is None or img.size[0] <= size: return
    img.scale(size, size)

seen = set()
for m in meshes:
    for slot in m.material_slots:
        mat = slot.material
        if mat is None or mat.name in seen: continue
        seen.add(mat.name)
        if not mat.use_nodes: mat.use_nodes = True
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None: continue
        for n in nt.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                to = [l.to_socket.name for l in nt.links if l.from_node == n]
                if 'Base Color' in to: scale_image(n.image, 2048)
                else: scale_image(n.image, 1024)
        if bsdf.inputs['Metallic'].default_value > 0.5: bsdf.inputs['Metallic'].default_value = 0
        mat.name = mat.name.replace('M_', '').replace('Material_0', 'body')

# ---- clips: same rig, same bone names -> assign each action directly, one NLA track per clip
arm.animation_data_create()
for name, path in clips:
    new = import_fbx(path)
    a_arm = next((o for o in new if o.type == 'ARMATURE'), None)
    act = a_arm.animation_data.action if a_arm and a_arm.animation_data else None
    if act is None:
        print('NO ACTION', path)
        continue
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    act.name = name
    act.use_fake_user = True
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, f0, act)
    if hasattr(st, 'action_slot') and act.slots: st.action_slot = act.slots[0]
    tr.mute = True
    for o in new:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Armature): bpy.data.armatures.remove(data)
    print('CLIP', name, f0, f1)
for a in list(bpy.data.actions):
    if not a.use_fake_user: bpy.data.actions.remove(a)
arm.animation_data.action = None

# ---- export
for o in view_layer.objects: o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86,
    export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_optimize_animation_size=True, export_def_bones=False,
    export_morph=False, export_yup=True, export_apply=True, export_cameras=False, export_lights=False,
    export_materials='EXPORT', use_selection=False,
)
print('EXPORTED', out, os.path.getsize(out))

# ---- portrait: the idle pose from the front, Workbench studio light (fast, headless safe)
try:
    idle = next((t for t in arm.animation_data.nla_tracks if t.name == 'Idle'), None)
    if idle:
        idle.mute = False
        scene.frame_set(int(idle.strips[0].frame_start) + 10)
    cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 70
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
    scene.camera = cam
    hi = max(max((arm.matrix_world @ v.co).z for v in m.data.vertices) for m in meshes)
    cam.location = (0.0, -4.2 * hi / 1.6, hi * 0.56)
    cam.rotation_euler = (math.radians(88), 0, 0)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.view_settings.view_transform = 'Standard'
    sh = scene.display.shading
    sh.light = os.environ.get('ROID_LIGHT', 'FLAT'); sh.color_type = 'TEXTURE'; sh.show_shadows = True; sh.show_cavity = True
    scene.render.film_transparent = True
    scene.render.resolution_x = 512; scene.render.resolution_y = 640; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = portrait
    bpy.ops.render.render(write_still=True)
    print('PORTRAIT', portrait)
except Exception as e:
    print('PORTRAIT FAILED', e)
