import json
from PIL import Image
from model import load_encoder

print("Downloading/verifying OpenCLIP ViT-B-32 / laion2b_s34b_b79k (public weights).", flush=True)
embed, identity = load_encoder(allow_download=True)
vector = embed(Image.new("RGB", (224, 224), "white"))
assert len(vector) == 512 and abs(sum(x * x for x in vector) - 1) < 0.001
print(json.dumps({"openclip": "ready", **identity}), flush=True)
