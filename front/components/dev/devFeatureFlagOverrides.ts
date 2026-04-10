// Dev mode feature flag overrides — reactive store + pure apply function.
// No side effects. Safe to import from the main bundle.

import {
  isWhitelistableFeature,
  type WhitelistableFeature,
} from "@app/types/shared/feature_flags";

import { DEV_MODE_ACTIVE } from "./devModeConstants";

const FF_OVERRIDES_KEY = "dust_ff_overrides";

type FeatureFlagOverrides = Partial<Record<WhitelistableFeature, boolean>>;

// ── Reactive store ──
// Lets useFeatureFlags re-render when the dev panel changes overrides.

let ffOverrideVersion = 0;
const ffOverrideListeners = new Set<() => void>();

export function notifyFfOverridesChanged(): void {
  ffOverrideVersion++;
  for (const listener of ffOverrideListeners) {
    listener();
  }
}

export function subscribeFfOverrides(onStoreChange: () => void): () => void {
  ffOverrideListeners.add(onStoreChange);
  return () => ffOverrideListeners.delete(onStoreChange);
}

export function getFfOverrideVersion(): number {
  return ffOverrideVersion;
}

// ── Override reading ──

export function getFeatureFlagOverrides(): FeatureFlagOverrides {
  if (!DEV_MODE_ACTIVE) {
    return {};
  }
  try {
    const raw = sessionStorage.getItem(FF_OVERRIDES_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const overrides: FeatureFlagOverrides = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isWhitelistableFeature(key) && typeof value === "boolean") {
        overrides[key] = value;
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

// ── Override writing ──

export function writeFeatureFlagOverrides(
  overrides: FeatureFlagOverrides
): void {
  if (Object.keys(overrides).length === 0) {
    sessionStorage.removeItem(FF_OVERRIDES_KEY);
  } else {
    sessionStorage.setItem(FF_OVERRIDES_KEY, JSON.stringify(overrides));
  }
  notifyFfOverridesChanged();
}

// ── Apply overrides to a flag list ──

export function applyFfOverrides(
  serverFlags: WhitelistableFeature[]
): WhitelistableFeature[] {
  if (!DEV_MODE_ACTIVE) {
    return serverFlags;
  }
  const overrides = getFeatureFlagOverrides();
  if (Object.keys(overrides).length === 0) {
    return serverFlags;
  }
  const flags = new Set(serverFlags);
  for (const [key, enabled] of Object.entries(overrides)) {
    if (enabled) {
      flags.add(key as WhitelistableFeature);
    } else {
      flags.delete(key as WhitelistableFeature);
    }
  }
  return [...flags];
}
