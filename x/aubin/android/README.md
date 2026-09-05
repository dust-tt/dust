# Dust Android

Native Kotlin and Jetpack Compose client for Dust. The app supports Android 8.0 (API 26) and newer
and uses a universal APK; there is no separate build per phone model.

## Quick Start

From this directory:

```bash
make doctor
make verify
make show-app
```

`make show-app` installs the production-targeted debug build and opens the credential-free sample
workspace on the selected emulator or device.

For a physical phone:

```bash
make phone-release
make devices
ANDROID_SERIAL=<serial> make install-phone
```

The sideloadable APK is written to `dist/dust-mobile-phone-release.apk`. It uses production Dust
URLs and release auth behavior, but is signed with the local Android development key and is not a
Play Store artifact.

## Modules

- `core/`: platform-neutral auth, networking, API models, repositories, streaming, and JVM tests.
- `app/`: Android lifecycle, secure token storage, browser auth, Compose UI, and device services.
- `scripts/`: build checks, Samsung emulator smoke flows, device commands, and diagnostics.

See [DEVELOPMENT.md](DEVELOPMENT.md) for the toolchain, architecture, build variants, authentication
flow, development commands, physical-device setup, testing, and release workflow.

See [PRODUCT_REVIEW.md](PRODUCT_REVIEW.md) for the mobile product decisions, review fixes, and
validation boundaries.
