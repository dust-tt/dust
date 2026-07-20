import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Shadow-compare machinery for the group_permissions rollout.
 *
 * Every later phase runs the legacy permission check and the new group_permissions check side by
 * side, serves the legacy result, and logs mismatches so a Datadog monitor can confirm parity
 * before we flip. The candidate is only evaluated when the feature flag is enabled for the
 * workspace, so shadowing is per-workspace and reverts instantly by toggling the flag off.
 */

// The literal message is the Datadog monitor key — keep it stable.
const SHADOW_MISMATCH_MESSAGE = "group_permissions_shadow_mismatch";

// Logged when the candidate check itself throws (it must never break the served legacy path).
const SHADOW_CANDIDATE_ERROR_MESSAGE =
  "group_permissions_shadow_candidate_error";

const SHADOW_FEATURE_FLAG: WhitelistableFeature = "group_permissions_shadow";

type ShadowContext = Record<string, string | number | boolean | null>;

interface ShadowCompareArgs<T> {
  auth: Authenticator;
  // The result actually served — already computed on the legacy path.
  legacy: T;
  // The new check, evaluated lazily and only while shadowing is enabled.
  candidate: () => Promise<T>;
  // Structured fields identifying the call site, logged on mismatch.
  context: ShadowContext;
  // Custom equality when T is not comparable with ===.
  equals?: (legacy: T, candidate: T) => boolean;
}

export async function shadowCompare<T>({
  auth,
  legacy,
  candidate,
  context,
  equals,
}: ShadowCompareArgs<T>): Promise<T> {
  const flags = await getFeatureFlags(auth);
  if (!flags.includes(SHADOW_FEATURE_FLAG)) {
    return legacy;
  }

  // Shadowing must never break the served path: any failure computing or comparing the candidate is
  // logged and swallowed, and the legacy result is still returned.
  try {
    const candidateResult = await candidate();
    const matches = equals
      ? equals(legacy, candidateResult)
      : legacy === candidateResult;
    if (!matches) {
      logger.warn(
        { ...context, legacyResult: legacy, candidateResult },
        SHADOW_MISMATCH_MESSAGE
      );
    }
  } catch (err) {
    logger.error(
      { ...context, err: normalizeError(err) },
      SHADOW_CANDIDATE_ERROR_MESSAGE
    );
  }

  return legacy;
}
