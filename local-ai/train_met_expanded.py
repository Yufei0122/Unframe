"""Continue a Met encoder on the complete mini gallery using cached frozen features.

Only the projection is trained. Caching the frozen convolutional backbone makes
full-gallery validation feasible on CPU without feeding query pixels to training.
"""
import argparse
import copy
import ctypes
import hashlib
import json
import os
import random
import shutil
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
import torchvision
from PIL import __version__ as pillow_version
from torch import nn
from torch.nn import functional as F
from torchvision import transforms

from evaluate_met_fullframe import fit384
from met_training_data import download_all, extract_selected, read_ground_truth, save_json, select_manifest, sha256, validate_manifest
from train_met import ROOT, calibrate, contrastive_loss, load_adapter, load_image, metrics, rank


class Tee:
    def __init__(self, *streams):
        self.streams = streams

    def write(self, value):
        for stream in self.streams:
            stream.write(value)
            stream.flush()
        return len(value)

    def flush(self):
        for stream in self.streams:
            stream.flush()


def resource_snapshot(path):
    peak_working_set = None
    if os.name == "nt":
        class Counters(ctypes.Structure):
            _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong),
                        ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]
        counters = Counters()
        counters.cb = ctypes.sizeof(counters)
        get_memory = ctypes.windll.kernel32.K32GetProcessMemoryInfo
        get_memory.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
        get_memory.restype = ctypes.c_int
        if get_memory(ctypes.windll.kernel32.GetCurrentProcess(), ctypes.byref(counters), counters.cb):
            peak_working_set = int(counters.PeakWorkingSetSize)
    usage = shutil.disk_usage(path)
    return {"peakProcessWorkingSetBytes": peak_working_set, "diskFreeBytes": usage.free,
            "diskTotalBytes": usage.total, "cudaPeakAllocatedBytes": int(torch.cuda.max_memory_allocated()) if torch.cuda.is_available() else 0}


def terminal_failure_status(error):
    return "cancelled" if isinstance(error, KeyboardInterrupt) else "failed"


def expanded_manifest(metadata, classes, validation_negatives, test_negatives, seed, all_gallery_training=False):
    result = select_manifest(metadata, train_classes=classes, negatives_per_group=validation_negatives, seed=seed,
                             full_gallery=True, all_gallery_training=all_gallery_training)
    test = select_manifest(metadata, train_classes=classes, negatives_per_group=test_negatives, seed=seed,
                           full_gallery=True, all_gallery_training=all_gallery_training)
    result["test"] = test["test"]
    result["selection"]["testNegativeSamplesPerGroup"] = test_negatives
    validate_manifest(result)
    return result


def reference_groups(manifest):
    """Exclude byte duplicates and cross-identity conflicts from positive pairs."""
    lookup = {row["path"]: i for i, row in enumerate(manifest["gallery"])}
    owners = defaultdict(set)
    for row in manifest["gallery"]:
        owners[manifest["imageSha256"][row["path"]]].add(row["id"])
    grouped = defaultdict(dict)
    for row in manifest["training"]:
        digest = manifest["imageSha256"][row["path"]]
        if len(owners[digest]) == 1:
            grouped[row["id"]].setdefault(digest, lookup[row["path"]])
    minimum = 1 if manifest.get("selection", {}).get("allGalleryTraining") else 2
    groups = {key: list(values.values()) for key, values in sorted(grouped.items()) if len(values) >= minimum}
    if len(groups) < 2:
        raise ValueError("Too few byte-distinct, conflict-free training pairs")
    return groups


def full_gallery_batches(groups, batch_size, rng):
    """Cover every clean reference once as an anchor, without duplicate identities in a batch."""
    identities = list(groups)
    rounds = max(map(len, groups.values()))
    result = []
    for round_index in range(rounds):
        eligible = [identity for identity in identities if round_index < len(groups[identity])]
        rng.shuffle(eligible)
        for offset in range(0, len(eligible), batch_size):
            chunk = eligible[offset:offset + batch_size]
            if chunk:
                result.append([(identity, round_index) for identity in chunk])
    return result


def cache_key(rows, manifest, checkpoint_sha, label, seed=None):
    payload = {"label": label, "checkpointSha256": checkpoint_sha, "seed": seed,
               "images": [(row["path"], manifest["imageSha256"][row["path"]]) for row in rows]}
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def cached_features(cache_dir, key, model, root, rows, label, augmentation=None):
    cache_dir.mkdir(parents=True, exist_ok=True)
    data_path, metadata_path = cache_dir / f"{key}.npy", cache_dir / f"{key}.json"
    if data_path.is_file() and metadata_path.is_file():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        if metadata.get("sha256") == sha256(data_path) and metadata.get("rows") == len(rows):
            values = np.load(data_path, mmap_mode="r")
            if values.shape == (len(rows), 512) and np.isfinite(values).all():
                return values, 0., {"key": key, "sha256": metadata["sha256"], "reused": True, "path": str(data_path)}
    values, seconds = frozen_features(model, root, rows, label, augmentation)
    temporary = data_path.with_suffix(".tmp.npy")
    np.save(temporary, values)
    temporary.replace(data_path)
    metadata = {"key": key, "rows": len(rows), "sha256": sha256(data_path)}
    save_json(metadata_path, metadata)
    return np.load(data_path, mmap_mode="r"), seconds, {**metadata, "reused": False, "path": str(data_path)}


def hard_batches(neighbours, batch_size, rng):
    """Each identity appears once per epoch, with nearby distinct identities."""
    remaining = set(range(len(neighbours)))
    order = rng.permutation(len(neighbours)).tolist()
    result, batch = [], []
    for anchor in order:
        if anchor not in remaining:
            continue
        remaining.remove(anchor)
        batch.append(anchor)
        if len(batch) < batch_size:
            candidates = [int(x) for x in neighbours[anchor] if int(x) in remaining]
            if candidates:
                other = candidates[int(rng.integers(len(candidates)))]
                remaining.remove(other)
                batch.append(other)
        if len(batch) >= batch_size:
            result.append(batch)
            batch = []
    if len(batch) == 1 and result:
        result[-1].extend(batch)
    elif batch:
        result.append(batch)
    return result


def frozen_features(model, root, rows, label, augmentation=None):
    values, started = [], time.monotonic()
    with torch.inference_mode():
        for index, row in enumerate(rows, 1):
            image = load_image(root / row["path"])
            if augmentation is not None:
                image = augmentation(image)
            values.append(model(fit384(image).unsqueeze(0)).numpy()[0])
            if index % 1000 == 0:
                print(f"FEATURES {label}: {index}/{len(rows)} ({time.monotonic()-started:.0f}s)", flush=True)
    result = np.asarray(values, dtype=np.float32)
    if not np.isfinite(result).all():
        raise ValueError("Non-finite frozen features")
    return result, round(time.monotonic() - started, 3)


def project(head, features):
    chunks = []
    with torch.inference_mode():
        for offset in range(0, len(features), 1024):
            batch = np.asarray(features[offset:offset + 1024]).copy()
            chunks.append(F.normalize(head(torch.from_numpy(batch)), dim=1).numpy())
    return np.concatenate(chunks)


def evaluate_head(head, gallery_features, query_features, manifest, split, gallery_mask=None):
    # Evaluate the same float16 descriptors that are actually shipped. Query
    # descriptors remain float32; no unreported full-precision index is used.
    gallery = project(head, gallery_features).astype(np.float16)
    ids = np.array([row["id"] for row in manifest["gallery"]])
    if gallery_mask is not None:
        gallery, ids = gallery[gallery_mask], ids[gallery_mask]
    predictions, scores = rank(gallery, ids, project(head, query_features))
    return predictions, scores, gallery


def write_predictions(path, rows, predictions, scores, threshold):
    save_json(path, [{"path": row["path"], "expectedMetId": row["id"], "group": row["group"],
                     "predictedMetIds": predictions[i].tolist(), "cosineSimilarities": scores[i].tolist(),
                     "accepted": bool(scores[i, 0] >= threshold)} for i, row in enumerate(rows)])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".local-ai/met-training" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-expanded"))
    parser.add_argument("--start", type=Path, default=ROOT / "models/met-pilot-20261018/adapter.pt")
    parser.add_argument("--legacy-manifest", type=Path, default=ROOT / "models/met-pilot-20261018/manifest.json")
    parser.add_argument("--archive-dir", type=Path, default=ROOT / ".local-ai/met-training/archives")
    parser.add_argument("--image-dir", type=Path, default=ROOT / ".local-ai/met-training/images")
    parser.add_argument("--train-classes", type=int, default=2000)
    parser.add_argument("--validation-negatives", type=int, default=256)
    parser.add_argument("--test-negatives", type=int, default=512)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--epochs", type=int, default=16)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--all-gallery-training", action="store_true", help="Train on every clean mini-gallery reference, including singletons")
    parser.add_argument("--prepare-only", action="store_true", help="Download, verify and report selection statistics without training")
    parser.add_argument("--feature-cache-dir", type=Path, default=ROOT / ".local-ai/met-training/feature-cache")
    parser.add_argument("--prepared", action="store_true", help="Use an existing manifest-only preparation; never overwrite a training report")
    args = parser.parse_args()
    if not (2 <= args.train_classes <= 2524 and 1 <= args.epochs <= 100 and 2 <= args.batch_size <= 128 and 1 <= args.threads <= 32 and 0 < args.learning_rate <= .001):
        parser.error("Training parameters outside supported limits")
    if not (2 <= args.validation_negatives <= 868 and 2 <= args.test_negatives <= 7964):
        parser.error("Unknown sample counts exceed the official split sizes")
    if args.prepared:
        if not (args.output / "manifest.json").is_file() or (args.output / "report.json").exists():
            raise ValueError("--prepared requires a manifest-only preparation without an existing report")
    else:
        args.output.mkdir(parents=True, exist_ok=False)
    log_handle = (args.output / "training.log").open("a", encoding="utf-8", buffering=1)
    sys.stdout = Tee(sys.__stdout__, log_handle)
    sys.stderr = Tee(sys.__stderr__, log_handle)
    report = {"status": "preparing", "startedAt": datetime.now(timezone.utc).isoformat(), "trainingPerformed": False,
              "configuration": {key: str(value) if isinstance(value, Path) else value for key, value in vars(args).items()},
              "hardware": {"python": sys.version.split()[0], "torch": str(torch.__version__), "torchvision": torchvision.__version__,
                           "pillow": pillow_version, "numpy": np.__version__, "device": "cpu", "threads": args.threads,
                           "cudaAvailable": torch.cuda.is_available(), "cudaDevice": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None},
              "epochs": [], "promotedToProduction": False, "testUsedForCheckpointSelection": False,
              "recipe": {"trainable": ["fc.weight", "fc.bias"], "frozen": "Starting checkpoint's entire convolutional backbone and GeM pooling",
                         "optimizer": "AdamW", "learningRate": args.learning_rate, "weightDecay": .001, "temperature": .1,
                         "teacherCosineLossWeight": .1, "hardNegativeNeighbours": 8, "inference": "fit384", "galleryStorage": "float16, evaluated at shipped precision"},
              "limitation": "Full official mini gallery, not the full Met benchmark or arbitrary-artwork recognition. A follow-up using previously observed official query splits, not a new independent test set."}
    started = time.monotonic()
    save_json(args.output / "report.json", report)
    try:
        source = args.output / "source"
        source.mkdir()
        report["sourceSha256"] = {}
        for name in ["train_met_expanded.py", "train_met.py", "met_training_data.py", "met_pretrained.py", "evaluate_met_fullframe.py"]:
            shutil.copyfile(Path(__file__).with_name(name), source / name)
            report["sourceSha256"][name] = sha256(source / name)
        report["sources"] = download_all(args.archive_dir)
        expected = expanded_manifest(read_ground_truth(args.archive_dir / "ground_truth.tar.gz"), args.train_classes, args.validation_negatives,
                                     args.test_negatives, args.seed, args.all_gallery_training)
        if args.prepared:
            existing = json.loads((args.output / "manifest.json").read_text(encoding="utf-8"))
            if {key: value for key, value in existing.items() if key != "imageSha256"} != expected:
                raise ValueError("Prepared manifest does not match this training configuration")
        manifest = extract_selected(args.archive_dir, args.image_dir, expected)
        save_json(args.output / "manifest.json", manifest)
        report["manifestSha256"] = sha256(args.output / "manifest.json")
        groups = reference_groups(manifest)
        owners = defaultdict(set)
        for row in manifest["gallery"]:
            owners[manifest["imageSha256"][row["path"]]].add(row["id"])
        clean_indices = {index for values in groups.values() for index in values}
        duplicate_count = sum(1 for row in manifest["training"] if len(owners[manifest["imageSha256"][row["path"]]]) == 1) - len(clean_indices)
        conflict_count = sum(1 for row in manifest["training"] if len(owners[manifest["imageSha256"][row["path"]]]) > 1)
        singleton_count = sum(len(values) == 1 for values in groups.values())
        report["data"] = {"selection": manifest["selection"], **{key: len(manifest[key]) for key in ["training", "gallery", "validation", "test"]},
                          "rawGalleryImages": len(manifest["gallery"]), "galleryIdentities": len({row["id"] for row in manifest["gallery"]}),
                          "actualTrainingClassesAfterByteDeduplication": len(groups), "actualTrainingReferences": sum(map(len, groups.values())),
                          "singleReferenceTrainingIdentities": singleton_count, "multiReferenceTrainingIdentities": len(groups)-singleton_count,
                          "excludedCorruptImages": 0, "excludedByteDuplicateImages": duplicate_count,
                          "excludedCrossIdentityConflictImages": conflict_count,
                          "validationQueryImages": len(manifest["validation"]), "testQueryImages": len(manifest["test"]),
                          "queryImagesUsedForGradients": 0}
        report["dataIsolation"] = {"queryPathsAndByteHashesDisjoint": True,
                                   "queryPixelsUsedForTraining": False,
                                   "evaluationIdentitiesSeenInGalleryTraining": args.all_gallery_training,
                                   "unseenIdentityGeneralizationClaim": False,
                                   "pilotTrainingIdentitiesDisjointFromQueryIdentities": not args.all_gallery_training,
                                   "publisherBasePreviouslyLearnedMetGalleryIdentities": True}
        if args.prepare_only:
            report["status"] = "prepared"
            print(json.dumps({"status": "prepared", "data": report["data"], "manifest": str(args.output / "manifest.json")}, indent=2), flush=True)
            return
        torch.set_num_threads(args.threads)
        torch.set_num_interop_threads(1)
        torch.manual_seed(args.seed)
        random.seed(args.seed)
        np.random.seed(args.seed)
        os.environ.setdefault("TORCH_HOME", str(ROOT / ".local-ai/cache/torch"))
        model, previous = load_adapter(args.start)
        report["startingCheckpointSha256"] = sha256(args.start)
        report["baseWeights"] = previous["baseWeights"]
        head = copy.deepcopy(model.fc)
        teacher = copy.deepcopy(head).requires_grad_(False)
        initial = copy.deepcopy(head.state_dict())
        model.fc = nn.Identity()
        model.requires_grad_(False).eval()
        report["trainableParameters"] = sum(parameter.numel() for parameter in head.parameters())
        report["status"] = "embedding"
        save_json(args.output / "report.json", report)
        checkpoint_sha = report["startingCheckpointSha256"]
        cache_records = {}
        key = cache_key(manifest["gallery"], manifest, checkpoint_sha, "gallery")
        gallery_features, gallery_seconds, cache_records["gallery"] = cached_features(args.feature_cache_dir, key, model, args.image_dir, manifest["gallery"], "gallery")
        key = cache_key(manifest["validation"], manifest, checkpoint_sha, "validation")
        validation_features, validation_seconds, cache_records["validation"] = cached_features(args.feature_cache_dir, key, model, args.image_dir, manifest["validation"], "validation")
        unique_indices = sorted({index for values in groups.values() for index in values})
        augmentation = transforms.Compose([transforms.RandomPerspective(distortion_scale=.2, p=.7, fill=(124, 116, 104)),
                                            transforms.RandomRotation(5, fill=(124, 116, 104)),
                                            transforms.ColorJitter(brightness=.2, contrast=.15, saturation=.1, hue=.01)])
        training_rows = [manifest["gallery"][i] for i in unique_indices]
        augmented_views, augmentation_seconds = [], 0.
        for view in range(2 if args.all_gallery_training else 1):
            torch.manual_seed(args.seed + 1000 + view)
            random.seed(args.seed + 1000 + view)
            key = cache_key(training_rows, manifest, checkpoint_sha, f"training-augmentation-{view}", args.seed + 1000 + view)
            augmented, seconds, record = cached_features(args.feature_cache_dir, key, model, args.image_dir, training_rows,
                                                          f"training augmentation {view + 1}", augmentation)
            augmented_views.append(augmented)
            augmentation_seconds += seconds
            cache_records[f"trainingAugmentation{view + 1}"] = record
        augmented = augmented_views[0]
        augment_lookup = {index: position for position, index in enumerate(unique_indices)}
        values = list(groups.values())
        neighbours = None
        if not args.all_gallery_training:
            centroids = np.stack([gallery_features[indices].mean(axis=0) for indices in values])
            centroids = project(teacher, centroids)
            similarities = centroids @ centroids.T
            np.fill_diagonal(similarities, -np.inf)
            neighbours = np.argsort(-similarities, axis=1, kind="stable")[:, :min(8, len(values)-1)]
        vp, vs, _ = evaluate_head(teacher, gallery_features, validation_features, manifest, "validation")
        base_calibration = calibrate(vs, manifest["validation"])
        report["baseline"] = {"validation": metrics(vp, vs, manifest["validation"], base_calibration["similarityThreshold"]), "calibration": base_calibration}
        report["featureTimingsSeconds"] = {"gallery": gallery_seconds, "validation": validation_seconds, "augmentation": augmentation_seconds}
        report["featureCaches"] = cache_records
        optimizer = torch.optim.AdamW(head.parameters(), lr=args.learning_rate, weight_decay=.001)
        report["status"] = "training"
        best, best_state, best_epoch, calibration = -1., None, None, None
        total_steps = 0
        for epoch in range(1, args.epochs + 1):
            epoch_start = time.monotonic()
            rng = np.random.default_rng(args.seed + epoch)
            losses = []
            batches = (full_gallery_batches(groups, args.batch_size, rng) if args.all_gallery_training
                       else hard_batches(neighbours, args.batch_size, rng))
            references_used = set()
            for batch in batches:
                left, right = [], []
                for item in batch:
                    if args.all_gallery_training:
                        identity, round_index = item
                        identity_values = groups[identity]
                        a = identity_values[round_index]
                        alternatives = [index for index in identity_values if index != a]
                        b = a if not alternatives else alternatives[int(rng.integers(len(alternatives)))]
                        references_used.add(a)
                        left.append(augmented_views[0][augment_lookup[a]])
                        right.append(augmented_views[1][augment_lookup[b]])
                    else:
                        identity = item
                        a, b = rng.choice(values[identity], size=2, replace=False).tolist()
                        left.append(augmented[augment_lookup[a]] if rng.random() < .5 else gallery_features[a])
                        right.append(augmented[augment_lookup[b]])
                inputs = torch.from_numpy(np.concatenate([np.asarray(left), np.asarray(right)]).copy())
                optimizer.zero_grad(set_to_none=True)
                features = head(inputs)
                with torch.no_grad():
                    targets = F.normalize(teacher(inputs), dim=1)
                anchor = (1 - (F.normalize(features, dim=1) * targets).sum(dim=1)).mean()
                loss = contrastive_loss(*features.chunk(2)) + .1 * anchor
                if not torch.isfinite(loss):
                    raise ValueError("Non-finite projection loss")
                loss.backward()
                if any(parameter.grad is not None and not torch.isfinite(parameter.grad).all() for parameter in head.parameters()):
                    raise ValueError("Non-finite projection gradient")
                nn.utils.clip_grad_norm_(head.parameters(), 1.)
                optimizer.step()
                total_steps += 1
                losses.append(float(loss.detach()))
            vp, vs, _ = evaluate_head(head, gallery_features, validation_features, manifest, "validation")
            current_calibration = calibrate(vs, manifest["validation"])
            validation = metrics(vp, vs, manifest["validation"], current_calibration["similarityThreshold"])
            report["epochs"].append({"epoch": epoch, "optimizerSteps": len(losses), "meanLoss": float(np.mean(losses)), "validation": validation,
                                     "trainingReferencesUsed": len(references_used) if args.all_gallery_training else sum(map(len, groups.values())),
                                     "calibration": current_calibration, "seconds": round(time.monotonic()-epoch_start, 3)})
            if validation["knownTop1Accuracy"] > best:
                best, best_epoch, best_state, calibration = validation["knownTop1Accuracy"], epoch, copy.deepcopy(head.state_dict()), current_calibration
                temporary_best = args.output / "checkpoint-best-projection.pt.tmp"
                torch.save({"epoch": best_epoch, "state": best_state, "calibration": calibration,
                            "manifestSha256": report["manifestSha256"], "startingCheckpointSha256": report["startingCheckpointSha256"]}, temporary_best)
                temporary_best.replace(args.output / "checkpoint-best-projection.pt")
            recovery = {"epoch": epoch, "epochsPlanned": args.epochs, "headState": head.state_dict(), "optimizerState": optimizer.state_dict(),
                        "bestEpoch": best_epoch, "bestValidationTop1": best, "bestState": best_state, "calibration": calibration,
                        "manifestSha256": report["manifestSha256"], "startingCheckpointSha256": report["startingCheckpointSha256"],
                        "configuration": report["configuration"], "optimizerSteps": total_steps}
            temporary_recovery = args.output / "checkpoint-latest.pt.tmp"
            torch.save(recovery, temporary_recovery)
            temporary_recovery.replace(args.output / "checkpoint-latest.pt")
            recovery_sha = sha256(args.output / "checkpoint-latest.pt")
            report["trainingPerformed"] = True
            report["epochs"][-1].update({"currentBestEpoch": best_epoch, "recoveryCheckpointSha256": recovery_sha,
                                          "bestProjectionCheckpointSha256": sha256(args.output / "checkpoint-best-projection.pt")})
            save_json(args.output / "report.json", report)
            print(f"EXPANDED epoch {epoch}: loss {np.mean(losses):.4f}, validation Top1 {validation['knownTop1Accuracy']:.1%}", flush=True)
        head.load_state_dict(best_state)
        delta = float(sum((best_state[key] - initial[key]).square().sum() for key in initial).sqrt())
        if delta <= 0:
            raise ValueError("Projection weights did not change")
        saved_state = dict(previous["state"])
        saved_state.update({"fc." + key: value for key, value in best_state.items()})
        checkpoint = {"format": previous["format"], "initialization": "met", "baseWeights": previous["baseWeights"], "state": saved_state,
                      "epoch": best_epoch, "calibration": calibration, "manifestSha256": report["manifestSha256"],
                      "continuedFromCheckpointSha256": report["startingCheckpointSha256"]}
        torch.save(checkpoint, args.output / "adapter.pt")
        restored, round_trip = load_adapter(args.output / "adapter.pt")
        assert all(torch.equal(value, round_trip["state"][key]) for key, value in saved_state.items())
        assert all(torch.equal(value, previous["state"][key]) for key, value in saved_state.items() if key.startswith("layer4."))
        head = restored.fc
        save_json(args.output / "selection-before-test.json", {"epoch": best_epoch, "calibration": calibration,
                  "criterion": "full mini gallery validation known Top1, earliest epoch on ties", "checkpointSha256": sha256(args.output / "adapter.pt")})
        print("FINAL TEST: selected projection sealed; encoding held-out test photos", flush=True)
        key = cache_key(manifest["test"], manifest, checkpoint_sha, "test-after-selection")
        test_features, seconds, cache_records["testAfterSelection"] = cached_features(args.feature_cache_dir, key, model, args.image_dir,
                                                                                       manifest["test"], "test")
        report["featureCaches"] = cache_records
        report["featureTimingsSeconds"]["test"] = seconds
        legacy = json.loads(args.legacy_manifest.read_text(encoding="utf-8"))
        legacy_paths = {row["path"] for row in legacy["gallery"]}
        gallery_paths = {row["path"] for row in manifest["gallery"]}
        if not legacy_paths <= gallery_paths:
            raise ValueError("Expanded gallery does not contain all legacy reference images")
        mask = np.array([row["path"] in legacy_paths for row in manifest["gallery"]])
        report["comparisons"] = {}
        shipped = None
        for name, candidate in [("starting_checkpoint", teacher), ("continued_training", head)]:
            for scope, selected_mask in [("expanded", None), ("legacy_reference_subset", mask)]:
                vp, vs, _ = evaluate_head(candidate, gallery_features, validation_features, manifest, "validation", selected_mask)
                current_calibration = calibrate(vs, manifest["validation"])
                tp, ts, descriptors = evaluate_head(candidate, gallery_features, test_features, manifest, "test", selected_mask)
                key = name + "/" + scope
                report["comparisons"][key] = {"validation": metrics(vp, vs, manifest["validation"], current_calibration["similarityThreshold"]),
                                             "test": metrics(tp, ts, manifest["test"], current_calibration["similarityThreshold"]), "calibration": current_calibration,
                                             "galleryReferences": len(descriptors)}
                if scope == "expanded":
                    write_predictions(args.output / (name + "-predictions.json"), manifest["test"], tp, ts, current_calibration["similarityThreshold"])
                if name == "continued_training" and scope == "expanded":
                    assert current_calibration == calibration
                    shipped = descriptors
        checksum = sha256(args.output / "adapter.pt")
        np.savez_compressed(args.output / "gallery-fit384.npz", features=shipped, ids=np.array([row["id"] for row in manifest["gallery"]]),
                            checkpointSha256=np.array(checksum), transform=np.array("fit384"), calibrationJson=np.array(json.dumps(calibration)))
        gallery_sha = sha256(args.output / "gallery-fit384.npz")
        report.update({"status": "completed", "selectedEpoch": best_epoch, "optimizerSteps": total_steps, "parameterChangeL2": delta,
                       "checkpointRoundTripVerified": True, "frozenBackboneVerifiedUnchanged": True, "checkpointSha256": checksum,
                       "gallerySha256": gallery_sha,
                       "baselineValidationBetterThanTrained": best < report["baseline"]["validation"]["knownTop1Accuracy"]})
        save_json(args.output / "inference.json", {"version": 1, "protocol": "fit384", "galleryFile": "gallery-fit384.npz", "gallerySha256": gallery_sha,
                  "checkpointSha256": checksum, "manifestSha256": report["manifestSha256"]})
        if args.all_gallery_training:
            run_kind = "16-epoch formal run" if args.epochs == 16 else f"{args.epochs}-epoch Smoke Run"
            card = f"""# Met full-gallery retrieval {run_kind}

This run performed real gradient training of the 512-dimensional ResNet18 projection head on the complete cleaned mini gallery. It is a full-gallery/transductive instance-retrieval experiment, not an unseen-identity generalization test.

- Raw gallery references: {report['data']['rawGalleryImages']}
- References used for gradients: {report['data']['actualTrainingReferences']}
- Training identities: {report['data']['actualTrainingClassesAfterByteDeduplication']}
- Query pixels used for training: false
- Evaluation identities seen in gallery training: true
- Unseen identity generalization claim: false
- Epochs / optimizer steps: {len(report['epochs'])} / {total_steps}
- Selected epoch: {best_epoch} (validation Top-1, earliest epoch on ties)
- Device: CPU ({torch.__version__})
- Checkpoint SHA256: `{checksum}`
- Gallery index SHA256: `{gallery_sha}`

Validation selected the checkpoint and rejection threshold before test features were encoded. OpenCLIP and Qwen were not trained. Production Scan was not changed.
"""
            (args.output / "MODEL_CARD.md").write_text(card, encoding="utf-8")
        print(json.dumps({"status": report["status"], "selectedEpoch": best_epoch, "comparisons": report["comparisons"]}, indent=2), flush=True)
    except BaseException as error:
        report["status"] = terminal_failure_status(error)
        report["error"] = f"{type(error).__name__}: {error}"
        raise
    finally:
        report["elapsedSeconds"] = round(time.monotonic() - started, 3)
        report["finishedAt"] = datetime.now(timezone.utc).isoformat()
        report["resources"] = resource_snapshot(args.output)
        save_json(args.output / "report.json", report)


if __name__ == "__main__":
    main()
