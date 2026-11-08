import copy
import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
import torch
from PIL import Image

from met_training_data import SOURCE_BASE, download, save_json, select_manifest, validate_manifest
from train_met import calibrate, contrastive_loss, metrics, rank
from met_pretrained import NormalizedGeM, convert_state
from evaluate_met_fullframe import fit384
from train_met import NORMALIZE
from train_met_expanded import hard_batches, reference_groups
from met_catalogue import extract_catalogue, load_local_catalogue
from met_training_data import sha256
from query_met import load_gallery, load_openclip_gallery
from model import MODEL, PRETRAINED
from summarize_met import painting_metrics


def metadata():
    return {
        "mini_MET_database.json": [{"id": key, "path": f"MET/{key}/{image}.jpg"} for key in [1, 2, 10, 11, 12] for image in [0, 1]],
        "valset.json": [{"MET_id": 1, "path": "test_met/val.jpg"}, {"path": "test_other/val.jpg"}, {"path": "test_noart/val.jpg"}],
        "testset.json": [{"MET_id": 2, "path": "test_met/test.jpg"}, {"path": "test_other/test.jpg"}, {"path": "test_noart/test.jpg"}],
    }


class MetTrainingTests(unittest.TestCase):
    def test_exported_openclip_index_cannot_be_opened_with_another_model_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save_json(root / "manifest.json", {"gallery": []})
            features = np.zeros((1, 512), dtype=np.float16)
            features[0, 0] = 1
            np.savez_compressed(root / "openclip-gallery.npz", features=features, ids=np.array([10]), model=np.array(MODEL),
                                pretrained=np.array(PRETRAINED), calibrationJson=np.array(json.dumps({"similarityThreshold": .8})))
            manifest = {"version": 1, "provider": "openclip", "model": MODEL, "pretrained": PRETRAINED, "dimensions": 512,
                        "normalized": True, "protocol": "openclip_eval", "galleryFile": "openclip-gallery.npz",
                        "manifestSha256": sha256(root / "manifest.json"), "gallerySha256": sha256(root / "openclip-gallery.npz")}
            save_json(root / "openclip-inference.json", manifest)
            self.assertEqual(load_openclip_gallery(root)[1].tolist(), [10])
            manifest["pretrained"] = "another-space"
            save_json(root / "openclip-inference.json", manifest)
            with self.assertRaisesRegex(ValueError, "Incompatible OpenCLIP"):
                load_openclip_gallery(root)
    def test_painting_diagnostics_distinguish_artist_agreement_from_work_identity(self):
        catalogue = {"10": {"classification": "Paintings", "artist": "Claude Monet"}, "11": {"classification": "Paintings", "artist": "Claude Monet"},
                     "12": {"classification": "Paintings", "artist": "Vincent van Gogh"}, "13": {"classification": "Vases", "artist": None}}
        rows = [{"expectedMetId": 10, "predictedMetIds": [11, 10], "accepted": True},
                {"expectedMetId": 12, "predictedMetIds": [12, 10], "accepted": False},
                {"expectedMetId": 13, "predictedMetIds": [13, 10], "accepted": True}]
        result = painting_metrics(rows, catalogue)
        self.assertEqual(result["positivePaintingQueries"], 2)
        self.assertEqual(result["paintingArtworkTop1Accuracy"], .5)
        self.assertEqual(result["paintingArtistTop1Accuracy"], 1.)
        self.assertEqual(result["paintingPositiveAcceptedPrecision"], 0.)

    def test_official_csv_lookup_preserves_quoted_titles_and_does_not_guess_artists(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "MetObjects.csv"
            with path.open("w", encoding="utf-8", newline="") as output:
                writer = csv.writer(output)
                writer.writerow(["Object ID", "Title", "Artist Display Name", "Object Date"])
                writer.writerow([10, 'A painting, "blue"', "Vincent van Gogh", "1887"])
                writer.writerow([11, "Vase", "", "1200"])
                writer.writerow([12, "Unselected", "Other artist", "1900"])
            result = extract_catalogue(path, {10, 11, 13})
            self.assertEqual(result["10"]["title"], 'A painting, "blue"')
            self.assertIsNone(result["11"]["artist"])
            self.assertNotIn("12", result)
            self.assertNotIn("13", result)

    def test_local_catalogue_rejects_corruption_and_another_gallery(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save_json(root / "catalogue.json", {"version": 1, "objects": {"10": {"title": "Artwork"}}})
            save_json(root / "catalogue-source.json", {"manifestSha256": "expected", "catalogueSha256": sha256(root / "catalogue.json")})
            self.assertIn("10", load_local_catalogue(root, "expected"))
            with self.assertRaisesRegex(ValueError, "another reference"):
                load_local_catalogue(root, "other")
            (root / "catalogue.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "checksum"):
                load_local_catalogue(root, "expected")

    def test_inference_manifest_binds_gallery_weights_and_fullframe_preprocessing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            save_json(root / "manifest.json", {"gallery": []})
            np.savez_compressed(root / "gallery-fit384.npz", features=np.array([[1., 0.]], dtype=np.float16), ids=np.array([10]),
                                checkpointSha256=np.array("model-sha"), transform=np.array("fit384"),
                                calibrationJson=np.array(json.dumps({"similarityThreshold": .5})))
            save_json(root / "inference.json", {"version": 1, "protocol": "fit384", "galleryFile": "gallery-fit384.npz", "checkpointSha256": "model-sha",
                                               "manifestSha256": sha256(root / "manifest.json"), "gallerySha256": sha256(root / "gallery-fit384.npz")})
            protocol, features, ids, calibration, _ = load_gallery(root, "model-sha")
            self.assertEqual((protocol, ids.tolist(), features.dtype), ("fit384", [10], np.dtype("float16")))
            self.assertEqual(calibration["similarityThreshold"], .5)
            with self.assertRaisesRegex(ValueError, "another checkpoint"):
                load_gallery(root, "other")
            with self.assertRaisesRegex(ValueError, "only the full-frame"):
                load_gallery(root, "model-sha", "center224")
            (root / "gallery-fit384.npz").write_bytes(b"corrupt")
            with self.assertRaisesRegex(ValueError, "Gallery file checksum"):
                load_gallery(root, "model-sha")

    def test_hard_negative_batches_cover_each_identity_once_including_odd_tail(self):
        for count in [2, 3, 33, 97]:
            neighbours = np.array([[(i + j) % count for j in range(1, min(count, 9))] for i in range(count)])
            batches = hard_batches(neighbours, 32, np.random.default_rng(17))
            flattened = [item for batch in batches for item in batch]
            self.assertEqual(sorted(flattened), list(range(count)))
            self.assertTrue(all(2 <= len(batch) <= 33 for batch in batches))

    def test_duplicate_reference_bytes_cannot_be_used_as_different_positive_views(self):
        rows = [{"id": identity, "path": f"MET/{identity}/{view}.jpg"} for identity in [10, 11, 12] for view in [0, 1]]
        hashes = {row["path"]: str(i) for i, row in enumerate(rows)}
        hashes[rows[1]["path"]] = hashes[rows[0]["path"]]
        data = {"gallery": rows, "training": rows, "imageSha256": hashes}
        self.assertEqual(set(reference_groups(data)), {11, 12})
        hashes[rows[2]["path"]] = hashes[rows[4]["path"]]
        with self.assertRaisesRegex(ValueError, "Too few"):
            reference_groups(data)

    def test_full_gallery_keeps_unselected_artworks_and_all_reference_views(self):
        source = metadata()
        source["mini_MET_database.json"] += [{"id": 99, "path": f"MET/99/{i}.jpg"} for i in range(5)]
        source["mini_MET_database.json"].append({"id": 100, "path": "MET/100/0.jpg"})
        result = select_manifest(source, train_classes=2, negatives_per_group=1, full_gallery=True)
        self.assertEqual(len(result["gallery"]), len(source["mini_MET_database.json"]))
        self.assertIn(100, {row["id"] for row in result["gallery"]})
        self.assertEqual(sum(row["id"] == 99 for row in result["gallery"]), 5)
        self.assertFalse({row["id"] for row in result["training"]} & {1, 2})

    def test_blocked_retrieval_matches_brute_force_across_query_chunks(self):
        rng = np.random.default_rng(11)
        gallery, queries = rng.normal(size=(113, 9)).astype("float32"), rng.normal(size=(135, 9)).astype("float32")
        ids = rng.integers(1, 31, size=113)
        actual_ids, actual_scores = rank(gallery, ids, queries)
        identities = np.unique(ids)
        brute = np.stack([(queries @ gallery.T)[:, ids == key].max(axis=1) for key in identities], axis=1)
        order = np.argsort(-brute, axis=1, kind="stable")[:, :5]
        np.testing.assert_array_equal(actual_ids, identities[order])
        np.testing.assert_allclose(actual_scores, np.take_along_axis(brute, order, axis=1), atol=1e-5)

    def test_selection_preserves_query_splits_and_excludes_their_artworks_from_training(self):
        data = select_manifest(metadata(), train_classes=2, distractor_classes=1, negatives_per_group=1, seed=7)
        self.assertFalse({row["id"] for row in data["training"]} & {1, 2})
        self.assertEqual(data["validation"][0]["path"], "test_met/val.jpg")
        self.assertEqual(data["test"][0]["path"], "test_met/test.jpg")
        self.assertEqual(len(data["validation"]), 3)
        self.assertEqual(data, select_manifest(metadata(), train_classes=2, distractor_classes=1, negatives_per_group=1, seed=7))

    def test_query_pixels_and_identity_leakage_are_rejected(self):
        original = select_manifest(metadata(), train_classes=2, negatives_per_group=1)
        data = copy.deepcopy(original)
        data["test"][0]["path"] = data["validation"][0]["path"]
        with self.assertRaisesRegex(ValueError, "leak"):
            validate_manifest(data)
        data = copy.deepcopy(original)
        data["test"][0]["id"] = data["training"][0]["id"]
        with self.assertRaisesRegex(ValueError, "identities overlap"):
            validate_manifest(data)

    def test_unsafe_image_paths_are_rejected(self):
        data = select_manifest(metadata(), train_classes=2, negatives_per_group=1)
        data["test"][0]["path"] = "../../outside.jpg"
        with self.assertRaisesRegex(ValueError, "Unsafe"):
            validate_manifest(data)

    def test_multi_image_retrieval_ranks_distinct_artwork_ids(self):
        gallery = np.array([[1., 0.], [.99, .01], [0., 1.]])
        predictions, scores = rank(gallery, np.array([100, 100, 200]), np.array([[1., 0.], [0., 1.]]))
        self.assertEqual(predictions.tolist(), [[100, 200], [200, 100]])
        self.assertEqual(scores[:, 0].tolist(), [1., 1.])

    def test_contrastive_objective_favours_the_correct_pairs_and_has_finite_gradients(self):
        left = torch.eye(4, requires_grad=True)
        right = torch.eye(4)
        correct = contrastive_loss(left, right)
        wrong = contrastive_loss(left, right.roll(1, 0))
        self.assertLess(float(correct.detach()), float(wrong.detach()))
        correct.backward()
        self.assertTrue(torch.isfinite(left.grad).all())

    def test_unknown_threshold_is_calibrated_from_validation_unknowns(self):
        rows = [{"id": 100, "group": "known"}, {"id": -1, "group": "test_other"}, {"id": -1, "group": "test_noart"}]
        predictions = np.array([[100, 200], [100, 200], [200, 100]])
        scores = np.array([[.95, .2], [.8, .2], [.4, .2]])
        calibration = calibrate(scores, rows)
        self.assertGreater(calibration["similarityThreshold"], .8)
        result = metrics(predictions, scores, rows, calibration["similarityThreshold"])
        self.assertEqual(result["unknownFalsePositiveRate"], 0.)
        self.assertEqual(result["knownCorrectAndAcceptedRate"], 1.)

    def test_verified_archives_can_be_reused_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ground_truth.tar.gz"
            path.write_bytes(b"abc")
            save_json(path.with_suffix(path.suffix + ".json"), {"url": SOURCE_BASE + path.name, "bytes": 3, "sha256": hashlib.sha256(b"abc").hexdigest()})
            with patch.dict("met_training_data.ARCHIVES", {path.name: 3}), patch("urllib.request.urlopen", side_effect=AssertionError("Cache reuse must not need a network")):
                self.assertEqual(download(path.name, directory)["bytes"], 3)
                path.write_bytes(b"abd")
                with self.assertRaisesRegex(ValueError, "integrity failed"):
                    download(path.name, directory)

    def test_invalid_vectors_cannot_return_apparently_valid_identities(self):
        with self.assertRaisesRegex(ValueError, "Non-finite"):
            rank(np.array([[np.nan, 0.]]), np.array([1]), np.array([[1., 0.]]))
        with self.assertRaisesRegex(ValueError, "Incompatible"):
            rank(np.ones((1, 3)), np.array([1]), np.ones((1, 2)))

    def test_publisher_layout_conversion_handles_legacy_projection_bias(self):
        values = {"backbone.backbone.0.weight": torch.ones(2, 3, 3, 3), "backbone.projector.bias": torch.zeros(1, 512), "backbone.pool.p": torch.tensor([3.])}
        converted = convert_state(values)
        self.assertEqual(tuple(converted["fc.bias"].shape), (512,))
        self.assertIn("conv1.weight", converted)
        with self.assertRaisesRegex(ValueError, "Unexpected publisher tensor"):
            convert_state({"unexpected": torch.ones(1)})

    def test_gem_pooling_is_finite_normalised_and_differentiable(self):
        pool = NormalizedGeM()
        values = torch.rand(2, 8, 4, 4, requires_grad=True)
        result = pool(values)
        self.assertTrue(torch.allclose(result.flatten(1).norm(dim=1), torch.ones(2), atol=1e-6))
        result.sum().backward()
        self.assertTrue(torch.isfinite(values.grad).all())

    def test_fullframe_preprocessing_retains_both_edges_and_aspect_ratio(self):
        image = Image.new("RGB", (768, 192), "black")
        image.paste("red", (0, 0, 64, 192))
        image.paste("blue", (704, 0, 768, 192))
        result = fit384(image)
        self.assertEqual(tuple(result.shape), (3, 96, 384))
        pixels = result * torch.tensor(NORMALIZE.std)[:, None, None] + torch.tensor(NORMALIZE.mean)[:, None, None]
        self.assertTrue(torch.allclose(pixels[:, 48, 1], torch.tensor([1., 0., 0.]), atol=1e-5))
        self.assertTrue(torch.allclose(pixels[:, 48, -2], torch.tensor([0., 0., 1.]), atol=1e-5))


if __name__ == "__main__":
    unittest.main()
