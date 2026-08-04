import type { GroupKind } from "@app/types/groups";

// Groups that can carry a model-tier override grant via setGroupMaxAllowedTier. Matches the kinds
// the Usage admin page lists (CAP_ELIGIBLE_GROUP_KINDS): user-managed collections only. regular_auto
// groups are excluded — the ones holding models_tier grants are the per-user backing groups managed
// by grantToUser, which resolve through the dedicated user-override path.
export const MODEL_TIER_OVERRIDE_GROUP_KINDS = [
  "provisioned",
  "regular_manual",
] as const satisfies readonly GroupKind[];

type ModelTierOverrideGroupKind =
  (typeof MODEL_TIER_OVERRIDE_GROUP_KINDS)[number];

export function isModelTierOverrideGroupKind(
  kind: GroupKind
): kind is ModelTierOverrideGroupKind {
  return MODEL_TIER_OVERRIDE_GROUP_KINDS.some(
    (allowedKind) => allowedKind === kind
  );
}
