"""Reproducible CPU/GPU Met retrieval pilot with real, held-out visitor queries."""
from __future__ import annotations

import argparse
import json
import os
import random
import shutil
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.nn import functional as F
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

from met_training_data import download_all, extract_selected, read_ground_truth, save_json, select_manifest, sha256, validate_manifest

ROOT = Path(__file__).resolve().parents[1]
BASE_WEIGHTS = "https://download.pytorch.org/models/resnet18-f37072fd.pth"
NORMALIZE = transforms.Normalize((.485, .456, .406), (.229, .224, .225))
EVAL_TRANSFORM = transforms.Compose([transforms.Resize(256), transforms.CenterCrop(224), transforms.ToTensor(), NORMALIZE])


def load_image(path):
    with Image.open(path) as source:
        if source.width * source.height > 4_000_000:
            raise ValueError("Unexpected benchmark image dimensions")
        return source.convert("RGB")


def encoder(initialization="imagenet"):
    if initialization == "met":
        from met_pretrained import load_published_encoder
        return load_published_encoder()
    if initialization != "imagenet":
        raise ValueError("Unsupported encoder initialisation")
    model = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1, progress=False)
    model.fc = nn.Linear(512, 512, bias=False)
    with torch.no_grad():
        model.fc.weight.copy_(torch.eye(512))
    model._unframe_base = {"url": BASE_WEIGHTS, "sha256": sha256(Path(torch.hub.get_dir()) / "checkpoints" / "resnet18-f37072fd.pth")}
    return model


class ReferencePairs(Dataset):
    def __init__(self, root, rows):
        self.root = Path(root)
        groups = defaultdict(list)
        for row in rows:
            groups[row["id"]].append(row["path"])
        self.groups = [groups[key] for key in sorted(groups)]
        if any(len(group) < 2 for group in self.groups):
            raise ValueError("Each training identity needs two distinct reference files")
        self.transform = transforms.Compose([
            transforms.RandomResizedCrop(224, scale=(.65, 1.0)),
            transforms.RandomPerspective(distortion_scale=.2, p=.4),
            transforms.ColorJitter(brightness=.15, contrast=.15, saturation=.1, hue=.01),
            transforms.RandomGrayscale(p=.05), transforms.ToTensor(), NORMALIZE,
        ])

    def __len__(self):
        return len(self.groups)

    def __getitem__(self, index):
        left, right = random.sample(self.groups[index], 2)
        return self.transform(load_image(self.root / left)), self.transform(load_image(self.root / right))


class QueryImages(Dataset):
    def __init__(self, root, rows):
        self.root, self.rows = Path(root), rows

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, index):
        return EVAL_TRANSFORM(load_image(self.root / self.rows[index]["path"]))


def contrastive_loss(first, second, temperature=.1):
    if len(first) < 2 or first.shape != second.shape:
        raise ValueError("Contrastive batches require at least two distinct identities")
    features = F.normalize(torch.cat([first, second]), dim=1)
    logits = features @ features.T / temperature
    logits.fill_diagonal_(float("-inf"))
    positive = (torch.arange(len(features), device=features.device) + len(first)) % len(features)
    return F.cross_entropy(logits, positive)


def embed(model, root, rows, *, batch_size=16, device="cpu"):
    model.eval()
    batches = DataLoader(QueryImages(root, rows), batch_size=batch_size, shuffle=False, num_workers=0)
    values = []
    started = time.monotonic()
    with torch.inference_mode():
        for images in batches:
            values.append(F.normalize(model(images.to(device)).float(), dim=1).cpu().numpy())
    matrix = np.concatenate(values)
    if not np.isfinite(matrix).all():
        raise ValueError("Non-finite image descriptors")
    return matrix, time.monotonic() - started


def rank(gallery, gallery_ids, queries):
    """Rank artwork IDs, not individual images of the same artwork."""
    if gallery.ndim != 2 or queries.ndim != 2 or len(gallery) == 0 or gallery.shape[1] != queries.shape[1] or len(gallery_ids) != len(gallery):
        raise ValueError("Incompatible retrieval descriptors")
    if not np.isfinite(gallery).all() or not np.isfinite(queries).all():
        raise ValueError("Non-finite retrieval descriptors")
    identities = np.unique(gallery_ids)
    similarities = queries @ gallery.T
    scores = np.stack([similarities[:, gallery_ids == key].max(axis=1) for key in identities], axis=1)
    order = np.argsort(-scores, axis=1)[:, :5]
    return identities[order], np.take_along_axis(scores, order, axis=1)


def calibrate(scores, rows, target_false_positive=.05):
    unknown = np.array([row["id"] < 0 for row in rows])
    if not unknown.any():
        raise ValueError("Validation unknowns are required for rejection calibration")
    # Only validation scores enter this function; the test split stays sealed.
    threshold = float(np.quantile(scores[unknown, 0], 1 - target_false_positive, method="higher")) + 1e-6
    return {"similarityThreshold": threshold, "calibratedOn": "validation_unknown_queries_only", "targetUnknownFalsePositiveRate": target_false_positive}


def metrics(predictions, scores, rows, threshold):
    truth = np.array([row["id"] for row in rows])
    known = truth >= 0
    accepted = scores[:, 0] >= threshold
    correct = predictions[:, 0] == truth
    unknown = ~known
    top5 = (predictions == truth[:, None]).any(axis=1)
    result = {
        "queries": len(rows), "knownQueries": int(known.sum()), "unknownQueries": int(unknown.sum()),
        "knownTop1Accuracy": float(correct[known].mean()), "knownTop5Accuracy": float(top5[known].mean()),
        "knownCorrectAndAcceptedRate": float((correct & accepted)[known].mean()),
        "unknownFalsePositiveRate": float(accepted[unknown].mean()),
        "unknownRejected": int((~accepted & unknown).sum()),
        "acceptedIdentityPrecision": float((correct & accepted & known).sum() / max(1, accepted.sum())),
        "similarityThreshold": threshold,
    }
    result["unknownGroups"] = {}
    for group in ["test_other", "test_noart"]:
        mask = np.array([row["group"] == group for row in rows])
        result["unknownGroups"][group] = {"queries": int(mask.sum()), "falsePositives": int((accepted & mask).sum())}
    return result


def evaluate(model, root, manifest, *, device, split, gallery_features=None):
    if gallery_features is None:
        gallery_features, gallery_seconds = embed(model, root, manifest["gallery"], device=device)
    else:
        gallery_seconds = 0
    queries, query_seconds = embed(model, root, manifest[split], device=device)
    predictions, scores = rank(gallery_features, np.array([row["id"] for row in manifest["gallery"]]), queries)
    return predictions, scores, gallery_features, {"gallerySeconds": round(gallery_seconds, 3), "querySeconds": round(query_seconds, 3)}


def adapter_state(model):
    return {name: value.detach().cpu().clone() for name, value in model.state_dict().items() if name.startswith(("layer4.", "fc."))}


def load_adapter(path, device="cpu"):
    saved = torch.load(path, map_location="cpu", weights_only=True)
    if saved.get("format") != "unframe-met-resnet18-adapter-v1":
        raise ValueError("Unsupported trained adapter")
    model = encoder(saved.get("initialization", "imagenet"))
    if any(saved.get("baseWeights", {}).get(key) != model._unframe_base[key] for key in ["url", "sha256"]):
        raise ValueError("Frozen base weights do not match the trained adapter")
    expected = set(adapter_state(model))
    if set(saved["state"]) != expected:
        raise ValueError("Trained adapter is incomplete or incompatible")
    merged = model.state_dict()
    merged.update(saved["state"])
    model.load_state_dict(merged, strict=True)
    return model.to(device).eval(), saved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".local-ai" / "met-training" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    parser.add_argument("--archive-dir", type=Path, default=ROOT / ".local-ai" / "met-training" / "archives")
    parser.add_argument("--image-dir", type=Path, default=ROOT / ".local-ai" / "met-training" / "images")
    parser.add_argument("--train-classes", type=int, default=512)
    parser.add_argument("--negatives", type=int, default=96, help="Unknowns per category per official split")
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-size", type=int, default=8, help="Distinct identities per batch; each contributes two real images")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--initialization", choices=["imagenet", "met"], default="imagenet")
    parser.add_argument("--layer4-lr", type=float, default=1e-5)
    parser.add_argument("--projection-lr", type=float, default=1e-4)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    if not (2 <= args.train_classes <= 2000 and 2 <= args.negatives <= 1000 and 1 <= args.epochs <= 100 and 2 <= args.batch_size <= min(64, args.train_classes) and 1 <= args.threads <= 32):
        parser.error("Training limits are out of range")
    if args.device == "cuda" and not torch.cuda.is_available():
        parser.error("CUDA unavailable; install a compatible GPU PyTorch build or select --device cpu")
    if not 0 < args.layer4_lr <= .001 or not 0 < args.projection_lr <= .001:
        parser.error("Learning rates must be positive and at most .001")
    args.output.mkdir(parents=True, exist_ok=False)
    started = time.monotonic()
    report = {"startedAt": datetime.now(timezone.utc).isoformat(), "status": "preparing", "trainingPerformed": False,
              "configuration": {key: str(value) if isinstance(value, Path) else value for key, value in vars(args).items()},
              "hardware": {"device": args.device, "torch": torch.__version__, "threads": args.threads, "cudaAvailable": torch.cuda.is_available()},
              "sources": {}, "epochs": [], "testUsedForCheckpointSelection": False,
              "limitation": "A CPU-sized research pilot on a selected Met gallery. The official full-gallery benchmark and arbitrary-artwork identification are not established. The production scanner is unchanged."}
    source_directory = args.output / "source"
    source_directory.mkdir()
    report["sourceSha256"] = {}
    for name in ["train_met.py", "met_training_data.py", "met_pretrained.py"]:
        destination = source_directory / name
        shutil.copyfile(Path(__file__).parent / name, destination)
        report["sourceSha256"][name] = sha256(destination)
    report["recipe"] = {"base": args.initialization, "trainable": ["layer4", "fc"], "projection": "512-dimensional linear projection",
                        "optimizer": "AdamW", "layer4LearningRate": args.layer4_lr, "projectionLearningRate": args.projection_lr, "weightDecay": 1e-4,
                        "temperature": .1, "gradientClipNorm": 1., "imageSize": 224, "batchNormRunningStatistics": "frozen"}
    save_json(args.output / "report.json", report)
    try:
        report["sources"] = download_all(args.archive_dir)
        metadata = read_ground_truth(args.archive_dir / "ground_truth.tar.gz")
        manifest = select_manifest(metadata, train_classes=args.train_classes, negatives_per_group=args.negatives, seed=args.seed)
        manifest = extract_selected(args.archive_dir, args.image_dir, manifest)
        validate_manifest(manifest)
        save_json(args.output / "manifest.json", manifest)
        report["manifestSha256"] = sha256(args.output / "manifest.json")
        report["data"] = {"selection": manifest["selection"], **{key: len(manifest[key]) for key in ["training", "gallery", "validation", "test"]}}
        report["dataIsolation"] = {"queryPathsDisjoint": True, "queryByteHashesDisjoint": True, "pilotTrainingIdentitiesDisjointFromQueryIdentities": True,
                                  "publisherPretrainingIncludesMetGalleryIdentities": args.initialization == "met"}
        save_json(args.output / "report.json", report)
        if args.prepare_only:
            report["status"] = "prepared_not_trained"
            return
        torch.set_num_threads(args.threads)
        torch.set_num_interop_threads(1)
        random.seed(args.seed)
        np.random.seed(args.seed)
        torch.manual_seed(args.seed)
        os.environ.setdefault("TORCH_HOME", str(ROOT / ".local-ai" / "cache" / "torch"))
        model = encoder(args.initialization).to(args.device)
        report["baseWeights"] = model._unframe_base
        print(f"BASELINE: official validation and sealed test; unmodified {args.initialization} descriptors", flush=True)
        vp, vs, baseline_gallery, duration = evaluate(model, args.image_dir, manifest, device=args.device, split="validation")
        baseline_calibration = calibrate(vs, manifest["validation"])
        report["baseline"] = {"validation": metrics(vp, vs, manifest["validation"], baseline_calibration["similarityThreshold"]), "timings": duration, "calibration": baseline_calibration}
        # Test descriptors are computed only here for the untrained baseline. They
        # never enter gradients, checkpoint selection or threshold calibration.
        tp, ts, _, baseline_test_duration = evaluate(model, args.image_dir, manifest, device=args.device, split="test", gallery_features=baseline_gallery)
        baseline_test = metrics(tp, ts, manifest["test"], baseline_calibration["similarityThreshold"])
        save_json(args.output / "baseline-test-sealed.json", {"metrics": baseline_test, "timings": baseline_test_duration})
        del tp, ts, baseline_gallery
        initial = adapter_state(model)
        for name, parameter in model.named_parameters():
            parameter.requires_grad_(name.startswith(("layer4.", "fc.")))
        report["trainableParameters"] = sum(parameter.numel() for parameter in model.parameters() if parameter.requires_grad)
        optimizer = torch.optim.AdamW([
            {"params": model.layer4.parameters(), "lr": args.layer4_lr},
            {"params": model.fc.parameters(), "lr": args.projection_lr},
        ], weight_decay=1e-4)
        pairs = ReferencePairs(args.image_dir, manifest["training"])
        loader = DataLoader(pairs, batch_size=args.batch_size, shuffle=True, drop_last=True, num_workers=0,
                            generator=torch.Generator().manual_seed(args.seed))
        best_score, best_epoch, best_state = -1., None, None
        report["status"] = "training"
        save_json(args.output / "report.json", report)
        for epoch in range(1, args.epochs + 1):
            epoch_start = time.monotonic()
            model.train()
            # Preserve pretrained population statistics on small contrastive batches.
            for module in model.modules():
                if isinstance(module, nn.BatchNorm2d):
                    module.eval()
            losses = []
            for step, (left, right) in enumerate(loader, 1):
                optimizer.zero_grad(set_to_none=True)
                features = model(torch.cat([left, right]).to(args.device))
                loss = contrastive_loss(*features.chunk(2))
                if not torch.isfinite(loss):
                    raise ValueError("Non-finite training loss")
                loss.backward()
                nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad], 1.)
                optimizer.step()
                report["trainingPerformed"] = True
                losses.append(float(loss.detach()))
                if step % 16 == 0:
                    print(f"TRAIN epoch {epoch}/{args.epochs}, batch {step}/{len(loader)}, loss {np.mean(losses):.4f}", flush=True)
            vp, vs, _, duration = evaluate(model, args.image_dir, manifest, device=args.device, split="validation")
            calibration = calibrate(vs, manifest["validation"])
            validation = metrics(vp, vs, manifest["validation"], calibration["similarityThreshold"])
            row = {"epoch": epoch, "optimizerSteps": len(losses), "meanContrastiveLoss": float(np.mean(losses)),
                   "validation": validation, "calibration": calibration, "elapsedSeconds": round(time.monotonic() - epoch_start, 2)}
            report["epochs"].append(row)
            if validation["knownTop1Accuracy"] > best_score:
                best_score, best_epoch, best_state = validation["knownTop1Accuracy"], epoch, adapter_state(model)
                report["selectedCalibration"] = calibration
                torch.save({"format": "unframe-met-resnet18-adapter-v1", "initialization": args.initialization, "baseWeights": report["baseWeights"], "state": best_state,
                            "epoch": epoch, "calibration": calibration, "manifestSha256": report["manifestSha256"]}, args.output / "adapter.pt")
            print(f"VALIDATION epoch {epoch}: Top1 {validation['knownTop1Accuracy']:.1%}, Top5 {validation['knownTop5Accuracy']:.1%}, unknown FP {validation['unknownFalsePositiveRate']:.1%}", flush=True)
            report["trainingPerformed"] = True
            save_json(args.output / "report.json", report)
        delta = float(sum((best_state[key].float() - initial[key].float()).square().sum() for key in best_state).sqrt())
        if delta <= 0:
            raise ValueError("No model weights changed during training")
        print("FINAL TEST: restoring selected adapter and opening the held-out test evaluation", flush=True)
        restored, saved = load_adapter(args.output / "adapter.pt", args.device)
        if any(not torch.equal(saved["state"][key], best_state[key]) for key in best_state):
            raise ValueError("Saved checkpoint round trip failed")
        tp, ts, gallery, duration = evaluate(restored, args.image_dir, manifest, device=args.device, split="test")
        trained_test = metrics(tp, ts, manifest["test"], saved["calibration"]["similarityThreshold"])
        report["selectedEpoch"] = best_epoch
        report["optimizerSteps"] = sum(row["optimizerSteps"] for row in report["epochs"])
        report["parameterChangeL2"] = delta
        report["checkpointRoundTripVerified"] = True
        report["baseline"]["test"] = baseline_test
        report["trained"] = {"test": trained_test, "timings": duration}
        report["improvement"] = {"knownTop1PercentagePoints": 100 * (trained_test["knownTop1Accuracy"] - baseline_test["knownTop1Accuracy"]),
                                 "knownTop5PercentagePoints": 100 * (trained_test["knownTop5Accuracy"] - baseline_test["knownTop5Accuracy"])}
        report["promotedToProduction"] = False
        report["checkpointSha256"] = sha256(args.output / "adapter.pt")
        np.savez_compressed(args.output / "gallery.npz", features=gallery, ids=np.array([row["id"] for row in manifest["gallery"]]),
                            checkpointSha256=np.array(report["checkpointSha256"]))
        predictions = [{"path": row["path"], "expectedMetId": row["id"], "group": row["group"], "predictedMetIds": tp[i].tolist(),
                        "cosineSimilarities": ts[i].tolist(), "accepted": bool(ts[i, 0] >= saved["calibration"]["similarityThreshold"])} for i, row in enumerate(manifest["test"])]
        save_json(args.output / "test-predictions.json", predictions)
        report["status"] = "completed"
        print(json.dumps({"status": report["status"], "selectedEpoch": best_epoch, "baselineTest": baseline_test, "trainedTest": trained_test, "output": str(args.output)}, indent=2), flush=True)
    except KeyboardInterrupt:
        report["status"] = "cancelled"
        raise
    except Exception as error:
        report["status"], report["error"] = "failed", f"{type(error).__name__}: {error}"
        raise
    finally:
        report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        report["elapsedSeconds"] = round(time.monotonic() - started, 2)
        save_json(args.output / "report.json", report)


if __name__ == "__main__":
    main()
