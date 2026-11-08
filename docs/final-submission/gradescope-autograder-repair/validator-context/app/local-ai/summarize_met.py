"""Independently recount expanded-gallery predictions and painting diagnostics."""
import argparse
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from met_catalogue import load_local_catalogue
from met_training_data import save_json, sha256


def recount(rows, threshold):
    known = [row for row in rows if row["expectedMetId"] >= 0]
    unknown = [row for row in rows if row["expectedMetId"] < 0]
    if not known or not unknown:
        raise ValueError("Both known and unknown queries are required")
    for row in rows:
        if len(row["predictedMetIds"]) != 5 or len(set(row["predictedMetIds"])) != 5:
            raise ValueError("Predictions must rank five different artwork IDs")
        if len(row["cosineSimilarities"]) != 5 or not all(math.isfinite(value) for value in row["cosineSimilarities"]):
            raise ValueError("Invalid prediction scores")
        if row["accepted"] != (row["cosineSimilarities"][0] >= threshold):
            raise ValueError("Saved acceptance does not match its validation threshold")
    correct = sum(row["predictedMetIds"][0] == row["expectedMetId"] for row in known)
    accepted_correct = sum(row["accepted"] and row["predictedMetIds"][0] == row["expectedMetId"] for row in known)
    accepted = sum(row["accepted"] for row in rows)
    return {"knownTop1Accuracy": correct / len(known),
            "knownTop5Accuracy": sum(row["expectedMetId"] in row["predictedMetIds"] for row in known) / len(known),
            "knownCorrectAndAcceptedRate": accepted_correct / len(known),
            "unknownFalsePositiveRate": sum(row["accepted"] for row in unknown) / len(unknown),
            "acceptedIdentityPrecision": accepted_correct / max(1, accepted)}


def painting_metrics(rows, catalogue):
    paintings = [row for row in rows if row["expectedMetId"] >= 0 and "painting" in (catalogue.get(str(row["expectedMetId"]), {}).get("classification") or "").lower()]
    named = [row for row in paintings if catalogue[str(row["expectedMetId"])].get("artist")]
    correct = lambda row: row["predictedMetIds"][0] == row["expectedMetId"]
    normalise = lambda value: " ".join((value or "").casefold().split())
    accepted = [row for row in paintings if row["accepted"]]
    artist_correct = sum(normalise(catalogue.get(str(row["predictedMetIds"][0]), {}).get("artist")) == normalise(catalogue[str(row["expectedMetId"])]["artist"]) for row in named)
    return {"definition": "Official catalogue classification contains 'painting' (case-insensitive)",
            "positivePaintingQueries": len(paintings), "paintingArtworks": len({row["expectedMetId"] for row in paintings}),
            "paintingArtworkTop1Accuracy": sum(correct(row) for row in paintings) / len(paintings) if paintings else None,
            "paintingArtworkTop5Accuracy": sum(row["expectedMetId"] in row["predictedMetIds"] for row in paintings) / len(paintings) if paintings else None,
            "paintingCorrectAndAcceptedRate": sum(row["accepted"] and correct(row) for row in paintings) / len(paintings) if paintings else None,
            "paintingAcceptedQueries": len(accepted),
            "paintingPositiveAcceptedPrecision": sum(correct(row) for row in accepted) / len(accepted) if accepted else None,
            "paintingQueriesWithKnownArtist": len(named), "paintingArtistTop1Accuracy": artist_correct / len(named) if named else None,
            "limitation": "Positive painting queries only. Artist agreement does not establish the correct artwork. This is not unknown-query rejection accuracy, and no subgroup test metric selects weights."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True, type=Path)
    parser.add_argument("--output", type=Path, help="Use a new output file when evaluating an additional exported index")
    args = parser.parse_args()
    run = args.run
    output = args.output or run / "evaluation-summary.json"
    if output.exists():
        raise ValueError("Preserve the existing summary")
    report = json.loads((run / "report.json").read_text(encoding="utf-8"))
    if report["status"] != "completed":
        raise ValueError("Training has not completed")
    manifest_sha = sha256(run / "manifest.json")
    if report["manifestSha256"] != manifest_sha or sha256(run / "adapter.pt") != report["checkpointSha256"]:
        raise ValueError("Training artifacts changed")
    manifest = json.loads((run / "manifest.json").read_text(encoding="utf-8"))
    catalogue = load_local_catalogue(run, manifest_sha)
    clip = json.loads((run / "openclip-comparison.json").read_text(encoding="utf-8"))
    if clip["manifestSha256"] != manifest_sha:
        raise ValueError("OpenCLIP used another dataset")
    models = {}
    cases = [(name, name + "-predictions.json", clip["test"] if name == "openclip" else report["comparisons"][name + "/expanded"]["test"])
             for name in ["starting_checkpoint", "continued_training", "openclip"]]
    if (run / "openclip-export-report.json").exists():
        exported = json.loads((run / "openclip-export-report.json").read_text(encoding="utf-8"))
        if exported["manifestSha256"] != manifest_sha or exported["sourceComparisonSha256"] != sha256(run / "openclip-comparison.json"):
            raise ValueError("Exported OpenCLIP index used another comparison")
        cases.append(("openclip_exported", "openclip-index-predictions.json", exported["test"]))
    for name, filename, expected in cases:
        rows = json.loads((run / filename).read_text(encoding="utf-8"))
        if [(row["path"], row["expectedMetId"], row["group"]) for row in rows] != [(row["path"], row["id"], row["group"]) for row in manifest["test"]]:
            raise ValueError("Predictions use another query split")
        counted = recount(rows, expected["similarityThreshold"])
        if any(not math.isclose(value, expected[key], abs_tol=1e-12) for key, value in counted.items()):
            raise ValueError("Reported metrics differ from saved predictions")
        models[name] = {"metricsIndependentlyRecounted": True, "test": expected, "paintingDiagnostics": painting_metrics(rows, catalogue)}
    result = {"status": "passed", "verifiedAt": datetime.now(timezone.utc).isoformat(), "manifestSha256": manifest_sha,
              "models": models, "galleryObjects": manifest["selection"]["galleryClasses"], "galleryReferences": len(manifest["gallery"]),
              "catalogueMatchedObjects": len(catalogue), "sourceSha256": sha256(Path(__file__)),
              "limitation": "Exploratory continuation using the same official query benchmark, not an independent new test set. Metadata-defined painting positives are reported separately; official validation contains only two such painting photos."}
    save_json(output, result)
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    main()
