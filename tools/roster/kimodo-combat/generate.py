"""
Wave 19D, step 3 of 3: one Kimodo take per (clip, seed[, alt prompt]) of combat_clips.json through ComfyUI (127.0.0.1:8188,
a minimal graph: LoadModel -> TextEncode -> Sampler -> ExportBVH) with the text encoder (or cached_encoder_server.py) on
127.0.0.1:9550. Each finished BVH is copied to
    D:\\fishing game\\Assets\\HyptileMotion\\kimodo_roster\\<Name>\\takes\\<Name>_s<seed>[a].bvh
which kimodo_clip_pipeline.py --bvh takes. A take counts only when its BVH from THIS run exists (check the artifact).

    <python> generate.py <comfy_output_dir> [--alt] [--seeds 1901,1902] [Name ...]
"""

import argparse
import glob
import json
import os
import shutil
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
COMFY = "http://127.0.0.1:8188"
ROOT = r"D:\fishing game\Assets\HyptileMotion\kimodo_roster"


def post(path, payload):
    req = urllib.request.Request(COMFY + path, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def get(path):
    return json.load(urllib.request.urlopen(COMFY + path, timeout=60))


def graph(prefix, prompt, seconds, seed):
    return {
        "1": {"class_type": "Kimodo_LoadModel", "inputs": {"model": "Kimodo-SOMA-RP-v1"}},
        "2": {"class_type": "Kimodo_TextEncode", "inputs": {"model": ["1", 0], "prompt": prompt}},
        "3": {"class_type": "Kimodo_Sampler", "inputs": {"model": ["1", 0], "conditioning": ["2", 0], "duration": seconds,
                                                          "seed": seed, "num_samples": 1, "diffusion_steps": 100, "constraints_json": ""}},
        "7": {"class_type": "Kimodo_ExportBVH", "inputs": {"motion": ["3", 0], "filename_prefix": prefix, "sample_index": 0}},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out_dir")
    ap.add_argument("names", nargs="*")
    ap.add_argument("--alt", action="store_true", help="use the clip's alternate prompt (suffix 'a')")
    ap.add_argument("--seeds")
    a = ap.parse_args()
    spec = json.load(open(os.path.join(HERE, "combat_clips.json"), encoding="utf-8"))
    seeds = [int(s) for s in a.seeds.split(",")] if a.seeds else spec["seeds"]
    clips = [c for c in spec["clips"] if not a.names or c["name"] in a.names]
    for c in clips:
        prompt = c["alt"] if a.alt else c["prompt"]
        for seed in (seeds if a.seeds else c.get("seeds", seeds)):
            label = f"{c['name']}_s{seed}{'a' if a.alt else ''}"
            dst_dir = os.path.join(ROOT, c["name"], "takes")
            dst = os.path.join(dst_dir, label + ".bvh")
            if os.path.exists(dst):
                print("HAVE", dst, flush=True)
                continue
            since = time.time() - 1
            t0 = time.time()
            pid = post("/prompt", {"prompt": graph(f"w19_{label}__", prompt, c["seconds"], seed), "client_id": "hyptile-w19d"})["prompt_id"]
            while True:
                time.sleep(2)
                h = get("/history/" + pid)
                if pid in h:
                    st = h[pid]["status"]["status_str"]
                    break
                if time.time() - t0 > 900:
                    st = "timeout"
                    break
            hits = [p for p in glob.glob(os.path.join(a.out_dir, f"w19_{label}__*.bvh")) if os.path.getmtime(p) >= since]
            if st != "success" or not hits:
                print("FAILED", label, st, "bvh" if hits else "no bvh", flush=True)
                continue
            os.makedirs(dst_dir, exist_ok=True)
            shutil.copyfile(max(hits, key=os.path.getmtime), dst)
            print("TAKE", label, f"{time.time() - t0:.0f}s", dst, flush=True)


if __name__ == "__main__":
    sys.exit(main())
