import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import logger from "@app/logger/logger";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Shadow-compare machinery for the group_permissions rollout.
 *
 * Every later phase runs the legacy permission check and the new group_permissions check side by
 * side, serves the selected result, and logs mismatches so a Datadog monitor can confirm parity
 * before and after the flip. The other source is only evaluated when the feature flag is enabled for the
 * workspace, so shadowing is per-workspace and reverts instantly by toggling the flag off.
 */

// The literal message is the Datadog monitor key — keep it stable.
const SHADOW_MISMATCH_MESSAGE = "group_permissions_shadow_mismatch";

// Logged when the comparison throws (it must never break the served path).
const SHADOW_CANDIDATE_ERROR_MESSAGE =
  "group_permissions_shadow_candidate_error";

const SHADOW_FEATURE_FLAG: WhitelistableFeature = "group_permissions_shadow";

type ShadowContext = Record<string, string | number | boolean | null>;

interface ShadowCompareArgs<T> {
  auth: Authenticator;
  // The result actually served — already computed outside the shadow comparison.
  legacy: T;
  // The other source, evaluated lazily and only while shadowing is enabled.
  candidate: () => Promise<T>;
  // When serving grants, keep comparison arguments and log fields in legacy/grant order.
  reverse?: boolean;
  // Structured fields identifying the call site, logged on mismatch.
  context: ShadowContext;
  // Custom equality when T is not comparable with ===.
  equals?: (legacy: T, candidate: T) => boolean | Promise<boolean>;
}

export async function shadowCompare<T>({
  auth,
  legacy,
  candidate,
  reverse = false,
  context,
  equals,
}: ShadowCompareArgs<T>): Promise<T> {
  // Shadowing must never break the served path: any failure computing or comparing the candidate is
  // logged and swallowed, and the selected result is still returned.
  try {
    const flags = await getFeatureFlags(auth);
    if (!flags.includes(SHADOW_FEATURE_FLAG)) {
      return legacy;
    }
    const candidateResult = await candidate();
    const [legacyResult, grantsResult] = reverse
      ? [candidateResult, legacy]
      : [legacy, candidateResult];
    const matches = equals
      ? await equals(legacyResult, grantsResult)
      : legacyResult === grantsResult;
    if (!matches) {
      logger.warn(
        {
          ...context,
          legacyResult,
          candidateResult: grantsResult,
          servedSource: reverse ? "grants" : "legacy",
        },
        SHADOW_MISMATCH_MESSAGE
      );
    }
  } catch (err) {
    logger.error(
      {
        ...context,
        err: normalizeError(err),
        servedSource: reverse ? "grants" : "legacy",
      },
      SHADOW_CANDIDATE_ERROR_MESSAGE
    );
  }

  return legacy;
}

// Temporary shadow-only lookup: keep the model access here and remove it with the shadow checks.
export async function hasActiveConfigurations(
  auth: Authenticator,
  configurationModelIds: ModelId[]
): Promise<boolean> {
  if (configurationModelIds.length === 0) {
    return false;
  }

  // Primary-key lookups, bounded by the supplied configuration IDs.
  const configuration = await AgentConfigurationModel.findOne({
    attributes: ["id"],
    where: {
      id: configurationModelIds,
      workspaceId: auth.getNonNullableWorkspace().id,
      status: "active",
    },
  });
  return configuration !== null;
}
