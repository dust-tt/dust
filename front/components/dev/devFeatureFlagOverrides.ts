// Dev mode feature flag overrides — sessionStorage-backed read/write + apply.
//
// This module is lazy-loaded as part of the dev panel chunk. On module load it
// registers applyFeatureFlagOverrides into devFlagOverrideStore so that
// useFeatureFlags (main bundle) can apply overrides without importing this file.
// See devFlagOverrideStore.ts for the full architecture overview.

import {
  notifyDevFlagOverridesChanged,
  registerDevFlagOverrides,
} from "./devFlagOverrideStore";
import {
  isWhitelistableFeature,
  type WhitelistableFeature,
} from "@app/types/shared/feature_flags";

const FEATURE_FLAG_OVERRIDES_KEY = "dust_ff_overrides";

type FeatureFlagOverrides = Partial<Record<WhitelistableFeature, boolean>>;

export function getFeatureFlagOverrides(): FeatureFlagOverrides {
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
  notifyDevFlagOverridesChanged();
}

function applyFeatureFlagOverrides(
  serverFlags: WhitelistableFeature[]
): WhitelistableFeature[] {
  const overrides = getFeatureFlagOverrides();
  if (Object.keys(overrides).length === 0) {
    return serverFlags;
  }
  const flags = new Set(serverFlags);
  for (const [key, enabled] of Object.entries(overrides)) {
    if (isWhitelistableFeature(key)) {
      if (enabled) {
        flags.add(key);
      } else {
        flags.delete(key);
      }
    }
  }
  return [...flags];
}

// Register with AuthContext so useFeatureFlags picks up overrides.
// This runs when the lazy dev panel chunk loads.
registerDevFlagOverrides(applyFeatureFlagOverrides);
