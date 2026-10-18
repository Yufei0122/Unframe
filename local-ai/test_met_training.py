import copy
import hashlib
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


def metadata():
    return {
        "mini_MET_database.json": [{"id": key, "path": f"MET/{key}/{image}.jpg"} for key in [1, 2, 10, 11, 12] for image in [0, 1]],
        "valset.json": [{"MET_id": 1, "path": "test_met/val.jpg"}, {"path": "test_other/val.jpg"}, {"path": "test_noart/val.jpg"}],
        "testset.json": [{"MET_id": 2, "path": "test_met/test.jpg"}, {"path": "test_other/test.jpg"}, {"path": "test_noart/test.jpg"}],
    }


class MetTrainingTests(unittest.TestCase):
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
