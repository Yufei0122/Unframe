# Training a Met artwork retrieval pilot

This experiment trains a ResNet18 image encoder on the **original [The Met Dataset](https://cmp.felk.cvut.cz/met/)**. It uses the publisher's mini reference archive and original validation/test query splits. It does not train Qwen, and it does not require paid APIs or cloud GPU services.

The architecture starts from TorchVision's ImageNet ResNet18 weights, freezes layers 1–3, and trains layer 4 plus a 512-dimensional projection using a contrastive objective. Each pair uses two different reference files of the same artwork, with camera-like crops, perspective and colour augmentation. The projection starts as identity so the untrained baseline is the original ImageNet descriptor. Batch-normalisation running statistics stay frozen for the small batches.

Alternatively, `--initialization met` starts from the publisher's **ResNet18-IN-SRC** checkpoint, using its learned GeM pooling and projection. This base already learned from Met gallery identities; exclusion of query identities applies to the additional pilot training, not to that prior pretraining. The visitor-query pixels remain excluded from gradients. The loader pins the original model's SHA256, reads tensors with `weights_only=True`, and only allows the legacy checkpoint's numeric NumPy scalar metadata. It never executes the publisher's Python code or enables unrestricted pickle loading.

## Reproduce training

Use the existing Python environment installed by `ai:setup`. Required packages are torch, torchvision, numpy and Pillow. The experiment is CPU-compatible; the app and Ollama do not need to be running.

```powershell
npm.cmd run test:met
npm.cmd run ai:train:met -- --epochs 8 --train-classes 512
# Continue training the published artwork-specialised base, with lower learning rates:
npm.cmd run ai:train:met -- --epochs 8 --initialization met --layer4-lr 0.0000001 --projection-lr 0.00001
```

Every invocation writes to a new `.local-ai/met-training/<UTC timestamp>` directory. An existing output directory is never overwritten. You can supply `--output`, `--archive-dir`, `--image-dir`, `--seed`, `--threads`, `--batch-size` and `--negatives`. Completed archive downloads are reused with checksum verification, including offline. Use `--prepare-only` to download, select and verify images without training; the report explicitly says no training was performed. A separately configured CUDA-capable PyTorch environment can select `--device cuda`; the default and the recorded cloud pilots use CPU. `PYTHON_EXE` selects another interpreter without changing the application's environment.

Preparation downloads approximately **4.7 GB** of compressed source data: mini gallery, visitor queries, out-of-gallery art, non-art queries and split metadata. It extracts only selected images. Source archives and images remain in ignored `.local-ai` directories. The publisher's original data links use HTTP; the script preserves those published URLs and records observed SHA256 digests. These are local download fingerprints, not publisher-authenticated checksums. The ImageNet base comes from the HTTPS PyTorch registry with its published hash prefix. The optional Met base uses the publisher's original HTTP model link and a pinned full SHA256 observed during this verification.

## Data isolation and evaluation

- 512 multi-reference artwork identities are sampled for training.
- All 129 official positive validation queries and 1,003 official positive test queries are retained. Their 845 artwork identities are excluded from supervised training.
- The selected gallery includes those query identities, the training identities and 128 additional distractor identities. At most three reference images per artwork are retained.
- Each split additionally samples 96 out-of-gallery-art queries and 96 non-art queries with a fixed seed.
- Query filenames and exact byte hashes must not overlap gallery images or each other. No query pixels enter gradient updates.
- Checkpoint selection uses **validation Top-1 only**. Rejection thresholds use validation unknowns only, targeting at most 5% false acceptance on that calibration sample. Test data never selects a checkpoint or threshold.
- Results include Top-1, Top-5, correct-and-accepted rate, unknown false acceptance, and precision among accepted identities. Similarity is not a probability.

This is a selected-gallery research experiment, not the full 224,000-class benchmark. It includes non-painting artworks, follows the source's instance-recognition task, and does not prove identification of arbitrary works or authors outside the selected gallery. The reported test performance, rather than falling training loss, determines whether the model is useful.

The actual cloud runs, trained weights, comparisons and unfavourable first attempt are preserved in the [18 October pilot package](models/met-pilot-20261018/MODEL_CARD.md). Model and preprocessing comparisons are exploratory follow-ups on the same benchmark, not new independent test sets.

## Saved artifacts and querying

A completed run writes:

- `adapter.pt`: trained layer-4/projection weights, base-weight identity, selected epoch and validation threshold.
- `gallery.npz`: reference descriptors tied to that checkpoint's SHA256.
- `manifest.json`: selected rows, split membership and image hashes, without redistributing image pixels.
- `report.json`: configuration, provenance, optimiser steps, per-epoch losses, baseline and trained metrics, parameter changes and checkpoint round-trip checks.
- `test-predictions.json`: every test query's expected ID and actual ranked candidates, including mistakes and rejected unknowns.

```powershell
npm.cmd run ai:met:query -- --run ".local-ai/met-training/<run>" --image "C:\photos\artwork.jpg" --lookup
```

`--lookup` requests catalogue metadata for candidate object IDs from the public Met API. It does not upload the photograph. Returned artist/title fields come from that catalogue, not a model's guess. Without this flag, inference is local after the base weights have been cached. A gallery created with another checkpoint is rejected.

To compare the existing Unframe encoder against the same gallery and query splits:

```powershell
npm.cmd run ai:met:compare -- --run ".local-ai/met-training/<run>"
```

This uses the cached OpenCLIP weights already installed by the app, with no new training or paid request. It writes `openclip-comparison.json` and calibrates its own rejection threshold using the same validation unknowns. It never replaces the trained result or hides an unfavourable comparison.

The original Met model accepts full frames with variable aspect ratios. A completed Met-initialised run can also compare full-frame inference against the CPU pilot's centre crop:

```powershell
npm.cmd run ai:met:fullframe -- --run ".local-ai/met-training/<run>"
```

This retains the entire image within 384 pixels on its longest side. It evaluates both the published and continued-training weights, selects the trained inference protocol by validation Top-1 before evaluating its test queries, and saves `fullframe-comparison.json`, `gallery-fit384.npz` and every full-frame test prediction. The query command defaults to that validation-selected protocol only after the comparison finishes. `--protocol center224` or `--protocol fit384` selects a protocol explicitly. This is an inference comparison, not additional training, and does not reproduce the paper's original 500-pixel/multiscale benchmark.

Training commands are separate from `npm.cmd start`. The production Scan encoder and its OpenCLIP reference index are not silently replaced: the trained ResNet descriptors use a different feature space and must have their own index. Promotion requires evidence that the new model is useful for the intended collection and camera conditions.

## Expand to the complete mini reference gallery

The expanded workflow retains **all 33,501 identities and 38,307 reference images** in the publisher's mini archive. This is about 22.6 times the first pilot's identity coverage; it is still not the full Met benchmark or every work held by the museum.

```powershell
npm.cmd run ai:train:met:expanded -- --epochs 16
npm.cmd run ai:met:catalogue -- --run ".local-ai/met-training/<expanded run>"
npm.cmd run ai:met:compare -- --run ".local-ai/met-training/<expanded run>" --batch-size 16
npm.cmd run ai:met:export:openclip -- --run ".local-ai/met-training/<expanded run>"
npm.cmd run ai:met:evaluate -- --run ".local-ai/met-training/<expanded run>"
npm.cmd run ai:met:query -- --run ".local-ai/met-training/<expanded run>" --image "C:\photos\artwork.jpg"
```

The trainer starts from the first pilot's saved Met adapter, freezes its convolutional backbone and GeM pooling, and trains its **512-dimensional projection**. It samples 2,000 multi-reference identities (excluding every query identity), removes byte-duplicate/conflicting positive views, and caches frozen features for original references plus perspective/rotation/colour augmentations. Batches include nearby, different training identities as hard negatives. A small teacher cosine penalty anchors the projection to its starting representation. This is real gradient-based projection training, not convolutional fine-tuning or just building an index.

Every epoch is selected against the **complete mini gallery**, using 129 official positive validation photographs and 256 unknowns per category. Final testing retains all 1,003 official positive photographs plus 512 other-art and 512 non-art queries. Test features are encoded only after checkpoint/threshold selection is sealed. Reports compare starting and trained weights against both the full gallery and the exact first pilot's reference subset, using the same new query sample. Additional references can make ranking harder; larger coverage does not itself demonstrate higher accuracy.

`gallery-fit384.npz` stores float16 descriptors to keep the expanded index practical to download. Validation and testing use that actual stored precision; query vectors remain float32. `inference.json` binds preprocessing, weight hash, gallery-file hash and reference manifest. The query rejects incompatible weights, preprocessing or damaged files. The trainer verifies that saved weights reload exactly and that the convolutional backbone has not changed. An existing report/output is never overwritten; `--prepared` is only for an existing manifest-only preparation with exactly matching selection settings.

The catalogue command downloads a pinned snapshot of the Met's official **CC0 metadata CSV**, verifies its Git LFS SHA256, and extracts only gallery object IDs. `catalogue.json` provides titles, artists and dates locally; missing artists stay null. Deprecated/missing records are listed explicitly, with optional public API fallback through `--lookup`. Photos are never uploaded. Catalogue and inference manifests are checked before using metadata. The 340.8 MB source CSV is cached in ignored `.local-ai/cache/met-catalogue`; raw dataset pictures and feature-training caches stay ignored as well.

OpenCLIP comparison accepts batches to process the larger collection with the same preprocessing and existing cached model weights. Normal Scan embedding calls retain their single-image interface. Per-query predictions and source digests are saved for independent metric recounting.

The export command converts those cached OpenCLIP vectors to a separate float16 index, recalibrates using validation unknowns, and evaluates the actual exported precision. It does not train OpenCLIP or rerun image embedding. The same local title/artist catalogue is shared, while embedding spaces and preprocessing remain separate and are checked by hash/identity. To query that alternative, add `--encoder openclip`; it uses the existing offline OpenCLIP cache and does not require the Met base. Met remains the query command's default. If an earlier evaluation summary exists, use `ai:met:evaluate -- --run <run> --output <new-summary.json>` to preserve it while recounting the additional export.

The evaluation command independently recounts the three expanded-gallery prediction files and compares those counts with their reported metrics. It also reports the official catalogue's painting subgroup and artist-name agreement separately. There are 173 positive painting photographs but only two in the official validation split; the generic benchmark alone cannot establish a reliable painting-specific fine-tuning gain. The planned comparison criteria are preserved before test inference in the [expanded experiment package](models/met-expanded-20261018/MODEL_CARD.md).

A completed expanded run also supports a validation-first learning-rate follow-up using its frozen feature caches:

```powershell
npm.cmd run ai:train:met:tune -- --run ".local-ai/met-training/<expanded run>" --output ".local-ai/met-training/<new trial>" --learning-rate 0.0001
```

This reuses the original frozen-backbone features and augmentation samples, recording their hashes and checking source checkpoint/manifest compatibility. It repeats the same projection objective and batches with a different learning rate. Its selected epoch must strictly exceed the earlier full-gallery validation Top-1 before another test inference is performed; otherwise it records `validation_only_not_selected` and leaves the earlier index unchanged. Validation-only trials are retained alongside the chosen model's results.

## Sources and redistribution

- [Dataset and download links](https://cmp.felk.cvut.cz/met/), [paper](https://arxiv.org/abs/2202.01747), [publisher's code](https://github.com/nikosips/met).
- [The Met Open Access policy](https://www.metmuseum.org/about-the-met/policies-and-documents/open-access) covers the eligible museum reference images and metadata. Visitor/distractor photos have their own source rights; they are used for local evaluation and are not redistributed with the experiment.
- [TorchVision source and licence](https://github.com/pytorch/vision) identify the ImageNet-pretrained base. Training and evaluation code here is a new CPU-compatible pilot, not a claim to reproduce the paper's complete training configuration or published accuracy.
