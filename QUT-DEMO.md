# QUT Art Museum UI demo

Open museum discovery → **Brisbane** → select the **QUT Art Museum** map pin → **Choose**. This opens a separate Expo screen in the same app on native and web. Use the back arrow to return to discovery.

The screen includes a museum introduction, an illustrated exhibition card, artwork category filters, artwork previews, session bookmarks, a three-stop slow-looking tour and visitor information. **Discover**, **Visit** and **Saved** switch between the demo sections. Bookmarks last while the screen remains mounted; they are not added to the existing collection/profile store.

## Content and assets

QUT Art Museum is a real museum at QUT Gardens Point, Brisbane. Free admission and visitor location are sourced from the [official museum website](https://www.artmuseum.qut.edu.au/) and [visitor page](https://www.artmuseum.qut.edu.au/your-visit), checked on 18 October 2026. Opening hours, temporary closures and exhibitions should be checked on the official site; this demo does not show live availability. The discovery pin is an approximate building location, not an entrance or indoor-navigation position.

**Ways of seeing** is an original sample exhibition. **River rhythm**, **Soft architecture** and **Between places** are original abstract illustrations credited to Unframe studio for this prototype, not QUT collection records or real exhibition announcements. The hero image is an original schematic gallery illustration, not a photograph of the museum. These distinctions are also displayed in the UI.

Editable sources are the four `mobile/assets/qut-*.svg` files. Their bundled PNG renders support React Native Image on native and web. No external image requests, dependency additions, backend migration or artwork-index changes are required.

## Integration

- Screen: `mobile/src/screens/QutMuseum.tsx`; root route: `QutMuseum`.
- Discovery entry: `mobile/src/discovery.ts`, `demoScreen: 'QutMuseum'`.
- This is a UI demo independent of the Met/GOMA catalogue selection. It does not claim QUT AI recognition, live indoor maps or AI-generated routes.
- Existing Met/GOMA welcome, catalogue, route and profile flows retain their current behavior.

## Verification

Run `npm run mobile:check`, `npm run mobile:test`, and `npm run mobile:export:web`. Browser coverage in `mobile/e2e/qut.spec.js` exercises discovery entry, filtering, details, session saves, a complete tour, visitor information, return navigation, image loading and small/desktop layouts. The discovery suite includes the new Brisbane pin.

Verified on 18 October 2026 after integrating the existing remote `work` changes:

- `npm run mobile:check`: passed.
- Mobile unit tests, run from `mobile` with `node --import tsx --test tests/*.test.ts`: four test files passed.
- Expo web export with two workers: passed.
- `node /workspace/unframe-cloud/run-e2e.mjs mobile qut.spec.js discovery.spec.js`: eight browser tests passed in 26 seconds using system Chromium. The external runner is specific to the cloud workspace; standard installations can use the repository Playwright configuration.

This validates the browser demo. Physical iOS/Android devices and live QUT services were not tested.
