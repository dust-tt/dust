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

`make doctor` checks Java, SDK components, adb, and the Samsung emulator setup. `make verify` runs
the core and app unit tests, builds every supported variant, runs Android lint, validates brand
assets, and checks that each variant has the expected URLs and auth flags.

## Project Structure

The Gradle project has two modules:

- `core/` is plain Kotlin/JVM. It owns API contracts, models, PKCE and token refresh, request and
  response handling, repositories, SSE parsing/reconnect behavior, and most business rules. Keep
  Android APIs out of this module so `./gradlew -PskipAndroidApp=true :core:test` stays portable.
- `app/` is the Android shell. It owns lifecycle, Compose UI, encrypted token persistence, browser
  and deep-link integration, microphone/file access, and Android-specific state holders.

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
| `app/.../ui/AppViewModels.kt` | Session and screen state, async work, streaming, and voice input |
| `app/.../ui/DustApp.kt` | Compose navigation and all user-facing screens/components |
| `app/src/main/res` | Fonts, icons, logos, avatars, launcher, and platform styles |
| `scripts/` | Build checks, emulator smoke flows, device control, and diagnostics |

The runtime path is:

```text
DustApplication -> AppGraph -> MainActivity -> DustApp
                                      |
                                      v
                     ViewModels -> repositories -> API/SSE
```

`DustApplication` creates the process-wide `AppGraph`. `MainActivity` opens browser custom tabs and
forwards incoming URIs to `DustApp`. Compose observes `StateFlow` state from the view models; view
models call repositories and reduce API or streaming events into immutable UI state.

## Authentication

Login uses PKCE in a browser custom tab and returns through `dust://auth`. The pending verifier and
tokens are encrypted with AES-GCM using a key held by Android Keystore. `TokenProvider` refreshes an
expired access token and retries one failed request after a `401`; an unrecoverable refresh clears
the session.

The local preview is compiled only into debuggable variants. It uses in-memory sample data and a
token provider that refuses token access, so it cannot accidentally authenticate against production.

## Build Variants

| Variant | Backend | Purpose |
| --- | --- | --- |
| `debug` | Local host through `10.0.2.2:3000` | Local development and visible sample-workspace button |
| `prodDebug` | `dust.tt` / `app.dust.tt` | Production behavior with debugging and hidden preview deep link |
| `phoneRelease` | `dust.tt` / `app.dust.tt` | Non-debuggable APK signed with this machine's development key |
| `release` | `dust.tt` / `app.dust.tt` | Unsigned basis for a future managed store release |

`phoneRelease` is for local sideloading, not Play Store distribution. It shares the development
certificate with `prodDebug`, so those variants can replace each other when built on the same
machine. A differently signed installed app must be uninstalled first, which clears local app data.

## Development Loop

```bash
make core-test                 # Fast pure-Kotlin tests
make app-test                  # Android-facing JVM tests
make run-debug                 # Local backend on an emulator
make run-prod-debug            # Production backend, debuggable
make run-prod-debug-local-preview
make logs                      # Running Dust process only
make phone-diagnostics         # Bounded local diagnostic bundle
```

`debug` uses `10.0.2.2` to reach port 3000 on the host, so it is intended for an emulator. A physical
phone should normally use `prodDebug` or `phoneRelease` unless the local backend is exposed on the
network.

When several devices are connected, set `ANDROID_SERIAL`:

```bash
make devices
ANDROID_SERIAL=<serial> make run-prod-debug
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

Smoke screenshots, UI XML, and review pages are written under `/tmp/dust-android-samsung-smoke`.
Device diagnostics are written under `/tmp/dust-android-diagnostics`; they can include visible
account data, so inspect them before sharing.

When changing behavior, put pure transformations and protocol handling in `core` with focused unit
tests. Keep Android services and lifecycle work in `app`, and add UI-state tests for non-trivial
Compose behavior. Finish with `make verify`; use the Samsung smoke targets when layout, auth,
deep-link, streaming, attachment, or voice flows changed.
