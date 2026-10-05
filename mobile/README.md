# Unframe mobile

A native React Native + Expo application for iOS and Android. It includes native stack navigation, bottom tabs, device photo/camera access, speech, and persistent on-device data. It is not a WebView of the website.

## The Met and Brisbane GOMA visits

The app opens on a full-screen museum welcome page. **Start Visit** opens the floor plan and horizontal nearby-artwork cards. Selecting a work opens an image-led detail page with bookmarks, a readable introduction, English/Chinese device speech, and a link to the museum collection record.

Choose a museum from the welcome page's location header or the Home page's museum dropdown: **Choose The Met** / **Choose GOMA** → **Explore**. The selection applies to artwork browsing, the map, web Scan and AI route planning. The Met has eight artworks; GOMA has four QAGOMA Collection works with official images, English/Chinese introductions and source links. See [GOMA demo sources and scope](../GOMA-DEMO.md).

Device location is requested on opening. The Met matches within 800 m with accuracy of 500 m or better; GOMA matches within 300 m with accuracy of 300 m or better. The nearest qualifying museum is selected automatically until you manually choose a museum for this session. Otherwise, or if permission is refused, the default Met demo remains available and either museum can be selected manually. Refresh location from the museum information page. Location is not persisted or uploaded by Unframe. There is no global museum discovery service.

**Floor plans, gallery labels, floor assignments, blue position markers, accessibility and artwork distances are demonstration data.** GPS does not place the visitor on an indoor map. GOMA uses its own schematic, not an official floor plan. QAGOMA holds a shared collection across QAG and GOMA; inclusion here does not mean a work is currently displayed at GOMA. See [asset sources](assets/SOURCES.md).

## Start from Windows

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

**Use the QR code printed by Expo, not `127.0.0.1:3000` on your phone.** That address belongs to the separate desktop museum workspace.

### Expo Go compatibility

This prototype intentionally uses **Expo SDK 54**, React Native 0.81 and React 19.1. Expo’s currently published guidance identifies SDK 54 as compatible with the Apple App Store build of Expo Go. The project SDK and Expo Go SDK must match. Check the [official compatibility instructions](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) if the phone reports a version mismatch. Expo’s newer SDKs can use development builds or a matching Expo Go build through TestFlight.

SDK 54 supports iOS 15.1 and later. See the [SDK platform requirements](https://docs.expo.dev/versions/v54.0.0/). This is a prototype baseline, not a claim that the current configuration satisfies every App Store submission requirement.

## Preview on the computer

For browser camera and Google AI, also start the Node API with `npm.cmd start` **from the repository root in another terminal**. Follow [AI setup](../AI-INTEGRATION.md) to configure Google credentials and generate the artwork index. Open **Scan** to capture/upload, or **Plan a Met visit** to create an itinerary. Camera access requires HTTPS or localhost. Google AI configuration is server-only; Expo Go camera configuration is unchanged.

Run from any directory using the full project path:

```powershell
cd D:\FlyFly\Study\Project\Unframe\mobile
npm.cmd run web
```

`npm.cmd run mobile:web` also works from either the project root or the `mobile` directory. In `mobile`, it is an alias for `npm.cmd run web`.

If a previous installation exits with `TypeError: eventsQueue is not iterable`, run `npm.cmd ci` in `mobile` once, then restart the command above. The lockfile now allows Expo's Metro wrapper to install its required Metro version. Do not force all `metro*` packages to a different version through npm overrides: the development file-watcher event format must match the installed CLI.

This runs the same React Native screens using React Native Web. On desktop windows 600 px or wider, the app automatically appears in a centred phone frame with a 390 px content width; narrower windows use the full viewport. No DevTools device mode is required. Keep the terminal open and use the URL it prints. Geolocation requires localhost or HTTPS and browser permission. This preview cannot validate native camera behaviour, audio output, signing, installation or gestures.

## Features

- **Home:** Selected museum's demo map, room selection, nearby cards, artwork/artist search and a full collection view; the Met schematic also has demo floor selection.
- **Map:** the interactive demo map with museum and location information.
- **Saved:** persistent bookmarks and optional completed-visit reflections.
- **Profile:** preferences, larger text, history consent, feedback and the separate Northbank sample tour.
- **Sample tour:** the existing fictional Northbank route planner and catalogue guide remain available. Active tour progress survives a restart.
- **Photo lookup:** web camera preview/capture or upload, followed by Vertex similarity matching and Gemini interpretation. Native photo lookup retains its existing manual flow. Permission denial allows upload or browsing.
- **Met route planning:** interests, time, start, walking/accessibility and must-see choices; Gemini recommendations plus deterministic Dijkstra paths, demo-map overlay and ordered stops. Local recommendations are used when Gemini is unavailable.
- **Listen:** device text-to-speech. On iPhone, silent mode can prevent audio playback; turn it off to listen.
- **Feedback:** local drafts and the native share sheet. Nothing is automatically sent to a museum.

The eight Met paintings are real works; their introductory text is prototype copy. Northbank Gallery and its collection remain fictional. Device location and configurable Google AI are connected in the web flow. Live indoor positioning, multi-user accounts and museum synchronisation remain unavailable. Uploaded recognition photos are sent to the server and Google only after pressing Identify artwork; Unframe does not persist them.

## Device data

Data is stored under `unframe.mobile.v1` using AsyncStorage on the device. The prototype stores bookmarks, preferences, active tours, completed visits and feedback drafts. Selected photos and location coordinates are not stored. The data is not encrypted; do not use this prototype to store sensitive information.

The existing website remains a separate curator workspace. Its JSON database is not silently copied to the phone. The mobile and web clients share the bundled collection and core route/guide algorithms under `../shared/`, but changes made in the web editor do not sync to a running mobile installation.

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
../shared/              Collection and route/guide logic shared with the web app
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
