"""Evaluate the existing Unframe OpenCLIP encoder on the identical Met pilot."""
import argparse
import json
import time
from pathlib import Path

import numpy as np

from met_training_data import save_json, sha256, validate_manifest
from model import load_encoder
from train_met import calibrate, load_image, metrics, rank


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--image-dir", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.run / "manifest.json").read_text(encoding="utf-8"))
    validate_manifest(manifest)
    training = json.loads((args.run / "report.json").read_text(encoding="utf-8"))
    if training.get("manifestSha256") != sha256(args.run / "manifest.json"):
        raise ValueError("Benchmark manifest changed after training")
    root = args.image_dir or Path(training["configuration"]["image_dir"])
    output = args.run / "openclip-comparison.json"
    if output.exists():
        raise ValueError("Comparison report already exists; preserve it and use another output run for a new experiment")
    embed, identity = load_encoder(allow_download=False)
    started = time.monotonic()
    arrays = {}
    timings = {}
    for split in ["gallery", "validation", "test"]:
        before = time.monotonic()
        values = []
        for index, row in enumerate(manifest[split], 1):
            values.append(embed(load_image(root / row["path"])))
            if index % 250 == 0:
                print(f"OPENCLIP {split}: {index}/{len(manifest[split])}", flush=True)
        arrays[split] = np.asarray(values, dtype=np.float32)
        timings[split] = round(time.monotonic() - before, 3)
    ids = np.array([row["id"] for row in manifest["gallery"]])
    vp, vs = rank(arrays["gallery"], ids, arrays["validation"])
    calibration = calibrate(vs, manifest["validation"])
    tp, ts = rank(arrays["gallery"], ids, arrays["test"])
    report = {"model": identity, "trainingPerformed": False, "verification": "Existing production encoder weights on the identical selected gallery and official query splits",
              "manifestSha256": sha256(args.run / "manifest.json"), "calibration": calibration,
              "validation": metrics(vp, vs, manifest["validation"], calibration["similarityThreshold"]),
              "test": metrics(tp, ts, manifest["test"], calibration["similarityThreshold"]),
              "timingsSeconds": timings, "elapsedSeconds": round(time.monotonic() - started, 2),
              "limitation": "Controlled comparison on a selected Met gallery. Does not establish all-artwork identification or that the current scanner has this larger gallery installed."}
    save_json(output, report)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
