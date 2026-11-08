# Screen-recording checklist: 4 minutes 40 seconds

This is a shot list, **not a narration script or a generated demonstration**. No new jobs, Bedrock calls, load tests or AWS changes were made during preparation. Record readable screen capture, not a phone recording. Short clips can be joined; label historical exports with their real timestamps. Do not accelerate a historical graph and imply it is a live scaling event.

## Pre-open and protect

- CloudFront app: `https://d3x3iexpafsgf.cloudfront.net`.
- AWS Console region Sydney. ECS cluster `n12281212-strobe-a2`, service `a3-n12281212-unframe-worker`; task revision 6. SQS source and DLQ names use `a3-n12281212-unframe-recognition` and `-dlq`.
- Open the files below in a viewer with large fonts. Use the saved 2026-10-31 08:03–08:34 UTC scaling window (18:03–18:34 Brisbane) instead of an empty current graph.
- Hide terminal history, credentials panes, request headers containing `X-Job-Token`, API POST response capability fields, presigned upload URLs/query strings, browser storage, unrelated account resources and private images. Job IDs/resource names are useful evidence; capabilities are not.
- No new job is necessary to present the historical evidence. If the student later chooses a fresh interactive recognition demonstration, create only the intended real job, show its actual state, and keep its recording clearly separate from the saved case. That future action was **not executed or tested by this preparation**.
- Existing result TTL may expire. Do not resubmit Analyse merely because the historical DynamoDB item is no longer present. Use the verified timestamped export and identify it as such.

## Eight segments

| Time / duration | Screen or page | Action and exact supporting file | Expected visible result | Hide / qualification |
| --- | --- | --- | --- | --- |
| 00:00–00:20 /20 s | CloudFront web app in browser | Show public HTTPS address, museum/Scan entry. Keep address bar visible; show app loading, without starting a new job. | Real hosted Unframe frontend, not localhost. | Close unrelated tabs. Do not advertise undeployed Planner. |
| 00:20–01:00 /40 s | Saved real recognition screenshot and trace | Open [candidate PNG](evidence/recognition/F18-candidate.png), then [browser trace](evidence/recognition/F18-browser.json) at recognition fields. Identify this as 31 October evidence. | `met`, `water-lilies`, SUCCEEDED, similarity 0.9999953508377075, confirmation required, one candidate. | Candidate success is proven; optional interpretation endpoint was unavailable. Do not present [confirmation PNG](evidence/recognition/F18-confirmation.png) as a successful cloud interpretation. |
| 01:00–01:30 /30 s | Sanitized async request trace | Show the same trace's POST 201 → PUT 200 → GET 200 entries and `Cache-Control: no-store`; compare with [job completion events](evidence/bedrock/F12-worker-events.json) only if clearly labelled as a different Analyse job. | Job creation, direct upload and later polling are separate requests; worker completes asynchronously. | No presigned URL or read token. Saved trace does not capture every intermediate UI state; don't invent QUEUED/PROCESSING screenshots. |
| 01:30–02:00 /30 s | ECS service Tasks/Deployments, or saved health export | Show service, revision 6, CPU 512/memory 2048 and current health if readable. Back up with [verified deployment](evidence/config/v5-deployment-verified.json) and [post-run health](evidence/scaling/final-health.json). | Saved evidence: desired 1/running 1, HEALTHY, v5 digest match. | Read-only page; do not use Update service. Current state may differ from 31 October—state the date honestly. |
| 02:00–02:25 /25 s | SQS/CloudWatch historical graph | Show [F14 queue PNG](evidence/scaling/F14-queue.png); briefly [verdict](evidence/scaling/F14-F16-verdict.json) with 883 successes. | Published backlog peak 321, drained to 0; direct peak 337 is a separately sampled observation. | Chart axis is AEST; don't call 321 and 337 inconsistent counts. Do not poll/delete DLQ messages. |
| 02:25–03:25 /60 s | CloudWatch actual running count and Auto Scaling activities | Show [F15/F16 PNG](evidence/scaling/F15-F16-running.png), then [Successful activities](evidence/scaling/F15-F16-scaling-activities.json), highlighting out 1→3 and in 3→2→1. | Actual running count rises and falls automatically, with high-/low-alarm action timestamps. Final 1 worker; min 1/max 3. | Not DesiredCount-only evidence. Say recorded 31 October; do not create load or alter counts to reproduce in 4 minutes. |
| 03:25–03:55 /30 s | Cache response headers | Open [F19 headers](evidence/recognition/F19-cache.json), zoom `xCache`/Age fields. Optionally use browser response-header view for an ordinary static request if recording it honestly as a fresh request. | Actual RefreshHit/Hit from CloudFront, Age 1 on subsequent requests. API responses remain no-store. | Do not open upload request URLs; don't claim a cold miss or 95% hit rate. |
| 03:55–04:40 /45 s | Sanitized Bedrock evidence | Open [safe events](evidence/bedrock/F12-worker-events.json) at `bedrock_complete`, then [F12 summary](evidence/bedrock/F12-summary.json). | Gemma model, 2785 ms, real job`48eb6b33-57e8-4d22-92bd-67690289915c`, SUCCEEDED, DynamoDB match, S3 absent. | This is actual saved Analyse evidence, not ordinary recognition invoking Bedrock. No raw response/image/token; no new Analyse call. |

**Total: 280 seconds = 4:40**, including transitions inside each segment. Retain enough time for the marker to read values; reduce verbal explanation rather than flashing tiny JSON.

## Before submission

- Play the entire exported video: text legible, audio clear, no private capability/credential frames, total 4–5 minutes.
- Distinguish saved evidence from any current read-only console views. No recreated metrics, mock screenshots or simulated job outputs.
- Keep recognition candidate success and optional confirmation limitation clear. No demonstration of undeployed Planning features.
- Upload to Canvas, click **Submit**, then verify the submitted recording plays. The report carries architectural explanation; the video demonstrates the results.
