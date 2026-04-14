// Dev mode feature flag overrides — reactive store + pure apply function.
// No side effects. Safe to import from the main bundle.

import {
  isWhitelistableFeature,
  type WhitelistableFeature,
} from "@app/types/shared/feature_flags";

import { DEV_MODE_ACTIVE } from "./devModeConstants";

const FEATURE_FLAG_OVERRIDES_KEY = "dust_ff_overrides";

type FeatureFlagOverrides = Partial<Record<WhitelistableFeature, boolean>>;

// Lets useFeatureFlags re-render when the dev panel changes overrides.
let featureFlagOverrideVersion = 0;
const featureFlagOverrideListeners = new Set<() => void>();

export function notifyFeatureFlagOverridesChanged(): void {
  featureFlagOverrideVersion++;
  for (const listener of featureFlagOverrideListeners) {
    listener();
  }
}

export function subscribeFeatureFlagOverrides(
  onStoreChange: () => void
): () => void {
  featureFlagOverrideListeners.add(onStoreChange);
  return () => featureFlagOverrideListeners.delete(onStoreChange);
}

export function getFeatureFlagOverrideVersion(): number {
  return featureFlagOverrideVersion;
}

export function getFeatureFlagOverrides(): FeatureFlagOverrides {
  if (!DEV_MODE_ACTIVE) {
    return {};
  }
  try {
    const raw = sessionStorage.getItem(FEATURE_FLAG_OVERRIDES_KEY);
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

export function writeFeatureFlagOverrides(
  overrides: FeatureFlagOverrides
): void {
  if (Object.keys(overrides).length === 0) {
    sessionStorage.removeItem(FEATURE_FLAG_OVERRIDES_KEY);
  } else {
    sessionStorage.setItem(
      FEATURE_FLAG_OVERRIDES_KEY,
      JSON.stringify(overrides)
    );
  }
  notifyFeatureFlagOverridesChanged();
}

export function applyFeatureFlagOverrides(
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
