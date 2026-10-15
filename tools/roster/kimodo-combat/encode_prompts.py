"""
Wave 19D, step 1 of 3: encode every prompt of combat_clips.json ONCE with the real Kimodo text encoder (LLM2Vec on
Llama-3-8B, the CPU server start_text_encoder.cmd on 127.0.0.1:9550, ~17 GB RAM) and keep the embeddings, so the encoder can
be stopped before ComfyUI starts (the two do not fit this machine's RAM together while other work runs).
cached_encoder_server.py then serves these embeddings on the same port and API to ComfyUI.

    <ComfyUI venv python> encode_prompts.py <cache_dir> [clips.json]
Writes <cache_dir>/<sha1 of the prompt>.npy and <cache_dir>/index.json { prompt: file }.
"""

import hashlib
import json
import os
import shutil
import sys
import time

import numpy as np
from gradio_client import Client

HERE = os.path.dirname(os.path.abspath(__file__))
cache = os.path.abspath(sys.argv[1])
spec = json.load(open(sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "combat_clips.json"), encoding="utf-8"))
os.makedirs(cache, exist_ok=True)
idx_path = os.path.join(cache, "index.json")
index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}

client = Client("http://127.0.0.1:9550/", verbose=False)
for c, text in [(c, t) for c in spec["clips"] for t in (c["prompt"], c.get("alt")) if t]:
    if text in index and os.path.exists(os.path.join(cache, index[text])):
        print("CACHED", c["name"])
        continue
    t0 = time.time()
    fname = hashlib.sha1(text.encode("utf-8")).hexdigest() + ".npy"
    res = client.predict(text=text, filename=fname, api_name="/DemoWrapper")
    src = res[0]["value"]
    emb = np.load(src)
    assert emb.ndim == 2 and emb.shape[-1] == 4096 and np.isfinite(emb).all(), emb.shape
    shutil.copyfile(src, os.path.join(cache, fname))
    index[text] = fname
    json.dump(index, open(idx_path, "w", encoding="utf-8"), indent=1)
    print("ENCODED", c["name"], emb.shape, f"{time.time() - t0:.1f}s")
print("DONE", len(index))
