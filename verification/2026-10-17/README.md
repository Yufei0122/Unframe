# CPU cloud verification · 2026-10-17

These reports use real local OpenCLIP and official Ollama model weights. No model responses were substituted in the inference reports or the live browser test. Separate browser regression tests use fixtures to exercise failures and cancellation.

| Check | Result | Evidence |
| --- | --- | --- |
| Catalogue matching, both museums | 48/48 reference variants; 6/6 negatives rejected in both museums; 8/8 HTTP checks | [Recognition](recognition.json) |
| General image analysis | 5/5 checks, including two labelled paintings, a blank image, browser origin and public sources | [Vision](vision.json) |
| Chinese and English planning | 6/6 checks; three model-selected routes; zero fallback responses | [Routes](routes.json) |
| Legacy 4B setting migrated to Instruct | Real visual inference, correct catalogue identity, no invented label transcription | [4B Instruct](vision-4b-instruct.json) |
| Actual browser uploads and model switching | Known artwork → unfamiliar image → known artwork and AI interpretation again | [Browser Scan](browser-scan.json) |

[Final configuration, model digests, timings and code hashes](report.json) identify the tested components. The recognition-only report records the former guide setting because it did not exercise that guide. The final live browser report exercises the new shared `qwen3:1.7b` guide and planner configuration.

The 4B control is a warm repeat of the same image and is not a cold-load benchmark. The general-analysis acceptance samples took about 44–45 seconds on CPU; the browser report records its own end-to-end timing. These observations do not establish a general response-time guarantee. A larger cancellation budget fixes premature termination; it does not make CPU inference instant.

All three public catalogue searches succeeded. The first Art Institute reference image returned HTTP 403; the report preserves that failure and the successful alternative Met download. An unavailable reference is never counted as a verified image match.

## Interface snapshots

[Home](home.png) uses a compact map and a larger image rail. [Scan](scan.png) keeps the uploaded image visible above a concise, scrollable result card. The Scan screenshot was captured after actual model inference.

## Reproduce on Windows

Stop the old backend and Expo terminals with Ctrl+C, then:

```powershell
git pull --ff-only origin work
npm.cmd start
```

Startup downloads missing Instruct weights and starts the services. Keep that terminal open. A completed first-time `ai:setup` or `ai:setup:vision` does not need to remain running; downloaded models persist.

In a second terminal:

```powershell
npm.cmd run ai:doctor -- --smoke
npm.cmd run ai:doctor -- --vision
npm.cmd run ai:validate:vision
npm.cmd run ai:validate:routes
```

`ai:doctor` without a flag checks readiness only. `liveVerified: false` in that output is not a model failure. Real inference is exercised by the flagged commands and acceptance scripts.

This cloud machine has CPU-only inference, approximately four CPU cores of quota and 16 GiB RAM. It cannot validate the Windows GPU driver, physical camera or arbitrary-artwork identification accuracy. The image controls are bundled references, transformations and synthetic negatives; no fine-tuning or independent accuracy study was performed. Identity suggestions remain unconfirmed in the interface.
