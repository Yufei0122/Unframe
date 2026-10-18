# Met retrieval training pilot — 18 October 2026

This package records two real CPU training runs on [The Met Dataset](https://cmp.felk.cvut.cz/met/), with evaluation against unmodified models and Unframe's existing OpenCLIP encoder. It is an experimental instance-retrieval model, not a model that identifies every painting. No paid API or GPU service was used. The production Scan configuration has not been changed.

## Data and procedure

- Training: 512 artwork identities, 1,084 distinct reference files; two different reference files form each contrastive pair.
- Retrieval gallery: 1,485 artwork identities, 2,976 reference images.
- Validation: 129 official visitor photographs plus 96 other-art and 96 non-art queries.
- Test: all 1,003 official positive queries plus 96 other-art and 96 non-art queries.
- Official query pixels never enter gradient updates. Query and gallery filenames and byte hashes do not overlap. Additional pilot training excludes all 845 validation/test artwork identities.
- The publisher's specialised Met base already learned from Met gallery identities; that earlier pretraining does not have the pilot's identity exclusion. This is disclosed in the report and checkpoint metadata.
- Both runs use eight epochs, 64 optimiser steps per epoch, seed 7, frozen layers 1–3 and batch-normalisation statistics, and contrastive learning of layer 4 and the projection. Checkpoint selection uses validation Top-1 only; unknown-rejection thresholds use validation unknowns only.
- This is a selected gallery from the official mini archive, not the full 224,000-class benchmark. The official mini gallery contains 33,501 artwork identities; this pilot does not index all of them.

## Results

Each trained run's per-query outputs, including incorrect predictions, are retained alongside the weights. Top-1 measures the first returned artwork ID on the 1,003 known queries. Correct-and-accepted additionally requires passing the validation-calibrated rejection threshold. Unknown false acceptance uses only the 192 sampled test unknowns; it is not a guarantee for real-world photographs.

| Encoder / weights | Inference | Known Top-1 | Correct and accepted | Unknown false acceptance | Accepted identity precision |
|---|---|---:|---:|---:|---:|
| ImageNet ResNet18 baseline | Centre 224 | 44.27% | 23.83% | 5.21%  74.45% |
| ImageNet + pilot training | Centre 224 | 43.17% | 11.67% | 2.08%  75.48% |
| Published Met ResNet18 | Centre 224 | 49.45% | 34.10% | 3.65%  89.76% |
| Met + pilot training | Centre 224 | 49.65% | 34.10% | 3.65%  89.53% |
| Existing OpenCLIP | Native transform | 53.34% | 34.40% | 6.77%  72.48% |

| Published Met ResNet18 | Full frame 384 | 56.73% | 43.87% | 5.21% | 91.48% |
| Met + pilot training | Full frame 384 | 56.63% | 43.97% | 4.69% | 91.68% |

The first run completed in 822.5 seconds; the second in 816.45 seconds, including their baseline/evaluation work but excluding initial downloads. Each performed 512 optimiser updates. The second run selected epoch 7 and verified changed parameters (L2 0.312254) and an exact saved-tensor round trip. Its 0.20-point centre-crop Top-1 gain over the published base is only two test queries; this single run does not establish a reliable improvement. Neither trained centre-crop model exceeded OpenCLIP.

The validation-selected trained protocol is **full frame 384**. Its test Top-1 is **56.63%**, compared with **56.73%** for the unchanged published Met base using the same full-frame protocol and **53.34%** for OpenCLIP on the same gallery. The full-frame trained model correctly identifies and accepts **44.0%** of known queries; it rejects **183/192** sampled unknowns. The main observed benefit is retaining the full frame, not additional training. The one-query Top-1 difference from the published base does not support a fine-tuning benefit. These results are insufficient to claim arbitrary-artwork recognition or to replace the production scanner automatically.

## Contents and use

`adapter.pt` contains the trained layer-4/projection tensors. It requires the exact publisher base identified by the pinned URL/SHA256 in the checkpoint; the loader downloads and caches that base if needed. `gallery.npz` uses the trained encoder with centre-crop inference. `gallery-fit384.npz` contains the validation-selected full-frame descriptors and calibration. The query command selects that completed protocol automatically. These vectors cannot be combined with an OpenCLIP index.

`manifest.json` and `sources.json` preserve dataset selection, image hashes, source URLs and archive download hashes. `report.json` records all epochs, parameter changes and the saved-weight round-trip check. `source/` contains the training sources captured before the second run; `evaluation-source/` preserves the later full-frame evaluation sources, with digests in its report. `attempts/imagenet/` preserves the first run and the existing OpenCLIP comparison. Raw dataset photographs, source archives and the unmodified publisher checkpoint are not redistributed here.

From the repository root:

```powershell
npm.cmd run ai:met:query -- --run models/met-pilot-20261018 --image "C:\photos\artwork.jpg" --lookup
```

The query runs locally. `--lookup` sends only candidate object IDs to the public Met catalogue to obtain title/artist metadata; it never sends the photograph. A returned `possible_match` is a retrieval candidate, not a confirmed identity or probability. First-use base downloading requires internet; subsequent inference can run offline without `--lookup`.

The executable query checks in `verification/` correctly retrieved Met object 436532 from a visitor photograph and obtained the catalogue's title, *Self-Portrait with a Straw Hat (obverse: The Potato Peeler)*, and artist, Vincent van Gogh. A non-art photograph was rejected. Both the centre-crop and final automatic full-frame paths were exercised. These examples demonstrate the command and metadata lookup, not an accuracy estimate. Timing fields exclude Python imports and public catalogue lookups; `startupAndRetrievalMs` covers model/index initialisation and retrieval only. Centre-crop samples ran while evaluation was also using the CPU. These are not application response guarantees. A deliberately mismatched gallery was rejected before reading its input photograph.

See [TRAINING.md](../../TRAINING.md) for reproducible training/evaluation commands and dependencies. Absolute cache paths in the raw reports describe this cloud run, not locations required on your computer; use `--image-dir` when evaluating at a different cache location.

## Limits and provenance

Single-seed results on one selected gallery cannot establish general recognition accuracy. A falling contrastive loss does not demonstrate improvement. Full-frame evaluation changes inference preprocessing only, not trained weights. Its protocol is chosen using validation data before full-frame test evaluation; this is an additional comparison on the same benchmark, not a new independent test set or a reproduction of the paper's 500-pixel/multiscale protocol.

The Met-initialisation trial and full-frame comparison followed observation of earlier results. Test data did not select within-run checkpoints or rejection thresholds, but these exploratory comparisons reuse the same test set and cannot establish an unbiased algorithm-selection gain.

Source archive SHA256 values are observed local download fingerprints; the publisher's original HTTP archive links supply no authenticated hashes. The optional Met model uses the publisher's original HTTP URL with a pinned full digest, and is loaded with restricted tensor deserialisation. Its upstream code is credited in [MET-CODE-LICENSE.txt](../MET-CODE-LICENSE.txt); the TorchVision base is credited in [TORCHVISION-LICENSE.txt](../TORCHVISION-LICENSE.txt). Reference-image eligibility is governed by [Met Open Access](https://www.metmuseum.org/about-the-met/policies-and-documents/open-access); query photographs retain their own source rights and are not included in this repository.

Paper: Ypsilantis et al., [The Met Dataset: Instance-level Recognition for Artworks](https://arxiv.org/abs/2202.01747). Upstream implementation and model download references: [nikosips/met](https://github.com/nikosips/met). This repository's small CPU training recipe does not claim to reproduce the original paper's training or accuracy.
