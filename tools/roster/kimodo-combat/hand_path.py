"""
Wave 19D: the hands' path through a retargeted clip, to pick seeds and contact frames by numbers as well as by eye.
    blender -b --python hand_path.py -- <rig.fbx> <clip.fbx> [<clip.fbx> ...]
Prints per clip and frame (every 2nd): time, the right and left wrist in the character's frame (x + = its left, y up, z
forward, metres from the root) and the right wrist's speed (m/s); then the frame of the fastest right wrist.
"""

import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
RIG, CLIPS = argv[0], argv[1:]


def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True, automatic_bone_orientation=False, ignore_leaf_bones=False)
    return [o for o in bpy.data.objects if o not in before]


for clip in CLIPS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30
    arm = next(o for o in imp(RIG) if o.type == "ARMATURE")
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    new = imp(clip)
    act = next(o for o in new if o.type == "ARMATURE").animation_data.action
    arm.animation_data_create()
    arm.animation_data.action = act
    if hasattr(act, "slots") and act.slots:
        arm.animation_data.action_slot = act.slots[0]
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    f0, f1 = int(round(act.frame_range[0])), int(round(act.frame_range[1]))
    rows, prev, best = [], None, (0, f0)
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        mw = arm.matrix_world
        p = {s: mw @ arm.pose.bones["hand_" + s].head for s in "rl"}
        g = {s: (p[s].x, p[s].z, -p[s].y) for s in "rl"}
        v = 0.0 if prev is None else ((g["r"][0] - prev[0]) ** 2 + (g["r"][1] - prev[1]) ** 2 + (g["r"][2] - prev[2]) ** 2) ** 0.5 * 30
        prev = g["r"]
        if v > best[0]:
            best = (v, f)
        if (f - f0) % 2 == 0:
            rows.append(f"  t {(f - f0) / 30:4.2f}  R {g['r'][0]:+.2f} {g['r'][1]:.2f} {g['r'][2]:+.2f}  L {g['l'][0]:+.2f} {g['l'][1]:.2f} {g['l'][2]:+.2f}  vR {v:4.1f}")
    print("CLIP", clip.replace("\\", "/").split("/")[-1], "frames", f0, f1)
    print("\n".join(rows))
    print(f"PEAK R {best[0]:.1f} m/s at t {(best[1] - f0) / 30:.2f}")
