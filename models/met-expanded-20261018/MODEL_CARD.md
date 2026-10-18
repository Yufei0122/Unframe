# Expanded Met retrieval model — 18 October 2026

This experiment expands the reference collection from 1,485 to **33,501 artwork identities**, retaining **all 38,307 images in the official Met mini gallery**. It continues training from [the first pilot's saved checkpoint](../met-pilot-20261018/MODEL_CARD.md). All model/data sources and catalogue lookups are free; training runs on four CPU threads without a GPU or paid API.

This is the complete **mini** reference collection, not the full 224,000-class benchmark, every Met collection object, or arbitrary artwork recognition. The model is a separate experimental retrieval index; production Scan has not been switched automatically.

## Training and evaluation

- 2,000 multi-reference training identities, 4,248 byte-distinct reference files. Official validation/test identities are excluded from both this continuation and the previous pilot's gradient updates. The publisher's original base had already learned from Met gallery identities.
- The previous convolutional backbone and GeM pooling remain frozen. Only the 512-dimensional projection weight and bias are optimised, with cached original features and camera-like perspective/rotation/colour augmentations.
- Contrastive batches contain different reference views of each identity and nearby, different training identities as hard negatives. A small teacher cosine penalty preserves the starting representation. The frozen features of query photographs never enter gradient updates.
- Checkpoint selection uses full-gallery validation Top-1 only, with the earliest epoch winning ties. Validation contains 129 official positive photographs plus 256 unknown artworks and 256 non-art images. Rejection thresholds use those validation unknowns only.
- Testing uses all 1,003 official positive photographs plus 512 unknown-art and 512 non-art queries. Test features are computed after the selected weights and threshold are sealed.
- Starting and continued weights are compared on both the expanded gallery and the exact old reference-file subset. OpenCLIP uses the same expanded gallery and query split. More distractors can lower ranking accuracy; coverage growth is not itself a training gain.
- Gallery descriptors are stored as float16; validation/testing use this shipped precision. Query descriptors remain float32. Saved-weight loading is checked exactly and the convolutional weights are verified unchanged.

The Met benchmark contains sculpture, ceramics and other objects as well as paintings. The official catalogue identifies **173 positive painting photographs (138 works)** in this test set, but only **two** painting photographs in the official validation split. Painting work/artist diagnostics are therefore reported separately and do not select checkpoints. This continuation is exploratory reuse of a previously observed benchmark, not an independent new test set.

All official positive query identities were already represented in the first pilot's reference subset. These tests measure the effect of additional reference views and distractors on those queries; they do not establish visitor-photo accuracy for every newly indexed identity.

## Results

Actual metrics and the selected checkpoint are recorded in `report.json`, `openclip-comparison.json` and `evaluation-summary.json`. Every expanded-gallery test prediction is retained, including mistakes and rejected unknowns. The evaluation summary independently recounts the saved predictions and separates correct artwork identity from artist-name agreement.

| Encoder | All known artworks Top-1 | Painting Top-1 | Correct and accepted (all known) | Unknown false acceptance | Accepted identity precision |
|---|---:|---:|---:|---:|---:|
| Starting Met checkpoint | 52.24% | 62.43% | 36.49% | 7.23% | 77.54% |
| Continued Met projection | 52.24% | 62.43% | 36.49% | 7.03% | 78.04% |
| OpenCLIP (exported index) | 45.06% | 65.90% | 16.55% | 7.23% | 54.43% |

The continuation completed **16 epochs / 1,008 optimiser updates**; the earliest best validation checkpoint was epoch 1 (63 updates), with a nonzero projection change (L2 0.089049) and an exact saved-weight round trip. Test Top-1 did not improve. A second 16-epoch run at ten times the learning rate also made 1,008 real updates, but failed to improve validation; its validation Top-1 fell from 61.24% to 59.69% in later epochs. It was not selected and no additional test inference was performed. Its report and captured sources remain in `attempts/learning-rate-1e-4/`; its unselected checkpoint remains in the ignored local training directory.

The exact legacy reference subset gives 56.63% known Top-1 for both starting and continued Met weights; the full gallery gives 52.24%. This measures added reference views/distractors, not a training improvement. On known painting photographs OpenCLIP ranks the correct work first more often, but at each encoder's validation-calibrated rejection threshold it correctly accepts 20.2% of painting queries, versus 44.5% for Met. Artist agreement is 67.1% (OpenCLIP) and 61.2% (Met) among 152 painting queries with a catalogue artist. These small exploratory subgroups do not establish a general winner.

Both encoders are provided for comparison. OpenCLIP export uses existing frozen app weights, not new training; its float16 index was recalibrated on validation data and independently retested. Its headline test metrics match the float32 control. Neither index has been promoted automatically to Scan.

## Use

From the repository root, using the Python dependencies installed by `ai:setup`:

```powershell
npm.cmd run ai:met:query -- --run models/met-expanded-20261018 --image "C:\photos\artwork.jpg"
# Compare the existing OpenCLIP encoder with the same expanded catalogue:
npm.cmd run ai:met:query -- --run models/met-expanded-20261018 --encoder openclip --image "C:\photos\artwork.jpg"
```

In Met mode, after the exact publisher base is cached, this command runs locally, including title/artist lookup from `catalogue.json`. First use may download the 137.4 MB frozen base, whose SHA256 is pinned in the checkpoint. OpenCLIP mode instead uses the existing `ai:setup` OpenCLIP cache and does not load or download the Met base. Neither mode requires Ollama, Qwen, an API key or the application backend. `possible_match` is a candidate, not a verified identity or calibrated probability.

The official Met CC0 catalogue snapshot matches **33,369 of the 33,501** gallery IDs. Its published Git LFS digest and Git commit are pinned in `catalogue-source.json`. Missing records and unknown artists are not invented. `--lookup` optionally requests metadata for uncached candidate IDs from the public Met API; photographs are never uploaded. Inference, reference-gallery and metadata manifests reject incompatible or changed files.

Training reproduction and evaluation commands are documented in [TRAINING.md](../../TRAINING.md). The cache paths in raw reports describe this cloud run; supply `--image-dir` when rerunning comparisons with images elsewhere. The official source images, visitor photographs, source CSV and frozen-feature caches are excluded from this repository. The committed package contains learned weights, descriptors, CC0 catalogue metadata and reproducibility/evaluation records.

The offline query checks retrieved a Van Gogh visitor photograph correctly with both encoders. A newly indexed Ding Yunpeng reference also retrieved its own ID and metadata; that self-match demonstrates index coverage, not visitor-photo accuracy. A fixed non-art photograph was rejected. The Met forward calculation was cross-checked against the upstream architecture definition with zero numerical difference, without executing publisher code. These functional checks and 20 unit tests are recorded in `verification/`; timing samples are CLI measurements and do not establish app response guarantees.

`source/` captures the initial training recipe, `evaluation-source/` captures comparison/export/query helpers, and `SHA256SUMS.txt` covers the delivered files. Large feature caches and unselected binary weights remain local and are not included in the package.

## Sources

[The Met Dataset](https://cmp.felk.cvut.cz/met/) · [paper](https://arxiv.org/abs/2202.01747) · [upstream code and weights](https://github.com/nikosips/met) · [Met Open Access catalogue](https://github.com/metmuseum/openaccess) · [Met Open Access policy](https://www.metmuseum.org/about-the-met/policies-and-documents/open-access).

The archive SHA256 values are observed download fingerprints for the publisher's original HTTP links. The model has a pinned full digest and restricted tensor loading; the catalogue CSV is pinned by its HTTPS Git LFS pointer. Upstream code attributions are preserved in [MET-CODE-LICENSE.txt](../MET-CODE-LICENSE.txt) and [TORCHVISION-LICENSE.txt](../TORCHVISION-LICENSE.txt). Visitor and distractor photographs retain their own source rights and are not redistributed here.
