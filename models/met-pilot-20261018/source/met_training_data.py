"""Download and select the original Met benchmark without executing publisher code."""
from __future__ import annotations

import concurrent.futures
import hashlib
import json
import random
import shutil
import tarfile
import time
import urllib.request
from collections import defaultdict
from pathlib import Path, PurePosixPath

PUBLISHER = "https://cmp.felk.cvut.cz/met/"
# These are the publisher's original links. Archives contain data only; pretrained
# executable model state is obtained separately from the HTTPS PyTorch registry.
SOURCE_BASE = "http://ptak.felk.cvut.cz/met/dataset/"
ARCHIVES = {
    "ground_truth.tar.gz": 2_891_859,
    "small_MET.tar.gz": 2_865_082_125,
    "test_met.tar.gz": 34_048_842,
    "test_noart.tar.gz": 815_534_763,
    "test_other.tar.gz": None,
}


def save_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(name, directory):
    if name not in ARCHIVES:
        raise ValueError("Unsupported benchmark archive")
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    url = SOURCE_BASE + name
    record_path = path.with_suffix(path.suffix + ".json")
    if path.is_file() and record_path.is_file():
        record = json.loads(record_path.read_text(encoding="utf-8"))
        if record.get("url") != url or record.get("bytes") != path.stat().st_size or record.get("sha256") != sha256(path):
            raise ValueError(f"Cached archive integrity failed: {name}; inspect the cache before retrying")
        if ARCHIVES[name] is not None and record["bytes"] != ARCHIVES[name]:
            raise ValueError("Cached archive has another dataset version")
        print(f"CACHED {name}: {record['sha256'][:12]}", flush=True)
        return record
    with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=30) as response:
        length = int(response.headers["Content-Length"])
    if not 0 < length <= 3_500_000_000:
        raise ValueError("Unexpected archive size")
    expected = ARCHIVES[name]
    if expected is not None and length != expected:
        raise ValueError(f"Publisher archive changed: {name}; inspect before training")
    if not path.exists() or path.stat().st_size != length:
        partial = path.with_suffix(path.suffix + ".partial")
        print(f"DOWNLOAD {name}: {length / 1e6:.1f} MB", flush=True)
        last_log = time.monotonic()
        for attempt in range(4):
            start = partial.stat().st_size if partial.exists() else 0
            if start >= length:
                partial.unlink()
                start = 0
            request = urllib.request.Request(url, headers={"Range": f"bytes={start}-"} if start else {})
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    if start and response.status != 206:
                        raise RuntimeError("Publisher did not honour a resumable download")
                    with partial.open("ab" if start else "wb") as output:
                        while chunk := response.read(4 * 1024 * 1024):
                            output.write(chunk)
                            if output.tell() > length:
                                raise ValueError("Archive exceeds advertised length")
                            if time.monotonic() - last_log > 15:
                                print(f"DOWNLOAD {name}: {output.tell() / length:.0%}", flush=True)
                                last_log = time.monotonic()
                if partial.stat().st_size != length:
                    raise RuntimeError("Incomplete archive")
                partial.replace(path)
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(1)
    record = {"url": url, "bytes": length, "sha256": sha256(path), "integrity": "Observed download SHA256; publisher supplies no authenticated digest"}
    save_json(record_path, record)
    print(f"READY {name}: {record['sha256'][:12]}", flush=True)
    return record


def download_all(directory):
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        records = dict(zip(ARCHIVES, executor.map(lambda name: download(name, directory), ARCHIVES)))
    save_json(Path(directory) / "sources.json", {"publisher": PUBLISHER, "archives": records})
    return records


def read_ground_truth(archive):
    expected = {"mini_MET_database.json", "valset.json", "testset.json"}
    result = {}
    with tarfile.open(archive, "r:gz") as source:
        for member in source:
            if member.name not in expected:
                continue
            if not member.isfile() or member.size > 25_000_000:
                raise ValueError("Invalid benchmark metadata")
            result[member.name] = json.load(source.extractfile(member))
    if set(result) != expected:
        raise ValueError("Missing benchmark split metadata")
    return result


def select_manifest(metadata, *, train_classes=512, distractor_classes=128, negatives_per_group=96, seed=7):
    rng = random.Random(seed)
    grouped = defaultdict(list)
    for row in metadata["mini_MET_database.json"]:
        grouped[int(row["id"])].append({"path": row["path"], "id": int(row["id"])})
    splits = {}
    for name, key in [("validation", "valset.json"), ("test", "testset.json")]:
        rows = metadata[key]
        selected = [{"path": row["path"], "id": int(row["MET_id"]), "group": "known"}
                    for row in rows if row["path"].startswith("test_met/")]
        for group in ["test_other", "test_noart"]:
            candidates = [row for row in rows if row["path"].startswith(group + "/")]
            for row in rng.sample(candidates, min(negatives_per_group, len(candidates))):
                selected.append({"path": row["path"], "id": -1, "group": group})
        splits[name] = selected
    evaluation_ids = {row["id"] for rows in splits.values() for row in rows if row["id"] >= 0}
    if not evaluation_ids <= set(grouped):
        raise ValueError("Mini gallery does not cover official known queries")
    candidates = sorted(key for key, rows in grouped.items() if len(rows) >= 2 and key not in evaluation_ids)
    if len(candidates) < train_classes:
        raise ValueError("Not enough distinct, multi-reference training identities")
    train_ids = set(rng.sample(candidates, train_classes))
    remaining = sorted(set(grouped) - train_ids - evaluation_ids)
    distractor_ids = set(rng.sample(remaining, min(distractor_classes, len(remaining))))
    gallery_ids = train_ids | evaluation_ids | distractor_ids
    gallery = [row for key in sorted(gallery_ids) for row in sorted(grouped[key], key=lambda row: row["path"])[:3]]
    training = [row for row in gallery if row["id"] in train_ids]
    manifest = {"dataset": "The Met Dataset / official mini gallery and official query splits", "publisher": PUBLISHER,
                "seed": seed, "training": training, "gallery": gallery, **splits,
                "selection": {"trainingClasses": len(train_ids), "galleryClasses": len(gallery_ids), "evaluationClasses": len(evaluation_ids),
                              "negativeSamplesPerGroupPerSplit": negatives_per_group, "maxReferencesPerClass": 3,
                              "trainingIdentitiesExcludedFromQueryIdentities": True},
                "limitation": "A selected gallery and sampled unknowns, not the full benchmark. Official positive query splits are retained. Gallery metadata selects supported identities; no query pixels enter training."}
    validate_manifest(manifest)
    return manifest


def validate_manifest(manifest):
    sets = {key: {row["path"] for row in manifest[key]} for key in ["training", "gallery", "validation", "test"]}
    if not sets["training"] <= sets["gallery"]:
        raise ValueError("Training references must belong to gallery")
    for left, right in [("gallery", "validation"), ("gallery", "test"), ("validation", "test")]:
        if sets[left] & sets[right]:
            raise ValueError("Query pixels leak between splits")
    trained = {row["id"] for row in manifest["training"]}
    query_ids = {row["id"] for key in ["validation", "test"] for row in manifest[key] if row["id"] >= 0}
    if trained & query_ids:
        raise ValueError("Supervised training identities overlap evaluation identities")
    for rows in [manifest[key] for key in sets]:
        for row in rows:
            path = PurePosixPath(row["path"])
            if path.is_absolute() or ".." in path.parts or "\\" in row["path"] or path.suffix.lower() != ".jpg":
                raise ValueError("Unsafe benchmark image path")


def extract_selected(archives, root, manifest):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    selected = {row["path"] for key in ["gallery", "validation", "test"] for row in manifest[key]}
    cache_file = root / "image-integrity.json"
    cache = json.loads(cache_file.read_text(encoding="utf-8")) if cache_file.is_file() else {}
    for name in selected:
        if not (root / name).resolve().is_relative_to(root.resolve()):
            raise ValueError("Image cache contains a path escaping the dataset root")
        if name in cache and (root / name).is_file() and sha256(root / name) != cache[name]:
            raise ValueError(f"Cached benchmark image changed: {name}")
    groups = {"small_MET.tar.gz": "MET/", "test_met.tar.gz": "test_met/", "test_other.tar.gz": "test_other/", "test_noart.tar.gz": "test_noart/"}
    for archive, prefix in groups.items():
        needed = {name for name in selected if name.startswith(prefix) and (name not in cache or not (root / name).is_file())}
        if not needed:
            continue
        print(f"EXTRACT {archive}: {len(needed)} selected images", flush=True)
        with tarfile.open(Path(archives) / archive, "r|gz") as source:
            for member in source:
                name = member.name.removeprefix("./")
                if name not in needed:
                    continue
                if not member.isfile() or not 0 < member.size <= 8_000_000:
                    raise ValueError("Unsafe benchmark archive member")
                destination = root / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                with source.extractfile(member) as image, destination.open("wb") as output:
                    shutil.copyfileobj(image, output)
                needed.remove(name)
                if not needed:
                    break
        if needed:
            raise ValueError(f"Missing {len(needed)} selected images from {archive}: {sorted(needed)[:3]}")
    hashes = {name: sha256(root / name) for name in sorted(selected)}
    # Catch identical pixel files even when they have different names or split labels.
    for left, right in [("gallery", "validation"), ("gallery", "test"), ("validation", "test")]:
        a = {hashes[row["path"]] for row in manifest[left]}
        b = {hashes[row["path"]] for row in manifest[right]}
        if a & b:
            raise ValueError(f"Byte-identical images overlap {left} and {right}")
    manifest["imageSha256"] = hashes
    cache.update(hashes)
    save_json(cache_file, cache)
    return manifest
