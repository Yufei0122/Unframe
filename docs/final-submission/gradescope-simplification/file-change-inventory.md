# Complete submission change inventory

Paths are relative to the separate submission root. Original source/evidence is unchanged.

## Removed (25)

- `app/deployment/lambda/planning-env.example.json`
- `app/deployment/lambda/planning-preparation.md`
- `app/mobile/e2e/planning.spec.js`
- `app/mobile/src/components/PlanningAnswer.tsx`
- `app/mobile/src/planningStream.ts`
- `app/mobile/src/screens/AIItinerary.tsx`
- `app/mobile/src/screens/AIPlanner.tsx`
- `app/mobile/src/screens/Discover.tsx`
- `app/mobile/src/screens/Explore.tsx`
- `app/mobile/src/screens/SavedRoutes.tsx`
- `app/mobile/tests/planningStream.test.ts`
- `app/scripts/ai-routes.mjs`
- `app/scripts/benchmark-planning.mjs`
- `app/scripts/route-acceptance.mjs`
- `app/scripts/validate-ai-routes.mjs`
- `app/scripts/validate-ai-visit.mjs`
- `app/scripts/validate-qwen-routes.mjs`
- `app/server/ai/chat.js`
- `app/server/ai/graph.js`
- `app/server/ai/planning-constraints.js`
- `app/server/ai/planning-status.js`
- `app/server/ai/routes.js`
- `app/server/cloud/planning.js`
- `app/tests/aws-planning.test.js`
- `app/tests/planning-runtime.test.js`

## Modified (67)

| File | Change |
| --- | --- |
| `app/AI-INTEGRATION.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/GOMA-DEMO.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/QUT-DEMO.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/README-CAB432-A3.md` | Document recognition/Analyse scope and independent reproduction commands. |
| `app/README.md` | Document recognition/Analyse scope and independent reproduction commands. |
| `app/deployment/web/README.md` | Remove undeployed Planning CORS deployment step. |
| `app/docs/a3-autoscaling-results.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/a3-cost-and-sustainability.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/a3-recognition-evidence-checklist.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/a3-submission-audit.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/aws-changes-summary.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/aws-deployment-readiness.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/aws-final-integration-report.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/aws-final-verification-commands.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/aws-final-verification-followup.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/aws-live-deployment-report.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/aws-scaling-test-plan.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/bedrock-schema-diagnosis.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/bedrock-v4-deployment-result.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/bedrock-v4-live-verification.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/deployment-preparation-status.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/friday-deployment-checklist.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/recognition-final-verification.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/submission-current-state.md` | Describe final scope, reproduction, safe isolated tests and cache-cleared exports. |
| `app/docs/worker-failure-diagnosis.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/docs/worker-resource-verification.md` | Add historical/superseded-scope notice; preserve earlier deployment facts. |
| `app/mobile/App.tsx` | Remove planner/tour/saved-route navigation; retain Home, Scan, Profile and artwork navigation. |
| `app/mobile/README.md` | Document recognition/Analyse scope and independent reproduction commands. |
| `app/mobile/e2e/ai.spec.js` | Remove planning-only browser scenarios/fixtures while retaining artwork and profile coverage. |
| `app/mobile/e2e/fixtures.js` | Remove planning fixture; block AWS/CloudFront domains before per-test request mocks. |
| `app/mobile/e2e/goma.spec.js` | Remove planning-only browser scenarios/fixtures while retaining artwork and profile coverage. |
| `app/mobile/e2e/mobile.spec.js` | Remove planning-only browser scenarios/fixtures while retaining artwork and profile coverage. |
| `app/mobile/e2e/profile-pages.spec.js` | Remove planning-only browser scenarios/fixtures while retaining artwork and profile coverage. |
| `app/mobile/e2e/qut.spec.js` | Remove unused itinerary fixture and obsolete Plan-tab assertions; retain QUT map/Scan/switch tests. |
| `app/mobile/package.json` | Remove planning-only npm scripts; dependency versions and lockfiles unchanged. |
| `app/mobile/src/ai.ts` | Remove planning client methods; keep artwork AI requests. |
| `app/mobile/src/components/AIProcessingAnimations.tsx` | Remove route-only transition; retain scan animation. |
| `app/mobile/src/model.ts` | Remove planning and saved-route state/action types. |
| `app/mobile/src/profileData.ts` | Remove saved-route helpers; retain artwork activities and visits. |
| `app/mobile/src/screens/AppSettings.tsx` | Remove sample-tour link and route-only setting item. |
| `app/mobile/src/screens/Modals.tsx` | Remove PlannerScreen; retain About/Feedback and correct scope copy. |
| `app/mobile/src/screens/Profile.tsx` | Remove saved-route count/link only. |
| `app/mobile/src/screens/RecentActivity.tsx` | Remove route-only history filter/navigation. |
| `app/mobile/src/state.ts` | Remove planning reducer/restore state; retain artwork/profile persistence. |
| `app/mobile/tests/profileData.test.ts` | Remove planning-only cases from mixed tests; retain recognition/analysis/profile assertions. |
| `app/mobile/tests/recognitionJobs.test.ts` | Remove planning-only cases from mixed tests; retain recognition/analysis/profile assertions. |
| `app/mobile/tests/state.test.ts` | Remove planning-only cases from mixed tests; retain recognition/analysis/profile assertions. |
| `app/package.json` | Remove planning-only npm scripts; dependency versions and lockfiles unchanged. |
| `app/scripts/ai-runtime.mjs` | Remove planning readiness/dependency checks and bootstrap requirement. |
| `app/scripts/ai-setup.mjs` | Remove automatic download of unused planning model. |
| `app/scripts/ai-up.mjs` | Remove planner startup readiness and warmup; retain artwork startup. |
| `app/scripts/check-ai.mjs` | Update readiness wording to artwork explanation scope. |
| `app/scripts/prepare-final-aws-evidence.mjs` | Remove deleted Planning environment template input/output; script not run. |
| `app/scripts/smoke-lambda.mjs` | Remove undeployed Planning import; retain Jobs handler smoke. |
| `app/scripts/validate-local-ai.mjs` | Remove route/chat checks; retain artwork checks. |
| `app/server/ai/handler.js` | Remove planning imports/status/routes; keep recognition, Analyse, confirmation, cancellation and errors. |
| `app/server/ai/ollama.js` | Remove planning schemas/methods; retain shared strict artwork explanation generator. |
| `app/server/ai/status.js` | Remove planner-model readiness requirement; keep recognition/vision readiness. |
| `app/server/domain.js` | Remove planRoute re-export. |
| `app/server/index.js` | Remove sample /api/routes endpoint. |
| `app/shared/ai-types.ts` | Remove planning-only types; retain artwork recognition/analysis contracts. |
| `app/shared/domain.d.ts` | Remove route-generation declarations. |
| `app/shared/domain.js` | Remove sample route generator and stale guide planner directions; keep artwork guide. |
| `app/tests/ai-runtime.test.js` | Remove planning-only cases from mixed tests; retain recognition/analysis/profile assertions. |
| `app/tests/ai.test.js` | Remove planning-only cases from mixed tests; retain recognition/analysis/profile assertions. |
| `app/tests/aws-bedrock.test.js` | Remove planning-only cases from mixed tests; retain recognition/analysis/profile assertions. |
| `app/tests/domain.test.js` | Remove planning-only cases from mixed tests; retain recognition/analysis/profile assertions. |

## Added (2)

- `app/mobile/tests/submissionScope.test.ts`: regression for ignoring legacy planning state while preserving artwork/profile data.
- `app/mobile/e2e/submission-scope.spec.js`: planner-free navigation with Home and Scan retained.

## Retained (295, including unchanged YAML)

This list includes modified files that remain in the submission; exact hashes and unchanged core files are in final-source-validation.json.

- `app/.gitignore`
- `app/AI-INTEGRATION.md`
- `app/GOMA-DEMO.md`
- `app/MUSEUM-DISCOVERY.md`
- `app/QUT-DEMO.md`
- `app/README-CAB432-A3.md`
- `app/README.md`
- `app/TRAINING.md`
- `app/deployment/ecs/autoscaling.json`
- `app/deployment/ecs/backlog-target-tracking.json`
- `app/deployment/ecs/scalable-target.json`
- `app/deployment/ecs/worker-task-definition.example.json`
- `app/deployment/lambda/Dockerfile`
- `app/deployment/lambda/Dockerfile.dockerignore`
- `app/deployment/lambda/jobs-env.example.json`
- `app/deployment/monitoring/alarm-tags.review.json`
- `app/deployment/monitoring/dashboard.json`
- `app/deployment/monitoring/final-tags.review.json`
- `app/deployment/web/README.md`
- `app/deployment/web/api-cors.review.json`
- `app/deployment/web/bucket-tags.json`
- `app/deployment/web/cloudfront-public-origin.review.json`
- `app/deployment/web/frontend-public-access.review.json`
- `app/deployment/web/frontend-public-policy.review.json`
- `app/deployment/web/job-images-tags.review.json`
- `app/deployment/web/upload-cors.review.json`
- `app/docs/a3-autoscaling-results.md`
- `app/docs/a3-cost-and-sustainability.md`
- `app/docs/a3-recognition-evidence-checklist.md`
- `app/docs/a3-submission-audit.md`
- `app/docs/aws-changes-summary.md`
- `app/docs/aws-deployment-readiness.md`
- `app/docs/aws-final-integration-report.md`
- `app/docs/aws-final-verification-commands.md`
- `app/docs/aws-final-verification-followup.md`
- `app/docs/aws-live-deployment-report.md`
- `app/docs/aws-scaling-test-plan.md`
- `app/docs/bedrock-schema-diagnosis.md`
- `app/docs/bedrock-v4-deployment-result.md`
- `app/docs/bedrock-v4-live-verification.md`
- `app/docs/deployment-preparation-status.md`
- `app/docs/friday-deployment-checklist.md`
- `app/docs/recognition-final-verification.md`
- `app/docs/submission-current-state.md`
- `app/docs/worker-failure-diagnosis.md`
- `app/docs/worker-resource-verification.md`
- `app/local-ai/compare_met_openclip.py`
- `app/local-ai/download.py`
- `app/local-ai/evaluate_met_fullframe.py`
- `app/local-ai/export_artwork_detector.py`
- `app/local-ai/export_met_openclip.py`
- `app/local-ai/image_input.py`
- `app/local-ai/met_catalogue.py`
- `app/local-ai/met_pretrained.py`
- `app/local-ai/met_training_data.py`
- `app/local-ai/model.py`
- `app/local-ai/query_met.py`
- `app/local-ai/requirements.txt`
- `app/local-ai/server.py`
- `app/local-ai/summarize_met.py`
- `app/local-ai/test_image_input.py`
- `app/local-ai/test_met_training.py`
- `app/local-ai/train_met.py`
- `app/local-ai/train_met_expanded.py`
- `app/local-ai/tune_met_projection.py`
- `app/mobile/App.tsx`
- `app/mobile/README.md`
- `app/mobile/app.json`
- `app/mobile/assets/SOURCES.md`
- `app/mobile/assets/adaptive-icon.png`
- `app/mobile/assets/afterimage.png`
- `app/mobile/assets/blue-hour.png`
- `app/mobile/assets/botanical-notes.png`
- `app/mobile/assets/brand/README.md`
- `app/mobile/assets/brand/unframe-logo.png`
- `app/mobile/assets/brand/unframe-mark.png`
- `app/mobile/assets/favicon.png`
- `app/mobile/assets/goma-exterior.jpg`
- `app/mobile/assets/goma-heritage.jpg`
- `app/mobile/assets/goma-in-bed.jpg`
- `app/mobile/assets/goma-obliteration-room.jpg`
- `app/mobile/assets/goma-soul-under-the-moon.jpg`
- `app/mobile/assets/guggenheim-exterior.jpg`
- `app/mobile/assets/icon.png`
- `app/mobile/assets/kurilpa-exterior.jpg`
- `app/mobile/assets/madame-charpentier-and-her-children.jpg`
- `app/mobile/assets/met-exterior.jpg`
- `app/mobile/assets/mob-exterior.jpg`
- `app/mobile/assets/moma-exterior.jpg`
- `app/mobile/assets/qag-exterior.jpg`
- `app/mobile/assets/quiet-geometry.png`
- `app/mobile/assets/qut-between-places.png`
- `app/mobile/assets/qut-between-places.svg`
- `app/mobile/assets/qut-gallery.png`
- `app/mobile/assets/qut-gallery.svg`
- `app/mobile/assets/qut-river-rhythm.png`
- `app/mobile/assets/qut-river-rhythm.svg`
- `app/mobile/assets/qut-soft-architecture.png`
- `app/mobile/assets/qut-soft-architecture.svg`
- `app/mobile/assets/riverlight.png`
- `app/mobile/assets/self-portrait-with-a-straw-hat.jpg`
- `app/mobile/assets/soft-form.png`
- `app/mobile/assets/splash-icon.png`
- `app/mobile/assets/the-card-players.jpg`
- `app/mobile/assets/the-dancing-class.jpg`
- `app/mobile/assets/the-harvesters.jpg`
- `app/mobile/assets/water-lilies.jpg`
- `app/mobile/assets/wheat-field-with-cypresses.jpg`
- `app/mobile/assets/young-woman-with-a-water-pitcher.jpg`
- `app/mobile/dev-e2e/startup.spec.js`
- `app/mobile/e2e/ai.spec.js`
- `app/mobile/e2e/auto-capture.spec.js`
- `app/mobile/e2e/avatar.spec.js`
- `app/mobile/e2e/cloud-scan.spec.js`
- `app/mobile/e2e/discovery.spec.js`
- `app/mobile/e2e/fixtures.js`
- `app/mobile/e2e/general-artwork.spec.js`
- `app/mobile/e2e/goma.spec.js`
- `app/mobile/e2e/live-ai.spec.js`
- `app/mobile/e2e/live-auto-capture.spec.js`
- `app/mobile/e2e/mobile.spec.js`
- `app/mobile/e2e/profile-pages.spec.js`
- `app/mobile/e2e/qut.spec.js`
- `app/mobile/eas.json`
- `app/mobile/index.ts`
- `app/mobile/metro.config.js`
- `app/mobile/package-lock.json`
- `app/mobile/package.json`
- `app/mobile/src/ai.ts`
- `app/mobile/src/apiConfig.ts`
- `app/mobile/src/assets.ts`
- `app/mobile/src/avatar.ts`
- `app/mobile/src/avatarImage.ts`
- `app/mobile/src/components/AIProcessingAnimations.tsx`
- `app/mobile/src/components/ArtworkAnalysisResult.tsx`
- `app/mobile/src/components/ArtworkRail.tsx`
- `app/mobile/src/components/ArtworkRail.web.tsx`
- `app/mobile/src/components/AvatarEditor.tsx`
- `app/mobile/src/components/BrandLogo.tsx`
- `app/mobile/src/components/CameraCapture.web.tsx`
- `app/mobile/src/components/DiscoveryMap.tsx`
- `app/mobile/src/components/DiscoveryMap.web.tsx`
- `app/mobile/src/components/FloorPlan.tsx`
- `app/mobile/src/components/GalleryFloorPlan.tsx`
- `app/mobile/src/components/HelpSupportDialog.tsx`
- `app/mobile/src/components/PreviewBackdrop.tsx`
- `app/mobile/src/components/PreviewBackdrop.web.tsx`
- `app/mobile/src/components/ProfileIllustrations.tsx`
- `app/mobile/src/components/ProfilePage.tsx`
- `app/mobile/src/components/SwipeScene.tsx`
- `app/mobile/src/components/SwipeScene.web.tsx`
- `app/mobile/src/components/discovery-map.css`
- `app/mobile/src/components/preview-backdrop.css`
- `app/mobile/src/discovery.ts`
- `app/mobile/src/location.tsx`
- `app/mobile/src/model.ts`
- `app/mobile/src/museum.ts`
- `app/mobile/src/nativeScanLoop.ts`
- `app/mobile/src/profileData.ts`
- `app/mobile/src/recognitionJobs.ts`
- `app/mobile/src/scanCapture.ts`
- `app/mobile/src/screens/AppSettings.tsx`
- `app/mobile/src/screens/Details.tsx`
- `app/mobile/src/screens/Guide.tsx`
- `app/mobile/src/screens/Lookup.tsx`
- `app/mobile/src/screens/Lookup.web.tsx`
- `app/mobile/src/screens/Modals.tsx`
- `app/mobile/src/screens/Museum.tsx`
- `app/mobile/src/screens/MuseumSelect.tsx`
- `app/mobile/src/screens/NearbyArtworks.tsx`
- `app/mobile/src/screens/Preferences.tsx`
- `app/mobile/src/screens/Profile.tsx`
- `app/mobile/src/screens/RecentActivity.tsx`
- `app/mobile/src/screens/SavedArtworks.tsx`
- `app/mobile/src/screens/Welcome.tsx`
- `app/mobile/src/state.ts`
- `app/mobile/src/store.tsx`
- `app/mobile/src/ui.tsx`
- `app/mobile/src/webScanTransport.ts`
- `app/mobile/tests/location.test.ts`
- `app/mobile/tests/nativeScanner.test.ts`
- `app/mobile/tests/profileData.test.ts`
- `app/mobile/tests/recognitionJobs.test.ts`
- `app/mobile/tests/state.test.ts`
- `app/mobile/tests/webScanTransport.test.ts`
- `app/mobile/tsconfig.json`
- `app/package-lock.json`
- `app/package.json`
- `app/playwright.config.js`
- `app/playwright.mobile-dev.config.js`
- `app/playwright.mobile.config.js`
- `app/scripts/ai-clip.mjs`
- `app/scripts/ai-met.mjs`
- `app/scripts/ai-runtime.mjs`
- `app/scripts/ai-setup-vision.mjs`
- `app/scripts/ai-setup.mjs`
- `app/scripts/ai-up.mjs`
- `app/scripts/audit-final-resource-tags.ps1`
- `app/scripts/build-brand-assets.mjs`
- `app/scripts/check-ai.mjs`
- `app/scripts/check-scaling-readiness.ps1`
- `app/scripts/collect-a3-price-inputs.mjs`
- `app/scripts/collect-analyse-evidence.mjs`
- `app/scripts/collect-recognition-load.mjs`
- `app/scripts/deploy-worker-image.mjs`
- `app/scripts/estimate-scaling-test.mjs`
- `app/scripts/evidence-result.mjs`
- `app/scripts/final-recognition-readiness.mjs`
- `app/scripts/index-artworks.mjs`
- `app/scripts/load-recognition-jobs.mjs`
- `app/scripts/model-a3-costs.mjs`
- `app/scripts/observe-recognition-scaling.mjs`
- `app/scripts/preflight-analyse-input.mjs`
- `app/scripts/prepare-a3-submission.mjs`
- `app/scripts/prepare-final-aws-evidence.mjs`
- `app/scripts/probe-bedrock-response.mjs`
- `app/scripts/render-final-metrics.mjs`
- `app/scripts/serve-mobile-preview.mjs`
- `app/scripts/smoke-lambda.mjs`
- `app/scripts/smoke-worker.mjs`
- `app/scripts/validate-a3-submission.mjs`
- `app/scripts/validate-artwork-vision.mjs`
- `app/scripts/validate-auto-capture.mjs`
- `app/scripts/validate-local-ai.mjs`
- `app/scripts/verify-cloudfront-browser.mjs`
- `app/scripts/verify-cloudfront-cache.mjs`
- `app/scripts/verify-final-aws-state.ps1`
- `app/scripts/verify-one-cloud-analyse.ts`
- `app/scripts/verify-one-cloud-job.ts`
- `app/scripts/verify-s3-recognition.mjs`
- `app/scripts/verify-worker-limits.mjs`
- `app/scripts/verify-worker-private-cache.sh`
- `app/scripts/verify-worker-rollout.mjs`
- `app/server/ai/artwork-analysis.js`
- `app/server/ai/artwork-detection.js`
- `app/server/ai/artwork-detector.json`
- `app/server/ai/bedrock.js`
- `app/server/ai/catalogues.js`
- `app/server/ai/config.js`
- `app/server/ai/diagnostics.js`
- `app/server/ai/embeddings.js`
- `app/server/ai/handler.js`
- `app/server/ai/images.js`
- `app/server/ai/job-context.js`
- `app/server/ai/local-http.js`
- `app/server/ai/loopback-fetch.js`
- `app/server/ai/ollama.js`
- `app/server/ai/providers.js`
- `app/server/ai/public-catalogues.js`
- `app/server/ai/recognition.js`
- `app/server/ai/s3-vectors.js`
- `app/server/ai/schema-diagnostics.js`
- `app/server/ai/status.js`
- `app/server/ai/vision.js`
- `app/server/cloud/config.js`
- `app/server/cloud/handlers.js`
- `app/server/cloud/job-repository.js`
- `app/server/cloud/jobs.js`
- `app/server/cloud/uploads.js`
- `app/server/domain.js`
- `app/server/index.js`
- `app/server/seed.js`
- `app/server/startup.js`
- `app/shared/ai-types.ts`
- `app/shared/collection.json`
- `app/shared/domain.d.ts`
- `app/shared/domain.js`
- `app/shared/goma-collection.json`
- `app/shared/goma-graph.json`
- `app/shared/met-collection.json`
- `app/shared/met-graph.json`
- `app/shared/museums.json`
- `app/shared/qut-collection.json`
- `app/shared/qut-graph.json`
- `app/tests/ai-runtime.test.js`
- `app/tests/ai.test.js`
- `app/tests/api.test.js`
- `app/tests/artwork-acceptance.test.js`
- `app/tests/artwork-analysis.test.js`
- `app/tests/aws-bedrock-schema.test.js`
- `app/tests/aws-bedrock.test.js`
- `app/tests/aws-diagnostics.test.js`
- `app/tests/aws-jobs.test.js`
- `app/tests/aws-vectors.test.js`
- `app/tests/domain.test.js`
- `app/tests/fixtures/bedrock-gemma-vision-sanitized.json`
- `app/tests/scaling-load.test.js`
- `app/worker/.dockerignore`
- `app/worker/Dockerfile`
- `app/worker/Dockerfile.dockerignore`
- `app/worker/healthcheck.js`
- `app/worker/process-job.js`
- `app/worker/start.js`
- `app/worker/worker.js`
- `submission-a3-infra.yml`
