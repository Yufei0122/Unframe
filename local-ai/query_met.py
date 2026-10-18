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
from met_catalogue import load_local_catalogue
from model import MODEL, PRETRAINED, load_encoder
from train_met import EVAL_TRANSFORM, ROOT, load_adapter, rank


def load_gallery(run, checksum, requested="auto"):
    protocol = requested
    manifest_sha = None
    inference_path = run / "inference.json"
    if inference_path.is_file():
        inference = json.loads(inference_path.read_text(encoding="utf-8"))
        if inference.get("version") != 1 or inference.get("protocol") != "fit384" or inference.get("galleryFile") != "gallery-fit384.npz":
            raise ValueError("Unsupported inference manifest")
        if inference["checkpointSha256"] != checksum:
            raise ValueError("Inference manifest uses another checkpoint")
        if requested not in ("auto", inference["protocol"]):
            raise ValueError("This run provides only the full-frame fit384 gallery")
        protocol = inference["protocol"]
        manifest_sha = inference["manifestSha256"]
        if sha256(run / "manifest.json") != manifest_sha:
            raise ValueError("Reference manifest checksum failed")
        if sha256(run / inference["galleryFile"]) != inference["gallerySha256"]:
            raise ValueError("Gallery file checksum failed")
    elif protocol == "auto":
        selection = run / "fullframe-validation-selection.json"
        completed = (run / "fullframe-comparison.json").is_file()
        protocol = json.loads(selection.read_text(encoding="utf-8"))["selectedTrainedProtocol"] if completed and selection.is_file() else "center224"
    if protocol not in ("center224", "fit384"):
        raise ValueError("Unsupported image preprocessing protocol")
    gallery_file = "gallery-fit384.npz" if protocol == "fit384" else "gallery.npz"
    calibration = None
    with np.load(run / gallery_file, allow_pickle=False) as source:
        if source["checkpointSha256"].item() != checksum:
            raise ValueError("Gallery was encoded by another checkpoint; rebuild it before querying")
        gallery, ids = source["features"], source["ids"]
        if protocol == "fit384":
            if source["transform"].item() != "fit384":
                raise ValueError("Gallery uses another image preprocessing protocol")
            calibration = json.loads(source["calibrationJson"].item())
    return protocol, gallery, ids, calibration, manifest_sha


def load_openclip_gallery(run):
    inference = json.loads((run / "openclip-inference.json").read_text(encoding="utf-8"))
    expected = {"version": 1, "provider": "openclip", "model": MODEL, "pretrained": PRETRAINED,
                "dimensions": 512, "normalized": True, "protocol": "openclip_eval", "galleryFile": "openclip-gallery.npz"}
    if any(inference.get(key) != value for key, value in expected.items()):
        raise ValueError("Incompatible OpenCLIP inference manifest")
    if sha256(run / "manifest.json") != inference["manifestSha256"] or sha256(run / "openclip-gallery.npz") != inference["gallerySha256"]:
        raise ValueError("OpenCLIP reference/index checksum failed")
    with np.load(run / "openclip-gallery.npz", allow_pickle=False) as source:
        if source["model"].item() != MODEL or source["pretrained"].item() != PRETRAINED:
            raise ValueError("OpenCLIP index uses another embedding space")
        gallery, ids = source["features"], source["ids"]
        calibration = json.loads(source["calibrationJson"].item())
    if gallery.ndim != 2 or gallery.shape[1] != 512 or len(ids) != len(gallery):
        raise ValueError("Invalid OpenCLIP index dimensions")
    return gallery, ids, calibration, inference["manifestSha256"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path, help="Completed training output directory")
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument("--lookup", action="store_true", help="Look up returned object IDs in the public Met API; never uploads the photo")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--encoder", choices=["met", "openclip"], default="met")
    parser.add_argument("--protocol", choices=["auto", "center224", "fit384"], default="auto")
    args = parser.parse_args()
    started = time.monotonic()
    if not 1 <= args.threads <= 32:
        parser.error("--threads must be between 1 and 32")
    checksum = None
    if args.encoder == "met":
        torch.set_num_threads(args.threads)
        torch.set_num_interop_threads(1)
        os.environ.setdefault("TORCH_HOME", str(ROOT / ".local-ai" / "cache" / "torch"))
        checksum = sha256(args.run / "adapter.pt")
        protocol, gallery, ids, calibration, manifest_sha = load_gallery(args.run, checksum, args.protocol)
        model, saved = load_adapter(args.run / "adapter.pt")
        calibration = calibration or saved["calibration"]
    else:
        if args.protocol != "auto":
            parser.error("OpenCLIP supplies its own preprocessing; use --protocol auto")
        gallery, ids, calibration, manifest_sha = load_openclip_gallery(args.run)
        os.environ["OPENCLIP_THREADS"] = str(args.threads)
        embed, _ = load_encoder(allow_download=False)
        protocol = "openclip_eval"
    catalogue = load_local_catalogue(args.run, manifest_sha)
    with Image.open(args.image) as source:
        if source.width * source.height > 32_000_000:
            raise ValueError("Image exceeds 32 megapixels")
        photo = ImageOps.exif_transpose(source).convert("RGB")
    model_ready = time.monotonic()
    if args.encoder == "openclip":
        vector = np.asarray([embed(photo)], dtype=np.float32)
    else:
        if protocol == "fit384":
            from evaluate_met_fullframe import fit384
            tensor = fit384(photo)
        else:
            tensor = EVAL_TRANSFORM(photo)
        with torch.inference_mode():
            vector = F.normalize(model(tensor.unsqueeze(0)), dim=1).numpy()
    predictions, scores = rank(gallery, ids, vector)
    matched = bool(scores[0, 0] >= calibration["similarityThreshold"])
    result = {"identityStatus": "possible_match" if matched else "unidentified", "checkpointSha256": checksum, "encoder": args.encoder,
              "similarityThreshold": calibration["similarityThreshold"], "protocol": protocol, "candidates": [],
              "retrievalMs": round(1000 * (time.monotonic() - model_ready), 2),
              "startupAndRetrievalMs": round(1000 * (time.monotonic() - started), 2),
              "note": "Cosine similarity is not an identity probability. Candidates belong only to this run's reference gallery. Timings exclude Python imports and catalogue lookups."}
    for identity, similarity in zip(predictions[0], scores[0]):
        row = {"metObjectId": int(identity), "cosineSimilarity": float(similarity), "sourceUrl": f"https://www.metmuseum.org/art/collection/search/{identity}"}
        local = catalogue.get(str(int(identity)))
        if local:
            row.update({"title": local["title"], "artist": local["artist"], "date": local["date"], "metadataSource": "local_met_openaccess_catalogue"})
        if args.lookup and not local:
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
