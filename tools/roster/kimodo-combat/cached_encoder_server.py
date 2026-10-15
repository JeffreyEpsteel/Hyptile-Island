"""
Wave 19D, step 2 of 3: a stand-in for Kimodo's text-encoder server (kimodo.scripts.run_text_encoder_server) that answers
from the embeddings encode_prompts.py saved, on the same port (127.0.0.1:9550) and the same Gradio API (/DemoWrapper:
text, filename -> a DownloadButton with the .npy path), so ComfyUI's TextEncoderAPI client works unchanged while the 17 GB
Llama encoder is not loaded. An unknown prompt fails loudly (no silent zero embedding).

    <ComfyUI venv python> cached_encoder_server.py <cache_dir>
The cache_dir must lie under %TEMP% (Gradio only serves files from the cwd or the temp dir).
"""

import json
import os
import shutil
import sys

import gradio as gr
import numpy as np

cache = os.path.abspath(sys.argv[1])
index = json.load(open(os.path.join(cache, "index.json"), encoding="utf-8"))
out_dir = os.path.join(cache, "served")
os.makedirs(out_dir, exist_ok=True)


def demo_wrapper(text, filename):
    if text == "healthcheck":
        # kimodo's TEXT_ENCODER_MODE=auto probe (load_model._select_text_encoder_conf): any embedding of the right width
        path = os.path.join(out_dir, os.path.basename(filename))
        np.save(path, np.zeros((1, 4096), dtype=np.float32))
        return gr.DownloadButton(visible=True, value=path), gr.Markdown(visible=True), gr.Markdown(visible=True)
    if text not in index:
        raise gr.Error("prompt not in the embedding cache: " + text[:80])
    path = os.path.join(out_dir, os.path.basename(filename))
    shutil.copyfile(os.path.join(cache, index[text]), path)
    print("SERVED", text[:60], flush=True)
    return gr.DownloadButton(visible=True, value=path), gr.Markdown(visible=True), gr.Markdown(visible=True, value="Text: " + text)


with gr.Blocks(title="Text encoder (cached)") as demo:
    text = gr.Textbox(label="Text prompt")
    filename = gr.Textbox(visible=False, value="embedding.npy")
    btn = gr.Button("Encode")
    title = gr.Markdown(visible=False)
    shown = gr.Markdown(visible=False)
    download = gr.DownloadButton("Download", visible=False)
    btn.click(fn=demo_wrapper, inputs=[text, filename], outputs=[download, title, shown], api_name="DemoWrapper")

demo.launch(server_name="127.0.0.1", server_port=9550)
