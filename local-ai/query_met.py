"""Use a trained Met pilot and its matching gallery; never mix OpenCLIP vectors."""
import argparse
import json
import os
import time
import urllib.request
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps
from torch.nn import functional as F

from met_training_data import sha256
from train_met import EVAL_TRANSFORM, ROOT, load_adapter, rank


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path, help="Completed training output directory")
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--lookup", action="store_true", help="Look up returned object IDs in the public Met API; never uploads the photo")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--protocol", choices=["auto", "center224", "fit384"], default="auto")
    args = parser.parse_args()
    started = time.monotonic()
    if not 1 <= args.threads <= 32:
        parser.error("--threads must be between 1 and 32")
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    os.environ.setdefault("TORCH_HOME", str(ROOT / ".local-ai" / "cache" / "torch"))
    checksum = sha256(args.run / "adapter.pt")
    protocol = args.protocol
    if protocol == "auto":
        selection = args.run / "fullframe-validation-selection.json"
        completed = (args.run / "fullframe-comparison.json").is_file()
        protocol = json.loads(selection.read_text(encoding="utf-8"))["selectedTrainedProtocol"] if completed and selection.is_file() else "center224"
    gallery_file = "gallery-fit384.npz" if protocol == "fit384" else "gallery.npz"
    calibration = None
    with np.load(args.run / gallery_file, allow_pickle=False) as source:
        if source["checkpointSha256"].item() != checksum:
            raise ValueError("Gallery was encoded by another checkpoint; rebuild it before querying")
        gallery, ids = source["features"], source["ids"]
        if protocol == "fit384":
            if source["transform"].item() != "fit384":
                raise ValueError("Gallery uses another image preprocessing protocol")
            calibration = json.loads(source["calibrationJson"].item())
    model, saved = load_adapter(args.run / "adapter.pt")
    calibration = calibration or saved["calibration"]
    with Image.open(args.image) as source:
        if source.width * source.height > 32_000_000:
            raise ValueError("Image exceeds 32 megapixels")
        photo = ImageOps.exif_transpose(source).convert("RGB")
    model_ready = time.monotonic()
    if protocol == "fit384":
        from evaluate_met_fullframe import fit384
        tensor = fit384(photo)
    else:
        tensor = EVAL_TRANSFORM(photo)
    with torch.inference_mode():
        vector = F.normalize(model(tensor.unsqueeze(0)), dim=1).numpy()
    predictions, scores = rank(gallery, ids, vector)
    matched = bool(scores[0, 0] >= calibration["similarityThreshold"])
    result = {"identityStatus": "possible_match" if matched else "unidentified", "checkpointSha256": checksum,
              "similarityThreshold": calibration["similarityThreshold"], "protocol": protocol, "candidates": [],
              "retrievalMs": round(1000 * (time.monotonic() - model_ready), 2),
              "startupAndRetrievalMs": round(1000 * (time.monotonic() - started), 2),
              "note": "Cosine similarity is not an identity probability. Candidates belong only to the selected pilot gallery."}
    for identity, similarity in zip(predictions[0], scores[0]):
        row = {"metObjectId": int(identity), "cosineSimilarity": float(similarity), "sourceUrl": f"https://www.metmuseum.org/art/collection/search/{identity}"}
        if args.lookup:
            try:
                url = f"https://collectionapi.metmuseum.org/public/collection/v1/objects/{int(identity)}"
                with urllib.request.urlopen(url, timeout=10) as response:
                    record = json.load(response)
                if record.get("objectID") != int(identity):
                    raise ValueError("Public source returned another object")
                row.update({"title": record.get("title"), "artist": record.get("artistDisplayName") or None, "date": record.get("objectDate"), "metadataSource": url})
            except Exception as error:
                row["metadataUnavailable"] = type(error).__name__
        result["candidates"].append(row)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
