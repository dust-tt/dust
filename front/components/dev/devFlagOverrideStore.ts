// Thin reactive store bridging useFeatureFlags (main bundle) with the dev panel
// override logic (lazy chunk). Imported by AuthContext so it must stay tiny with
// zero side effects.
//
// The lazy-loaded devFeatureFlagOverrides module calls registerDevFlagOverrides()
// at load time to inject its apply function, and notifyDevFlagOverridesChanged()
// on each override change to trigger re-renders via useSyncExternalStore.
// When dev mode is off, nothing registers and _applyOverrides stays as identity.

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
