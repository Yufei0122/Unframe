"""Build offline title/artist metadata from the Met's public CC0 catalogue."""
import argparse
import csv
import json
import time
import urllib.request
from pathlib import Path

from met_training_data import save_json, sha256
from train_met import ROOT

# Pin both a public Git commit and the SHA256 published in its Git LFS pointer.
COMMIT = "ee02ef674f1a4e7d6658900765cfa6072a41fffe"
CHECKSUM = "d59d84a3d3588849dfcbc0fe534efffe1d59ed83695adfe7d8db71fb4f3854d0"
SIZE = 340_762_089
URL = f"https://media.githubusercontent.com/media/metmuseum/openaccess/{COMMIT}/MetObjects.csv"


def download_catalogue(directory):
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"MetObjects-{CHECKSUM[:12]}.csv"
    if target.is_file():
        if target.stat().st_size != SIZE or sha256(target) != CHECKSUM:
            raise ValueError("Cached Met catalogue checksum failed")
        return target
    partial = target.with_suffix(".partial")
    last_log = time.monotonic()
    print("Downloading pinned public Met catalogue", flush=True)
    with urllib.request.urlopen(URL, timeout=60) as response, partial.open("wb") as output:
        while chunk := response.read(2 * 1024 * 1024):
            output.write(chunk)
            if output.tell() > SIZE:
                raise ValueError("Met catalogue exceeds expected size")
            if time.monotonic() - last_log > 15:
                print(f"CATALOGUE {output.tell()/SIZE:.0%}", flush=True)
                last_log = time.monotonic()
    if partial.stat().st_size != SIZE or sha256(partial) != CHECKSUM:
        raise ValueError("Downloaded Met catalogue checksum failed")
    partial.replace(target)
    return target


def extract_catalogue(path, identities):
    objects = {}
    csv.field_size_limit(1_000_000)
    with path.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"Object ID", "Title", "Artist Display Name", "Object Date"}
        if not required <= set(reader.fieldnames or []):
            raise ValueError("Unsupported official Met CSV layout")
        for row in reader:
            try:
                identity = int(row["Object ID"])
            except (ValueError, TypeError):
                continue
            if identity not in identities:
                continue
            key = str(identity)
            if key in objects:
                raise ValueError("Official catalogue contains duplicate object IDs")
            objects[key] = {"metObjectId": identity, "title": row["Title"].strip() or None,
                            "artist": row["Artist Display Name"].strip() or None, "date": row["Object Date"].strip() or None,
                            "classification": row.get("Classification", "").strip() or None,
                            "department": row.get("Department", "").strip() or None,
                            "sourceUrl": f"https://www.metmuseum.org/art/collection/search/{identity}"}
    return objects


def load_local_catalogue(run, expected_manifest_sha=None):
    path, provenance = run / "catalogue.json", run / "catalogue-source.json"
    if not path.is_file():
        return {}
    record = json.loads(provenance.read_text(encoding="utf-8"))
    if sha256(path) != record["catalogueSha256"]:
        raise ValueError("Local catalogue checksum failed")
    if expected_manifest_sha and record["manifestSha256"] != expected_manifest_sha:
        raise ValueError("Local catalogue belongs to another reference manifest")
    catalogue = json.loads(path.read_text(encoding="utf-8"))
    if catalogue.get("version") != 1:
        raise ValueError("Unsupported local catalogue")
    return catalogue["objects"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--cache-dir", type=Path, default=ROOT / ".local-ai/cache/met-catalogue")
    args = parser.parse_args()
    manifest_path = args.run / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (args.run / "catalogue.json").exists():
        raise ValueError("Preserve the existing catalogue; choose another output run to rebuild")
    source = download_catalogue(args.cache_dir)
    identities = {int(row["id"]) for row in manifest["gallery"]}
    objects = extract_catalogue(source, identities)
    result = {"version": 1, "objects": objects, "missingObjectIds": sorted(identities - {int(key) for key in objects}),
              "note": "Catalogue metadata only. Missing or unknown artists remain null; no attribution is invented."}
    save_json(args.run / "catalogue.json", result)
    record = {"version": 1, "url": URL, "gitCommit": COMMIT, "upstreamCsvSha256": CHECKSUM,
              "gitLfsPointerUrl": f"https://raw.githubusercontent.com/metmuseum/openaccess/{COMMIT}/MetObjects.csv",
              "manifestSha256": sha256(manifest_path), "catalogueSha256": sha256(args.run / "catalogue.json"),
              "matchedObjects": len(objects), "galleryObjects": len(identities),
              "license": "Public Met Open Access catalogue metadata (CC0)", "photosUploaded": False}
    save_json(args.run / "catalogue-source.json", record)
    print(json.dumps(record, indent=2), flush=True)


if __name__ == "__main__":
    main()
