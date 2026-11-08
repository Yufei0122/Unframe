"""Export and evaluate the cached OpenCLIP baseline as a usable offline index."""
import argparse
import json
from pathlib import Path

import numpy as np

from met_training_data import save_json, sha256
from model import MODEL, PRETRAINED
from train_met import calibrate, metrics, rank
from train_met_expanded import write_predictions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    args = parser.parse_args()
    run = args.run
    if (run / "openclip-inference.json").exists():
        raise ValueError("Preserve the existing exported index")
    report = json.loads((run / "openclip-comparison.json").read_text(encoding="utf-8"))
    manifest_sha = sha256(run / "manifest.json")
    if manifest_sha != report["manifestSha256"] or report["model"]["model"] != MODEL or report["model"]["pretrained"] != PRETRAINED:
        raise ValueError("Comparison uses another dataset or encoder")
    manifest = json.loads((run / "manifest.json").read_text(encoding="utf-8"))
    arrays, cache_hashes = {}, {}
    for split in ["gallery", "validation", "test"]:
        path = run / ("openclip-features-" + split + ".npy")
        cache_hashes[split] = sha256(path)
        arrays[split] = np.load(path, allow_pickle=False)
        if arrays[split].shape != (len(manifest[split]), 512) or not np.isfinite(arrays[split]).all():
            raise ValueError("Invalid OpenCLIP cache dimensions or values")
        if not np.allclose(np.linalg.norm(arrays[split], axis=1), 1., atol=.001):
            raise ValueError("OpenCLIP cache is not normalised")
    gallery = arrays["gallery"].astype(np.float16)
    ids = np.array([row["id"] for row in manifest["gallery"]])
    vp, vs = rank(gallery, ids, arrays["validation"])
    calibration = calibrate(vs, manifest["validation"])
    # Precision changes have their own validation calibration before test ranking.
    save_json(run / "openclip-export-selection.json", {"calibration": calibration, "storage": "float16", "selectedOn": "validation unknowns only"})
    tp, ts = rank(gallery, ids, arrays["test"])
    index = run / "openclip-gallery.npz"
    np.savez_compressed(index, features=gallery, ids=ids, model=np.array(MODEL), pretrained=np.array(PRETRAINED),
                        calibrationJson=np.array(json.dumps(calibration)))
    inference = {"version": 1, "provider": "openclip", "model": MODEL, "pretrained": PRETRAINED, "dimensions": 512, "normalized": True,
                 "protocol": "openclip_eval", "galleryFile": index.name, "gallerySha256": sha256(index), "manifestSha256": manifest_sha}
    save_json(run / "openclip-inference.json", inference)
    write_predictions(run / "openclip-index-predictions.json", manifest["test"], tp, ts, calibration["similarityThreshold"])
    result = {"manifestSha256": manifest_sha, "sourceComparisonSha256": sha256(run / "openclip-comparison.json"),
              "model": report["model"], "storage": "float16", "featureCacheSha256": cache_hashes, "calibration": calibration,
              "validation": metrics(vp, vs, manifest["validation"], calibration["similarityThreshold"]),
              "test": metrics(tp, ts, manifest["test"], calibration["similarityThreshold"]), "inference": inference,
              "trainingPerformed": False, "sourceSha256": sha256(Path(__file__)),
              "limitation": "Export of existing frozen OpenCLIP weights, not a fine-tuning gain. Tested at actual shipped precision on the same exploratory benchmark."}
    save_json(run / "openclip-export-report.json", result)
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
