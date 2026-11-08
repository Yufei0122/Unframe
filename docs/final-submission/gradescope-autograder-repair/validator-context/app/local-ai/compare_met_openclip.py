"""Evaluate the existing Unframe OpenCLIP encoder on the identical Met pilot."""
import argparse
import json
import os
import time
from pathlib import Path

import numpy as np

from met_training_data import save_json, sha256, validate_manifest
from model import load_encoder
from train_met import calibrate, load_image, metrics, rank
from train_met_expanded import write_predictions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--image-dir", type=Path)
    parser.add_argument("--batch-size", type=int, default=16)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 64:
        parser.error("--batch-size must be between 1 and 64")
    manifest = json.loads((args.run / "manifest.json").read_text(encoding="utf-8"))
    validate_manifest(manifest)
    training = json.loads((args.run / "report.json").read_text(encoding="utf-8"))
    if training.get("manifestSha256") != sha256(args.run / "manifest.json"):
        raise ValueError("Benchmark manifest changed after training")
    root = args.image_dir or Path(training["configuration"]["image_dir"])
    output = args.run / "openclip-comparison.json"
    if output.exists():
        raise ValueError("Comparison report already exists; preserve it and use another output run for a new experiment")
    embed, identity = load_encoder(allow_download=False, batch=True)
    started = time.monotonic()
    arrays = {}
    timings = {}
    for split in ["gallery", "validation", "test"]:
        before = time.monotonic()
        values = []
        for offset in range(0, len(manifest[split]), args.batch_size):
            rows = manifest[split][offset:offset + args.batch_size]
            values.append(embed([load_image(root / row["path"]) for row in rows]))
            if offset // 1000 != (offset + len(rows)) // 1000:
                print(f"OPENCLIP {split}: {offset+len(rows)}/{len(manifest[split])}", flush=True)
        arrays[split] = np.concatenate(values).astype(np.float32)
        np.save(args.run / ("openclip-features-" + split + ".npy"), arrays[split])
        timings[split] = round(time.monotonic() - before, 3)
    ids = np.array([row["id"] for row in manifest["gallery"]])
    vp, vs = rank(arrays["gallery"], ids, arrays["validation"])
    calibration = calibrate(vs, manifest["validation"])
    tp, ts = rank(arrays["gallery"], ids, arrays["test"])
    write_predictions(args.run / "openclip-predictions.json", manifest["test"], tp, ts, calibration["similarityThreshold"])
    report = {"model": identity, "trainingPerformed": False, "verification": "Existing production encoder weights on the identical selected gallery and official query splits",
              "manifestSha256": sha256(args.run / "manifest.json"), "calibration": calibration,
              "validation": metrics(vp, vs, manifest["validation"], calibration["similarityThreshold"]),
              "test": metrics(tp, ts, manifest["test"], calibration["similarityThreshold"]),
              "timingsSeconds": timings, "elapsedSeconds": round(time.monotonic() - started, 2), "benchmarkBatchSize": args.batch_size,
              "blasThreadsEnvironment": os.environ.get("OPENBLAS_NUM_THREADS"),
              "sourceSha256": {name: sha256(Path(__file__).with_name(name)) for name in ["compare_met_openclip.py", "model.py", "train_met.py", "train_met_expanded.py"]},
              "limitation": "Controlled comparison on a selected Met gallery. Does not establish all-artwork identification or that the current scanner has this larger gallery installed."}
    save_json(output, report)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
