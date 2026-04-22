// Reactive store bridging useFeatureFlags (main bundle) with the dev panel
// override logic (lazy chunk). Must stay tiny — imported by AuthContext.
//
// Works via useSyncExternalStore: a React hook that subscribes to a value
// outside React and re-renders when it changes. Here:
// - _version is the external value (bumped on every flag override change)
// - devFlagSubscribe tells React "call me back when _version changes"
// - devFlagGetVersion tells React "here's the current value"
// - notifyDevFlagOverridesChanged bumps _version and fires callbacks
//   → React re-renders → useFeatureFlags returns updated flags

import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { DEV_MODE_ACTIVE } from "./devModeConstants";

let _version = 0;
const _listeners: Set<() => void> | null = DEV_MODE_ACTIVE ? new Set() : null;
let _applyOverrides: (flags: WhitelistableFeature[]) => WhitelistableFeature[] =
  (f) => f;

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
