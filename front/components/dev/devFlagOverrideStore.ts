// Reactive store that bridges useFeatureFlags (main bundle) with the dev panel
// feature flag overrides (lazy-loaded chunk).
//
// ## Problem
//
// useFeatureFlags() in AuthContext needs to reflect dev panel overrides in
// real time, but the override logic (sessionStorage reads, validation, apply)
// lives in devFeatureFlagOverrides.ts which is part of the lazy-loaded dev
// panel chunk. We can't import it from AuthContext without pulling it into the
// main bundle.
//
// ## Solution
//
// This file acts as a thin indirection layer:
//
//   ┌─────────────────────┐       ┌──────────────────────────┐
//   │  AuthContext.tsx     │       │  devFeatureFlagOverrides  │
//   │  (main bundle)      │       │  (lazy chunk)             │
//   │                     │       │                           │
//   │  useFeatureFlags()  │       │  reads sessionStorage     │
//   │    ├ subscribe ──────┤──┐    │  validates flags          │
//   │    ├ getVersion ─────┤  │    │  applies overrides        │
//   │    └ apply ──────────┤  │    │                           │
//   └─────────────────────┘  │    │  on module load:          │
//                            │    │    registerDevFlag─────────┤──► sets _applyOverrides
//                            │    │                           │
//                            │    │  on override change:      │
//                            │    │    notifyDevFlag───────────┤──► bumps _version
//                            │    └──────────────────────────┘     → triggers re-render
//                            │
//                    devFlagOverrideStore.ts
//                    (this file, main bundle, ~300 bytes)
//                    Holds: _version, _listeners, _applyOverrides
//
// ## Lifecycle
//
// 1. Page loads. DEV_MODE_ACTIVE is false → useFeatureFlags uses noopSubscribe,
//    _applyOverrides is identity. Zero runtime cost.
//
// 2. Page loads with dev mode on (localStorage flag set):
//    a. useFeatureFlags subscribes via devFlagSubscribe, reads devFlagGetVersion.
//       _applyOverrides is still identity → returns serverFlags as-is.
//    b. AppAuthContextLayout lazy-imports DevFeatureFlagPanel.
//    c. That chunk imports devFeatureFlagOverrides.ts, which at module load
//       calls registerDevFlagOverrides(applyFn).
//    d. registerDevFlagOverrides sets _applyOverrides and calls notify.
//    e. notify bumps _version and fires _listeners → useSyncExternalStore
//       detects the snapshot change → React re-renders → useMemo calls
//       devFlagApply(serverFlags) → now applies overrides from sessionStorage.
//
// 3. User toggles a flag in the dev panel → writeFeatureFlagOverrides() updates
//    sessionStorage then calls notifyDevFlagOverridesChanged() → same re-render
//    cycle as step 2e.

import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { DEV_MODE_ACTIVE } from "./devModeConstants";

// useSyncExternalStore snapshot version — incremented on every override change.
let _version = 0;

// Listener set for useSyncExternalStore subscriptions. Null when dev mode is
// off so we don't allocate a Set that will never be used.
const _listeners: Set<() => void> | null = DEV_MODE_ACTIVE ? new Set() : null;

// The actual override application function. Starts as identity and gets
// replaced when the lazy chunk registers via registerDevFlagOverrides.
let _applyOverrides: (flags: WhitelistableFeature[]) => WhitelistableFeature[] =
  (f) => f;

// --- Hooks interface (consumed by useFeatureFlags in AuthContext) ---

export function devFlagSubscribe(cb: () => void): () => void {
  _listeners!.add(cb);
  return () => {
    _listeners!.delete(cb);
  };
}

export function devFlagGetVersion(): number {
  return _version;
}

export function devFlagApply(
  serverFlags: WhitelistableFeature[]
): WhitelistableFeature[] {
  return _applyOverrides(serverFlags);
}

// --- Registration interface (consumed by devFeatureFlagOverrides in lazy chunk) ---

export function notifyDevFlagOverridesChanged(): void {
  _version++;
  if (_listeners) {
    for (const listener of _listeners) {
      listener();
    }
  }
}

export function registerDevFlagOverrides(
  apply: (flags: WhitelistableFeature[]) => WhitelistableFeature[]
): void {
  _applyOverrides = apply;
  notifyDevFlagOverridesChanged();
}
