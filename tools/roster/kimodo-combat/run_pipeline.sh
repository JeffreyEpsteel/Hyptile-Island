#!/bin/sh
# Wave 19D: every accepted take of combat_clips.json through the approved roster pipeline (kimodo_clip_pipeline.py: convert,
# retarget, the per-character arm-collision fix for all eight, review.png), one clip at a time (Blender is shared).
#   sh tools/roster/kimodo-combat/run_pipeline.sh [Name ...]
PY="D:/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI/.venv/Scripts/python.exe"
KP="D:/fishing game/tools/kimodo_text_encoder_setup/kimodo_clip_pipeline.py"
HERE=$(dirname "$0")
"$PY" - "$HERE/combat_clips.json" "$@" <<'PYEOF' | tr -d '\r' | while IFS="|" read -r name bvh opts; do
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
for c in d["clips"]:
    if not c.get("take") or (len(sys.argv) > 2 and c["name"] not in sys.argv[2:]):
        continue
    bvh = rf"D:\fishing game\Assets\HyptileMotion\kimodo_roster\{c['name']}\takes\{c['name']}_{c['take']}.bvh"
    opts = (" --in-place" if c.get("in_place") else "") + (f" --loop {c['loop']}" if c.get("loop") else "")
    print(f"{c['name']}|{bvh}|{opts}")
PYEOF
	echo "== $name $(date +%H:%M)"
	"$PY" "$KP" "$name" --bvh "$bvh" --tag w19 $opts 2>&1 | tail -2
done
