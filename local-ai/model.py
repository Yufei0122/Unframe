"""One fixed OpenCLIP embedding space; downloads only public model weights."""
import gc
import os
from pathlib import Path

MODEL = "ViT-B-32"
PRETRAINED = "laion2b_s34b_b79k"
DIMENSIONS = 512
IDENTITY = {"model": MODEL, "pretrained": PRETRAINED, "dimensions": DIMENSIONS, "normalized": True}


def load_encoder(*, allow_download=False):
    # Set cache paths before importing Hugging Face / OpenCLIP.
    cache = Path(os.environ.get("OPENCLIP_CACHE_DIR", Path(__file__).resolve().parents[1] / ".local-ai" / "cache"))
    cache.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(cache / "huggingface"))
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    if not allow_download:
        # Normal server startup and inference must not contact model registries.
        # Only ai:setup's explicit download step is allowed to fetch weights.
        os.environ["HF_HUB_OFFLINE"] = "1"
    import torch
    import open_clip

    threads = int(os.environ.get("OPENCLIP_THREADS", "4"))
    if not 1 <= threads <= 32:
        raise ValueError("OPENCLIP_THREADS must be between 1 and 32")
    device = os.environ.get("OPENCLIP_DEVICE", "cpu")
    if device not in {"cpu", "cuda"}:
        raise ValueError("OPENCLIP_DEVICE must be cpu or cuda")
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA is unavailable; use OPENCLIP_DEVICE=cpu and CPU PyTorch.")
    torch.set_num_threads(threads)
    torch.set_num_interop_threads(1)
    try:
        model, _, preprocess = open_clip.create_model_and_transforms(
            MODEL, pretrained=PRETRAINED, device=device, precision="fp32", cache_dir=str(cache / "openclip")
        )
    except Exception as error:
        raise RuntimeError("OpenCLIP weights could not be loaded. Run npm.cmd run ai:setup; check free RAM and the local model cache.") from error
    model.eval()
    # Recognition only needs the vision tower. Release the unused text tower.
    visual = model.visual
    del model
    gc.collect()

    def embed(image):
        with torch.inference_mode():
            features = visual(preprocess(image).unsqueeze(0).to(device))
            features = torch.nn.functional.normalize(features.float(), p=2, dim=-1)
            if features.shape != (1, DIMENSIONS) or not torch.isfinite(features).all():
                raise RuntimeError("OpenCLIP returned an invalid embedding")
            return features[0].cpu().tolist()

    return embed, {**IDENTITY, "device": device, "threads": threads}
