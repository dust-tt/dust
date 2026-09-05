# Android Development Guide

This project is the native Kotlin/Jetpack Compose Dust app. It targets Android 8.0 (API 26) and
newer, talks to the same Dust APIs as the web and iOS clients, and is packaged as one universal APK
rather than one build per phone model.

## Toolchain

Required:

- JDK 17 or newer.
- Android SDK platform 35, build-tools 34.0.0, and platform-tools.
- The checked-in Gradle wrapper. A system Gradle installation is not needed.

The Makefile and phone scripts detect the normal SDK locations at `~/Library/Android/sdk` on macOS
and `~/Android/Sdk` on Linux. Use `ANDROID_HOME` or `ANDROID_SDK_ROOT` for another location.

Start with:

```bash
make doctor
make verify
```

`make doctor` checks Java, SDK components, adb, and the Samsung emulator setup. `make verify` checks
the architecture contract, runs the core and app unit tests, compiles the device-test APK, builds
every supported variant, runs Android lint, validates brand assets, and checks that each variant
has the expected URLs and auth flags.

## Project Structure

The Gradle project has three modules:

- `core/` is plain Kotlin/JVM. It owns API contracts, models, PKCE and token refresh, request and
  response handling, repositories, SSE parsing/reconnect behavior, and most business rules. Keep
  Android APIs out of this module so `./gradlew -PskipAndroidApp=true :core:test` stays portable.
- `app/` is the Android shell. It owns lifecycle, Compose UI, encrypted persistence, browser and
  deep-link integration, microphone/file access, and Android platform integrations.
- `baselineprofile/` is a test-only Android module. It drives deterministic startup, inbox, and
  conversation journeys to generate profiles and measure release performance.

Important paths:

| Path | Responsibility |
| --- | --- |
| `core/config` | Backend URLs, endpoints, and deep-link routing |
| `core/auth` | PKCE login, token refresh, and token-provider behavior |
| `core/network` | HTTP, JSON, multipart uploads, OkHttp, and SSE transport |
| `core/model` | API models and pure presentation/business helpers |
| `core/repository` | Workspace, conversation, agent, capability, file, and user operations |
| `core/stream` | Agent-message stream reduction and reconnect state |
| `app/.../data/AppGraph.kt` | Dependency construction and build-variant configuration |
| `app/.../data/{persistence,outbox,offline}` | Encrypted process state, durable sends, and bounded offline reads |
| `app/.../audio` | Realtime microphone capture and Android text-to-speech playback |
| `app/.../ui/DustApp.kt` | App entry point, session navigation, and cross-feature coordination |
| `app/.../ui/auth` | Authentication state, browser-return handling, and login UI |
| `app/.../ui/composer` | Drafts, bottom composer, focus/IME policy, attachments, voice, and context pickers |
| `app/.../ui/inbox` | Conversation list, pods, Catch Up, grouping, search, and row actions |
| `app/.../ui/conversation` | Conversation detail, streaming/reply state, files, and attachment viewers |
| `app/.../ui/{frame,message}` | Shared-frame/WebView lifecycle and conversation content rendering |
| `app/.../notifications` | FCM, channels, privacy, inline replies, and notification rendering |
| `app/.../{shortcuts,share,search}` | Launcher/direct-share targets, incoming shares, and AppSearch |
| `app/.../{widget,quicksettings}` | Catch Up home widget and Ask Dust Quick Settings tile |
| `app/.../preview` | Compose and Glance preview providers |
| `app/.../ui/{common,theme}` | Stateless shared primitives, loading states, and design tokens |
| `app/.../ui/preview` | Deterministic credential-free preview fixtures |
| `baselineprofile/src/main` | Baseline Profile journeys and Macrobenchmark tests |
| `app/src/main/res` | Fonts, icons, logos, avatars, launcher, and platform styles |
| `scripts/` | Build checks, emulator smoke flows, device control, and diagnostics |

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the enforced package graph, source limits, and mobile UI
contract. Run `make check-architecture` for the fast structural gate.

The runtime path is:

```text
DustApplication -> AppGraph -> MainActivity -> DustApp
                                      |
                                      v
                     ViewModels -> repositories -> API/SSE
```

`DustApplication` creates the process-wide `AppGraph`. `MainActivity` opens browser custom tabs and
forwards incoming URIs to `DustApp`. Compose observes `StateFlow` state from feature ViewModels;
ViewModels call repositories and reduce API or streaming events into immutable UI state.

## State Durability And Sending

Selected workspace/navigation state, drafts, and the message outbox are encrypted on disk. A send
is persisted before network dispatch and keeps one `clientRequestId` across retries; the backend
uses that ID to return the existing conversation/message instead of creating a duplicate. WorkManager
drains pending work after connectivity or process recovery, while the foreground UI observes the
same outbox state.

A separate encrypted cache keeps the active identity, workspace metadata, up to four workspace
snapshots, and the 40 newest messages for up to 12 recently opened conversations. Home and
conversation detail render this saved state first and refresh it in the background. Cache entries
are user-scoped and bounded; file bytes and attachment payloads are not cached. Failed refreshes
leave saved content visible, while server-only actions still report their connectivity failure.
Signing out clears both encrypted stores, shortcuts, widgets, and search data.

## Authentication

Login uses PKCE in a browser custom tab and returns through `dust://auth`. The pending verifier and
tokens are encrypted with AES-GCM using a key held by Android Keystore. `TokenProvider` refreshes an
expired access token and retries one failed request after a `401`. If startup token refresh fails
because the network is unavailable, the app can restore the cached identity and recent read state;
an authentication rejection still clears the session.

## Voice Sessions

Voice input streams 16 kHz mono PCM to the existing Scribe realtime transcription endpoint. In an
existing conversation, the full-screen voice surface keeps the turn active after send, follows the
specific agent response created after that turn, and reads the completed Markdown response through
Android `TextToSpeech`. Playback requests transient audio focus and follows system output routing,
including connected headsets. Tapping the microphone during playback stops speech immediately and
starts a new transcription turn; successful playback automatically returns to listening.

Voice sessions are foreground-only. They stop when the conversation leaves composition, never keep
the microphone active from a background service, and pause when an approval or user-question card
needs visual interaction. New-conversation voice input remains dictation until the conversation has
been created.

The local preview is compiled only into debuggable variants. It uses in-memory sample data and a
token provider that refuses token access, so it cannot accidentally authenticate against production.
Opening it preserves any saved production session; restarting the app normally returns to that
session. Set `CLEAR_APP_DATA=1` only when `make run-prod-debug-local-preview` needs a clean install.

## Build Variants

| Variant | Backend | Purpose |
| --- | --- | --- |
| `debug` | Local host through `10.0.2.2:3000` | Local development and visible sample-workspace button |
| `prodDebug` | `dust.tt` / `app.dust.tt` | Production behavior with debugging and hidden preview deep link |
| `phoneRelease` | `dust.tt` / `app.dust.tt` | Non-debuggable APK signed with this machine's development key |
| `release` | `dust.tt` / `app.dust.tt` | Unsigned basis for a future managed store release |
| `nonMinifiedRelease` / `benchmarkRelease` | `dust.tt` / `app.dust.tt` | Internal profile generation and measurement only |

`phoneRelease` is for local sideloading, not Play Store distribution. It shares the development
certificate with `prodDebug`, so those variants can replace each other when built on the same
machine. A differently signed installed app must be uninstalled first, which clears local app data.
The two profiling variants enable the credential-free local preview so their journeys are
deterministic. They are development tooling and must never be distributed.

## Development Loop

```bash
make core-test                 # Fast pure-Kotlin tests
make app-test                  # Android-facing JVM tests
make app-device-test           # Compose and Android IME tests on the selected device
make baseline-profile          # Generate committed release profiles on a disposable device
make benchmark                 # Measure a profiled release on a physical test device
make run-debug                 # Local backend on an emulator
make run-prod-debug            # Production backend, debuggable
make run-prod-debug-local-preview
make logs                      # Running Dust process only
make phone-diagnostics         # Bounded local diagnostic bundle
```

Message sends log privacy-safe phase markers under `DustMessageSend`: `preparing`, `dispatching`,
`accepted`, `timed out`, or `failed`. Run `make logs` while reproducing a send issue and filter on
that tag. The markers do not include message text, conversation/workspace identifiers, or tokens.

`debug` uses `10.0.2.2` to reach port 3000 on the host, so it is intended for an emulator. A physical
phone should normally use `prodDebug` or `phoneRelease` unless the local backend is exposed on the
network.

## Notifications

Remote push registration is unavailable in this standalone client because the existing backend
has no mobile token-registration API. No Firebase configuration or server changes are required.
The account's remote-notification control stays disabled. Existing Pod notification preferences
continue to use the existing API.

The native notification renderer, channels, privacy handling, and inline-reply receiver can be
inspected with local debug notifications. Inline replies enter the same durable queue as app sends;
unconfirmed delivery requires manual review before another attempt.

Use a debuggable build to inspect local notification rendering:

```bash
make run-prod-debug
make test-notification KIND=user
make test-notification KIND=agent
make test-notification KIND=mention
make test-notification KIND=action
```

## Android Entry Points

Dust handles production conversation and Pod links plus its `dust://` callback links. It also
appears in Android's Sharesheet for text, images, PDFs, JSON, and common Word, Excel, and PowerPoint
files. Shared text initializes the new-conversation draft and shared files enter the normal attachment upload
flow; an incoming share waits through login and then opens the composer.

Launcher long-press actions open Ask Dust, Catch Up, or a recently used agent. Recent agents also
appear as Direct Share targets. The composer accepts supported content from the clipboard, keyboard,
drag and drop, and the Sharesheet through one attachment path. Hardware keyboards expose `Ctrl+N`
for a draft, `Ctrl+K` for inbox search, and `Ctrl+Shift+U` for Catch Up.

Useful adb checks:

```bash
adb shell am start -a android.intent.action.VIEW \
  -d 'dust://conversation/<workspace-id>/<conversation-id>'
adb shell am start -n com.dust.mobile/com.dust.mobile.android.MainActivity \
  -a android.intent.action.SEND -t text/plain \
  --es android.intent.extra.TEXT 'Summarize this link: https://example.com'
```

## Android Platform Surfaces

- The Glance Catch Up widget supports compact, medium, and large layouts, links to exact content,
  and renders privacy-safe logged-out/locked states. It refreshes after foreground sync and
  periodic WorkManager updates; the in-app account menu can request widget pinning.
- Android search is opt-in from the account menu. Conversation, Pod, and agent metadata remains
  app-private until enabled for system surfaces, and the index is cleared on sign-out. AppSearch is
  pinned to `1.1.0-beta01` while this project remains on compile SDK 35 and AGP 8.7.3; re-evaluate the
  stable release with the next toolchain upgrade.
- The Ask Dust Quick Settings tile opens a new draft. Users add it through the system tile editor or
  the account-menu shortcut on supported Android versions.
- Expanded windows use a list/detail layout with a stable inbox pane. Separating fold hinges become
  pane boundaries; compact phone navigation is unchanged. This covers tablets, foldables, DeX, and
  desktop-style resizable windows without cloning the web layout.

## Previews

Open `app/.../preview` and `app/.../ui/preview` in Android Studio to render credential-free Compose
and Glance fixtures. Preview matrices cover phone/tablet widths, light/dark themes, font scaling,
empty/loading/error states, conversations, composers, and all widget sizes. Previews never read
tokens or call production services.

## Baseline Profiles

The generated Baseline and Startup Profiles are committed under
`app/src/release/generated/baselineProfiles/`. Release APKs package them and include ProfileInstaller
for local sideloads.

```bash
ANDROID_SERIAL=<disposable-api-33+-device> make baseline-profile
ANDROID_SERIAL=<physical-test-device> make benchmark
```

Both commands run `pm clear com.dust.mobile`. Never point either command at a signed-in daily-use
phone. Profile generation may run on an emulator for reproducibility; emulator benchmark results are
only a functional smoke signal and must not be used for performance claims. Measure regressions and
improvements on the same physical device with stable thermal conditions. The release currently keeps
R8 disabled; enable minification only as a separately verified release-hardening change.

When several devices are connected, set `ANDROID_SERIAL`:

```bash
make devices
ANDROID_SERIAL=<serial> make run-prod-debug
ANDROID_SERIAL=<serial> make app-device-test
```

## Phone Builds

On a Samsung phone, enable Developer options by tapping **Build number** seven times under
**Settings > About phone > Software information**, then enable **USB debugging** under
**Settings > Developer options**. Connect and unlock the phone, accept its USB debugging prompt,
and confirm that adb can see it before installing:

```bash
make phone-release
make devices
ANDROID_SERIAL=<serial> make phone-doctor
ANDROID_SERIAL=<serial> make install-phone
```

The reusable APK and checksum are written to `dist/dust-mobile-phone-release.apk` and
`dist/dust-mobile-phone-release.apk.sha256`. The build has no per-ABI or per-device splits, so no
Samsung- or model-specific build is required. Increment `versionCode` and `versionName` in
`app/build.gradle.kts` when publishing an update that must supersede an installed version.

A future Play release should use managed signing and an Android App Bundle. Do not reuse the local
development certificate as a production signing identity.

## UI And Runtime Verification

The `DustSamsungS23` AVD provides a stable `1080x2340 @ 425dpi` review viewport:

```bash
make smoke-samsung-prod-visible
make smoke-samsung-local-preview
make presentation-check
```

The managed AVD enables `hw.keyboard=yes`, so the host keyboard can type into focused Android
fields while the software keyboard remains available for IME layout checks. AVD hardware changes
take effect after restarting the emulator.

Smoke screenshots, UI XML, and review pages are written under `/tmp/dust-android-samsung-smoke`.
Device diagnostics are written under `/tmp/dust-android-diagnostics`; they can include visible
account data, so inspect them before sharing.

The local-preview smoke checks editor focus and Android's IME active state during composer flows.
Some emulator keyboard configurations expose only an accessory strip while still reporting the IME
as active. Require a full visible keyboard surface when doing keyboard layout QA:

```bash
REQUIRE_FULL_IME_SURFACE=1 make smoke-samsung-local-preview
```

The run records the observed IME inset heights in the artifact manifest and dedicated diagnostic
files. Use the strict check on a physical phone or an emulator configured to render its soft
keyboard.

`make app-device-test` includes a real input-connection test for rich composer content. It focuses
the composer, verifies that the editor advertises image support to the keyboard, and commits a
screenshot URI through Android's keyboard API. A physical-device pass is still required to verify
the Samsung Keyboard suggestion UI itself, because the keyboard decides whether and how to render
that shortcut.

When changing behavior, put pure transformations and protocol handling in `core` with focused unit
tests. Keep Android services and lifecycle work in `app`, and add UI-state tests for non-trivial
Compose behavior. Finish with `make verify`; use the Samsung smoke targets when layout, auth,
deep-link, streaming, attachment, or voice flows changed.
