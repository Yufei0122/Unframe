"""Export text prototypes in the existing CLIP image space; no training/download."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".local-ai" / "cache"
os.environ.setdefault("HF_HOME", str(CACHE / "huggingface"))
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"

import open_clip
import torch

PROMPTS = {
    "artwork": [
        "a photograph of a painting hanging on a museum wall",
        "a close-up of a framed painting",
        "a painting filling the picture",
        "a drawing or an art print",
        "an abstract geometric artwork",
        "a photograph of a sculpture or an art object",
    ],
    "background": [
        "a photograph of an empty wall",
        "a photograph of a museum entrance or building exterior",
        "a photograph of a corridor or an empty room",
        "a photograph of people walking in a room",
        "a blurry photograph of the floor or ceiling",
        "a photograph of a hand holding a phone",
        "a blank dark camera frame",
        "a photograph of outdoor scenery",
    ],
}

if __name__ == "__main__":
    torch.set_num_threads(4)
    model, _, _ = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="laion2b_s34b_b79k", device="cpu",
        precision="fp32", cache_dir=str(CACHE / "openclip"),
    )
    model.eval()
    tokenizer = open_clip.get_tokenizer("ViT-B-32")
    vectors = {}
    with torch.inference_mode():
        for group, prompts in PROMPTS.items():
            features = torch.nn.functional.normalize(model.encode_text(tokenizer(prompts)).float(), dim=-1)
            vectors[group] = torch.nn.functional.normalize(features.mean(dim=0), dim=-1).tolist()
    result = {"version": 1, "model": "ViT-B-32", "pretrained": "laion2b_s34b_b79k", "dimension": 512,
              "purpose": "Scene cue for auto capture only, never artwork identity or probability",
              "prompts": PROMPTS, "minimumSimilarity": 0.20, "minimumMargin": 0.015, "vectors": vectors}
    target = ROOT / "server" / "ai" / "artwork-detector.json"
    target.write_text(json.dumps(result, indent=2) + "\n")
    print(f"Exported offline text prototypes to {target}")
