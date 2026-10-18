# Scan latency diagnosis · 2026-10-18

Real CPU cloud checks, using OpenCLIP and Ollama 0.40.5 with `qwen3-vl:2b-instruct`. No paid services, visitor photographs or model-response mocks were used for the live checks. The browser uses Chromium's synthetic camera and bundled images; this is not physical-camera accuracy testing.

## Causes found

- The active Scan reference catalogue contains **8 Met, 4 GOMA and 3 QUT works**. Expanded Met training experiments are separate artifacts, not the production Scan gallery. Repeatedly scanning an unindexed work cannot retrieve its identity from this catalogue.
- Camera sampling repeated collection matching without displaying the completed no-match message. It does not automatically invoke vision. Uploaded photos with no museum match proceed to general vision and return only when that analysis finishes.
- General analysis unnecessarily invoked vision even after finding a distinctive local reference. One Water Lilies request took **40,986 ms**, despite collection recognition taking **241 ms**.
- A separate direct vision profile took **38,911 ms**: **29,103 ms** processing the image/prompt and **9,669 ms** generating 172 tokens. The CPU vision model, rather than collection vector comparison, dominates this path. Its unverified Harvesters artist guess was wrong, demonstrating why model memory cannot replace catalogue identity.
- The old cloud backend on port 3004 returned **503 INDEX_INCOMPATIBLE** in 58 ms. Its loaded catalogue no longer matched the current index. Other old backends were still listening. This establishes a cloud process problem, not the state of the user's Windows processes.

## Changes

Distinctive local-reference matches now return catalogue identity and notes without vision generation. Weak or ambiguous references retain the vision path. Similarity thresholds and the requirement for human confirmation are unchanged.

Camera no-match feedback is visible. General analysis has an explicit cancel action. Unsupported model title/artist guesses are confined to expanded details; the prominent result says **Artwork not identified** unless an image reference supports a possible match. Catalogue descriptions are labelled **Collection notes**.

Vision uses shorter output and first classifies the visible subject. Non-art categories suppress identity hypotheses and public lookup. The initial exterior-photo control failed because the model treated a museum banner as art; that failed report is retained. The corrected control passes without claiming an identity. This is a regression control, not a universal non-art classifier guarantee.

Analysis responses identify the path (`collection`, `vision`, `empty`) and stage timings. Blank-image rejection and catalogue shortcuts do not count as verified vision inference. Startup checks catalogue identity, Scan readiness and recorded Expo backend/client configuration; new Expo sessions clear their bundle cache. Existing unrelated processes are not terminated.

## Live results

| HTTP analysis sample | Result | Wall time |
| --- | --- | ---: |
| Water Lilies, before | Collection identity, unnecessary vision | 40.986 s |
| Water Lilies, after | Collection identity and notes, no vision | 0.157 s |
| The Harvesters, after | Collection identity and notes, no vision | 0.095 s |
| Uniform blank, after | Abstention, no model generation | 0.122 s |
| Museum exterior, after | Real vision, no artwork identity or search | 39.884 s |

These are individual controlled samples. Browser file uploads also exercise unfamiliar-art analysis and switching back to the text model. The first browser run's unfamiliar-image request took **65.869 s**. General CPU vision remains slow and cannot guarantee an artwork identity or comfortable interactive latency for arbitrary images. The fast-reference improvement must not be presented as a universal vision speedup. Windows/GPU timings require measurement on that hardware.

Validation:

- **106 AI tests**, **70 core tests**, mobile TypeScript and **5 mobile test files** pass; the final startup-only rerun passes **14 tests**. These sets overlap.
- **60/60** reference/transformation retrieval checks; **6** unrelated controls rejected across all three museums; **12/12** live recognition HTTP checks.
- **6/6** full live analysis/source checks, including a control that must actually invoke vision and public reference download.
- **18** browser regressions pass; the changed general-result UI is separately rechecked with **6/6** tests. These use mocked model responses.
- The opt-in live browser check uses actual camera-frame uploads, photo recognition, general vision and text interpretation after switching models, with no photo-request proxy. Reports and screenshots accompany this file.
- Web export succeeds. Compatible `npm start` reuse exits successfully without stopping services; an Expo preview for backend 3004 is rejected when 3009 is requested.

## Update locally

Stop the existing Unframe backend and Expo terminals with **Ctrl+C**, then:

```powershell
git pull --ff-only origin work
npm.cmd start
```

Model weights remain installed. Keep the new app terminal open. In another terminal, inspect a real input if needed:

```powershell
npm.cmd run ai:doctor -- --vision --image "C:\path\to\artwork.jpg"
```

`analysisReady` means the model is present, not that it has identified a painting. Inspect `method`, `timings`, `visionInferenceVerified`, sources and errors. To broaden fast identification coverage, the expanded gallery still needs a separate, validated production integration; training alone does not activate it in Scan.
