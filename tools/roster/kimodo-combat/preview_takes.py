"""
Wave 19D: pick the best seed of a combat clip before the slow per-character pipeline. Every take in
kimodo_roster/<Name>/takes/*.bvh is converted (kimodo_bvh_to_bip01.py, --in-place / --loop from combat_clips.json),
retargeted onto Hyptile in ONE retarget.py run with the pipeline's settings (no arm-collision fix), and drawn as one
review sheet (front and side rows per take, top to bottom in take order):

    <python> preview_takes.py <Name> <work_dir> [take filter, e.g. s191]   ->  <work_dir>/<Name>/takes.png
One Blender job at a time (Blender is shared).
"""

import glob
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KT = r"D:\fishing game\tools\kimodo_text_encoder_setup"
BLENDER = r"D:\blender\blender.exe"
RETARGET = os.path.join(os.path.dirname(HERE), "retarget.py")
RIG = r"D:\fishing game\Assets\HyptileEyes\exports\SK_Hyptile_Eyes.fbx"
IDLE = os.path.join(os.path.dirname(HERE), "retargeted", "Idle_Breathe.fbx")
ROOT = r"D:\fishing game\Assets\HyptileMotion\kimodo_roster"

name, work = sys.argv[1], os.path.abspath(sys.argv[2])
clip = next(c for c in json.load(open(os.path.join(HERE, "combat_clips.json"), encoding="utf-8"))["clips"] if c["name"] == name)
out = os.path.join(work, name)
os.makedirs(os.path.join(out, "rt"), exist_ok=True)
takes = sorted(glob.glob(os.path.join(ROOT, name, "takes", "*" + (sys.argv[3] if len(sys.argv) > 3 else "") + "*.bvh")))
specs = []
for bvh in takes:
    label = os.path.splitext(os.path.basename(bvh))[0]
    fbx = os.path.join(out, label + ".bip01.fbx")
    cmd = [BLENDER, "-b", "--factory-startup", "--python", os.path.join(KT, "kimodo_bvh_to_bip01.py"), "--", bvh, fbx]
    if clip.get("in_place"):
        cmd.append("--in-place")
    if clip.get("loop"):
        cmd.append(f"--loop={clip['loop']}")
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(fbx):
        specs.append(f"{label}={fbx}" + ("|loop" if clip.get("loop") else ""))
env = dict(os.environ, SRC_STAND_PELVIS_Z="1.005", TWIST_ALIGN="1", ARM_ABDUCT="0", ELBOW_BEND="0", FINGERS_FROM=IDLE)
log = open(os.path.join(out, "retarget.log"), "w", encoding="utf-8", errors="replace")
subprocess.run([BLENDER, "-b", "--python", RETARGET, "--", RIG, os.path.join(out, "rt")] + specs, stdout=log, stderr=subprocess.STDOUT, env=env)
rows = [f"{s.split('=')[0]}|{RIG}|{os.path.join(out, 'rt', s.split('=')[0] + '.fbx')}" for s in specs]
rows = [r for r in rows if os.path.exists(r.split("|")[2])]
log = open(os.path.join(out, "review.log"), "w", encoding="utf-8", errors="replace")
subprocess.run([BLENDER, "-b", "--python", os.path.join(KT, "review_sheet.py"), "--", os.path.join(out, "takes" + (sys.argv[3] if len(sys.argv) > 3 else "") + ".png"), "7"] + rows,
               stdout=log, stderr=subprocess.STDOUT)
print("TAKES", name, [r.split("|")[0] for r in rows], os.path.join(out, "takes" + (sys.argv[3] if len(sys.argv) > 3 else "") + ".png"))
