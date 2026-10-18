# QUT Art Museum in the shared museum experience

Open discovery → **Brisbane** → **QUT Art Museum** → **Choose** → **Start visit**. QUT uses the same **Home / Plan / Scan / Profile** navigation and screens as The Met and GOMA. There is no separate QUT screen or session-only bookmark store.

## Features

- Home: shared interactive gallery map, room selection, search, draggable image rail and a full-page nearby artwork grid.
- Artwork details: the common image-led page, English/Chinese audio introduction and persistent bookmarks.
- Plan: Mira’s shared conversation card with an automatically generated QUT route preview, itinerary details and floating Save action. Route constraints use QUT’s own graph and artwork IDs.
- Scan: the same camera/photo recognition and confirmation flow, using the three indexed QUT illustrations. Unmatched uploads retain the existing general visual-analysis flow.
- Profile: shared saved artworks, saved routes, museum filters and recent activity. Saves survive reloads and remain available when switching museums.

## Content and sources

QUT Art Museum is a real museum at Gardens Point, Brisbane. Venue information is sourced from the [official website](https://www.artmuseum.qut.edu.au/) and [visitor page](https://www.artmuseum.qut.edu.au/your-visit). Check the official site for opening hours, current exhibitions and visitor access.

**River rhythm**, **Soft architecture** and **Between places** are original Unframe studio illustrations for a simulated visit, not QUT collection records. Each shared artwork record credits its original source. The welcome image is an original gallery illustration, not a photograph of QUT. The illustrated rooms, distances and accessibility graph are simulated and are not official indoor navigation data.

Editable sources are `mobile/assets/qut-*.svg`; bundled PNG renders work on native and web. Shared data lives in `shared/qut-collection.json`, `shared/qut-graph.json` and `shared/museums.json`. Both the mobile app and Node AI services use these records. The common `GalleryFloorPlan` component renders QUT and GOMA from their graph data; The Met retains its multi-floor map.

## Updating an existing installation

Pull `origin/work`, stop the previous Unframe startup terminal with **Ctrl+C**, then run `npm.cmd start`. Startup checks the catalogue identity and automatically rebuilds the collection index from **12 to 15 references**, including QUT’s PNG assets. An installed OpenCLIP service is required; already downloaded model weights are reused. Keep the startup terminal running while using AI features.

To rebuild separately while OpenCLIP is running: `npm.cmd run ai:index`. For actual inference checks use `npm.cmd run ai:doctor -- --smoke` or `npm.cmd run ai:verify:features`. Health checks alone do not run inference. Recognition remains limited to available references and does not establish coverage of QUT’s real collection or arbitrary artworks.

## Verification

Browser tests in `mobile/e2e/qut.spec.js` cover common navigation, room filters, nearby artworks, persistent saves, automatic route preview and saving, scan request museum identity, small/desktop layouts, and switching back to GOMA/The Met. Browser AI responses are controlled fixtures; actual OpenCLIP/Qwen inference is checked separately. TypeScript, mobile state/location tests and backend route acceptance include QUT.

Verified on 18 October 2026: TypeScript and web export passed; mobile tests (four files), 96 AI tests, 68 root tests and 22 browser tests passed. Actual inference passed 60 recognition variants, six negative controls, 12 recognition HTTP checks and eight Qwen route/chat checks. A separate browser session completed QUT chat → automatic route → save → PNG upload → real recognition and Qwen confirmation without AI mocks. See [verification evidence and screenshots](verification/2026-10-18/README.md).
