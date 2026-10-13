# Blender 5.x batch converter: one rigged Hyptile-family character (SK_*.fbx on the accepted 48-bone
# JadeFisher rig) + animation-only FBXs on the same rig -> one GLB (decimated skin, downsized JPEG
# textures, one glTF animation per clip) and a portrait PNG for the character picker.
#   blender -b --python convert-character.py -- <character.fbx> <out.glb> <portrait.png> <maxTris> <Name=anim.fbx[|rebase]> ...
# Bone names match between the character and the clips, so every clip action is assigned directly
# (NLA track per clip) and the exporter samples it. A clip marked `|rebase` (or every clip with env REBASE_ALL=1) is first
# rebased onto the character's rest (see rebase_action). The six eye morph targets (Blink_L / Blink_R / Gaze_Left /
# Gaze_Right / Gaze_Up / Gaze_Down, position deltas only) are kept on the eye and lid pieces. Vertex-coloured
# lid / rim slots become their flat material colour.
import bpy, sys, os, math
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, portrait, max_tris = argv[0], argv[1], argv[2], int(argv[3])
clips = [a.split('=', 1) for a in argv[4:]]
REBASE_ALL = os.environ.get('REBASE_ALL', '0') == '1'
SYMMETRY = os.environ.get('DECIMATE_SYMMETRY', '0') == '1'
FACTOR = float(os.environ.get('DECIMATE_FACTOR', '1.0'))
DETAIL_W = float(os.environ.get('DECIMATE_DETAIL_W', '0.9'))
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

# ---- eyes: keep the six morph targets (Blink_L / Blink_R / Gaze_Left / Gaze_Right / Gaze_Up / Gaze_Down)
# Blender's Decimate cannot run on a mesh with shape keys, so the face is split in three: the BODY (everything but the eye
# slots, no keys, decimated below like before), the EYES (eye globe / pupil / iris / rim polygons, kept whole, keys kept) and the
# LIDS (the two lid sheets: thousands of flat triangles that curl over the eye on a blink). The lids are decimated on their
# half-closed pose (so the collapse sees the curvature a flat sheet hides), then every key is transferred onto the new vertices
# (nearest point on the old surface, same barycentric weights on the keyed surface) and the result is measured against the
# original keyed surfaces: the ratio is the smallest whose worst error stays under LID_TOL.
import numpy as np, bmesh, re
from mathutils import Vector
from mathutils.bvhtree import BVHTree
EYE_SLOT = re.compile(r'_(eye|pupil|iris|lid|rim)_[lr]$', re.I)
LID_SLOT = re.compile(r'_lid_[lr]$', re.I)
LID_TOL = float(os.environ.get('LID_TOL', '0.003'))        # metres: 3 mm (the lids float 3 to 12 mm off the eye and the skin)
LID_RATIOS = (0.06, 0.1, 0.15, 0.25, 0.4, 0.6, 1.0)
MORPH_KEYS = ('Blink_L', 'Blink_R', 'Gaze_Left', 'Gaze_Right', 'Gaze_Up', 'Gaze_Down')
morph_pieces = []    # the eye / lid objects that keep their keys: exported as glTF morph targets, never decimated

def key_arrays(obj):
    me = obj.data
    out = {}
    for kb in me.shape_keys.key_blocks:
        a = np.empty(len(me.vertices) * 3, dtype=np.float32)
        kb.data.foreach_get('co', a)
        out[kb.name] = a.reshape(-1, 3).astype(np.float64)
    return out

def bake_common_offset(obj):
    # some generations ship every key with the same displacement of the eyeball vertices (a repair that was never put in the
    # Basis): at weight 0 the globe is torn, and any two keys together would shift it twice. Per vertex, when at least four
    # of the six deltas agree, that delta is the common offset: bake it into the Basis and take it out of every key.
    ka = key_arrays(obj)
    names = [n for n in ka if n != 'Basis']
    D = np.stack([ka[n] - ka['Basis'] for n in names])           # (k, n, 3)
    med = np.median(D, axis=0)
    agree = (np.abs(D - med) < 1e-5).all(axis=2).sum(axis=0)      # keys agreeing with the median, per vertex
    c = np.where(((agree >= 4) & (np.linalg.norm(med, axis=1) > 1e-5))[:, None], med, 0.0)
    n = int((np.linalg.norm(c, axis=1) > 0).sum())
    if n:
        me = obj.data
        nb = (ka['Basis'] + c).astype(np.float32)
        me.shape_keys.key_blocks[0].data.foreach_set('co', nb.ravel())
        me.vertices.foreach_set('co', nb.ravel())
        me.update()
        print('EYE_COMMON_OFFSET', obj.name, 'vertices', n, 'max', round(float(np.linalg.norm(c, axis=1).max()), 4))
    return n

def flatten_lid_colours(obj, slots):
    # the lid and rim slots are coloured per vertex (EyeLidColor, sampled from the skin around each eye) in the source, but the glTF
    # material would only carry a flat colour: use the average of the sampled colours so a clown's lids are not the frog's green
    me = obj.data
    attr = me.color_attributes.get('EyeLidColor') or (me.color_attributes.active_color if me.color_attributes else None)
    if attr is None: return
    n = len(attr.data)
    buf = np.empty(n * 4, dtype=np.float32); attr.data.foreach_get('color', buf); buf = buf.reshape(-1, 4)
    for i, slot in enumerate(slots):
        if not (LID_SLOT.search(slot) or re.search(r'_rim_[lr]$', slot, re.I)): continue
        idx = set()
        for p in me.polygons:
            if p.material_index != i: continue
            idx.update(p.vertices if attr.domain == 'POINT' else p.loop_indices)
        if not idx: continue
        c = buf[sorted(idx)].mean(axis=0)
        mat = obj.material_slots[i].material
        bsdf = next((nd for nd in mat.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED'), None) if mat and mat.use_nodes else None
        if bsdf is None: continue
        for l in list(mat.node_tree.links):
            if l.to_node == bsdf and l.to_socket.name == 'Base Color': mat.node_tree.links.remove(l)
        bsdf.inputs['Base Color'].default_value = (float(c[0]), float(c[1]), float(c[2]), 1.0)
        print('LID_COLOUR', slot, [round(float(x), 3) for x in c[:3]])

def piece(obj, name, want):
    # copy of obj (shape keys included) restricted to the polygons whose slot satisfies want(slot_index)
    new = obj.copy()
    new.data = obj.data.copy()
    new.name = name; new.data.name = name
    for c in obj.users_collection: c.objects.link(new)
    bm = bmesh.new(); bm.from_mesh(new.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not want(f.material_index)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(new.data); bm.free()
    new.data.update()
    return new

def prune_keys(obj):
    # drop keys that move nothing on this piece (they would export as empty targets)
    me = obj.data
    if not me.shape_keys: return
    ka = key_arrays(obj)
    for kb in list(me.shape_keys.key_blocks)[1:]:
        if np.abs(ka[kb.name] - ka['Basis']).max() < 1e-4: obj.shape_key_remove(kb)   # under 0.1 mm: nothing to export
    if len(me.shape_keys.key_blocks) <= 1:
        obj.shape_key_remove(me.shape_keys.key_blocks[0])
    else:
        for kb in me.shape_keys.key_blocks: kb.value = 0
    me.update()

def tri_soup(obj):
    me = obj.data
    me.calc_loop_triangles()
    return [tuple(t.vertices) for t in me.loop_triangles]

def bary(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01
    if abs(den) < 1e-20: return 1.0, 0.0, 0.0
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return 1.0 - v - w, v, w

def surface_error(co, tris, other_bvh):
    # worst distance from the decimated surface (its vertices, edge midpoints and centroids) to the original surface
    pts = [Vector(p) for p in co]
    for t in tris:
        a, b, c = co[t[0]], co[t[1]], co[t[2]]
        pts += [Vector((a + b + c) / 3), Vector((a + b) / 2), Vector((b + c) / 2), Vector((c + a) / 2)]
    worst = 0.0
    for q in pts:
        hit = other_bvh.find_nearest(q)
        if hit[0] is not None: worst = max(worst, hit[3])
    return worst

def grid_groups(L):
    # the generated lids are (nx + 1) x (ny + 1) vertex grids in row-major order (a = v0 + j * cols + i, quads a, a + cols, a + cols + 1,
    # a + 1), one material slot each: returns [ (v0, cols, rows, material_index) ] when every slot of L really is one, else None
    me = L.data
    by = {}
    for p in me.polygons: by.setdefault(p.material_index, []).append(p)
    out = []
    for mi, polys in by.items():
        if any(len(p.vertices) != 4 for p in polys): return None
        v0 = min(v for p in polys for v in p.vertices)
        vmax = max(v for p in polys for v in p.vertices)
        cols = polys[0].vertices[1] - polys[0].vertices[0]
        if cols < 3 or (vmax - v0 + 1) % cols: return None
        rows = (vmax - v0 + 1) // cols
        if len(polys) != (cols - 1) * (rows - 1): return None
        for p in polys:
            a = p.vertices[0]
            if tuple(p.vertices) != (a, a + cols, a + cols + 1, a + 1): return None
        out.append((v0, cols, rows, mi))
    return out

def grid_decimate(L):
    # keep every s-th row and column of each lid grid (the vertices and their keys are the originals, nothing is transferred); the
    # largest s whose worst chord error over every pose stays under LID_TOL. Returns the object or None.
    groups = grid_groups(L)
    if not groups: return None
    ka = key_arrays(L)
    tris = tri_soup(L)
    bvhs = {n: BVHTree.FromPolygons([tuple(p) for p in v], tris) for n, v in ka.items()}
    for step in (4, 3, 2):
        sub, quads, stris = [], [], []
        pos = {}
        for v0, cols, rows, mi in groups:
            ci = [i for i in range(cols) if i % step == 0 or i == cols - 1]
            rj = [j for j in range(rows) if j % step == 0 or j == rows - 1]
            for j in rj:
                for i in ci:
                    pos[v0 + j * cols + i] = len(sub); sub.append(v0 + j * cols + i)
            for j, j2 in zip(rj, rj[1:]):
                for i, i2 in zip(ci, ci[1:]):
                    q = (v0 + j * cols + i, v0 + j2 * cols + i, v0 + j2 * cols + i2, v0 + j * cols + i2)
                    quads.append((q, mi)); stris += [(pos[q[0]], pos[q[1]], pos[q[2]]), (pos[q[0]], pos[q[2]], pos[q[3]])]
        err = max(surface_error(ka[n][sub], stris, bvhs[n]) for n in ka)
        print('LID_GRID step', step, 'tris', len(stris), 'max error mm', round(err * 1000, 3))
        if err <= LID_TOL: break
    else:
        return None
    # rebuild from the kept vertices: new quads over them, then drop everything else (the keys follow the vertices)
    bm = bmesh.new(); bm.from_mesh(L.data); bm.verts.ensure_lookup_table()
    keep = set(sub)
    newf = []
    for q, mi in quads:
        f = bm.faces.new([bm.verts[v] for v in q]); f.material_index = mi; f.smooth = True; newf.append(f)
    fresh = set(newf)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f not in fresh], context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context='VERTS')
    bm.to_mesh(L.data); bm.free(); L.data.update()
    return L

def decimate_lids(L):
    if tri_count(L) <= 2500: return L        # small lids (the clown's) stay whole
    g = grid_decimate(L)
    if g is not None: return g
    me = L.data
    ka = key_arrays(L)
    names = [n for n in ka if n != 'Basis']
    base = ka['Basis']
    tris = tri_soup(L)
    delta = {n: ka[n] - base for n in names}
    mid = base + 0.5 * sum(delta.values())
    poses = {'Basis': base, **{n: ka[n] for n in names}}
    bvhs = {n: BVHTree.FromPolygons([tuple(p) for p in v], tris) for n, v in poses.items()}
    bvh_mid = BVHTree.FromPolygons([tuple(p) for p in mid], tris)
    # the lid object without keys, on its half-closed pose, is what gets decimated
    for kb in list(me.shape_keys.key_blocks)[::-1]: L.shape_key_remove(kb)
    me.vertices.foreach_set('co', mid.astype(np.float32).ravel()); me.update()
    best = None
    for ratio in LID_RATIOS:
        D = L.copy(); D.data = me.copy()
        for c in L.users_collection: c.objects.link(D)
        if ratio < 1.0:
            for o in view_layer.objects: o.select_set(False)
            view_layer.objects.active = D; D.select_set(True)
            mod = D.modifiers.new('lid_decimate', 'DECIMATE')
            mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio; mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
        dm = D.data
        dco = np.empty(len(dm.vertices) * 3, dtype=np.float32); dm.vertices.foreach_get('co', dco); dco = dco.reshape(-1, 3).astype(np.float64)
        dtris = tri_soup(D)
        if ratio >= 1.0:
            out, err = dict(poses), 0.0      # untouched: its own keys, nothing to transfer
        else:
            # transfer: every new vertex is a point on the half-closed surface; its barycentric coordinates there give its place on each pose
            out = {n: np.zeros_like(dco) for n in poses}
            for i, p in enumerate(dco):
                hit = bvh_mid.find_nearest(Vector(p))
                t = tris[hit[2]]
                u, v, w = bary(hit[0], Vector(mid[t[0]]), Vector(mid[t[1]]), Vector(mid[t[2]]))
                for n, P in poses.items(): out[n][i] = P[t[0]] * u + P[t[1]] * v + P[t[2]] * w
            err = max(surface_error(out[n], dtris, bvhs[n]) for n in poses)
        print('LID_RATIO', ratio, 'tris', len(dtris), 'max error mm', round(err * 1000, 3))
        if best is not None: bpy.data.objects.remove(best[0], do_unlink=True)
        best = (D, out, err)
        if err <= LID_TOL: break
    D, out, err = best
    if err > LID_TOL: print('WARNING lid error above tolerance', err)
    lname = L.name
    bpy.data.objects.remove(L, do_unlink=True)
    D.name = lname
    D.data.name = lname
    dm = D.data
    dm.vertices.foreach_set('co', out['Basis'].astype(np.float32).ravel())
    D.shape_key_add(name='Basis', from_mix=False)
    for n in names:
        kb = D.shape_key_add(name=n, from_mix=False)
        kb.data.foreach_set('co', out[n].astype(np.float32).ravel())
    dm.update()
    return D

if os.environ.get('EYES_MORPH', '1') == '1':
    for m in list(meshes):
        sk = m.data.shape_keys
        if not sk or not any(k in sk.key_blocks for k in MORPH_KEYS): continue
        slots = [(s.material.name if s.material else '') for s in m.material_slots]
        eye_idx = {i for i, n in enumerate(slots) if EYE_SLOT.search(n)}
        lid_idx = {i for i, n in enumerate(slots) if LID_SLOT.search(n)}
        # keep only the six keys
        for kb in list(sk.key_blocks)[1:]:
            if kb.name not in MORPH_KEYS: m.shape_key_remove(kb)
        bake_common_offset(m)
        flatten_lid_colours(m, slots)
        eyes = piece(m, m.name + '_eyes', lambda i: i in eye_idx and i not in lid_idx)
        lids = piece(m, m.name + '_lids', lambda i: i in lid_idx)
        for kb in list(m.data.shape_keys.key_blocks)[::-1]: m.shape_key_remove(kb)
        bm = bmesh.new(); bm.from_mesh(m.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in eye_idx], context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(m.data); bm.free(); m.data.update()
        prune_keys(eyes)
        if lids.data.polygons: lids = decimate_lids(lids); prune_keys(lids)
        else: bpy.data.objects.remove(lids, do_unlink=True); lids = None
        for p in (eyes, lids):
            if p is not None and p.data.shape_keys:
                morph_pieces.append(p)
                print('EYE_PIECE', p.name, 'tris', tri_count(p), 'keys', [k.name for k in p.data.shape_keys.key_blocks][1:])

# ---- meshes: drop shape keys, decimate dense generations, keep the skin weights
fixed_tris = sum(tri_count(p) for p in morph_pieces)
max_tris = max(max_tris - fixed_tris, 10000)
all_tris = max(1, sum(tri_count(m) for m in meshes))
for m in meshes:
    view_layer.objects.active = m
    for o in view_layer.objects: o.select_set(False)
    m.select_set(True)
    if m.data.shape_keys:
        for k in list(m.data.shape_keys.key_blocks)[::-1]: m.shape_key_remove(k)
    if os.environ.get('WELD', '0') == '1':
        # generation exports split every UV / normal discontinuity into loose shards; weld positions (UV loops stay) so
        # the collapse sees one surface instead of tearing it along the splits
        import bmesh
        bm = bmesh.new(); bm.from_mesh(m.data)
        n0 = len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        bm.to_mesh(m.data); bm.free()
        print('WELD', m.name, n0, '->', len(m.data.vertices))
    tris = tri_count(m)
    budget = max_tris * tris / all_tris
    if tris > budget * 1.05:
        # keep the face and hands denser: a vertex group (weight DETAIL_W on head / eye / hand / finger vertices, 0.3 elsewhere)
        # steers the collapse. DETAIL_W must stay below 1: the modifier is inverted, and an edge whose two vertices both end at
        # weight 0 is never collapsed, so weight 1.0 FREEZES the head and hands. Doge's head + hands are 99k of the 100k budget
        # (Pengu's 120k), which left ~1.5k triangles for the whole body: torso, arms and legs became torn shards.
        # At 0.9 they are only strongly preferred and the collapse spreads the budget over the body too.
        FACE = ('head', 'eye_l', 'eye_r', 'neck_01')
        vg = m.vertex_groups.new(name='keep_detail')
        names = {g.index: g.name for g in m.vertex_groups}
        for v in m.data.vertices:
            best, bw = None, 0.0
            for g in v.groups:
                if g.weight > bw and names.get(g.group) != 'keep_detail': best, bw = names.get(g.group), g.weight
            hi = best is not None and (best in FACE or best.startswith(('hand_', 'index_', 'middle_', 'ring_', 'thumb_')))
            vg.add([v.index], DETAIL_W if hi else 0.3, 'REPLACE')
        mod = m.modifiers.new('decimate', 'DECIMATE')
        mod.decimate_type = 'COLLAPSE'
        mod.ratio = budget / tris
        mod.use_collapse_triangulate = True
        mod.use_symmetry = SYMMETRY
        mod.symmetry_axis = 'X'
        if os.environ.get('DECIMATE_VG', '1') == '1':
            mod.vertex_group = vg.name
            mod.vertex_group_factor = FACTOR
            mod.invert_vertex_group = os.environ.get('DECIMATE_INVERT', '1') == '1'
        bpy.ops.object.modifier_apply(modifier=mod.name)
        g2 = m.vertex_groups.get('keep_detail')
        if g2:
            # how the budget was split: triangles wholly on detail vertices (head, hands) vs the rest of the body
            w = [0.0] * len(m.data.vertices)
            for v in m.data.vertices:
                for g in v.groups:
                    if g.group == g2.index: w[v.index] = g.weight
            cut = (DETAIL_W + 0.3) / 2
            detail = sum(1 for p in m.data.polygons if all(w[i] > cut for i in p.vertices))
            print('DETAIL_SPLIT', m.name, 'head+hands', detail, 'body', tri_count(m) - detail)
            m.vertex_groups.remove(g2)
        print('DECIMATED', m.name, tris, '->', tri_count(m))
        if tri_count(m) > budget * 1.02: print('WARNING decimation missed the budget', m.name, tri_count(m), '>', int(budget))
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

# ---- rebase: the authored clip FBXs (HyptileMotion build_motion.py, FishingFleet boat actions, JadeFisher animations) were
# exported with the rig posed on their first frame, and the FBX exporter writes the current pose as the skeleton's rest. The
# importer reads that back as the clip armature's rest, so its keys are deltas from the FIRST FRAME, not from the true rest
# (which the characters share: every SK_*.fbx has the JadeFisher v03 rest). Assigned as-is, a clip starts in the bind pose and
# a clip that holds one pose (Helm_Idle, Seated_Idle, Steer_Left / Right, Fall_Loop) IS the bind pose for its whole length.
# Rebasing composes each key with the clip armature's rest:  basis' = inv(rest_char_local) @ rest_clip_local @ basis, which
# is the authored local pose exactly. Translations off the pelvis / root keep the character's own offsets (proportions).
from mathutils import Matrix, Quaternion

def rest_local(a, n):
    b = a.data.bones[n]
    return (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local.copy()

def action_channelbag(act, slot):
    try:
        from bpy_extras.anim_utils import action_get_channelbag_for_slot
        cb = action_get_channelbag_for_slot(act, slot)
        if cb is not None: return cb
    except ImportError:
        pass
    return act.layers[0].strips[0].channelbag(slot, ensure=True)

def rebase_action(act, slot, src, dst):
    cb = action_channelbag(act, slot)
    worst = 0.0
    for b in src.data.bones:
        n = b.name
        if n not in dst.data.bones: continue
        Lc, Lt = rest_local(src, n), rest_local(dst, n)
        C = Lt.inverted() @ Lc
        moves_root = n in ('root', 'pelvis')
        if not moves_root: C.translation = (0, 0, 0)       # same rotation correction, the character's own bone offset
        ang = math.degrees(C.to_quaternion().angle)
        if ang < 1e-3 and C.translation.length < 1e-6: continue
        worst = max(worst, min(ang, 360 - ang))
        dp = 'pose.bones["%s"].' % n
        fc = {}
        for prop, k in (('location', 3), ('rotation_quaternion', 4), ('scale', 3)):
            for i in range(k):
                fc[prop, i] = cb.fcurves.find(dp + prop, index=i)
        frames = sorted({kp.co[0] for c in fc.values() if c for kp in c.keyframe_points})
        if not frames: frames = [act.frame_range[0], act.frame_range[1]]
        val = lambda prop, i, f, d: fc[prop, i].evaluate(f) if fc[prop, i] else d
        out = {key: [] for key in fc}
        prev = None
        for f in frames:
            loc = Vector([val('location', i, f, 0.0) for i in range(3)])
            q = Quaternion([val('rotation_quaternion', i, f, 1.0 if i == 0 else 0.0) for i in range(4)]).normalized()
            s = Vector([val('scale', i, f, 1.0) for i in range(3)])
            N = C @ Matrix.LocRotScale(loc, q, s)
            nl, nq, ns = N.decompose()
            if prev is not None and nq.dot(prev) < 0: nq.negate()
            prev = nq
            for i in range(3): out['location', i].append(nl[i]); out['scale', i].append(ns[i])
            for i in range(4): out['rotation_quaternion', i].append(nq[i])
        for (prop, i), c in fc.items():
            if c is None: c = cb.fcurves.new(dp + prop, index=i, group_name=n)
            c.keyframe_points.clear()
            c.keyframe_points.add(len(frames))
            co = [x for f, v in zip(frames, out[prop, i]) for x in (f, v)]
            c.keyframe_points.foreach_set('co', co)
            for kp in c.keyframe_points: kp.interpolation = 'LINEAR'
            c.update()
    return worst

# ---- clips: same rig, same bone names -> assign each action directly, one NLA track per clip
arm.animation_data_create()
for name, path in clips:
    path, _, opts = path.partition('|')
    new = import_fbx(path)
    a_arm = next((o for o in new if o.type == 'ARMATURE'), None)
    act = a_arm.animation_data.action if a_arm and a_arm.animation_data else None
    if act is None:
        print('NO ACTION', path)
        continue
    if REBASE_ALL or 'rebase' in opts.split(','):
        slot = a_arm.animation_data.action_slot or (act.slots[0] if act.slots else None)
        print('REBASE', name, 'max rest correction deg', round(rebase_action(act, slot, a_arm, arm), 1))
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

# ---- procedural fishing clips (Hold / Reel / Fight / Strike / Charge / Cast, tools/roster/fishing_pose.py): the authored ones are static poses
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fishing_pose
for name in fishing_pose.SPECS:
    tr = arm.animation_data.nla_tracks.get(name)
    if tr: arm.animation_data.nla_tracks.remove(tr)
    old = bpy.data.actions.get(name)
    if old: bpy.data.actions.remove(old)
for name, act in fishing_pose.make_fishing_clips(arm).items():
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 1, act)
    if hasattr(st, 'action_slot') and act.slots: st.action_slot = act.slots[0]
    tr.mute = True
    print('CLIP', name, 'procedural', act.frame_range[0], act.frame_range[1])
arm.animation_data.action = None

# ---- export
for o in view_layer.objects: o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=out, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=86,
    export_skins=True, export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_optimize_animation_size=True, export_def_bones=False,
    export_morph=True, export_morph_normal=False, export_morph_tangent=False, export_try_sparse_sk=False, export_morph_animation=False,
    export_yup=True, export_apply=False, export_cameras=False, export_lights=False,
    export_materials='EXPORT', use_selection=False,
)
print('EXPORTED', out, os.path.getsize(out))

# ---- portrait: the idle pose from the front, Workbench studio light (fast, headless safe)
try:
    idle = next((t for t in arm.animation_data.nla_tracks if t.name == 'Idle_Breathe'), None)
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
    sh = scene.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_shadows = True; sh.show_cavity = True
    scene.render.film_transparent = True
    scene.render.resolution_x = 512; scene.render.resolution_y = 640; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
    scene.render.filepath = portrait
    bpy.ops.render.render(write_still=True)
    print('PORTRAIT', portrait)
except Exception as e:
    print('PORTRAIT FAILED', e)
