"""Check full-frame inference for the fully convolutional Met GeM encoder."""
import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import torch
from PIL import ImageOps
from torch.nn import functional as F
from torchvision import transforms

from met_training_data import save_json, sha256
from train_met import NORMALIZE, ROOT, calibrate, encoder, load_adapter, load_image, metrics, rank


def fit384(image):
    # Preserve every edge of the painting/label and its aspect ratio. GeM accepts
    # variable spatial sizes, so no padding or square centre crop is necessary.
    return NORMALIZE(transforms.ToTensor()(ImageOps.contain(image, (384, 384))))


def encode(model, root, rows, label):
    values = []
    started = time.monotonic()
    with torch.inference_mode():
        for index, row in enumerate(rows, 1):
            image = fit384(load_image(root / row["path"]))
            values.append(F.normalize(model(image.unsqueeze(0)).float(), dim=1).numpy()[0])
            if index % 500 == 0:
                print(f"FULL FRAME {label}: {index}/{len(rows)}", flush=True)
    result = np.asarray(values)
    if not np.isfinite(result).all():
        raise ValueError("Non-finite full-frame descriptors")
    return result, round(time.monotonic() - started, 3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--image-dir", type=Path, help="Override the original run's image cache location")
    args = parser.parse_args()
    training = json.loads((args.run / "report.json").read_text(encoding="utf-8"))
    if training["status"] != "completed" or training["configuration"].get("initialization") != "met":
        raise ValueError("Full-frame comparison requires a completed Met-initialised run")
    output = args.run / "fullframe-comparison.json"
    if output.exists():
        raise ValueError("Preserve the existing full-frame report")
    manifest = json.loads((args.run / "manifest.json").read_text(encoding="utf-8"))
    if sha256(args.run / "manifest.json") != training["manifestSha256"]:
        raise ValueError("Dataset changed after training")
    root = args.image_dir or Path(training["configuration"]["image_dir"])
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    os.environ.setdefault("TORCH_HOME", str(ROOT / ".local-ai" / "cache" / "torch"))
    checkpoint_sha = sha256(args.run / "adapter.pt")
    candidates = {}
    arrays = {}
    # All validation variants are evaluated before opening either new test run.
    for name, model in [("published_met", encoder("met").eval()), ("continued_training", load_adapter(args.run / "adapter.pt")[0])]:
        gallery, gallery_seconds = encode(model, root, manifest["gallery"], name + " gallery")
        validation, validation_seconds = encode(model, root, manifest["validation"], name + " validation")
        vp, vs = rank(gallery, np.array([row["id"] for row in manifest["gallery"]]), validation)
        calibration = calibrate(vs, manifest["validation"])
        candidates[name] = {"validation": metrics(vp, vs, manifest["validation"], calibration["similarityThreshold"]), "calibration": calibration,
                            "timingsSeconds": {"gallery": gallery_seconds, "validation": validation_seconds}}
        arrays[name] = (model, gallery)
    center_validation = training["epochs"][training["selectedEpoch"] - 1]["validation"]
    selected = "fit384" if candidates["continued_training"]["validation"]["knownTop1Accuracy"] > center_validation["knownTop1Accuracy"] else "center224"
    selection = {"selectedTrainedProtocol": selected, "criterion": "validation known Top1 only, before evaluating full-frame tests", "center224Validation": center_validation}
    save_json(args.run / "fullframe-validation-selection.json", selection)
    for name, (model, gallery) in arrays.items():
        query, seconds = encode(model, root, manifest["test"], name + " test")
        tp, ts = rank(gallery, np.array([row["id"] for row in manifest["gallery"]]), query)
        candidates[name]["test"] = metrics(tp, ts, manifest["test"], candidates[name]["calibration"]["similarityThreshold"])
        candidates[name]["timingsSeconds"]["test"] = seconds
        if name == "continued_training":
            np.savez_compressed(args.run / "gallery-fit384.npz", features=gallery, ids=np.array([row["id"] for row in manifest["gallery"]]),
                                checkpointSha256=np.array(checkpoint_sha), transform=np.array("fit384"),
                                calibrationJson=np.array(json.dumps(candidates[name]["calibration"])))
            save_json(args.run / "fullframe-test-predictions.json", [{"path": row["path"], "expectedMetId": row["id"], "group": row["group"],
                      "predictedMetIds": tp[i].tolist(), "cosineSimilarities": ts[i].tolist(),
                      "accepted": bool(ts[i, 0] >= candidates[name]["calibration"]["similarityThreshold"])} for i, row in enumerate(manifest["test"])])
    report = {"protocol": "Preserve full image and aspect ratio, longest side <=384; ImageNet normalisation; single-scale inference",
              "manifestSha256": training["manifestSha256"], "checkpointSha256": checkpoint_sha, **selection, "variants": candidates,
              "sourceSha256": {"evaluate_met_fullframe.py": sha256(Path(__file__)), "train_met.py": sha256(Path(__file__).with_name("train_met.py")), "met_pretrained.py": sha256(Path(__file__).with_name("met_pretrained.py"))},
              "trainingPerformed": False, "limitation": "Inference/preprocessing comparison using already trained weights. Same selected gallery and official query splits, not a new independent benchmark or a reproduction of the publisher's 500-pixel/multiscale protocol."}
    save_json(output, report)
    print(json.dumps(report, indent=2), flush=True)


if __name__ == "__main__":
    main()
