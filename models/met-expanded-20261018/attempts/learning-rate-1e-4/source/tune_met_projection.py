"""One validation-first learning-rate follow-up using verified frozen caches."""
import argparse
import copy
import json
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch import nn
from torch.nn import functional as F

from met_training_data import save_json, sha256
from train_met import ROOT, calibrate, contrastive_loss, load_adapter, metrics
from train_met_expanded import evaluate_head, frozen_features, hard_batches, project, reference_groups, write_predictions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path, help="Completed expanded run whose frozen features are reused")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--learning-rate", type=float, default=1e-4)
    args = parser.parse_args()
    if not 0 < args.learning_rate <= .001:
        parser.error("Learning rate must be positive and at most .001")
    source = json.loads((args.run / "report.json").read_text(encoding="utf-8"))
    if source["status"] != "completed":
        raise ValueError("Source training must be complete")
    manifest_file = args.run / "manifest.json"
    if sha256(manifest_file) != source["manifestSha256"]:
        raise ValueError("Cached reference selection changed")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    report = {"status": "preparing", "startedAt": datetime.now(timezone.utc).isoformat(), "trainingPerformed": False, "epochs": [],
              "configuration": {**source["configuration"], "output": str(args.output), "feature_cache": str(args.run), "learning_rate": args.learning_rate},
              "manifestSha256": source["manifestSha256"], "startingCheckpointSha256": source["startingCheckpointSha256"],
              "recipe": {**source["recipe"], "learningRate": args.learning_rate}, "sources": source["sources"], "data": source["data"],
              "dataIsolation": source["dataIsolation"], "hardware": source["hardware"], "sourceReportSha256": sha256(args.run / "report.json"),
              "testUsedForCheckpointSelection": False, "promotedToProduction": False,
              "limitation": "Learning-rate follow-up after observing the first expanded run. Uses the same benchmark; it is not an independent test set. Test inference is skipped unless full-gallery validation improves."}
    save_json(args.output / "report.json", report)
    try:
        snapshot = args.output / "source"
        snapshot.mkdir()
        report["sourceSha256"] = {}
        for name in ["tune_met_projection.py", "train_met_expanded.py", "train_met.py", "met_training_data.py", "met_pretrained.py", "evaluate_met_fullframe.py"]:
            shutil.copyfile(Path(__file__).with_name(name), snapshot / name)
            report["sourceSha256"][name] = sha256(snapshot / name)
        report["featureCacheSha256"] = {}
        arrays = {}
        for name in ["gallery", "validation", "training-augmentation"]:
            file = args.run / ("features-" + name + ".npy")
            report["featureCacheSha256"][name] = sha256(file)
            arrays[name] = np.load(file, allow_pickle=False)
            if arrays[name].ndim != 2 or arrays[name].shape[1] != 512 or not np.isfinite(arrays[name]).all():
                raise ValueError("Invalid frozen feature cache")
        gallery, validation, augmented = arrays["gallery"], arrays["validation"], arrays["training-augmentation"]
        groups = reference_groups(manifest)
        indices = sorted({index for values in groups.values() for index in values})
        if len(gallery) != len(manifest["gallery"]) or len(validation) != len(manifest["validation"]) or len(augmented) != len(indices):
            raise ValueError("Frozen cache rows do not match the original source recipe")
        augment_lookup = {index: position for position, index in enumerate(indices)}
        cfg = source["configuration"]
        if sha256(Path(cfg["start"])) != source["startingCheckpointSha256"]:
            raise ValueError("Starting checkpoint changed")
        torch.set_num_threads(cfg["threads"])
        torch.set_num_interop_threads(1)
        os.environ.setdefault("TORCH_HOME", str(ROOT / ".local-ai/cache/torch"))
        model, previous = load_adapter(Path(cfg["start"]))
        head = copy.deepcopy(model.fc)
        teacher = copy.deepcopy(head).requires_grad_(False)
        initial = copy.deepcopy(head.state_dict())
        model.fc = nn.Identity()
        model.requires_grad_(False).eval()
        report["baseWeights"] = previous["baseWeights"]
        report["trainableParameters"] = sum(parameter.numel() for parameter in head.parameters())
        values = list(groups.values())
        centroids = project(teacher, np.stack([gallery[rows].mean(axis=0) for rows in values]))
        similarities = centroids @ centroids.T
        np.fill_diagonal(similarities, -np.inf)
        neighbours = np.argsort(-similarities, axis=1, kind="stable")[:, :min(8, len(values)-1)]
        optimizer = torch.optim.AdamW(head.parameters(), lr=args.learning_rate, weight_decay=.001)
        best, selected_state, selected_calibration, selected_epoch, total_steps = -1., None, None, None, 0
        report["status"] = "training"
        for epoch in range(1, cfg["epochs"] + 1):
            rng = np.random.default_rng(cfg["seed"] + epoch)
            losses = []
            for batch in hard_batches(neighbours, cfg["batch_size"], rng):
                left, right = [], []
                for identity in batch:
                    a, b = rng.choice(values[identity], size=2, replace=False).tolist()
                    left.append(augmented[augment_lookup[a]] if rng.random() < .5 else gallery[a])
                    right.append(augmented[augment_lookup[b]])
                inputs = torch.from_numpy(np.concatenate([np.asarray(left), np.asarray(right)]))
                optimizer.zero_grad(set_to_none=True)
                features = head(inputs)
                with torch.no_grad():
                    targets = F.normalize(teacher(inputs), dim=1)
                anchor = (1 - (F.normalize(features, dim=1) * targets).sum(dim=1)).mean()
                loss = contrastive_loss(*features.chunk(2)) + .1 * anchor
                if not torch.isfinite(loss):
                    raise ValueError("Non-finite projection loss")
                loss.backward()
                nn.utils.clip_grad_norm_(head.parameters(), 1.)
                optimizer.step()
                total_steps += 1
                losses.append(float(loss.detach()))
            vp, vs, _ = evaluate_head(head, gallery, validation, manifest, "validation")
            calibration = calibrate(vs, manifest["validation"])
            result = metrics(vp, vs, manifest["validation"], calibration["similarityThreshold"])
            report["epochs"].append({"epoch": epoch, "optimizerSteps": len(losses), "meanLoss": float(np.mean(losses)), "validation": result, "calibration": calibration})
            if result["knownTop1Accuracy"] > best:
                best, selected_epoch, selected_state, selected_calibration = result["knownTop1Accuracy"], epoch, copy.deepcopy(head.state_dict()), calibration
            report["trainingPerformed"] = True
            save_json(args.output / "report.json", report)
            print(f"TUNE epoch {epoch}: loss {np.mean(losses):.4f}, validation Top1 {result['knownTop1Accuracy']:.1%}", flush=True)
        head.load_state_dict(selected_state)
        saved_state = dict(previous["state"])
        saved_state.update({"fc." + key: value for key, value in selected_state.items()})
        delta = float(sum((selected_state[key] - initial[key]).square().sum() for key in initial).sqrt())
        if delta <= 0:
            raise ValueError("No trained weights changed")
        torch.save({"format": previous["format"], "initialization": "met", "baseWeights": previous["baseWeights"], "state": saved_state,
                    "epoch": selected_epoch, "calibration": selected_calibration, "manifestSha256": report["manifestSha256"],
                    "continuedFromCheckpointSha256": report["startingCheckpointSha256"]}, args.output / "adapter.pt")
        restored, saved = load_adapter(args.output / "adapter.pt")
        assert all(torch.equal(value, saved["state"][key]) for key, value in saved_state.items())
        assert all(torch.equal(value, previous["state"][key]) for key, value in saved_state.items() if key.startswith("layer4."))
        previous_best = max(row["validation"]["knownTop1Accuracy"] for row in source["epochs"])
        selected = best > max(previous_best, source["baseline"]["validation"]["knownTop1Accuracy"])
        report.update({"selectedEpoch": selected_epoch, "optimizerSteps": total_steps, "parameterChangeL2": delta, "checkpointRoundTripVerified": True,
                       "frozenBackboneVerifiedUnchanged": True, "checkpointSha256": sha256(args.output / "adapter.pt"), "selectedOverOriginalRun": selected})
        save_json(args.output / "selection-before-test.json", {"selected": selected, "bestValidationTop1": best, "originalBestValidationTop1": previous_best,
                  "checkpointSha256": report["checkpointSha256"], "criterion": "Strict full-gallery validation Top1 improvement required before any follow-up test inference"})
        if not selected:
            report["status"] = "validation_only_not_selected"
            return
        # Only a validation-selected follow-up opens another test inference.
        test_features, seconds = frozen_features(model, Path(cfg["image_dir"]), manifest["test"], "selected tune test")
        tp, ts, descriptors = evaluate_head(restored.fc, gallery, test_features, manifest, "test")
        report["trainedTest"] = metrics(tp, ts, manifest["test"], selected_calibration["similarityThreshold"])
        report["testFeatureSeconds"] = seconds
        write_predictions(args.output / "continued_training-predictions.json", manifest["test"], tp, ts, selected_calibration["similarityThreshold"])
        np.savez_compressed(args.output / "gallery-fit384.npz", features=descriptors, ids=np.array([row["id"] for row in manifest["gallery"]]),
                            checkpointSha256=np.array(report["checkpointSha256"]), transform=np.array("fit384"), calibrationJson=np.array(json.dumps(selected_calibration)))
        for name in ["manifest.json", "catalogue.json", "catalogue-source.json", "evaluation-plan.json"]:
            shutil.copyfile(args.run / name, args.output / name)
        save_json(args.output / "inference.json", {"version": 1, "protocol": "fit384", "galleryFile": "gallery-fit384.npz", "gallerySha256": sha256(args.output / "gallery-fit384.npz"),
                  "checkpointSha256": report["checkpointSha256"], "manifestSha256": report["manifestSha256"]})
        report["status"] = "completed"
        print(json.dumps({"status": report["status"], "selectedEpoch": selected_epoch, "test": report["trainedTest"]}, indent=2), flush=True)
    except BaseException as error:
        report["status"] = "cancelled" if isinstance(error, KeyboardInterrupt) else "failed"
        report["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        report["elapsedSeconds"] = round(time.monotonic() - started, 3)
        save_json(args.output / "report.json", report)


if __name__ == "__main__":
    main()
