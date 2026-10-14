# Blender (5.x) batch retargeter: Microsoft Rocketbox motion-capture clips (Bip01 skeleton, ~1.8 m, T-pose avatars)
# -> animation-only FBXs on the 48-bone JadeFisher roster rig (A-pose, 1.6 m, big head), baked every frame.
#   blender -b --python retarget.py -- <rig.fbx> <out_dir> [--preview <dir>] [--only A,B] <Name=clip.fbx[|opt,opt]> ...
# Options per clip:  zero  = pelvis stays on the spot (xy locked: sit/stand clips of the xyz set)
#                    loop  = drop the last frame when it repeats the first one (walk / run / idles)
#                    keepz = no foot-ground correction (the offset is only measured, not applied)
#                    nocap = keep a clip longer than CAP_SEC as it is
#                    fingers=<fbx> = hold the hand pose of that clip on this rig (see FINGERS_FROM)
#                    sit=<m> = sitting on a seat <m> high (wave 18E): the seated frames are lifted so the lowest buttock
#                              point (pelvis / upper-thigh vertices) lands on the seat, blended in by how far the pelvis has
#                              dropped (the standing frames keep the feet on the floor); the Rocketbox chair scaled to
#                              this rig is lower than the game's seats. `sit` alone = 0.45 m
#                    travel=end | travel=start = keep the take's ground travel, ending | starting over the root (sit / stand)
#                    unyaw = remove the pelvis heading change (turn-in-place takes: the feet step, the game turns the body)
#                    noclamp = with sit: no floor clamp (a seat lower than the take's: post-clips.mjs re-solves the legs)
#                    cap=<s> = cut long clips at <s> seconds instead of CAP_SEC (smaller GLBs for ambient loops)
# Method (see tools/roster/README.md): the importer's rest pose of a Rocketbox clip is its first frame (arms down),
# not the T-pose, and the rig's A-pose differs again, so a plain world-rotation copy or a delta from "rest" would twist
# the limbs. Each target bone is therefore matched to the clip's rest pose by DIRECTION (the minimal swing F that turns
# the target bone's rest direction, head to child head, onto the clip bone's rest direction), and the clip's motion is
# then applied as a world-space delta on that matched pose:
#     target_world(t) = ( clip_world(t) * inverse(clip_rest_world) ) * F * target_rest_world
# Only the pelvis translates (scaled by target/source pelvis height, in place); `root` stays at the origin.
import bpy, sys, os, math
from mathutils import Matrix, Vector, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:]
RIG, OUT = os.path.abspath(argv[0]), os.path.abspath(argv[1])
rest = argv[2:]
PREVIEW = None; ONLY = None
while rest and rest[0].startswith('--'):
    if rest[0] == '--preview': PREVIEW = os.path.abspath(rest[1]); rest = rest[2:]
    elif rest[0] == '--only': ONLY = set(rest[1].split(',')); rest = rest[2:]
    else: raise SystemExit('unknown option ' + rest[0])
CLIPS = []
for a in rest:
    name, spec = a.split('=', 1)
    path, _, opts = spec.partition('|')
    path = os.path.abspath(path)
    if ONLY and name not in ONLY: continue
    CLIPS.append((name, path, set(o for o in opts.split(',') if o)))
os.makedirs(OUT, exist_ok=True)

# Proportion fixes (the Rocketbox actors have a slim torso and a small head; this rig has a big belly and a big head):
# arms that hang are abducted and the elbows bent forward so the swing clears the belly, scaled by how much the upper arm
# hangs (raised arms for waves and claps are left alone); neck and head keep only part of the source rotation.
ARM_ABDUCT = float(os.environ.get('ARM_ABDUCT', 18.0))   # degrees about the forward axis, whole arm chain rigid about the shoulder
ELBOW_BEND = float(os.environ.get('ELBOW_BEND', 10.0))   # extra forward bend of forearm / hand / fingers, degrees
DAMP = {'neck_01': float(os.environ.get('NECK_KEEP', 0.5)), 'head': float(os.environ.get('NECK_KEEP', 0.5))}   # fraction of the source delta rotation kept
CAP_SEC = 8.0               # clips longer than this are cut and cross-faded into a loop
# FINGERS_FROM=<clip retargeted on this rig>: sources without real finger motion (Kimodo's SOMA model outputs a fixed,
# flat default hand) do not drive the fingers; they hold the relaxed hand of that clip (its middle frame) instead.
FINGERS_FROM = os.environ.get('FINGERS_FROM')
FINGER_PREFIX = ('thumb_', 'index_', 'middle_', 'ring_')
# TWIST_ALIGN=1: the direction match is a minimal swing, so the roll about a bone is not matched; for the forearm and
# hand that roll is where the palm faces. Also match the knuckle line (index -> ring) as a second axis for those bones.
TWIST_ALIGN = os.environ.get('TWIST_ALIGN') == '1'
SRC_STAND_PELVIS_Z = float(os.environ.get('SRC_STAND_PELVIS_Z', 0.895))   # Rocketbox male, metres (Kimodo SOMA: 1.005)

# target bone -> (clip bone, target child for the direction, clip child for the direction)  |  inherit F from a bone
MAP = {
    'pelvis':   ('Bip01 Pelvis', 'spine_01', 'Bip01 Spine'),
    'spine_01': ('Bip01 Spine1', 'spine_02', 'Bip01 Spine2'),
    'spine_02': ('Bip01 Spine2', 'neck_01', 'Bip01 Neck'),
    'neck_01':  ('Bip01 Neck', 'head', 'Bip01 Head'),
    'head':     ('Bip01 Head', None, 'neck_01'),
}
for s, S in (('l', 'L'), ('r', 'R')):
    MAP.update({
        f'clavicle_{s}': (f'Bip01 {S} Clavicle', f'upperarm_{s}', f'Bip01 {S} UpperArm'),
        f'upperarm_{s}': (f'Bip01 {S} UpperArm', f'lowerarm_{s}', f'Bip01 {S} Forearm'),
        f'lowerarm_{s}': (f'Bip01 {S} Forearm', f'hand_{s}', f'Bip01 {S} Hand'),
        f'hand_{s}':     (f'Bip01 {S} Hand', f'middle_01_{s}', f'Bip01 {S} Finger2'),
        f'thumb_01_{s}': (f'Bip01 {S} Finger0', f'thumb_02_{s}', f'Bip01 {S} Finger01'),
        f'thumb_02_{s}': (f'Bip01 {S} Finger01', None, f'thumb_01_{s}'),
        f'thigh_{s}':    (f'Bip01 {S} Thigh', f'calf_{s}', f'Bip01 {S} Calf'),
        f'calf_{s}':     (f'Bip01 {S} Calf', f'foot_{s}', f'Bip01 {S} Foot'),
        f'foot_{s}':     (f'Bip01 {S} Foot', f'ball_{s}', f'Bip01 {S} Toe0'),
        f'ball_{s}':     (f'Bip01 {S} Toe0', None, f'foot_{s}'),
    })
    for fi, nm in ((1, 'index'), (2, 'middle'), (3, 'ring')):
        MAP[f'{nm}_01_{s}'] = (f'Bip01 {S} Finger{fi}', f'{nm}_02_{s}', f'Bip01 {S} Finger{fi}1')
        MAP[f'{nm}_02_{s}'] = (f'Bip01 {S} Finger{fi}1', f'{nm}_03_{s}', f'Bip01 {S} Finger{fi}2')
        MAP[f'{nm}_03_{s}'] = (f'Bip01 {S} Finger{fi}2', None, f'{nm}_02_{s}')


def import_fbx(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True, automatic_bone_orientation=False, ignore_leaf_bones=False)
    return [o for o in bpy.data.objects if o not in before]


def rot3(m):
    return m.to_3x3().normalized()


def depth(b):
    d = 0
    while b.parent: b = b.parent; d += 1
    return d


def clip_action(obj):
    return obj.animation_data.action if obj.animation_data else None


def arm_chain(nm):
    # ('upperarm' | 'lowerarm' | 'hand' | 'finger', side) for the arm chain bones the proportion fix applies to, else None
    if nm.endswith('_l') or nm.endswith('_r'):
        sd = nm[-1]
        base = nm[:-2]
        if base == 'upperarm': return ('upperarm', sd)
        if base in ('lowerarm', 'hand'): return (base, sd)
        if base.startswith(('index', 'middle', 'ring', 'thumb')): return ('finger', sd)
    return None

def torso_model(robjs, Mt):
    # torso cross-section per 5 cm height bin from the skinned mesh (vertices dominated by pelvis / spine bones):
    # half width a, front and back extents from the spine axis -> penetration depth of a point (m, 0 when outside)
    bins = {}
    ax = {}
    for m in [o for o in robjs if o.type == 'MESH']:
        gname = {g.index: g.name for g in m.vertex_groups}
        for v in m.data.vertices:
            best, bw = None, 0.0
            for g in v.groups:
                if g.weight > bw: best, bw = gname.get(g.group), g.weight
            if best in ('pelvis', 'spine_01', 'spine_02'):
                p = m.matrix_world @ v.co
                if p.z < 0.75 or p.z > 1.12: continue
                bins.setdefault(int(p.z * 20), []).append(p)
    prof = {}
    for k, ps in bins.items():
        if len(ps) < 20: continue
        xs = sorted(abs(p.x) for p in ps); ys = sorted(p.y for p in ps)
        n = len(ps)
        cy = (ys[int(n * 0.03)] + ys[int(n * 0.97)]) / 2
        prof[k] = (xs[int(n * 0.97)], cy - ys[int(n * 0.03)], ys[int(n * 0.97)] - cy, cy)
    def depth_at(pt, rad):
        k = int(pt.z * 20)
        if k not in prof: return 0.0
        a, front, back, cy = prof[k]
        a += rad; front += rad; back += rad   # the limb's own thickness
        dy = pt.y - cy
        b = front if dy < 0 else back
        e = math.sqrt((pt.x / a) ** 2 + (dy / b) ** 2)
        return max(0.0, (1.0 - e) * min(a, b))
    return depth_at

def retarget(name, path, opts):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    robjs = import_fbx(RIG)
    tgt = next(o for o in robjs if o.type == 'ARMATURE')
    for o in robjs:
        if o.type == 'EMPTY': bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    tgt.name = 'Armature'
    hand = {}
    donor_path = next((o.split('=', 1)[1] for o in opts if o.startswith('fingers=')), FINGERS_FROM)   # per clip: |fingers=<fbx>
    if donor_path:
        dobjs = import_fbx(donor_path)
        donor = next(o for o in dobjs if o.type == 'ARMATURE')
        dact = clip_action(donor)
        scene.frame_set(int(round((dact.frame_range[0] + dact.frame_range[1]) / 2)))
        for pb in donor.pose.bones:
            if pb.name.startswith(FINGER_PREFIX):
                pb.rotation_mode = 'QUATERNION'
                hand[pb.name] = pb.rotation_quaternion.copy()
        for o in dobjs: bpy.data.objects.remove(o, do_unlink=True)
        for a in list(bpy.data.actions): bpy.data.actions.remove(a)
        print('FINGERS', name, 'hand pose from', os.path.basename(donor_path), len(hand), 'bones')
    cobjs = import_fbx(path)
    src = next(o for o in cobjs if o.type == 'ARMATURE' and 'Bip01 Pelvis' in o.data.bones)
    sact = clip_action(src)
    f0, f1 = int(round(sact.frame_range[0])), int(round(sact.frame_range[1]))
    Ms, Mt = src.matrix_world, tgt.matrix_world
    Ms3, Mt3 = rot3(Ms), rot3(Mt)
    sb, tb = src.data.bones, tgt.data.bones

    def s_rest_rot(n): return Ms3 @ rot3(sb[n].matrix_local)
    def s_head(n): return Ms @ sb[n].head_local
    def t_rest_rot(n): return Mt3 @ rot3(tb[n].matrix_local)
    def t_head(n): return Mt @ tb[n].head_local

    # matched reference pose: swing F per mapped bone (inherit for bones without a child to aim at)
    F, SRC = {}, {}
    for tn, (sn, tc, sc) in MAP.items():
        SRC[tn] = sn
        if tc is None: continue
        vt = (t_head(tc) - t_head(tn)).normalized()
        vs = (s_head(sc) - s_head(sn)).normalized()
        F[tn] = vt.rotation_difference(vs).to_matrix()
    for tn, (sn, tc, sc) in MAP.items():
        if tc is None: F[tn] = F[sc]
    if TWIST_ALIGN:
        def frame(v, u):
            v = v.normalized(); u = (u - v * u.dot(v)).normalized()
            return Matrix((v, u, v.cross(u))).transposed()   # columns: primary, secondary, normal
        for s, S in (('l', 'L'), ('r', 'R')):
            ut = t_head(f'index_01_{s}') - t_head(f'ring_01_{s}')
            us = s_head(f'Bip01 {S} Finger1') - s_head(f'Bip01 {S} Finger3')
            # the whole arm: matching only forearm + hand left ~120 deg of twist at the elbow (rope-like "noodle" arms)
            for tn in (f'upperarm_{s}', f'lowerarm_{s}', f'hand_{s}'):
                sn, tc, sc = MAP[tn]
                vt = t_head(tc) - t_head(tn); vs = s_head(sc) - s_head(sn)
                F[tn] = frame(vs, us) @ frame(vt, ut).transposed()
        print('TWIST', name, 'upper arm / forearm / hand roll matched on the knuckle line')
    Rs0 = {tn: s_rest_rot(SRC[tn]) for tn in MAP}
    Rs0_inv = {tn: Rs0[tn].inverted() for tn in MAP}
    Rt = {b.name: t_rest_rot(b.name) for b in tb}
    order = sorted(tb, key=depth)
    k = tb['pelvis'].head_local.z * Mt.to_scale().z / SRC_STAND_PELVIS_Z

    # sample the clip
    frames = list(range(f0, f1 + 1))
    quats, ppos, worlds = [], [], []
    sp = src.pose.bones
    for f in frames:
        scene.frame_set(f)
        w = {tn: Ms3 @ rot3(sp[SRC[tn]].matrix) for tn in MAP}
        worlds.append(w)
        ppos.append((Ms @ sp['Bip01 Pelvis'].matrix).translation.copy())
    # unyaw: every frame turned back about the vertical by the pelvis heading change since the first frame
    if 'unyaw' in opts:
        def heading(w):
            f = (w['pelvis'] @ Rs0_inv['pelvis']) @ Vector((0.0, -1.0, 0.0))
            return math.atan2(f.x, -f.y)
        h0 = heading(worlds[0])
        turned = math.degrees(math.atan2(math.sin(heading(worlds[-1]) - h0), math.cos(heading(worlds[-1]) - h0)))
        for i, w in enumerate(worlds):
            R = Matrix.Rotation(-(heading(w) - h0), 3, 'Z')
            for tn in MAP: w[tn] = R @ w[tn]
            c = ppos[i] - ppos[0]
            ppos[i] = ppos[0] + (R @ c)
        print('UNYAW', name, 'heading change removed: %.1f deg' % turned)
    # long clips are cut to CAP_SEC and closed into a loop: the last K frames cross-fade to the K frames that precede
    # the start, so the cut cannot pop (keeps the GLBs small: the talk / idle takes run 30+ seconds)
    cap = next((float(o.split('=', 1)[1]) for o in opts if o.startswith('cap=')), CAP_SEC)
    L, K = int(cap * 30), 15
    capped = False
    if 'nocap' not in opts and len(worlds) >= L + K + 2:
        nw, npos = [], []
        for j in range(L):
            if j < L - K:
                nw.append(worlds[K + j]); npos.append(ppos[K + j].copy())
            else:
                i = j - (L - K); t = (i + 1) / (K + 1)
                a, b = worlds[L + i], worlds[i]
                nw.append({tn: a[tn].to_quaternion().slerp(b[tn].to_quaternion(), t).to_matrix() for tn in MAP})
                npos.append(ppos[L + i].lerp(ppos[i], t))
        print('CAP', name, '%d -> %d frames, loop cross-fade %d' % (len(worlds), L, K))
        worlds, ppos = nw, npos
        capped = True
    # pelvis path: scaled and in place (the linear travel of the whole clip is removed)
    drift = Vector((ppos[-1].x - ppos[0].x, ppos[-1].y - ppos[0].y))
    denom = max(1, len(ppos) - 1)
    # looping: the clip's last frame repeats its first one
    if 'loop' in opts and not capped:
        diff = 0.0
        for tn in MAP:
            qa = worlds[0][tn].to_quaternion(); qb = worlds[-1][tn].to_quaternion()
            diff = max(diff, math.degrees(qa.rotation_difference(qb).angle))
        if diff < 2.5:
            frames, worlds, ppos = frames[:-1], worlds[:-1], ppos[:-1]
            print('LOOPDROP', name, 'last frame repeats the first (%.2f deg)' % diff)
        else:
            print('LOOPKEEP', name, 'last frame differs by %.1f deg' % diff)
    p0 = ppos[0]
    print('TRAVEL', name, 'pelvis xy start->end %.3f %.3f m (clip scale)' % ((ppos[-1].x - p0.x) * k, (ppos[-1].y - p0.y) * k))
    xy = []
    for i, p in enumerate(ppos):
        if 'zero' in opts:
            d = Vector((0.0, 0.0))
        elif 'travel=end' in opts:   # the real travel, ending over the root (sit down: start in front of the seat)
            d = Vector((p.x - ppos[-1].x, p.y - ppos[-1].y))
        elif 'travel=start' in opts:   # the real travel, starting over the root (stand up: step off the seat)
            d = Vector((p.x - p0.x, p.y - p0.y))
        else:
            d = Vector((p.x - p0.x, p.y - p0.y)) - drift * (i / denom)
        xy.append(d * k)
    zs = []
    for p in ppos:
        z = p.z * k
        zs.append(z)
    pel_rest = Mt @ tb['pelvis'].head_local
    zs = []
    for p in ppos:
        z = p.z * k
        zs.append(z)

    # desired pose per frame: armature-space rotation of every target bone (forward kinematics for the foot heights)
    rest_head = {b.name: Mt @ b.head_local for b in tb}
    rest_tail = {b.name: Mt @ b.tail_local for b in tb}
    low_names = ('foot_l', 'foot_r', 'ball_l', 'ball_r')
    # sole points: the lowest skinned vertices of the feet, carried rigidly by their bone, measure the floor contact
    sole = []
    for m in [o for o in robjs if o.type == 'MESH']:
        gname = {g.index: g.name for g in m.vertex_groups}
        cand = {nm: [] for nm in low_names}
        for v in m.data.vertices:
            for g in v.groups:
                nm = gname.get(g.group)
                if nm in cand and g.weight >= 0.5:
                    cand[nm].append((v.co.z, (m.matrix_world @ v.co).copy(), nm))
        for nm, lst in cand.items():
            lst.sort(key=lambda t: t[0])
            sole += [(nm, pos) for _, pos, _ in lst[:120]]
    if not sole:
        raise SystemExit('no foot vertices found for the ground measurement')
    # sit=<m>: the buttocks, the lowest pelvis-dominated vertices and the upper thighs (within 12 cm of the hip joints)
    sit_h = None
    for o in opts:
        if o == 'sit': sit_h = 0.45
        elif o.startswith('sit='): sit_h = float(o.split('=', 1)[1])
    seat = []
    if sit_h is not None:
        for m in [o for o in robjs if o.type == 'MESH']:
            gname = {g.index: g.name for g in m.vertex_groups}
            for v in m.data.vertices:
                best, bw = None, 0.0
                for g in v.groups:
                    if g.weight > bw: best, bw = gname.get(g.group), g.weight
                if best not in ('pelvis', 'thigh_l', 'thigh_r') or bw < 0.5: continue
                p = (m.matrix_world @ v.co).copy()
                if best != 'pelvis' and (p - rest_head[best]).length > 0.12: continue
                seat.append((best, p))
        seat.sort(key=lambda t: t[1].z)
        seat = seat[:600]
    seat_lows = []
    # how much each upper arm hangs per frame (1 = straight down, 0 = at or above horizontal): scales the arm fixes
    hang = {}
    for sd in ('l', 'r'):
        v_rest = (rest_tail[f'upperarm_{sd}'] - rest_head[f'upperarm_{sd}']).normalized()
        hang[sd] = []
        for w in worlds:
            Pu = w[f'upperarm_{sd}'] @ Rs0_inv[f'upperarm_{sd}'] @ F[f'upperarm_{sd}'] @ Rt[f'upperarm_{sd}']
            dv = Pu @ Rt[f'upperarm_{sd}'].inverted() @ v_rest
            hang[sd].append(max(0.0, min(1.0, (-dv.z - 0.2) / 0.6)))
    torso = torso_model(robjs, Mt)
    pen = {'max': 0.0, 'where': ''}
    samples = []   # per frame: dict bone -> (quat local, pose rot) and lowest foot z
    lows = []
    for i, w in enumerate(worlds):
        Pa = {}   # pose rotation in world space of every bone
        loc_q = {}
        head = {}
        pelvis_pos = Vector((pel_rest.x + xy[i].x, pel_rest.y + xy[i].y, zs[i]))
        for b in order:
            nm = b.name
            if nm in hand:   # FINGERS_FROM: the donor's local hand pose, carried by the animated hand
                pn = b.parent.name
                Pb = Pa[pn] @ Rt[pn].inverted() @ Rt[nm] @ hand[nm].to_matrix()
            elif nm in MAP:
                Pb = w[nm] @ Rs0_inv[nm] @ F[nm] @ Rt[nm]
                if nm in DAMP:
                    P0 = F[nm] @ Rt[nm]
                    Pb = P0.to_quaternion().slerp(Pb.to_quaternion(), DAMP[nm]).to_matrix()
                chain = arm_chain(nm)
                if chain:
                    wgt = hang[chain[1]][i]
                    sgn = 1.0 if chain[1] == 'r' else -1.0
                    corr = Matrix.Rotation(math.radians(ARM_ABDUCT * wgt) * sgn, 3, 'Y')
                    if chain[0] != 'upperarm':
                        corr = corr @ Matrix.Rotation(math.radians(-ELBOW_BEND * wgt), 3, 'X')
                    Pb = corr @ Pb
            else:
                if b.parent is None: Pb = Rt[nm]
                else: Pb = Pa[b.parent.name] @ Rt[b.parent.name].inverted() @ Rt[nm]
            Pa[nm] = Pb
            if b.parent is None:
                loc_q[nm] = Quaternion((1, 0, 0, 0))
                head[nm] = rest_head[nm]
            else:
                pn = b.parent.name
                # local pose rotation (bone space): Pb = Pp * (Rp^-1 Rb) * q
                q = (Rt[nm].inverted() @ Rt[pn] @ Pa[pn].inverted() @ Pb)
                loc_q[nm] = q.to_quaternion().normalized()
                head[nm] = head[pn] + Pa[pn] @ Rt[pn].inverted() @ (rest_head[nm] - rest_head[pn])
        for sd in ('l', 'r'):
            pts = {'hand': head[f'hand_{sd}'], 'forearm': (head[f'lowerarm_{sd}'] + head[f'hand_{sd}']) * 0.5,
                   'fingers': head[f'middle_01_{sd}'] + (head[f'middle_01_{sd}'] - head[f'hand_{sd}']) * 0.4}
            for pn, pt in pts.items():
                d = torso(pt, {'hand': 0.05, 'forearm': 0.045, 'fingers': 0.025}[pn])
                if d > pen['max']: pen['max'] = d; pen['where'] = f'{pn}_{sd} frame {i}'
        # shift: pelvis translation moves the whole body (head positions above are computed with the rest pelvis)
        shift = pelvis_pos - rest_head['pelvis']
        lowz = min((head[nm] + Pa[nm] @ Rt[nm].inverted() @ (pos - rest_head[nm])).z for nm, pos in sole) + shift.z
        lows.append(lowz)
        if seat:
            seat_lows.append(min((head[nm] + Pa[nm] @ Rt[nm].inverted() @ (pos - rest_head[nm])).z for nm, pos in seat) + shift.z)
        samples.append((loc_q, shift))
    print('PENETRATION', name, 'max %.3f m (%s) limb-into-torso depth (belly ellipse + limb radius)' % (pen['max'], pen['where']))
    rest_low = min(pos.z for nm, pos in sole)
    # sitting: the floor is measured on the standing frames only (a take's seated legs are not a floor reference)
    sw = None
    all_lows = list(lows)
    if seat:
        zmax, zmin = max(zs), min(zs)
        span = zmax - zmin
        sw = [1.0 if span < 0.08 else max(0.0, min(1.0, (zmax - z) / span)) for z in zs]
        standing = [lows[i] for i in range(len(lows)) if sw[i] < 0.1]
        if len(standing) >= 3: lows = standing
    sorted_lows = sorted(lows)
    ref_low = sorted_lows[max(0, int(len(sorted_lows) * 0.1))]
    ground = rest_low - ref_low
    if 'keepz' in opts:
        print('GROUND', name, 'measured foot offset %.3f m (not applied)' % ground)
        ground = 0.0
    else:
        print('GROUND', name, 'foot offset applied %.3f m' % ground)
    # per-frame extra height: the seated frames lifted onto the seat (blend by the pelvis drop: 0 standing, 1 seated)
    lift = [0.0] * len(samples)
    if seat:
        deep = [seat_lows[i] for i in range(len(zs)) if sw[i] > 0.95] or seat_lows
        deep = sorted(deep)[len(deep) // 2]
        need = sit_h - (deep + ground)
        lift = [w * need for w in sw]
        # and no frame pushes a foot through the floor (the take's knees bend on longer shins than this rig's)
        under = [0.0 if 'noclamp' in opts else max(0.0, rest_low - (all_lows[i] + ground + lift[i])) for i in range(len(lift))]
        lift = [lift[i] + under[i] for i in range(len(lift))]
        if max(under) > 0.002: print('SIT', name, 'floor clamp up to %.3f m' % max(under))
        pel = rest_head['pelvis'].z + samples[sw.index(max(sw))][1].z + ground + need
        print('SIT', name, 'seat %.3f m -> %.3f m (lift %.3f), seated pelvis %.3f m (drop %.3f from rest)' % (deep + ground, sit_h, need, pel, rest_head['pelvis'].z - pel))

    # bake: keyframe every frame (basis rotation of every bone but root, basis location of the pelvis)
    tgt.animation_data_create()
    act = bpy.data.actions.new(name)
    tgt.animation_data.action = act
    if hasattr(act, 'slots'):
        slot = act.slots.new('OBJECT', tgt.name)
        tgt.animation_data.action_slot = slot
    tpb = tgt.pose.bones
    Rpel = Rt['pelvis']
    start = 1
    for i, (loc_q, shift) in enumerate(samples):
        fr = start + i
        for b in order:
            nm = b.name
            if b.parent is None: continue
            pb = tpb[nm]
            pb.rotation_mode = 'QUATERNION'
            pb.rotation_quaternion = loc_q[nm]
            pb.keyframe_insert('rotation_quaternion', frame=fr, group=nm)
        d = Vector((shift.x, shift.y, shift.z + ground + lift[i]))
        # pelvis basis location lives in its rest frame; its parent (root) stays at rest
        pb = tpb['pelvis']
        pb.location = Rpel.inverted() @ d
        pb.keyframe_insert('location', frame=fr, group='pelvis')
    # The FBX exporter writes the CURRENT pose as the bones' default transform and the importer takes that as the clip
    # skeleton's rest, so export from a frame where the pose is the true rest pose: key rest (identity) on frame 0 and
    # limit the action's range to the real clip so frame 0 is not baked.
    for b in order:
        if b.parent is None: continue
        pb = tpb[b.name]
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
        pb.keyframe_insert('rotation_quaternion', frame=0, group=b.name)
    tpb['pelvis'].location = Vector((0, 0, 0))
    tpb['pelvis'].keyframe_insert('location', frame=0, group='pelvis')
    act.use_frame_range = True
    act.frame_start, act.frame_end = start, start + len(samples) - 1
    scene.frame_start, scene.frame_end = start, start + len(samples) - 1
    scene.frame_set(0)
    expected = {nm: samples[len(samples) // 2][0][nm].copy() for nm in ('upperarm_l', 'thigh_r', 'head')}
    mi = len(samples) // 2
    expected_loc = Rpel.inverted() @ Vector((samples[mi][1].x, samples[mi][1].y, samples[mi][1].z + ground + lift[mi]))
    mid_frame = start + len(samples) // 2

    return tgt, src, act, (scene.frame_start, scene.frame_end), (expected, expected_loc, mid_frame), robjs, cobjs


def export_clip(name, tgt, robjs, cobjs, outpath):
    for o in list(bpy.data.objects):
        if o.name != tgt.name: bpy.data.objects.remove(o, do_unlink=True)
    tgt.select_set(True); bpy.context.view_layer.objects.active = tgt
    bpy.ops.export_scene.fbx(filepath=outpath, use_selection=True, object_types={'ARMATURE'}, add_leaf_bones=False,
                             bake_anim=True, bake_anim_use_all_bones=True, bake_anim_use_nla_strips=False,
                             bake_anim_use_all_actions=False, bake_anim_force_startend_keying=True,
                             bake_anim_simplify_factor=0.0, primary_bone_axis='Y', secondary_bone_axis='X',
                             apply_unit_scale=True, apply_scale_options='FBX_SCALE_NONE', global_scale=1.0)


def validate(name, outpath, expect, rng):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    objs = import_fbx(outpath)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    act = clip_action(arm)
    errs = []
    if len(arm.data.bones) != 48: errs.append('bones %d' % len(arm.data.bones))
    if arm.name != 'Armature': errs.append('armature name ' + arm.name)
    fr0, fr1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    n_frames = fr1 - fr0 + 1
    bad_loc, bad_nan, maxloc = 0, 0, 0.0
    sc = bpy.context.scene
    step = max(1, n_frames // 12)
    for f in range(fr0, fr1 + 1, step):
        sc.frame_set(f)
        for pb in arm.pose.bones:
            vals = list(pb.matrix_basis.translation) + list(pb.matrix_basis.to_quaternion())
            if any(math.isnan(v) or math.isinf(v) for v in vals): bad_nan += 1
            if pb.name != 'pelvis' and pb.matrix_basis.translation.length > 1e-4: bad_loc += 1; maxloc = max(maxloc, pb.matrix_basis.translation.length)
    if bad_nan: errs.append('non-finite %d' % bad_nan)
    if bad_loc: errs.append('translation on non-pelvis bones %d (max %.4f)' % (bad_loc, maxloc))
    if (fr1 - fr0) != (rng[1] - rng[0]): errs.append('frame range %d..%d vs %d..%d' % (fr0, fr1, rng[0], rng[1]))
    expected, expected_loc, mid = expect
    sc.frame_set(fr0 + (mid - rng[0]))
    worst = 0.0
    for nm, q in expected.items():
        r = arm.pose.bones[nm].matrix_basis.to_quaternion()
        worst = max(worst, math.degrees(q.rotation_difference(r).angle))
    locerr = (arm.pose.bones['pelvis'].matrix_basis.translation - expected_loc).length
    if worst > 0.5: errs.append('round-trip rotation error %.2f deg' % worst)
    if locerr > 0.003: errs.append('round-trip pelvis error %.4f m' % locerr)
    print('DEBUG', fr0, fr1, rng, mid, [round(v,3) for v in arm.pose.bones['upperarm_l'].matrix_basis.to_quaternion()], [round(v,3) for v in expected['upperarm_l']])
    print('VALIDATE', name, 'OK' if not errs else 'FAIL ' + '; '.join(errs), '| bones', len(arm.data.bones), 'frames', n_frames,
          'rt-rot %.3f deg rt-loc %.4f m' % (worst, locerr))
    return not errs


def preview(name, clip_fbx, outpng):
    """Contact sheet: 4 frames, front (top row) and side (bottom row), the Hyptile mesh on the retargeted clip, Workbench."""
    import numpy as np
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = 30
    robjs = import_fbx(RIG)
    arm = next(o for o in robjs if o.type == 'ARMATURE')
    for o in robjs:
        if o.type == 'EMPTY': bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    for o in robjs:
        if o.type == 'MESH':
            for k in list(o.data.shape_keys.key_blocks if o.data.shape_keys else [])[::-1]:
                o.shape_key_remove(k)
    new = import_fbx(clip_fbx)
    a_arm = next(o for o in new if o.type == 'ARMATURE')
    act = clip_action(a_arm)
    arm.animation_data_create()
    arm.animation_data.action = act
    if hasattr(act, 'slots') and act.slots: arm.animation_data.action_slot = act.slots[0]
    for o in new:
        data = o.data
        bpy.data.objects.remove(o, do_unlink=True)
        if isinstance(data, bpy.types.Armature): bpy.data.armatures.remove(data)
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    # foot check: lowest skinned vertex per frame against the rest pose (the feet must stand on the same floor)
    dg = bpy.context.evaluated_depsgraph_get()
    mesh_objs = [o for o in robjs if o.type == 'MESH']

    def min_z():
        dg = bpy.context.evaluated_depsgraph_get(); dg.update()
        return min(min((o.evaluated_get(dg).matrix_world @ v.co).z for v in o.evaluated_get(dg).data.vertices) for o in mesh_objs)

    arm.data.pose_position = 'REST'; scene.frame_set(f0)
    rest_floor = min_z()
    arm.data.pose_position = 'POSE'
    zs_ = []
    for f in range(f0, f1 + 1, max(1, (f1 - f0) // 24)):
        scene.frame_set(f); zs_.append(min_z() - rest_floor)
    print('FEET', name, 'lowest vertex vs rest floor: min %.3f max %.3f m' % (min(zs_), max(zs_)))
    # floor
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, -0.005))
    floor = bpy.context.active_object
    cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 2.05
    cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_shadows = True; sh.show_cavity = False
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('w'); scene.world.color = (0.62, 0.66, 0.72)
    W, H = 360, 440
    scene.render.resolution_x, scene.render.resolution_y = W, H
    scene.render.image_settings.file_format = 'PNG'
    nshots = 4
    picks = [f0 + int(round((f1 - f0) * i / nshots)) for i in range(nshots)]
    rows = []
    tmp = os.path.join(OUT, '_tmp.png')
    for view in ('front', 'side'):
        if view == 'front':
            cam.location = (0, -6, 0.8); cam.rotation_euler = (math.radians(90), 0, 0)
        else:
            cam.location = (6, 0, 0.8); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
        row = []
        for f in picks:
            scene.frame_set(f)
            scene.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(tmp)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
            bpy.data.images.remove(img)
            row.append(px)
        rows.append(np.concatenate(row, axis=1))
    sheet = np.concatenate(rows[::-1], axis=0)   # image rows are bottom-up: front on top
    out = bpy.data.images.new('sheet', width=W * nshots, height=H * 2, alpha=True)
    out.pixels = sheet.reshape(-1).tolist()
    out.filepath_raw = outpng; out.file_format = 'PNG'; out.save()
    os.remove(tmp)
    print('PREVIEW', outpng, 'frames', picks)


results = {}
for name, path, opts in CLIPS:
    try:
        tgt, src, act, rng, expect, robjs, cobjs = retarget(name, path, opts)
        outp = os.path.join(OUT, name + '.fbx')
        export_clip(name, tgt, robjs, cobjs, outp)
        ok = validate(name, outp, expect, rng)
        results[name] = ok
        print('RETARGETED', name, outp, os.path.getsize(outp))
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            preview(name, outp, os.path.join(PREVIEW, 'retarget-%s.png' % name))
    except Exception as e:
        import traceback; traceback.print_exc()
        results[name] = False
        print('FAILED', name, e)
print('SUMMARY', sum(1 for v in results.values() if v), '/', len(results), [k for k, v in results.items() if not v])
