# Unframe mobile

A native React Native + Expo application for iOS and Android. It includes native stack navigation, bottom tabs, device photo/camera access, speech, and persistent on-device data. It is not a WebView of the website.

## The Met and Brisbane GOMA visits

The app opens on museum discovery: a full-width photographic preview above a web OpenLayers street map. Switch between New York and Brisbane, tap a museum pin, or swipe the preview (mouse dragging also works). The preview rotates every ten seconds, pausing during interaction, when hidden, or for reduced-motion preferences. The Met and GOMA offer **Choose** → welcome → **Start Visit**. Five nearby museums offer photo previews and official website links. See [museum discovery sources and scope](../MUSEUM-DISCOVERY.md).

**Start Visit** opens the indoor demo floor plan and horizontal nearby-artwork cards. Selecting a work opens an image-led detail page with bookmarks, a readable introduction, English/Chinese device speech, and a link to the museum collection record. The outdoor discovery map uses real building locations; the indoor map remains illustrative.

Choose a museum from the discovery entrance: **Choose The Met** / **Choose GOMA** → **Start Visit**. Tap the museum and location area on the welcome page, the museum name on Home, or **Explore museums** in Profile to return to the entrance. The selection applies to artwork browsing, the indoor map, web Scan and AI route planning. The Met has eight artworks; GOMA has four QAGOMA Collection works with official images, English/Chinese introductions and source links. See [GOMA demo sources and scope](../GOMA-DEMO.md).

Device location is requested on opening. The Met matches within 800 m with accuracy of 500 m or better; GOMA matches within 300 m with accuracy of 300 m or better. The nearest qualifying museum is selected automatically until you manually choose a museum for this session. Otherwise, or if permission is refused, the default Met demo remains available and either museum can be selected manually. Refresh location from the museum information page. Location is not persisted or uploaded by Unframe. There is no global museum discovery service.

**Floor plans, gallery labels, floor assignments, blue position markers, accessibility and artwork distances are demonstration data.** GPS does not place the visitor on an indoor map. GOMA uses its own schematic, not an official floor plan. QAGOMA holds a shared collection across QAG and GOMA; inclusion here does not mean a work is currently displayed at GOMA. See [asset sources](assets/SOURCES.md).

## Start from Windows

Profile’s **Saved Artworks**, **Saved Routes** and **Recent Activity** open dedicated pages with the Profile tab retained. Artwork search covers titles, artists and museums; filters include painting, sculpture, installation and saves in the last 30 days. Routes saved from an itinerary or the Northbank sample tour keep the original itinerary, museum and constraints. Route filters cover confirmed nearby museums, visits of 30 minutes or less, The Met and GOMA. The map shortcut opens the existing museum map. Removing a saved route offers Undo.

Recent Activity combines completed visits with currently saved artworks and routes. New bookmarks record their save time; older bookmarks with no timestamp appear under **Saved on this device**. The AI filter shows saved Qwen-recommended itineraries; it does not manufacture an annual summary. Empty collections use empty states, and visual test fixtures are confined to isolated test browser contexts.

The **Profile** tab is a cream-and-gold personal dashboard with editable interests, on-device collection statistics, artwork thumbnails and activity shortcuts. The pencil beside the avatar opens a photo-only editor: choose a picture, drag or use the position buttons, zoom, rotate, then **Save avatar**. Cancel preserves the existing avatar. The cropped 512 × 512 JPEG is saved only on this device and survives reloads; no avatar is sent to the AI server. The default portrait, gallery backdrop and reflection landscape are temporary SVG illustrations in `src/components/ProfileIllustrations.tsx`. Unframe Plus and the AI reflection card are labelled previews; no subscription or AI annual review is generated. Empty collections show suggestions from the selected museum without saving them. Name and preference editing, privacy controls, feedback drafts and the Northbank sample tour remain under **Profile → App Settings**.

Run in PowerShell:

```powershell
cd D:\FlyFly\Study\Project\Unframe\mobile
npm.cmd ci
npm.cmd start
```

The dependencies have already been installed in this workspace; `npm.cmd ci` is needed for a fresh checkout. Keep the terminal open.

1. Install **Expo Go** on your iPhone.
2. Put the iPhone and your computer on the same Wi-Fi network.
3. Run the command above and scan the terminal QR code with the iPhone Camera app.
4. Choose **Open in Expo Go**. If Expo requests it, run `npx.cmd expo login` on the computer and sign in to the same Expo account in Expo Go.
5. When Windows asks about network access, allow Node.js on your private network. If your Wi-Fi isolates devices, use a network that allows devices to communicate; Expo also supports `npx.cmd expo start --tunnel` with its tunnel dependency.

From the repository root you can also use:

```powershell
npm.cmd run mobile
```

**Use the QR code printed by Expo, not `127.0.0.1:3000` on your phone.** That is the default backend API address, not the Expo app. The separate desktop museum workspace has been removed.

### Expo Go compatibility

This prototype intentionally uses **Expo SDK 54**, React Native 0.81 and React 19.1. Expo’s currently published guidance identifies SDK 54 as compatible with the Apple App Store build of Expo Go. The project SDK and Expo Go SDK must match. Check the [official compatibility instructions](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) if the phone reports a version mismatch. Expo’s newer SDKs can use development builds or a matching Expo Go build through TestFlight.

SDK 54 supports iOS 15.1 and later. See the [SDK platform requirements](https://docs.expo.dev/versions/v54.0.0/). This is a prototype baseline, not a claim that the current configuration satisfies every App Store submission requirement.

## Preview on the computer

For browser camera and local AI, run `npm.cmd run ai:setup` once, then `npm.cmd run ai:up` **from the repository root in another terminal**. Follow [AI setup](../AI-INTEGRATION.md) to install OpenCLIP and Ollama Qwen and generate the artwork index; `npm.cmd run ai:doctor -- --smoke` performs real model checks. No cloud credentials or paid account are required. Open **Scan** to start automatic scanning, then tap a possible artwork to confirm it. The bottom **Plan** tab lets you chat about your visit and create an itinerary. Browser camera access requires HTTPS or localhost. Model addresses and settings remain on the server.

Run from any directory using the full project path:

```powershell
cd D:\FlyFly\Study\Project\Unframe\mobile
npm.cmd run web
```

`npm.cmd run mobile:web` also works from either the project root or the `mobile` directory. In `mobile`, it is an alias for `npm.cmd run web`.

The AI commands (`ai:setup`, `ai:setup:vision`, `ai:clip`, `ai:up`, `ai:web`, `ai:doctor`, `ai:index`, and `ai:validate`) also work from `mobile`; they forward to the repository root and use its configuration and model cache. From an older checkout without these aliases, use `npm.cmd --prefix .. run ai:doctor` or `npm.cmd --prefix .. run ai:up` while in `mobile`. No virtual-environment activation is required.

For **Plan only**, `npm.cmd run ai:routes:verify` starts the Qwen text model and backend, runs strict real route/chat acceptance, then starts Expo with the root backend port. It skips OpenCLIP, vision-model installation and the image index. Use `ai:routes` for later startup or `ai:validate:routes` to test an already running backend. A visible local-rule itinerary is not a passed Qwen check. See [route verification](../AI-INTEGRATION.md#route-planning-independent-startup-and-strict-model-acceptance).

For **arbitrary artwork photos**, install the vision model once with `npm.cmd run ai:setup:vision`. Then stop the old Expo/backend terminals and run `npm.cmd run ai:web`; this starts the complete local web stack with consistent ports in one terminal. Web Photos automatically analyses uploads that do not match the selected local collection. **Analyse any artwork** also analyses the current camera frame; native Scan provides **Analyse photo**. Results distinguish model guesses, public reference candidates and uncertain identity. Only title/artist search terms go to public catalogue services; photos stay with the local model. See [general artwork analysis](../AI-INTEGRATION.md#general-artwork-analysis) for model requirements, source coverage and real-model verification.

If the page opens but reports that it cannot reach the AI server, keep both the Expo terminal and the `ai:up` terminal open. Downloaded model files and an existing artwork index do not keep OpenCLIP or Node running after their terminal closes or the computer restarts. An `OPENCLIP_UNAVAILABLE` result with a ready Ollama model and complete index calls for starting `ai:up`, not reinstalling everything. If startup fails, retain its first error for diagnosis. For a backend using `PORT=3001`, the browser must also use `EXPO_PUBLIC_API_URL=http://127.0.0.1:3001` in `mobile/.env.local`; restart Expo after changing this setting.

If a previous installation exits with `TypeError: eventsQueue is not iterable`, run `npm.cmd ci` in `mobile` once, then restart the command above. The lockfile now allows Expo's Metro wrapper to install its required Metro version. Do not force all `metro*` packages to a different version through npm overrides: the development file-watcher event format must match the installed CLI.

This runs the same React Native screens using React Native Web. On desktop windows 600 px or wider, the app automatically appears in a centred phone frame with a 390 px content width; narrower windows use the full viewport. No DevTools device mode is required. Keep the terminal open and use the URL it prints. Geolocation requires localhost or HTTPS and browser permission. This preview cannot validate native camera behaviour, audio output, signing, installation or gestures.

### Native camera scanning

Native Scan uses `expo-camera` to show the rear camera and sample frames automatically. It normalises samples to JPEG at no more than 960 px, waits three seconds after each recognition request before sampling again, and requires the same explicit candidate selection as the browser. Leaving the screen or backgrounding the app stops the camera and cancels requests; temporary frame files are deleted. A photo-library upload remains available. The native implementation still needs camera, permission and recognition testing on physical iOS/Android devices.

Native requests require `EXPO_PUBLIC_API_URL` in `mobile/.env.local` to point to an absolute backend URL reachable by the phone. OpenCLIP and Ollama run on that backend computer. `localhost` and `127.0.0.1` refer to the phone itself; the default Node server also listens only on the computer's loopback interface, so simply substituting a LAN IP is insufficient. Use a suitable HTTPS development forwarder or explicitly configure the backend to be reachable on your trusted LAN, then restart Expo after setting the URL. Keep model services on loopback. See [AI setup and deployment limits](../AI-INTEGRATION.md).

Interactive AI requests have a 15-second target. The Qwen, OpenCLIP and vision client deadlines default to 14,500 ms, while the model service defaults to 14,000 ms. `ai:up` preloads Qwen and temporarily migrates the former slow-profile values when it detects them; copy the current values from `.env.example` to make that configuration explicit. Real acceptance fails any valid scan, chat, route or vision response that exceeds the target. Leaving a screen or cancelling aborts the request immediately.

## Features

- **Home:** Selected museum's demo map, room selection, nearby cards, artwork/artist search and a full collection view; the Met schematic also has demo floor selection.
- **Plan:** a dedicated chat with quick prompts, a fixed message composer and a summary of confirmed preferences. Local Qwen interprets time, interests, starting point, walking/access needs and must-see requests; **Generate route** opens a separate itinerary. Returning or switching tabs preserves the conversation; switching museums or choosing **New conversation** starts fresh. Enter sends, Shift+Enter adds a line. Failed messages can be retried or discarded, and leaving the tab cancels pending work.
- **Scan:** opens the camera and automatically looks for possible artworks, like a camera scanner. Tap a candidate to confirm it and load an optional AI interpretation, then open its details or resume scanning. Browser Scan offers **Pause scanning**, **Resume scanning** and a **Photos** upload shortcut. The museum map remains on Home.
- **Profile:** Saved Artworks, Saved Routes and Recent Activity are the single home for saved content. The duplicate Saved bottom tab has been removed. Completed visits open Recent Activity; tap a visit to read its full reflection and revisit its artworks.
- **App Settings (inside Profile):** preferences, larger text, history consent, feedback and the separate Northbank sample tour.
- **Sample tour:** the existing fictional Northbank route planner and catalogue guide remain available. Active tour progress survives a restart.
- **Live artwork lookup:** browser Scan samples one frame at a time, waiting three seconds after each response before sending another. OpenCLIP ranks up to three records from the selected museum; only selecting a candidate requests a Qwen interpretation based on the catalogue record. Frames below the matching threshold keep scanning. Similarity is not an accuracy estimate or probability. Service errors pause scanning until retry. Pausing, hiding the browser or leaving Scan releases the camera and cancels requests; old results are ignored. Permission denial still permits a single-image upload.
- **Met and GOMA route planning:** Qwen selects works, while deterministic Dijkstra paths enforce route order, time and accessibility constraints. The itinerary shows whether recommendations came from Qwen or local rules. Route generation falls back to local rules if Qwen is unavailable; conversational preference updates require the AI service and show an explicit retryable error on failure.
- **Listen:** device text-to-speech. On iPhone, silent mode can prevent audio playback; turn it off to listen.
- **Feedback:** local drafts and the native share sheet. Nothing is automatically sent to a museum.

The eight Met paintings and four QAGOMA Collection works are real works; their introductory text is prototype copy. Northbank Gallery and its collection remain fictional. Device location and local AI services are connected in the web flow. Live indoor positioning, multi-user accounts and museum synchronisation remain unavailable. Opening Scan with camera permission automatically sends sampled frames to your Node backend and local OpenCLIP service; uploads are sent on selection. Unframe does not persist these images. Matching compares the whole frame with catalogue reference images; it does not independently locate every artwork in a room.

Automated mocked browser tests verify the app flow independently of the models. Real recognition requires a local 512-dimensional OpenCLIP index, and real interpretation and planning require Ollama `qwen3:4b`. Use the [local setup and live check](../AI-INTEGRATION.md) to verify the current computer; passing mocked tests alone does not verify model deployment.

## Device data

Data is stored under `unframe.mobile.v1` using AsyncStorage on the device. The prototype stores bookmarks and their save times, saved route snapshots, preferences, the saved cropped avatar, active tours, completed visits and feedback drafts. Artwork recognition photos and location coordinates are not stored. Avatar photos are re-encoded locally without EXIF; only the cropped avatar is added to the saved collection data. The data is not encrypted; do not use this prototype to store sensitive information.

Planning conversations stay in memory for the current museum session and are cleared on reload, museum change or New conversation. Sending a message transmits it, the latest eight messages and the current visit preferences through the backend to local Ollama Qwen. Unframe does not write planning conversations to disk. The AI models run on the backend computer, which may be separate from the phone; public model downloads require internet access during setup.

The mobile app is the only UI; the separate website and curator workspace have been removed. Existing backend JSON files are preserved, but are not copied or synchronised to the phone. The mobile app and backend share bundled collection data and core route/guide algorithms under `../shared/`.

## Build an actual iOS installation

The app configuration and `eas.json` are included. No build has been uploaded, signed, published or submitted to Apple.

From Windows, EAS can build iOS in the cloud. This requires your own Expo account, an Apple Developer account for device distribution, a registered device for an internal build, and an available bundle identifier. Change the sample `com.unframe.museum` identifier to one you own before distribution.

```powershell
cd mobile
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest build:configure
npx.cmd eas-cli@latest build --platform ios --profile preview
```

Follow EAS’s signing and device-registration prompts. A production build can later use the `production` profile. Read the [official iOS internal-distribution instructions](https://docs.expo.dev/build/internal-distribution/) before distributing it.

For a local native build or iOS Simulator, use macOS with Xcode:

```sh
cd mobile
npm ci
npx expo run:ios
```

Generated `ios/` and `android/` folders are ignored because Expo regenerates them from the app configuration.

## Structure

```text
App.tsx                 Native stack and tab navigation
app.json                iOS/Android IDs, permissions and application metadata
eas.json                Internal, simulator and production build profiles
src/screens/            Native visitor screens
src/ui.tsx              Shared visual components and accessible controls
src/model.ts            Collection types and default preferences
src/museum.ts           Met demo collection and location matching
src/location.tsx        Optional foreground location with fallback
src/components/         Interactive illustrated floor plan
src/state.ts            Testable state transitions and data restoration
src/store.tsx           AsyncStorage hydration and queued persistence
assets/                 Bundled artwork images and 1024px app icon
tests/                  Persistence, consent and tour-state tests
e2e/                    Browser tests of the React Native Web preview
../shared/              Collection and route/guide logic shared with the backend
```

## Validate

```powershell
cd mobile
npm.cmd run check
npm.cmd test
npx.cmd expo install --check
npm.cmd run export
```

`export` generates the JavaScript/assets for iOS, Android and web. It does **not** compile an `.ipa` or replace a real-device test.

From the repository root, after exporting:

```powershell
npm.cmd run test:mobile:e2e
```

To verify the actual web development server, including watched-file changes and browser reloads (no export required), run from the repository root:

```powershell
npm.cmd run test:mobile:web-dev
```

The browser suite requires root development dependencies and an installed Chrome browser. It exercises the welcome-to-map-to-detail journey, bookmarks across reload, floor and room filters, search, location success/refusal/failure, speech controls with mocked audio, desktop sizing, small-screen overflow, existing sample tours, preferences and feedback. Screenshots are saved under `../test-results/met-*.png`. Actual camera permissions, speech output, GPS behaviour and native navigation must also be checked on a physical phone.
